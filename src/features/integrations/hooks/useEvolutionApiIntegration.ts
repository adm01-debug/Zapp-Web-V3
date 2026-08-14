import { listInstances } from '@/lib/whatsappAdapter';
/**
 * useEvolutionApiIntegration — Wave 3 (2026-07-06) / rewrite 2026-08-04
 * Camada de dados extraída de EvolutionApiIntegrationView (componente ficou 100% UI).
 * Semântica preservada: Promise.all no fetch, auto-teste antes do save, logs de health.
 *
 * ARQUITETURA DE DADOS (rewrite):
 * - LEITURA: zapp.evolution_instance_credentials é uma VIEW auto-updatable no schema
 *   'zapp' (security_invoker=on) que OMITE api_key por segurança — usar supabase direto.
 * - ESCRITA: edge function 'evolution-credentials' (POST actions save/delete) roda com
 *   service_role e grava na tabela física em 'evo' (service_role only via RLS).
 * - HEALTH LOGS: gravados via RPC zapp.rpc_log_evolution_health (F3 ingest-port), NÃO
 *   via insert direto — evolution_health_logs é tabela física em 'evo', ainda não migrada.
 * - O schema 'evo' NÃO está no PGRST_DB_SCHEMAS — qualquer override de schema
 *   apontando para 'evo' falha com PGRST106 (guardrail check-schema-usage).
 *   PGRST106. Nunca usar evo a partir do client.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** Evolution Instance Credential interface definition. */
export interface EvolutionInstanceCredential {
  id: string;
  instance_name: string;
  api_url: string;
  /** Opcional: a view zapp NÃO expõe api_key (segurança); só vem preenchida do form, nunca da listagem. */
  api_key?: string;
  is_active: boolean;
  health_status: 'healthy' | 'unhealthy' | 'error' | 'unknown';
  last_health_check: string | null;
  created_at: string;
}

/** Health Log interface definition. */
export interface HealthLog {
  id: string;
  instance_name: string;
  status: 'success' | 'failure';
  error_message: string | null;
  response_time_ms: number;
  online_instances: number;
  total_instances: number;
  performed_at: string;
}

/** D E F A U L T_ U R L constant. */
export const DEFAULT_URL = 'https://evolution.atomicabr.com.br';

