/**
 * zapp-auto-export@v1 — AutoExport (G4): gera exportação CSV/JSON de tabelas
 * do schema zapp para o bucket PRIVADO `zapp-exports` e devolve signed URL.
 *
 * Contrato (estrito): { jobId: uuid, action?: 'run' | 'link' }.
 *  - action 'run' (padrão): gera/regenera o arquivo de exportação.
 *  - action 'link': apenas renova a signed URL do arquivo existente.
 *
 * Autenticação:
 *  - Chamada interna (service_role bearer ou x-cron-secret) — aceita.
 *  - Caso contrário exige JWT de usuário + zapp.is_admin_or_supervisor (UI).
 *
 * Comportamento:
 *  - Job inexistente → 404. Job já em processamento → 409 (anti-concorrência).
 *  - Query vazia → 200 HONESTO { ok:true, empty:true, rowCount:0 } — NÃO cria
 *    arquivo no storage (evita lixo de arquivos vazios no bucket privado).
 *  - Com dados → upload em `exports/{jobId}/{timestamp}-{slug}.{csv|json}`,
 *    signed URL 1h, job atualizado (status/file_path/row_count/last_run_at).
 *  - Erro → job marcado 'failed' com last_error e resposta 500.
 *
 * Segurança: bucket privado SEM policy de leitura pública; acesso somente via
 * signed URL gerada aqui (service_role). RLS admin-only na tabela de jobs.
 */
import { handleCors, errorResponse, errorEnvelope, jsonResponse, Logger, getCorsHeaders } from "../_shared/validation.ts";
import { requireAdminOrSupervisor, requireServiceRoleOrCron, type AuthedUser } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { ZappAutoExportV1Schema } from "../_shared/contract-schemas.ts";

const BUCKET = "zapp-exports";
const MAX_EXPORT_ROWS = 50_000;
const SIGNED_URL_TTL_SECONDS = 3600; // 1h

/** Allowlist de tabelas exportáveis do schema zapp (espelho do CHECK da migration). */
const ALLOWED_SOURCE_TABLES = new Set([
  "contacts",
  "messages",
  "conversations",
  "campaigns",
  "scheduled_messages",
]);

interface ExportJob {
  id: string;
  name?: string | null;
  source_table?: string | null;
  format?: string | null;
  filters?: Record<string, unknown> | null;
  status?: string | null;
  file_path?: string | null;
  row_count?: number | null;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const esc = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const s = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return lines.join("\n");
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "export";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("zapp-auto-export");

  // Auth: chamada interna (cron/service_role) OU admin/supervisor autenticado.
  const internal = requireServiceRoleOrCron(req);
  if (internal !== null) {
    const authed: AuthedUser | Response = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;
  }

