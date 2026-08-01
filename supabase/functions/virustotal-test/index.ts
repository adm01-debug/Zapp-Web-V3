import { handleCors, jsonResponse, Logger, errorResponse } from "../_shared/validation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Endpoint to test VirusTotal connection and API Key
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("virustotal-test", req);

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, req);
  }

  try {
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
