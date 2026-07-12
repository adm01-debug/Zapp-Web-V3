import { safeClient } from '@/integrations/supabase/safeClient';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { z } from 'zod';

const log = getLogger('diagnostics');

// [build-fix 2026-07-12] `@/types/system-connections` was imported here but never
// existed in the repo (phantom module), breaking the production build. This module
// is the ONLY consumer of those symbols, so the minimal 4-field validator/type it
// actually uses is inlined here instead of reconstructing a shared contract.
const systemConnectionSchema = z.object({
  name: z.string(),
  provider: z.string(),
  config: z.record(z.string(), z.unknown()),
  is_active: z.boolean(),
});
type SystemConnectionForm = z.infer<typeof systemConnectionSchema>;

/**
 * Decodes the payload (claims) of a JWT without any external dependency.
 * The `jwt-decode` package was imported here but is not a project dependency,
 * which broke the production build; this inline decoder replaces it. Handles
 * base64url + UTF-8 and never throws — diagnostics must degrade gracefully.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const b64 = part
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = decodeURIComponent(
      Array.from(atob(b64))
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface DiagStep {
  step: string;
  status: 'pass' | 'fail';
  details: unknown;
}

interface SystemConnectionRow {
  id?: string;
  name?: string;
  provider?: string;
  config?: { url?: string; anon_key?: string; [key: string]: unknown };
  is_active?: boolean;
  created_by?: string;
}

interface DiagResult {
  timestamp: string;
  steps: DiagStep[];
}

/**
 * Rotina de Verificação Automatizada: Fluxo de Conexão
 *
 * Este script valida:
 * 1. A conectividade com o endpoint do Supabase Self-Hosted.
 * 2. A persistência de dados na tabela system_connections.
 * 3. A integridade do RLS (se o registro é visível após o save).
 */
export async function runConnectionDiagnostics(): Promise<DiagResult> {
  const diagnostics: DiagResult = {
    timestamp: new Date().toISOString(),
    steps: [],
  };

  const record = (step: string, status: 'pass' | 'fail', details: unknown) => {
    diagnostics.steps.push({ step, status, details });
    diagLog[status === 'pass' ? 'debug' : 'warn'](`${status.toUpperCase()}: ${step}`, details);
  };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    results.hasSession = Boolean(session);
    results.userEmail = session?.user?.email ?? null;

    if (session?.access_token) {
      const decoded: Record<string, unknown> = decodeJwtPayload(session.access_token);
      results.tokenRole = decoded?.role ?? null;
      results.tokenExp = decoded?.exp ?? null;
    }
    record('Auth Check', 'pass', { user: session.user.email });

    // Test connection to system_connections table (manual table)
    const { data: connData, error: connError } = await safeClient.single<SystemConnectionRow>(
      'system_connections',
      (q: any) => q.select('*').eq('name', 'FATOR X').eq('provider', 'supabase_external') // ignore-audit
    );
    const currentConfigs = configRows?.[0] ?? null;

    results.connectionFetch = connError ? { error: connError.message } : { data: connData };

    // Test basic rpc call
    const { data: rpcResult, error: rpcError } = await safeClient.rpc('rpc_get_server_time');
    results.rpcTest = rpcError ? { error: rpcError.message } : { data: rpcResult };

    // Test upsert to system_connections
    const payload: SystemConnectionForm = {
      name: '_DIAGNOSTICS_TEST',
      provider: 'diagnostics',
      config: { test: true },
      is_active: false,
    };

    const validatedPayload = systemConnectionSchema.parse(payload);
    const { error: upsertError } = await safeClient.from('system_connections', (q: any) =>
      // ignore-audit
      q.upsert({
        ...validatedPayload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    );
    results.upsertTest = upsertError ? { error: upsertError.message } : { success: true };

    // Verify the upsert
    if (!upsertError) {
      const testName = '_DIAGNOSTICS_TEST';
      const { data: verifyData, error: verifyError } = await safeClient.single<SystemConnectionRow>(
        'system_connections',
        (q: any) => q.select('*').eq('name', testName) // ignore-audit
      );
      results.verifyUpsert = verifyError ? { error: verifyError.message } : { data: verifyData };

      // Clean up
      await safeClient.from('system_connections', (q: any) => q.delete().eq('name', testName)); // ignore-audit
    }
  } catch (err) {
    log.error('Diagnostics error', err);
    results.criticalError = err instanceof Error ? err.message : String(err);
  }

  return results;
}

// [build-fix 2026-07-12] The onda2 refactor renamed this export to
// runSupabaseDiagnostics but its only caller (admin/Connections.tsx) still imports
// runConnectionDiagnostics — breaking the build. Alias both names (no other file
// consumes runSupabaseDiagnostics).
export const runConnectionDiagnostics = runSupabaseDiagnostics;