  try {
    const parsed = parseOrReject("zapp-auto-export", { v1: ZappAutoExportV1Schema }, req, await req.json().catch(() => null), {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;

    const { jobId, action } = parsed.data as { jobId: string; action?: "run" | "link" };

    const supabase = createZappAdminClient();

    const { data: jobRaw, error: jobError } = await supabase
      .from("auto_export_jobs")
      .select("id, name, source_table, format, filters, status, file_path, row_count")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !jobRaw || typeof jobRaw !== "object") {
      return errorResponse("Job not found", 404, req);
    }
    const job = jobRaw as unknown as ExportJob;

    // ── Modo 'link': só renova a signed URL do arquivo existente ─────────────
    if (action === "link") {
      if (job.status !== "completed" || !job.file_path) {
        return errorResponse("Nenhum arquivo gerado ainda — execute o job antes de gerar o link", 400, req);
      }
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(job.file_path, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed?.signedUrl) {
        log.error("Signed URL refresh failed", { path: job.file_path, error: signError?.message });
        return errorResponse("Falha ao gerar link de download", 500, req);
      }
      log.done(200, { jobId, action: "link", path: job.file_path });
      return jsonResponse(
        {
          ok: true,
          empty: false,
          rowCount: job.row_count ?? 0,
          filePath: job.file_path,
          signedUrl: signed.signedUrl,
          expiresIn: SIGNED_URL_TTL_SECONDS,
        },
        200,
        req
      );
    }

    if (job.status === "processing") {
      return errorResponse("Job já está em processamento", 409, req);
    }

    const sourceTable = job.source_table ?? "";
    if (!ALLOWED_SOURCE_TABLES.has(sourceTable)) {
      return errorResponse(`Tabela de origem não permitida para exportação: ${sourceTable}`, 400, req);
    }
    const format = job.format === "json" ? "json" : "csv";

    // Claim: marca processando ANTES de executar (idempotência de re-run).
    await supabase
      .from("auto_export_jobs")
      .update({ status: "processing", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    let query = supabase.from(sourceTable).select("*").limit(MAX_EXPORT_ROWS);
    const filters = (job.filters ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(filters)) {
      if (value === null || typeof value === "object") continue; // só igualdade primitiva
      query = query.eq(key, value);
    }

    const { data: rows, error: queryError } = await query;
    if (queryError) {
      await markFailed(jobId, `Erro ao consultar ${sourceTable}: ${queryError.message}`);
      log.error("Query failed", { sourceTable, error: queryError.message });
      return errorResponse("Falha ao consultar dados para exportação", 500, req);
    }

    const rowArray = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
    const truncated = rowArray.length >= MAX_EXPORT_ROWS;

    // ── Vazio → 200 honesto (sem arquivo no storage) ─────────────────────────
    if (rowArray.length === 0) {
      await supabase
        .from("auto_export_jobs")
        .update({
          status: "completed",
          row_count: 0,
          file_path: null,
          last_run_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      log.done(200, { jobId, rowCount: 0, empty: true });
      return jsonResponse(
        {
          ok: true,
          empty: true,
          rowCount: 0,
          message: "Nenhum registro encontrado para exportar",
        },
        200,
        req
      );
    }

    // ── Serializa ────────────────────────────────────────────────────────────
    const body = format === "json" ? JSON.stringify(rowArray, null, 2) : toCsv(rowArray);
    const contentType = format === "json" ? "application/json" : "text/csv";
    const extension = format === "json" ? "json" : "csv";
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const path = `exports/${jobId}/${stamp}-${slugify(job.name ?? "export")}.${extension}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, body, {
      contentType,
      upsert: false,
    });
    if (uploadError) {
      await markFailed(jobId, `Falha no upload para ${BUCKET}: ${uploadError.message}`);
      log.error("Upload failed", { path, error: uploadError.message });
      return errorResponse("Falha ao gravar arquivo de exportação", 500, req);
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      await markFailed(jobId, `Falha ao gerar signed URL: ${signError?.message ?? "sem URL"}`);
      log.error("Signed URL failed", { path, error: signError?.message });
      return errorResponse("Falha ao gerar link de download", 500, req);
    }

    await supabase
      .from("auto_export_jobs")
      .update({
        status: "completed",
        row_count: rowArray.length,
        file_path: path,
        last_run_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    log.done(200, { jobId, rowCount: rowArray.length, truncated, path });
    return jsonResponse(
      {
        ok: true,
        empty: false,
        rowCount: rowArray.length,
        truncated,
        filePath: path,
        signedUrl: signed.signedUrl,
        expiresIn: SIGNED_URL_TTL_SECONDS,
      },
      200,
      req
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Error generating export", { error: errorMessage });
    return errorEnvelope("internal_error", "Internal server error", 500, req);
  }
});

/** Marca o job como failed com last_error truncado (2000 chars). */
async function markFailed(jobId: string, message: string): Promise<void> {
  try {
    const supabase = createZappAdminClient();
    await supabase
      .from("auto_export_jobs")
      .update({
        status: "failed",
        last_error: message.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch {
    // best-effort: falha ao marcar não deve estourar o fluxo principal
  }
}
