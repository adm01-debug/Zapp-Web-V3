// send-scheduled-report v2 — Dispatch da OUTBOX de relatórios agendados
// (DASHBOARD-16 / SIM-4). O executor SQL zapp.fn_run_scheduled_reports()
// gera CSV/JSON e grava na outbox zapp.scheduled_report_runs (status='success',
// content, storage_path). Este edge:
//   1. Claima runs pendentes via zapp.rpc_claim_pending_report_runs
//      (SKIP LOCKED, status='sending', send_attempts++ — DLQ após 5).
//   2. Upload do artefato p/ bucket privado zapp-reports (Storage API —
//      self-hosted: o storage-api é dono dos blobs; INSERT direto em
//      storage.objects criaria objeto-fantasma).
//   3. Signed URL 7d + email via Resend (csv/json → link; email → tabela HTML).
//   4. Marca delivered_at/signed_url no run. Falha → retryável (success,
//      send_error) até 5 tentativas, depois status='error' (DLQ visível).
//
// Contrato:
//   v1 (compat): { reportId } — envia runs pendentes DAQUELE relatório.
//   v2 (cron):   {} ou { limit?, dryRun? } — batch da outbox (cron
//   scheduled-reports-dispatch a cada 15 min chama com body '{}').
//
// Auth: requireServiceRoleOrCron (cron usa service_role do vault).
import { handleCors, errorResponse, jsonResponse, Logger, getCorsHeaders } from "../_shared/validation.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { fetchWithRetry } from "../_shared/retry-with-backoff.ts";

const SIGNED_URL_TTL_SECONDS = 604_800; // 7 dias (F7 do SIM-4)
const MAX_ATTEMPTS = 5;

interface ClaimedRun {
  run_id: string;
  report_id: string;
  report_name: string;
  format: string;
  recipients: string[] | null;
  content: string | null;
  storage_path: string | null;
  row_count: number | null;
  signed_url: string | null;
  send_attempts: number;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  const log = new Logger("send-scheduled-report");

  try {
    const supabase = createZappAdminClient();
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const body = await req.json().catch(() => null);

    // Contrato send-scheduled-report@v2 (batch) / v1 (reportId específico).
    const parsed = parseOrReject("send-scheduled-report", CONTRACT_SCHEMAS["send-scheduled-report"], req, body, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;

    const { version, data } = parsed;
    const payload = data as { reportId?: string; limit?: number; dryRun?: boolean };
    const isBatch = version === "v2";
    const reportId = isBatch ? undefined : payload.reportId;
    const limit = payload.limit ?? 20;
    const dryRun = payload.dryRun ?? false;

    // ── 1. Claim atômico da outbox ──────────────────────────────────────────
    const { data: claimed, error: claimError } = await supabase.rpc("rpc_claim_pending_report_runs", {
      p_limit: limit,
      p_report_id: reportId ?? null,
    });

    if (claimError) {
      log.error("claim failed", { error: claimError.message });
      return errorResponse("claim_failed", 500, req);
    }

    const runs = (Array.isArray(claimed) ? claimed : []) as ClaimedRun[];
    if (runs.length === 0) {
      log.done(200, { claimed: 0, sent: 0, failed: 0, dryRun });
      // Bloco 5 (2026-08-21): propaga parsed.headers (x-contract-version/
      // deprecated/sunset) — antes nunca chegava ao cliente.
      return jsonResponse({ claimed: 0, sent: 0, failed: 0, dryRun }, 200, req, parsed.headers);
    }

    let sent = 0;
    let failed = 0;

    for (const run of runs) {
      try {
        if (dryRun) continue;

        // ── 2. Upload do artefato p/ bucket privado zapp-reports ────────────
        if (!run.content || !run.storage_path) {
          throw new Error("run sem content/storage_path (outbox incompleta)");
        }
        const contentType = run.format === "csv" ? "text/csv" : "application/json";
        const { error: uploadError } = await supabase.storage
          .from("zapp-reports")
          .upload(run.storage_path, run.content, {
            contentType,
            upsert: true,
            cacheControl: "3600",
          });
        if (uploadError) throw new Error(`storage upload: ${uploadError.message}`);

        // ── 3. Signed URL 7d (host público — evita kong:8000 interno) ───────
        const { data: signed, error: signError } = await supabase.storage
          .from("zapp-reports")
          .createSignedUrl(run.storage_path, SIGNED_URL_TTL_SECONDS);
        if (signError || !signed?.signedUrl) {
          throw new Error(signError ? `signed url: ${signError.message}` : "signed url: vazio");
        }
        const publicUrl = publicSignedUrl(signed.signedUrl);

        // ── 4. Email (Resend) ───────────────────────────────────────────────
        if (!resendApiKey) throw new Error("RESEND_API_KEY ausente (F7)");

        const recipients = (run.recipients ?? []).filter((r): r is string => typeof r === "string");
        if (recipients.length === 0) {
          throw new Error("sem destinatários (recipients vazio)");
        }

        const emailHtml = run.format === "email"
          ? buildEmailHtmlTable(run.content, run.report_name, publicUrl)
          : buildFileEmail(run, publicUrl);

        const emailResults = await Promise.allSettled(
          recipients.map((recipient) => sendEmail(resendApiKey, recipient, run.report_name, emailHtml)),
        );
        const emailFailures = emailResults.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        if (emailFailures.length > 0) {
          throw new Error(`${emailFailures.length} email(s) falharam: ${
            emailFailures.map((f) => f.reason instanceof Error ? f.reason.message : String(f.reason)).join("; ")
          }`);
        }

        // ── 5. Marca entregue ───────────────────────────────────────────────
        const { error: updateError } = await supabase
          .from("scheduled_report_runs")
          .update({
            status: "success",
            delivered_at: new Date().toISOString(),
            signed_url: publicUrl,
            send_error: null,
          })
          .eq("id", run.run_id);
        if (updateError) throw new Error(`update run: ${updateError.message}`);

        sent++;
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error("send failed", { runId: run.run_id, error: errorMsg });

        // Retryável até MAX_ATTEMPTS; depois vira DLQ (status='error').
        const attempts = run.send_attempts ?? 1;
        const dlq = attempts >= MAX_ATTEMPTS;
        await supabase
          .from("scheduled_report_runs")
          .update({
            status: dlq ? "error" : "success",
            send_error: errorMsg,
            error: dlq ? errorMsg : null,
          })
          .eq("id", run.run_id);
      }
    }

    log.done(200, { claimed: runs.length, sent, failed, dryRun });
    return jsonResponse({ claimed: runs.length, sent, failed, dryRun }, 200, req, parsed.headers);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Error processing scheduled reports", { error: errorMessage });
    return errorResponse("Internal server error", 500, req);
  }
});

