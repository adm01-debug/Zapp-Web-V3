/**
 * zapp-email-send — Envio de email via Resend (caminho VIÁVEL pós EMAIL-02).
 *
 * Decisão 2026-08-17 (wt-g5): Edge Functions são HTTP-only (sem TCP) — SMTP/IMAP
 * real nunca funcionaria aqui. O caminho viável de envio é a API HTTP do Resend:
 *   - Auth: JWT de usuário (requireUser) + rate limit 30/60s por usuário.
 *   - Anexos: base64 no body → cópia no bucket privado `email-attachments`
 *     (limite 20MB do bucket; máx. 10 anexos) → enviados ao Resend (base64).
 *   - Registro: cada envio grava em zapp.emails (direction='outbound'), com
 *     message_id do Resend e metadados dos anexos (storage_path).
 *
 * Contrato: zapp-email-send@v1 (ver _shared/contract-schemas.ts).
 * Falha SEMPRE explícita (nunca silenciosa) — o chamador decide o retry.
 */
import { requireUser } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { createZappAdminClient } from '../_shared/db-client.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { resendFromAddress } from '../_shared/resend.ts';
import { fetchWithRetry } from '../_shared/retry-with-backoff.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';

const RESEND_API = 'https://api.resend.com/emails';
const ATTACHMENT_BUCKET = 'email-attachments';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // limite do bucket (gmail-sync: 20MB)

interface AttachmentMeta {
  filename: string;
  content_type: string | null;
  size_bytes: number;
  storage_path: string;
}

function json(data: unknown, status = 200, req: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Sanitiza nome de arquivo p/ storage path (sem separadores de diretório). */
function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[\\/]/g, '_').replace(/\.\.+/g, '_').trim();
  return base.length > 0 ? base.slice(0, 200) : 'attachment';
}

/** Decodifica base64 → Uint8Array (lança em base64 inválido). */
function decodeBase64(content: string): Uint8Array {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Normaliza `to` (string ou lista) para lista. */
function normalizeTo(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`zapp-email-send:${authed.user.id}`, 30, 60_000);
    if (!rl.allowed) {
      return json({ error: 'Rate limit exceeded. Tente novamente em instantes.' }, 429, req);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      raw = null;
    }
    const parsed = parseOrReject('zapp-email-send', CONTRACT_SCHEMAS['zapp-email-send'], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as {
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      reply_to?: string;
      attachments?: Array<{ filename: string; content_type?: string; content: string }>;
    };

    const admin = createZappAdminClient();

    // ── 1) Anexos: validar tamanho → storage → metadados ─────────────────────
    const attachments = body.attachments ?? [];
    const attachmentMeta: AttachmentMeta[] = [];
    const resendAttachments: Array<{ filename: string; content: string }> = [];

    for (const att of attachments) {
      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(att.content);
      } catch {
        return json({ error: `Anexo "${att.filename}" não é base64 válido` }, 422, req);
      }
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        return json({ error: `Anexo "${att.filename}" excede 20MB` }, 422, req);
      }

      const filename = sanitizeFilename(att.filename);
      const storagePath = `outbound/${authed.user.id}/${crypto.randomUUID()}/${filename}`;
      const { error: uploadErr } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, bytes, {
          contentType: att.content_type || 'application/octet-stream',
          upsert: true,
        });
      if (uploadErr) {
        console.error('[zapp-email-send] storage upload failed:', uploadErr.message);
        return json({ error: 'Falha ao armazenar anexo. Nada foi enviado.' }, 502, req);
      }

      attachmentMeta.push({
        filename,
        content_type: att.content_type ?? null,
        size_bytes: bytes.byteLength,
        storage_path: storagePath,
      });
      resendAttachments.push({ filename, content: att.content });
    }

    // ── 2) Envio ao Resend ───────────────────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey || resendKey.length === 0) {
      return json({ error: 'RESEND_API_KEY not configured' }, 503, req);
    }

    const payload: Record<string, unknown> = {
      from: resendFromAddress(),
      to: normalizeTo(body.to),
      subject: body.subject,
    };
    if (body.html) payload.html = body.html;
    if (body.text) payload.text = body.text;
    if (body.reply_to) payload.reply_to = body.reply_to;
    if (resendAttachments.length > 0) payload.attachments = resendAttachments;

    let resendRes: Response;
    try {
      resendRes = await fetchWithRetry(RESEND_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify(payload),
      }, {
        timeoutMs: 15_000,
        label: 'Resend',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Resend network error';
      await admin.from('emails').insert({
        direction: 'outbound',
        provider: 'resend',
        from_email: resendFromAddress(),
        to_emails: normalizeTo(body.to),
        subject: body.subject,
        text_body: body.text ?? null,
        html_body: body.html ?? null,
        attachments: attachmentMeta,
        status: 'failed',
        error_message: `resend_network: ${msg}`,
        user_id: authed.user.id,
      });
      return json({ error: `Falha de rede ao enviar: ${msg}` }, 504, req);
    }

    const resendData = (await resendRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resendRes.ok) {
      const message =
        typeof resendData.message === 'string'
          ? resendData.message
          : `Resend error (${resendRes.status})`;
      await admin.from('emails').insert({
        direction: 'outbound',
        provider: 'resend',
        from_email: resendFromAddress(),
        to_emails: normalizeTo(body.to),
        subject: body.subject,
        text_body: body.text ?? null,
        html_body: body.html ?? null,
        attachments: attachmentMeta,
        status: 'failed',
        error_message: `resend_${resendRes.status}: ${message.slice(0, 2000)}`,
        user_id: authed.user.id,
      });
      return json({ error: message }, resendRes.status, req);
    }

    const messageId = typeof resendData.id === 'string' ? resendData.id : null;
    if (!messageId) {
      return json({ error: 'No message ID returned from Resend' }, 502, req);
    }

    // ── 3) Registro em zapp.emails ───────────────────────────────────────────
    const { data: emailRow, error: insertErr } = await admin
      .from('emails')
      .insert({
        message_id: messageId,
        direction: 'outbound',
        provider: 'resend',
        from_email: resendFromAddress(),
        to_emails: normalizeTo(body.to),
        subject: body.subject,
        text_body: body.text ?? null,
        html_body: body.html ?? null,
        attachments: attachmentMeta,
        status: 'sent',
        user_id: authed.user.id,
      })
      .select('id')
      .single();

    if (insertErr) {
      // Email ENVIOU, mas o registro falhou — reportar com o messageId para
      // reconciliação manual (não inventar sucesso silencioso).
      console.error('[zapp-email-send] insert zapp.emails failed:', insertErr.message);
      return json(
        {
          ok: true,
          messageId,
          emailId: null,
          warning: 'email enviado, mas o registro em zapp.emails falhou',
        },
        200,
        req
      );
    }

    return json({ ok: true, messageId, emailId: emailRow.id }, 200, req);
  } catch (err) {
    console.error(
      '[zapp-email-send] unexpected error:',
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    );
    return json({ error: 'Internal error' }, 500, req);
  }
});
