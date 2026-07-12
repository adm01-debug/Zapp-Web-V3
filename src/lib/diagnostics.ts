import { safeClient } from "@/integrations/supabase/safeClient";
import { supabase } from "@/integrations/supabase/client";
import { getLogger } from "@/lib/logger";

import {
  systemConnectionSchema,
  SystemConnectionForm,
} from "@/types/system-connections";

const log = getLogger("diagnostics");

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const b64url = token.split('.')[1];
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type SystemConnectionRow = {
  id: string;
  name: string;
  provider: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function runSupabaseDiagnostics() {
  const results: Record<string, unknown> = {};

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    results.hasSession = Boolean(session);
    results.userEmail = session?.user?.email ?? null;

    if (session?.access_token) {
      const decoded = decodeJwtPayload(session.access_token);
      results.tokenRole = decoded?.role ?? null;
      results.tokenExp = decoded?.exp ?? null;
    }

    // Test connection to system_connections table (manual table)
    const { data: connData, error: connError } = await safeClient.single<SystemConnectionRow>(
      "system_connections",
      (q: any) => q.select("*").eq("name", "FATOR X").eq("provider", "supabase_external")
    );

    results.connectionFetch = connError ? { error: connError.message } : { data: connData };

    // Test basic rpc call
    const { data: rpcResult, error: rpcError } = await safeClient.rpc(
      "rpc_get_server_time"
    );
    results.rpcTest = rpcError ? { error: rpcError.message } : { data: rpcResult };

    // Test upsert to system_connections
    const payload: SystemConnectionForm = {
      name: "_DIAGNOSTICS_TEST",
      provider: "diagnostics",
      config: { test: true },
      is_active: false,
    };

    const validatedPayload = systemConnectionSchema.parse(payload);
    const { error: upsertError } = await safeClient.from("system_connections", (q: any) =>
      q.upsert({
        ...validatedPayload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    );
    results.upsertTest = upsertError ? { error: upsertError.message } : { success: true };

    // Verify the upsert
    if (!upsertError) {
      const testName = "_DIAGNOSTICS_TEST";
      const { data: verifyData, error: verifyError } = await safeClient.single<SystemConnectionRow>(
        "system_connections",
        (q: any) => q.select("*").eq("name", testName)
      );
      results.verifyUpsert = verifyError ? { error: verifyError.message } : { data: verifyData };

      // Clean up
      await safeClient.from("system_connections", (q: any) => q.delete().eq("name", testName));
    }
  } catch (err) {
    log.error("Diagnostics error", err);
    results.criticalError = err instanceof Error ? err.message : String(err);
  }

  return results;
}

export const runConnectionDiagnostics = runSupabaseDiagnostics;