/** Envia email via Resend com timeout (F7). */
async function sendEmail(apiKey: string, to: string, reportName: string, html: string): Promise<void> {
  const response = await fetchWithRetry("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "reports@zappweb.app.br",
      to,
      subject: `📊 ${reportName} - ${new Date().toLocaleDateString("pt-BR")}`,
      html,
    }),
  }, {
    timeoutMs: 15_000,
    label: "Resend",
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend API error ${response.status}: ${errText.slice(0, 200)}`);
  }
}

/** Rebuild signed URL com host público (SELFHOSTED_SUPABASE_URL) — padrão storage-url.ts. */
function publicSignedUrl(signedUrl: string): string {
  const base = (Deno.env.get("SELFHOSTED_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  if (!base) return signedUrl;
  const marker = "/storage/v1/";
  const idx = signedUrl.indexOf(marker);
  if (idx === -1) return signedUrl;
  return `${base}${signedUrl.slice(idx)}`;
}

/** Email p/ format csv|json: link do artefato assinado (7d). */
function buildFileEmail(run: ClaimedRun, publicUrl: string): string {
  const rowInfo = run.row_count != null ? `${run.row_count} linha(s)` : "dados gerados";
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#f9fafb;">
    <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#25D366,#128C7E);padding:24px;color:white;"><h1 style="margin:0;font-size:20px;">📊 ${escapeHtml(run.report_name)}</h1><p style="margin:4px 0 0;opacity:0.9;font-size:14px;">${new Date().toLocaleDateString("pt-BR")} • ${rowInfo}</p></div>
      <div style="padding:24px;">
        <p style="color:#555;font-size:14px;">Seu relatório agendado está pronto. Clique no botão abaixo para baixar o arquivo (link válido por 7 dias):</p>
        <a href="${escapeHtml(publicUrl)}" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#25D366;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Baixar relatório (.${run.format})</a>
      </div>
      <div style="padding:16px 24px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">Relatório gerado automaticamente • ZAPP Web</div>
    </div></body></html>`;
}

/** Email p/ format=email: tabela HTML a partir do JSON gerado pela fn. */
function buildEmailHtmlTable(content: string, reportName: string, publicUrl: string): string {
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(content);
    rows = Array.isArray(parsed) ? parsed.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null) : [];
  } catch {
    rows = [];
  }

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const bodyRows = rows.slice(0, 50).map((row) =>
    `<tr>${headers.map((h) => `<td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${escapeHtml(String(row[h] ?? ""))}</td>`).join("")}</tr>`
  ).join("");

  const tableHtml = rows.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tr style="background:#f5f5f5;">${headers.map((h) => `<th style="padding:8px 12px;text-align:left;">${escapeHtml(h)}</th>`).join("")}</tr>
        ${bodyRows}
      </table>`
    : `<p style="color:#999;">Sem dados no período.</p>`;

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#f9fafb;">
    <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#25D366,#128C7E);padding:24px;color:white;"><h1 style="margin:0;font-size:20px;">📊 ${escapeHtml(reportName)}</h1><p style="margin:4px 0 0;opacity:0.9;font-size:14px;">${new Date().toLocaleDateString("pt-BR")}</p></div>
      <div style="padding:24px;">${tableHtml}
        <p style="margin-top:16px;font-size:12px;"><a href="${escapeHtml(publicUrl)}" style="color:#128C7E;">Abrir versão JSON completa</a></p>
      </div>
      <div style="padding:16px 24px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">Relatório gerado automaticamente • ZAPP Web</div>
    </div></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
