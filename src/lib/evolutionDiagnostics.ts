import { whatsappConnectionRepository } from '@/features/connections/data-access/whatsappConnectionRepository';
import { isExternalConfigured, getExternalSupabase } from '@/integrations/supabase/externalClient';

export interface DiagnosticResult {
  step: string;
  status: 'ok' | 'fail' | 'warn';
  message: string;
  details?: any;
}

export async function runEvolutionDiagnostics(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // 1. Check if external Supabase is configured
  results.push({
    step: 'Configuração do Banco Externo (FATOR X)',
    status: isExternalConfigured ? 'ok' : 'fail',
    message: isExternalConfigured
      ? 'URL e Anon Key do seu Supabase externo estão configurados nos Secrets.'
      : 'Secrets VITE_EXTERNAL_SUPABASE_URL ou VITE_EXTERNAL_SUPABASE_ANON_KEY ausentes.',
  });

  // 2. Test Edge Function Proxy Connectivity
  try {
    const startProxy = Date.now();
    const { data: proxyData, error: proxyError } =
      await whatsappConnectionRepository.callEvolutionApi({
        action: 'list-instances',
      });
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
        message: `Proxy respondendo em ${proxyLatency}ms. Comunicação Lovable -> FATOR X validada.`,
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
      step: 'Conectividade Lovable Cloud',
      status: 'fail',
      message: `Erro crítico ao tentar usar a Edge Function: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 4. Test External Database Direct Connection
  if (isExternalConfigured) {
    try {
      const extSupabase = getExternalSupabase();
      if (extSupabase) {
        // Connectivity probe against the external DB — a working query suffices
        const { error: extError } = await extSupabase.from('contacts').select('id').limit(1);
        results.push({
          step: 'Database Direct (FATOR X)',
          status: extError ? 'fail' : 'ok',
          message: extError
            ? `Erro ao acessar o Postgres do FATOR X: ${extError.message}`
            : 'Conexão direta com o banco do seu Supabase externo está OK.',
          details: extError,
        });
      }
    } catch (err: unknown) {
      results.push({
        step: 'Database Direct (FATOR X)',
        status: 'fail',
        message: `Falha na conexão com banco de dados: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return results;
}