/** Manages Evolution API instance credentials, health checks, and connection testing with timeout protection. */
export function useEvolutionApiIntegration() {
  const [credentials, setCredentials] = useState<EvolutionInstanceCredential[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    instance_name: '',
    api_url: DEFAULT_URL,
    api_key: '',
    show_key: false,
    is_editing: null as string | null,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [credsRes, logsRes] = await Promise.all([
        // INVARIANT (INTEGRATION_INVARIANTS.md § REGRA CREDENCIAIS):
        //   zapp.evolution_instance_credentials é VIEW sem coluna api_key.
        //   SELECT '*' é seguro: api_key nunca é retornada. Não alterar para
        //   'evo.*' (não está no PGRST_DB_SCHEMAS) nem adicionar api_key ao select.
        supabase.from('evolution_instance_credentials').select('*').order('instance_name'),
        supabase
          .from('evolution_health_logs')
          .select('*')
          .order('performed_at', { ascending: false })
          .limit(20),
      ]);

      if (credsRes.error) throw credsRes.error;
      if (logsRes.error) throw logsRes.error;

      setCredentials(credsRes.data as EvolutionInstanceCredential[]); // ignore-audit: narrows nullable DB fields (api_key, api_url, is_active, health_status) to non-null
      setHealthLogs(logsRes.data as HealthLog[]); // ignore-audit: narrows nullable DB fields (instance_name, status, response_time_ms, etc.) to non-null
    } catch (err) {
      toast.error('Erro ao carregar dados: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const normalizeUrl = (url: string) => {
    let normalized = url.trim().replace(/\/+$/, '');
    if (!normalized.startsWith('http')) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  };

  const handleTestConnection = async (creds: Partial<EvolutionInstanceCredential>) => {
    if (!creds.api_url || !creds.api_key) {
      // Credenciais salvas vêm da view zapp, que omite api_key — sem a chave não há teste possível.
      if (creds.id) {
        toast.error('Informe a chave da API para testar');
      } else {
        toast.error('URL e Chave de API são obrigatórias para o teste');
      }
      return false;
    }

    const testId = creds.id || 'new';
    setTesting(testId);
    const startTime = Date.now();

    try {
      // AUTENTICAÇÃO VIA EDGE FUNCTION PROXY (fix D-7 2026-08-06):
      // NUNCA enviar chave da Evolution pelo cliente (bundle público). O proxy
      // 'evolution-api' valida o usuário autenticado (JWT do Supabase) e usa a
      // EVOLUTION_API_KEY server-side (secret v5). A chave digitada no form não
      // é transmitida — o teste valida a CONEXÃO da instância do servidor.
      let data: unknown;
      let error: unknown;
      try { data = await listInstances(); } catch (err) { error = err; }
      const responseTime = Date.now() - startTime;
      const isSuccess = !error;
      let errorMsg: string | null = null;
      let onlineCount = 0;
      let totalCount = 0;

      if (isSuccess) {
        const instances = Array.isArray(data) ? data : [];
        totalCount = instances.length;
        onlineCount = instances.filter(
          (i: { connectionStatus?: string }) => i.connectionStatus === 'open'
        ).length;
        toast.success(`Teste bem-sucedido para ${creds.instance_name || 'nova config'}`);
      } else {
        const status = (error as { status?: number } | null)?.status;
        errorMsg =
          status === 401 || String(error).includes('401')
            ? 'Chave de API inválida (servidor)'
            : `Erro HTTP ${status ?? 'desconhecido'}`;
        toast.error(`Falha no teste: ${errorMsg}`);
      }

      // Log the health check via RPC canônica (F3 ingest-port — evolution_health_logs vive em evo)
      if (creds.instance_name) {
        await supabase.rpc('rpc_log_evolution_health', {
          p_instance_name: creds.instance_name,
          p_status: isSuccess ? 'success' : 'failure',
          p_error_message: errorMsg,
          p_response_time_ms: responseTime,
          p_online_instances: onlineCount,
          p_total_instances: totalCount,
        });

        // health_status/last_health_check NÃO são atualizados aqui: a view omite api_key
        // e o update via evo falhava (PGRST106). A edge fn save não aceita health fields.
        fetchData();
      }

      return isSuccess;
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const errorMsg = rawMsg.includes('fetch') ? 'Erro de rede/URL inacessível' : rawMsg;
      toast.error(`Erro de conexão: ${errorMsg}`);

      if (creds.instance_name) {
        await supabase.rpc('rpc_log_evolution_health', {
          p_instance_name: creds.instance_name,
          p_status: 'failure',
          p_error_message: errorMsg,
          p_response_time_ms: Date.now() - startTime,
        });
        fetchData();
      }
      return false;
    } finally {
      setTesting(null);
    }
  };

  const handleSave = async () => {
    if (!formData.instance_name || !formData.api_url || !formData.api_key) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const normalizedUrl = normalizeUrl(formData.api_url);

    // Auto-test before saving
    const isTestOk = await handleTestConnection({
      api_url: normalizedUrl,
      api_key: formData.api_key,
      instance_name: formData.instance_name,
    });

    if (!isTestOk) {
      toast.warning('Atenção: O teste de conexão falhou, mas as credenciais serão salvas.');
    }

    try {
      // Escrita via edge function (service_role) — a física está em evo; a view zapp não aceita api_key.
      const { data, error } = await supabase.functions.invoke('evolution-credentials', {
        method: 'POST',
        body: {
          action: 'save',
          instance_name: formData.instance_name,
          api_url: normalizedUrl,
          api_key: formData.api_key,
          is_active: true,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Falha ao salvar');

      // A edge fn faz upsert por instance_name — is_editing (update por id) é ignorado.
      toast.success(formData.is_editing ? 'Configurações atualizadas' : 'Novas credenciais salvas');

      setFormData({
        instance_name: '',
        api_url: DEFAULT_URL,
        api_key: '',
        show_key: false,
        is_editing: null,
      });
      fetchData();
    } catch (err: unknown) {
      toast.error('Erro ao salvar: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir as credenciais da instância "${name}"?`))
      return;

    try {
      const { data, error } = await supabase.functions.invoke('evolution-credentials', {
        method: 'POST',
        body: { action: 'delete', id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Falha ao excluir');
      toast.success('Credenciais excluídas');
      fetchData();
    } catch (err: unknown) {
      toast.error('Erro ao excluir: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return {
    credentials,
    healthLogs,
    loading,
    testing,
    formData,
    setFormData,
    fetchData,
    handleTestConnection,
    handleSave,
    handleDelete,
    normalizeUrl,
  };
}
