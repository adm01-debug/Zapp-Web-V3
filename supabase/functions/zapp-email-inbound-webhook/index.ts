/**
 * zapp-email-inbound-webhook — Recebimento de email via webhook (caminho VIÁVEL
 * pós EMAIL-02).
 *
 * Decisão 2026-08-17 (wt-g5): Edge Functions são HTTP-only (sem TCP) — IMAP real
 * (fetchInbox) nunca funcionaria aqui. O caminho viável de recebimento é o
 * webhook de entrada do Resend (inbound emails → POST JSON), que grava em
 * zapp.emails (direction='inbound').
 *
 * Auth (fail-closed — nenhum mecanismo configurado = 503):
 *   - `RESEND_INBOUND_SIGNING_SECRET` (vault/env): verifica assinatura Svix
 *     (headers svix-id/svix-timestamp/svix-signature, HMAC-SHA256 sobre o body
 *     cru, janela ±5min) — autenticação forte recomendada.
 *   - `EMAIL_INBOUND_WEBHOOK_SECRET` (vault/env): exige header `x-webhook-secret`
 *     (ou `?token=`) com comparação timing-safe.
 *   Ambos configurados → ambos são exigidos.
 *
 * Idempotência: message_id do provider é UNIQUE em zapp.emails — re-delivery
 * retorna 200 { duplicate: true } sem duplicar. Dedup atômico no padrão do
 * repo (markEventProcessed): INSERT + violação de UNIQUE (23505) tratada como
 * duplicate, nunca erro; fast-path SELECT evita re-upload de anexos. O UNIQUE
 * é parcial (idx_emails_message_id_unique) — ON CONFLICT com target de coluna
 * falharia 42P10, por isso o dedup usa o código 23505.
 *
 * Contrato: zapp-email-inbound-webhook@v1 (permissivo — campo novo do provider
 * nunca derruba a ingestão).
 */
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { timingSafeStringEqual } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { createZappAdminClient } from '../_shared/db-client.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { getSecret } from '../_shared/vault.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';

const ATTACHMENT_BUCKET = 'email-attachments';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // limite do bucket
const MAX_ATTACHMENTS = 20;
const SVIX_TOLERANCE_SEC = 5 * 60;

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

