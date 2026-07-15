// @ts-nocheck
/**
 * useEvolutionApiIntegration — Wave 3 (2026-07-06)
 * Camada de dados extraída de EvolutionApiIntegrationView (componente ficou 100% UI).
 * Semântica preservada: Promise.all no fetch, auto-teste antes do save, logs de health.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface EvolutionInstanceCredential {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
  is_active: boolean;
  health_status: 'healthy' | 'unhealthy' | 'error' | 'unknown';
  last_health_check: string | null;
  created_at: string;
}

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
      toast.error('URL e Chave de API são obrigatórias para o teste');
      return false;
    }

    const testId = creds.id || 'new';
    setTesting(testId);
    const startTime = Date.now();
    const timeoutMs = 10000;

    try {
      const url = normalizeUrl(creds.api_url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${url}/instance/fetchInstances`, {
        method: 'GET',
        headers: { apikey: creds.api_key },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      const isSuccess = response.ok;
      let errorMsg: string | null = null;
      let onlineCount = 0;
      let totalCount = 0;

      if (isSuccess) {
        const data = await response.json();
        const instances = Array.isArray(data) ? data : [];
        totalCount = instances.length;
        onlineCount = instances.filter(
          (i: { connectionStatus?: string }) => i.connectionStatus === 'open'
        ).length;
        toast.success(`Teste bem-sucedido para ${creds.instance_name || 'nova config'}`);
      } else {
        errorMsg =
          response.status === 401 ? 'Chave de API inválida' : `Erro HTTP ${response.status}`;
        toast.error(`Falha no teste: ${errorMsg}`);
      }

      // Log the health check in the database
      if (creds.instance_name) {
        await supabase.from('evolution_health_logs').insert({
          instance_name: creds.instance_name,
          status: isSuccess ? 'success' : 'failure',
          error_message: errorMsg,
          response_time_ms: responseTime,
          online_instances: onlineCount,
          total_instances: totalCount,
        });

        // Update credential status
        await supabase
          .from('evolution_instance_credentials')
          .update({
            health_status: isSuccess ? 'healthy' : 'unhealthy',
            last_health_check: new Date().toISOString(),
          })
          .eq('id', creds.id);

        fetchData();
      }

      return isSuccess;
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const errorMsg = rawMsg.includes('fetch') ? 'Erro de rede/URL inacessível' : rawMsg;
      toast.error(`Erro de conexão: ${errorMsg}`);

      if (creds.instance_name) {
        await supabase.from('evolution_health_logs').insert({
          instance_name: creds.instance_name,
          status: 'failure',
          error_message: errorMsg,
          response_time_ms: Date.now() - startTime,
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

    const payload = {
      instance_name: formData.instance_name,
      api_url: normalizedUrl,
      api_key: formData.api_key,
      health_status: isTestOk ? 'healthy' : 'unhealthy',
      last_health_check: new Date().toISOString(),
    };

    try {
      if (formData.is_editing) {
        const { error } = await supabase
          .from('evolution_instance_credentials')
          .update(payload)
          .eq('id', formData.is_editing);
        if (error) throw error;
        toast.success('Configurações atualizadas');
      } else {
        const { error } = await supabase.from('evolution_instance_credentials').insert(payload);
        if (error) throw error;
        toast.success('Novas credenciais salvas');
      }

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
      const { error } = await supabase.from('evolution_instance_credentials').delete().eq('id', id);
      if (error) throw error;
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