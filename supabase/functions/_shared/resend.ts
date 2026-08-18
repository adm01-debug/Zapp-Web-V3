/**
 * Shared transactional email helper (Resend).
 *
 * Usado por fluxos de auth (convite, reset de senha) e qualquer email
 * transacional sem conta Gmail. Sem dependência de banco — testável isolado.
 *
 * Falha SEMPRE explícita (nunca silenciosa): o chamador decide o que fazer
 * (rollback, fallback manual, 502/503).
 *
 * Retry 2x (backoff 300ms→600ms, full jitter) em 408/429/5xx/timeout/rede via
 * fetchWithRetry — falha transiente deixa de ser perda silenciosa. 4xx de
 * contrato nunca é retentado.
 */
import { fetchWithRetry } from "./retry-with-backoff.ts";
export interface ResendSuccess {
  ok: true;
  messageId: string;
}

export interface ResendFailure {
  ok: false;
  status: number;
  error: string;
}

export type ResendResult = ResendSuccess | ResendFailure;

const RESEND_API = "https://api.resend.com/emails";

/** From padrão: RESEND_FROM_EMAIL ou fallback histórico do repo. */
export function resendFromAddress(): string {
  const from = Deno.env.get("RESEND_FROM_EMAIL")?.trim();
  return from && from.length > 0 ? from : "noreply@zappweb.app";
}

/**
 * Envia email transacional via Resend.
 * - Sem RESEND_API_KEY → 503 explícito (nunca 500).
 * - Timeout de 15s (AbortSignal.timeout) → 504 explícito.
 * - Erro do Resend → status + mensagem do provider.
 */
export async function sendTransactionalEmail(
  to: string,
  subject: string,
  html: string,
): Promise<ResendResult> {
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey || resendKey.length === 0) {
    return { ok: false, status: 503, error: "RESEND_API_KEY not configured" };
  }

  let res: Response;
  try {
    res = await fetchWithRetry(RESEND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: resendFromAddress(),
        to: [to],
        subject,
        html,
      }),
    }, {
      timeoutMs: 15_000,
      label: "Resend",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Resend network error";
    return { ok: false, status: 504, error: msg };
  }

  const body = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    const message =
      typeof body.message === "string" ? body.message : `Resend error (${res.status})`;
    return { ok: false, status: res.status, error: message };
  }

  const messageId = typeof body.id === "string" ? body.id : null;
  if (!messageId) {
    return { ok: false, status: 502, error: "No message ID returned from Resend" };
  }

  return { ok: true, messageId };
}

/**
 * Layout HTML transacional (inline styles — compatível com Gmail/Outlook).
 * `ctaUrl`/`ctaText` opcionais: renderiza botão quando presentes.
 */
export function renderTransactionalEmailHtml(opts: {
  title: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaText?: string;
  footerText?: string;
}): string {
  const cta =
    opts.ctaUrl && opts.ctaText
      ? `<p style="margin:24px 0;text-align:center;">
           <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">${escapeHtml(opts.ctaText)}</a>
         </p>`
      : "";
  const footer =
    opts.footerText
      ? `<p style="margin:24px 0 0;font-size:12px;color:#71717a;line-height:1.5;">${escapeHtml(opts.footerText)}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr>
          <td style="padding:28px 32px 4px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#18181b;">${escapeHtml(opts.title)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 24px;font-size:14px;color:#3f3f46;line-height:1.6;">
            ${opts.bodyHtml}
            ${cta}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">ZAPP Web — Segurança de conta. Se você não solicitou esta mensagem, ignore-a com segurança.</p>
            ${footer}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Escapa HTML de qualquer valor interpolado no template (anti-injeção). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
