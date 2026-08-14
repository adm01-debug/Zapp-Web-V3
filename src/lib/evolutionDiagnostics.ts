import { listInstances } from '@/lib/whatsappAdapter';

import { supabase } from '@/integrations/supabase/client';

/** Diagnostic Result. */
export interface DiagnosticResult {
  step: string;
  status: 'ok' | 'fail' | 'warn';
  message: string;
  details?: Record<string, unknown> | null;
}

/** run Evolution Diagnostics. */
export async function runEvolutionDiagnostics(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // 1. Banco self-hosted configurado (consolidação: cliente único, schema zapp)
  results.push({
    step: 'Configuração do Banco Self-Hosted (Evolution DB)',
    status: 'ok',
    message: 'Supabase self-hosted (schema zapp) em uso via cliente único.',
  });

  // 2. Test Edge Function Proxy Connectivity
  try {
    const startProxy = Date.now();
    let proxyData: unknown, proxyError: unknown;
    try { proxyData = await listInstances(); } catch (err) { proxyError = err; }
    const proxyLatency = Date.now() - startProxy;

    if (proxyError) {
      results.push({
        step: 'Evolution Proxy (Edge Function)',
        status: 'fail',
        message: `Falha na Edge Function: ${proxyError.message}`,
        details: proxyError,
      });
    } else {
      results.push({
        step: 'Evolution Proxy (Edge Function)',
        status: 'ok',
        message: `Proxy respondendo em ${proxyLatency}ms. Comunicação Lovable -> Self-Hosted validada.`,
        details: proxyData,
      });

      // 3. Test API Key Permissions
      const instances = Array.isArray(proxyData)
        ? proxyData
        : (proxyData as Record<string, unknown>)?.instances;
      if (Array.isArray(instances)) {
        results.push({
          step: 'Global API Key (Evolution)',
          status: 'ok',
          message: `Credenciais válidas. ${instances.length} instâncias retornadas pelo seu servidor.`,
          details: { count: instances.length },
        });
      } else {
        results.push({
          step: 'Global API Key (Evolution)',
          status: 'warn',
          message: 'Conectado, mas o formato de resposta da Evolution API é inesperado.',
          details: proxyData,
        });
      }
    }
  } catch (err: unknown) {
    results.push({
      step: 'Conectividade Self-Hosted',
      status: 'fail',
      message: `Erro crítico ao tentar usar a Edge Function: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 4. Test External Database Direct Connection
  try {
    // Connectivity probe against the DB — a working query suffices
    const { error: extError } = await supabase.from('contacts').select('id').limit(1);
    results.push({
      step: 'Database Direct (Self-Hosted)',
      status: extError ? 'fail' : 'ok',
      message: extError
        ? `Erro ao acessar o Postgres self-hosted: ${extError.message}`
        : 'Conexão direta com o banco do seu Supabase externo está OK.',
      details: extError ? { message: extError.message, code: extError.code, hint: extError.hint } : null,
    });
  } catch (err: unknown) {
    results.push({
      step: 'Database Direct (Evolution DB)',
      status: 'fail',
      message: `Falha na conexão com banco de dados: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}