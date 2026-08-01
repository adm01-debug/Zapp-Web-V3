import { handleCors, jsonResponse, Logger, securityErrorResponse, requireEnv } from "../_shared/validation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Secure Upload Middleware
 * Intercepts file uploads, validates via VirusTotal (when configured) and persists.
 *
 * Standardized error response (so the frontend can switch on `code`):
 *   { error: true, code, message, verdict, scanId, details? }
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("secure-upload", req);

  if (req.method !== "POST") {
    return securityErrorResponse(
      { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." },
      405,
      req,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return securityErrorResponse(
        { code: "UNAUTHORIZED", message: "Sessão inválida ou expirada." },
        401,
        req,
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const bucket = (formData.get("bucket") as string) || "whatsapp-media";
    const customPath = formData.get("path") as string;

    if (!file) {
      return securityErrorResponse(
        { code: "INVALID_INPUT", message: "Nenhum arquivo enviado.", details: { field: "file" } },
        400,
        req,
      );
    }

    log.info("Processando upload seguro", {
      fileName: file.name,
      size: file.size,
      type: file.type,
      bucket,
    });

    // 1. Hash + VirusTotal lookup (preventive, by hash to avoid full re-upload)
    const vtApiKey = Deno.env.get("VIRUSTOTAL_API_KEY");
    let scanId: string | null = null;

    if (vtApiKey && file.size > 0) {
      try {
        // Stream-hash the file (sha256) to query VT without sending bytes twice.
        const buf = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest("SHA-256", buf);
        const sha256 = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const lookup = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
          headers: { "x-apikey": vtApiKey },
        });

        if (lookup.ok) {
          const data = await lookup.json();
          scanId = data?.data?.id ?? sha256;
          const stats = data?.data?.attributes?.last_analysis_stats ?? {};
          const malicious = stats.malicious ?? 0;
          const suspicious = stats.suspicious ?? 0;

          if (malicious > 0) {
            log.warn("Bloqueando upload — hash conhecido como malicioso", { sha256 });
            return securityErrorResponse(
              {
                code: "MALWARE_DETECTED",
                message: "Arquivo bloqueado: conteúdo malicioso identificado.",
                verdict: "malicious",
                scanId,
                details: { malicious, suspicious, fileName: file.name },
              },
              422,
              req,
            );
          }

          if (suspicious > 0) {
            log.warn("Bloqueando upload — hash suspeito", { sha256 });
            return securityErrorResponse(
              {
                code: "SUSPICIOUS_FILE",
                message: "Arquivo bloqueado por suspeita de ameaça.",
                verdict: "suspicious",
                scanId,
                details: { malicious, suspicious, fileName: file.name },
              },
              403,
              req,
            );
          }
        } else if (lookup.status !== 404) {
          log.warn("Falha no lookup VirusTotal", { status: lookup.status });
        }
      } catch (err) {
        log.error("Erro na varredura preventiva", { error: String(err) });
        // Não bloqueia o fluxo: a varredura é best-effort aqui.
      }
    }

    // 2. Persist to storage
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const fileExt = file.name.split(".").pop();
    const fileName =
      customPath ||
      `secure/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    log.info("Persistindo no storage", { path: fileName });

    const { data, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { contentType: file.type, upsert: true });

    if (uploadError) {
      log.error("Erro no storage", { error: uploadError.message });
      return securityErrorResponse(
        {
          code: "STORAGE_ERROR",
          message: "Falha ao salvar o arquivo no armazenamento.",
          verdict: "clean",
          scanId,
          details: { reason: uploadError.message },
        },
        500,
        req,
      );
    }

    const { data: signedUrl } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileName, 3600);

    log.done(200, { path: fileName });

    return jsonResponse(
      {
        success: true,
        verdict: "clean",
        scanId,
        message: "Upload concluído com sucesso.",
        path: data.path,
        url: signedUrl?.signedUrl || fileName,
        fullPath: `${bucket}/${data.path}`,
      },
      200,
      req,
    );
  } catch (error: unknown) {
    log.error("Crash no upload", {
      error: error instanceof Error ? error.message : String(error),
    });
    return securityErrorResponse(
      {
        code: "INTERNAL_ERROR",
        message: "Erro interno no processamento do upload.",
        verdict: "unknown",
      },
      500,
      req,
    );
  }
});
