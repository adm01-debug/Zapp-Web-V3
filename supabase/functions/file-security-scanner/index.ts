import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, securityErrorResponse } from "../_shared/validation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * File Security Scanner Edge Function
 * Middleware for file uploads — scans via VirusTotal and persists clean files.
 *
 * Standardized error format (security flows):
 *   { error: true, code, message, verdict, scanId, details? }
 *
 * Status codes:
 *   422 MALWARE_DETECTED   — confirmed malicious (verdict: malicious)
 *   403 SUSPICIOUS_FILE    — flagged suspicious (verdict: suspicious)
 *   408 SCAN_TIMEOUT       — analysis did not complete in time
 *   502 SCAN_UNAVAILABLE   — VirusTotal API unreachable
 *   400 INVALID_INPUT      — missing/invalid file
 *   405 METHOD_NOT_ALLOWED
 *   500 STORAGE_ERROR / INTERNAL_ERROR
 */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("file-security-scanner", req);

  try {
    const VIRUSTOTAL_API_KEY = requireEnv("VIRUSTOTAL_API_KEY");
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method !== "POST") {
      return securityErrorResponse(
        { code: "METHOD_NOT_ALLOWED", message: "Apenas requisições POST são permitidas." },
        405,
        req,
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const bucketId = (formData.get("bucket") as string) || "uploads";

    if (!file) {
      return securityErrorResponse(
        { code: "INVALID_INPUT", message: "Nenhum arquivo enviado.", details: { field: "file" } },
        400,
        req,
      );
    }

    log.info("Starting scan for file", { name: file.name, size: file.size, bucket: bucketId });

    // 1. Submit to VirusTotal
    const vtFormData = new FormData();
    vtFormData.append("file", file);

    const vtResponse = await fetch("https://www.virustotal.com/api/v3/files", {
      method: "POST",
      headers: { "x-apikey": VIRUSTOTAL_API_KEY },
      body: vtFormData,
    });

    if (!vtResponse.ok) {
      const vtError = await vtResponse.text();
      log.error("VirusTotal API error", { status: vtResponse.status, detail: vtError });
      return securityErrorResponse(
        {
          code: "SCAN_UNAVAILABLE",
          message: "Serviço de varredura indisponível. Tente novamente em instantes.",
          verdict: "unknown",
        },
        502,
        req,
      );
    }

    const vtData = await vtResponse.json();
    const analysisId: string = vtData.data.id;

    log.info("Analysis submitted", { analysisId });

    // 2. Poll for results
    let analysisResult;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const pollResponse = await fetch(
        `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
        { headers: { "x-apikey": VIRUSTOTAL_API_KEY } },
      );

      analysisResult = await pollResponse.json();
      const status = analysisResult.data.attributes.status;

      if (status === "completed") break;

      log.debug("Analysis still in progress...", { attempt: attempts + 1 });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }

    if (!analysisResult || analysisResult.data.attributes.status !== "completed") {
      log.warn("Analysis timed out, blocking for safety", { analysisId });
      return securityErrorResponse(
        {
          code: "SCAN_TIMEOUT",
          message: "A varredura de segurança expirou. Tente novamente.",
          verdict: "unknown",
          scanId: analysisId,
        },
        408,
        req,
      );
    }

    const stats = analysisResult.data.attributes.stats;
    const malicious = stats.malicious ?? 0;
    const suspicious = stats.suspicious ?? 0;
    const isMalicious = malicious > 0;
    const isSuspicious = !isMalicious && suspicious > 0;

    // 3. Log scan result
    await supabase.from("file_scan_logs").insert({
      file_name: file.name,
      bucket_id: bucketId,
      status: isMalicious ? "malicious" : isSuspicious ? "suspicious" : "clean",
      provider: "VirusTotal",
      provider_response: analysisResult,
    });

    if (isMalicious || isSuspicious) {
      log.error("Unsafe file detected", { name: file.name, stats, analysisId });

      // Quarantine for forensic analysis
      const { error: qError } = await supabase.storage
        .from("quarantine")
        .upload(`${Date.now()}_${file.name}`, file);

      if (qError) log.error("Failed to move to quarantine", { error: qError });

      if (isMalicious) {
        return securityErrorResponse(
          {
            code: "MALWARE_DETECTED",
            message: "Arquivo bloqueado: conteúdo malicioso identificado.",
            verdict: "malicious",
            scanId: analysisId,
            details: { malicious, suspicious, fileName: file.name },
          },
          422,
          req,
        );
      }

      return securityErrorResponse(
        {
          code: "SUSPICIOUS_FILE",
          message: "Arquivo bloqueado por suspeita de ameaça. Contate o suporte se acreditar ser um falso positivo.",
          verdict: "suspicious",
          scanId: analysisId,
          details: { malicious, suspicious, fileName: file.name },
        },
        403,
        req,
      );
    }

    // 4. Clean → upload to target bucket
    log.info("File is clean, proceeding with upload", { name: file.name });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketId)
      .upload(`${Date.now()}_${file.name}`, file, { upsert: true });

    if (uploadError) {
      log.error("Storage upload failed", { error: uploadError });
      return securityErrorResponse(
        {
          code: "STORAGE_ERROR",
          message: "Falha ao salvar o arquivo no armazenamento.",
          verdict: "clean",
          scanId: analysisId,
          details: { reason: uploadError.message },
        },
        500,
        req,
      );
    }

    log.done(200, { path: uploadData.path });
    return jsonResponse(
      {
        success: true,
        verdict: "clean",
        scanId: analysisId,
        message: "Arquivo verificado e enviado com sucesso.",
        path: uploadData.path,
      },
      200,
      req,
    );
  } catch (error: unknown) {
    log.error("Unhandled exception in scanner", {
      error: error instanceof Error ? error.message : String(error),
    });
    return securityErrorResponse(
      {
        code: "INTERNAL_ERROR",
        message: "Erro interno no processamento da varredura.",
        verdict: "unknown",
      },
      500,
      req,
    );
  }
});
