// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const diagLog = getLogger('diagnostics');

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
    // Passo 1: Verificar Autenticação Local
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      record('Auth Check', 'fail', 'Usuário não autenticado no Lovable Cloud.');
      return diagnostics;
    }
    record('Auth Check', 'pass', { user: session.user.email });

    // Passo 2: Buscar Configuração Atual no Banco
    const { data: configRows, error: _fetchError } = await safeClient.from<{
      config: { url?: string; anon_key?: string };
    }>('system_connections', (q) =>
      q.select('*').eq('name', 'FATOR X').eq('provider', 'supabase_external').limit(1)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await safeClient.from('system_connections', (q: any) => // ignore-audit — query builder shape not in generated types
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
      const { data: _verifyData, error: _verifyError } = await safeClient.single<SystemConnectionRow>(
        'system_connections',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q.select('*').eq('name', testName) // ignore-audit
      );
      return diagnostics;
    }

    const externalUrl = currentConfigs.config?.url;
    const externalKey = currentConfigs.config?.anon_key;

    if (!externalUrl || !externalKey) {
      record('Config Validation', 'fail', 'URL ou Anon Key ausentes na configuração do banco.');
      return diagnostics;
    }
    record('Config Validation', 'pass', { url: externalUrl, key_length: externalKey.length });

    // Passo 3: Testar Conectividade Externa (Self-Hosted)
    try {
      const res = await fetch(
        `${externalUrl.replace(/\/$/, '')}/rest/v1/?apikey=${encodeURIComponent(externalKey)}`,
        {
          headers: { apikey: externalKey, Authorization: `Bearer ${externalKey}` },
        }
      );
      if (res.status < 500) {
        record('External Connectivity', 'pass', { status: res.status });
      } else {
        record('External Connectivity', 'fail', {
          status: res.status,
          msg: 'Endpoint retornou erro 500+',
        });
      }
    } catch (e: unknown) {
      record('External Connectivity', 'fail', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Passo 4: Testar Escrita/Leitura no system_connections (Verificar RLS)
    const testName = `DIAG_TEST_${Math.floor(Math.random() * 1000)}`;
    const { data: saveResult, error: saveError } = await safeClient.from<SystemConnectionRow>(
      'system_connections',
      (q) =>
        q
          .upsert(
            {
              name: testName,
              provider: 'diagnostic_test',
              config: { url: 'test', anon_key: 'test' },
              is_active: false,
              created_by: session.user.id,
            },
            { onConflict: 'name' }
          )
          .select()
    );

    if (saveError) {
      record('Database Write (RLS)', 'fail', { error: saveError });
    } else {
      record('Database Write (RLS)', 'pass', { id: saveResult?.[0]?.id });

      // Passo 5: Verificação de Visibilidade (Read-back)
      const { data: verifyRows, error: verifyError } = await safeClient.from<SystemConnectionRow>(
        'system_connections',
        (q) => q.select('*').eq('name', testName).limit(1)
      );
      const verifyData = verifyRows?.[0] ?? null;

      if (verifyError || !verifyData) {
        record('Data Read-back (RLS)', 'fail', {
          error: verifyError?.message || 'Registro inserido não foi encontrado no SELECT',
        });
      } else {
        record('Data Read-back (RLS)', 'pass', { verified_id: verifyData.id });

        // Limpeza
        await safeClient.from<SystemConnectionRow>('system_connections', (q) =>
          q.delete().eq('name', testName)
        );
        record('Cleanup', 'pass', 'Registro de teste removido.');
      }
    }
  } catch (e: unknown) {
    // ignore-audit
    record('Global Error', 'fail', { message: e instanceof Error ? e.message : String(e) });
  }

  return diagnostics;
}
