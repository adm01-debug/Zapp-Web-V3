import { handleCors, jsonResponse, Logger, errorResponse, checkRateLimit } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";

/**
 * Endpoint to test VirusTotal connection and API Key
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("virustotal-test", req);

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`virustotal-test:${authed.user.id}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405, req);
    }

    const { apiKey } = await req.json();

    if (!apiKey) {
      return errorResponse("API Key is required", 400, req);
    }

    log.info("Testing VirusTotal API Key");

    // Test the key by fetching current user/quota info from VirusTotal
    const response = await fetch("https://www.virustotal.com/api/v3/users/me", {
      headers: {
        "x-apikey": apiKey,
      },
      signal: AbortSignal.timeout(10_000),
    });

    const data = await response.json();

    if (!response.ok) {
      log.error("VirusTotal API test failed", { status: response.status, data });
      return errorResponse(data.error?.message || "Invalid API Key", response.status, req);
    }

    log.info("VirusTotal API Key is valid", { user: data.data?.attributes?.username });

    return jsonResponse({
      success: true,
      message: "VirusTotal API Key is valid and working!",
      user: data.data?.attributes?.username,
      quotas: data.data?.attributes?.quotas
    }, 200, req);

  } catch (error: unknown) {
    log.error("Error testing VirusTotal API", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse("Internal error testing API Key", 500, req);
  }
});