/** Decodifica base64 → Uint8Array (null em base64 inválido). */
function decodeBase64(content: string): Uint8Array | null {
  try {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** "Nome <email>" ou "email" puro → { email, name }. */
function parseFrom(from: string): { email: string; name: string | null } {
  const m = /^\s*(?:"?([^"<]+)"?\s*)?<([^>]+)>\s*$/.exec(from);
  if (m) {
    return { email: m[2].trim().toLowerCase(), name: (m[1] ?? '').trim() || null };
  }
  return { email: from.trim().toLowerCase(), name: null };
}

/** Verifica assinatura Svix (formato Resend: svix-id/svix-timestamp/svix-signature). */
async function verifySvixSignature(
  req: Request,
  rawBody: string,
  secret: string
): Promise<boolean> {
  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signatureHeader = req.headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > SVIX_TOLERANCE_SEC) {
    return false; // replay/stale
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // Formato: "v1,<sig> v1,<sig2> ..." — aceita qualquer entrada v1.
  for (const part of signatureHeader.split(' ')) {
    const [version, sig] = part.split(',');
    if (version === 'v1' && sig && timingSafeStringEqual(sig, expected)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const admin = createZappAdminClient();

    // ── Auth (fail-closed) ───────────────────────────────────────────────────
    const signingSecret = await getSecret('resend_inbound_signing_secret');
    const webhookSecret = await getSecret('email_inbound_webhook_secret');
    if (!signingSecret && !webhookSecret) {
      return json({ error: 'Webhook authentication not configured' }, 503, req);
    }

    const rawText = await req.text().catch(() => '');
    if (signingSecret) {
      const ok = await verifySvixSignature(req, rawText, signingSecret);
      if (!ok) return json({ error: 'Invalid Svix signature' }, 401, req);
    }
    if (webhookSecret) {
      const received =
        req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('token');
      if (!received || !timingSafeStringEqual(received, webhookSecret)) {
        return json({ error: 'Invalid or missing webhook secret' }, 401, req);
      }
    }

    // ── Rate limit global (proteção contra bursts) ───────────────────────────
    const rl = checkRateLimit('zapp-email-inbound-webhook', 120, 60_000);
    if (!rl.allowed) return json({ error: 'Rate limit exceeded' }, 429, req);

    // ── Contrato ─────────────────────────────────────────────────────────────
    let rawBody: unknown = null;
    if (rawText.length > 0) {
      try {
        rawBody = JSON.parse(rawText);
      } catch {
        rawBody = null;
      }
    }

    // Bloco 2 (etapa 23, 2026-08-21 — fecha D2): validação de to/subject/
    // text-ou-html agora vive no schema (ZappEmailInboundWebhookV1Schema,
    // superRefine) — o gate abaixo é a ÚNICA fonte de validação, envelope
    // 422 canônico sempre atingível (antes caía num 400 artesanal antes do gate).
    const parsed = parseOrReject(
      'zapp-email-inbound-webhook',
      CONTRACT_SCHEMAS['zapp-email-inbound-webhook'],
      req,
      rawBody,
      {
        extraHeaders: getCorsHeaders(req),
      }
    );
    if (parsed.ok === false) return parsed.response;

    // to/subject/text-ou-html são garantidos pelo superRefine acima — não
    // opcionais na prática, mas o tipo aqui reflete o schema Zod (passthrough
    // com campos .optional() estruturalmente; a obrigatoriedade é imposta
    // via superRefine, que o TS não consegue refletir no tipo inferido).
    const body = parsed.data as {
      id: string;
      from: string;
      to?: string[];
      cc?: string[];
      subject?: string;
      text?: string;
      html?: string;
      attachments?: Array<{ filename: string; content_type?: string; content: string }>;
    };

    // ── Idempotência (re-delivery do webhook) ────────────────────────────────
    // Padrão do repo (evolution-webhook → markEventProcessed): violação de
    // UNIQUE = duplicate (23505), nunca erro. Este SELECT é só o fast-path
    // (evita re-upload de anexos em retries comuns); a autoridade é o INSERT
    // abaixo — corrida SELECT→INSERT coberta pelo UNIQUE parcial
    // idx_emails_message_id_unique (zapp.emails.message_id).
    const { data: existing } = await admin
      .from('emails')
      .select('id')
      .eq('message_id', body.id)
      .maybeSingle();
    if (existing) {
      return json({ ok: true, duplicate: true, emailId: existing.id }, 200, req);
    }

    // ── Anexos → storage (falha NUNCA derruba a ingestão do email) ───────────
    const attachmentMeta: Array<{
      filename: string;
      content_type: string | null;
      size_bytes: number;
      storage_path: string;
    }> = [];
    const attachments = (body.attachments ?? []).slice(0, MAX_ATTACHMENTS);
    for (const att of attachments) {
      const bytes = decodeBase64(att.content);
      if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        console.warn(
          `[zapp-email-inbound-webhook] anexo inválido/oversize ignorado: "${att.filename}"`
        );
        continue;
      }
      const filename = sanitizeFilename(att.filename);
      const storagePath = `inbound/${body.id}/${filename}`;
      const { error: uploadErr } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, bytes, {
          contentType: att.content_type || 'application/octet-stream',
          upsert: true,
        });
      if (uploadErr) {
        console.error(
          `[zapp-email-inbound-webhook] storage upload failed for "${att.filename}":`,
          uploadErr.message
        );
        continue;
      }
      attachmentMeta.push({
        filename,
        content_type: att.content_type ?? null,
        size_bytes: bytes.byteLength,
        storage_path: storagePath,
      });
    }

    // ── Grava em zapp.emails ─────────────────────────────────────────────────
    // Dedup atômico (padrão do repo — evolution-webhook/markEventProcessed):
    // INSERT direto + violação de UNIQUE (23505) tratada como duplicate, nunca
    // como erro. O UNIQUE é PARCIAL (WHERE message_id IS NOT NULL) — por isso
    // ON CONFLICT com target de coluna falharia 42P10 no PostgREST; o código
    // 23505 cobre o conflito igualmente, inclusive na corrida SELECT→INSERT.
    const sender = parseFrom(body.from);
    const { data: emailRow, error: insertErr } = await admin
      .from('emails')
      .insert({
        message_id: body.id,
        direction: 'inbound',
        provider: 'resend',
        from_email: sender.email,
        from_name: sender.name,
        to_emails: (body.to ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        cc_emails: (body.cc ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        subject: body.subject ?? null,
        text_body: body.text ?? null,
        html_body: body.html ?? null,
        attachments: attachmentMeta,
        status: 'received',
        user_id: null,
        raw_payload: rawBody,
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      if (insertErr.code === '23505') {
        // Re-delivery concorrente do mesmo message_id — contrato de resposta
        // do duplicate preservado: 200 { ok, duplicate: true, emailId }.
        const { data: raced } = await admin
          .from('emails')
          .select('id')
          .eq('message_id', body.id)
          .maybeSingle();
        return json({ ok: true, duplicate: true, emailId: raced?.id ?? null }, 200, req);
      }
      console.error('[zapp-email-inbound-webhook] insert zapp.emails failed:', insertErr.message);
      return json({ error: 'Falha ao registrar email' }, 502, req);
    }

    if (!emailRow) {
      // Defensivo: INSERT sem erro não deveria retornar sem row (PostgREST
      // sempre devolve a linha com return=representation). Evita crash de tipo.
      console.error('[zapp-email-inbound-webhook] insert zapp.emails returned no row');
      return json({ error: 'Falha ao registrar email' }, 502, req);
    }

    return json({ ok: true, emailId: emailRow.id }, 200, req);
  } catch (err) {
    console.error(
      '[zapp-email-inbound-webhook] unexpected error:',
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    );
    return json({ error: 'Internal error' }, 500, req);
  }
});
