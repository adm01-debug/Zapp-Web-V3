// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { updateRuntimeExternalConfig } from '@/integrations/supabase/externalClient';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('Connections');

const APP_ENV = (import.meta.env.VITE_APP_ENV || 'production') as
  'development' | 'staging' | 'production';

const getInitialConfig = () => {
  switch (APP_ENV) {
    case 'development':
      return {
        url:
          import.meta.env.VITE_DEV_EXTERNAL_SUPABASE_URL || 'https://supabase-dev.atomicabr.com.br',
        key: import.meta.env.VITE_DEV_EXTERNAL_SUPABASE_ANON_KEY || '',
      };
    case 'staging':
      return {
        url:
          import.meta.env.VITE_STAGING_EXTERNAL_SUPABASE_URL ||
          'https://supabase-staging.atomicabr.com.br',
        key: import.meta.env.VITE_STAGING_EXTERNAL_SUPABASE_ANON_KEY || '',
      };
    default:
      return {
        url: import.meta.env.VITE_EXTERNAL_SUPABASE_URL || 'https://supabase.atomicabr.com.br',
        key: import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || '',
      };
  }
};

const initialConfig = getInitialConfig();
export const DEFAULT_EXTERNAL_URL = initialConfig.url;
export const DEFAULT_EXTERNAL_KEY = initialConfig.key;

// MCP server endpoint (self-hosted canônico — migrado de cloud em 30/06/2026)
export const MCP_SERVER_URL = 'https://supabase.atomicabr.com.br/functions/v1/mcp-server';

export interface SystemConnectionPayload {
  name: string;
  provider: string;
  config: { url: string; anon_key: string };
  is_active: boolean;
}

export interface SystemConnection {
  id: string;
  name: string;
  provider: string;
  config: { url: string; anon_key: string };
  is_active: boolean;
  created_at: string;
  created_by?: string | null;
  updated_at?: string | null;
}

export function useConnections() {
  const [activeTab, setActiveTab] = useState('external-db');
  const [connections, setConnections] = useState<SystemConnection[]>([]);

  const [externalUrl, setExternalUrl] = useState(DEFAULT_EXTERNAL_URL);
  const [externalKey, setExternalKey] = useState(DEFAULT_EXTERNAL_KEY);
  const [editOpen, setEditOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(DEFAULT_EXTERNAL_URL);
  const [draftKey, setDraftKey] = useState(DEFAULT_EXTERNAL_KEY);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const isMountedRef = useRef(true);

  const checkAdminStatus = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!isMountedRef.current) return;

      setCurrentUserId(user?.id ?? null);
      if (user?.id) {
        const { data: roles, error: rolesError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (rolesError) throw rolesError;
        if (!isMountedRef.current) return;

        const hasAccess = !!roles?.some(
          (r: { role: string | null }) => r.role === 'admin' || r.role === 'dev'
        ); // ignore-audit
        setIsAdmin(hasAccess);

        if (!hasAccess) {
          log.warn('User logged in without admin/dev permission', { email: user.email });
        }
      } else {
        setIsAdmin(false);
      }
    } catch (e: unknown) {
      log.error('Error checking roles or connection', e);
      if (!isMountedRef.current) return;
      setIsAdmin(false);
      const msg = e instanceof Error ? e.message : 'Banco indisponível';
      toast({
        title: 'Erro de Conexão ou Acesso',
        description: `Não foi possível validar seu nível de acesso: ${msg}.`,
        variant: 'destructive',
      });
    }
  }, []);

  const fetchConnections = useCallback(async () => {
    const { data, error } = await safeClient.from<SystemConnection>('system_connections', (q) =>
      q.select('*').order('created_at', { ascending: false })
    );

    if (!isMountedRef.current) return;
    if (!error && data) {
      setConnections(data as SystemConnection[]); // ignore-audit: narrows Supabase query result to local interface
      const fatorX = (data as SystemConnection[]).find(
        (c) => c.provider === 'supabase_external' || c.name === 'FATOR X'
      );
      if (fatorX?.config?.url && fatorX?.config?.anon_key) {
        setExternalUrl(fatorX.config.url);
        setDraftUrl(fatorX.config.url);
        setExternalKey(fatorX.config.anon_key);
        setDraftKey(fatorX.config.anon_key);
        updateRuntimeExternalConfig(fatorX.config.url, fatorX.config.anon_key);
      }
    }
  }, []);

  useEffect(() => {
    void fetchConnections();
    void checkAdminStatus();

    const handleFocus = () => void checkAdminStatus();
    window.addEventListener('focus', handleFocus);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchConnections, checkAdminStatus]);

  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value);
      void checkAdminStatus();
      void fetchConnections();
    },
    [checkAdminStatus, fetchConnections]
  );

  const openEditor = useCallback(() => {
    setDraftUrl(externalUrl);
    setDraftKey(externalKey);
    setEditOpen(true);
  }, [externalUrl, externalKey]);

  const cancelEdit = useCallback(() => {
    setEditOpen(false);
    setDraftUrl(externalUrl);
    setDraftKey(externalKey);
  }, [externalUrl, externalKey]);

  const testConnection = useCallback(async (url: string, key: string): Promise<boolean> => {
    if (!url || !key) {
      toast({ title: 'Preencha URL e chave', variant: 'destructive' });
      return false;
    }
    setTesting(true);
    try {
      const res = await fetch(
        `${url.replace(/\/$/, '')}/rest/v1/?apikey=${encodeURIComponent(key)}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (res.status < 500) {
        toast({ title: 'Conexão OK', description: `Resposta ${res.status} do endpoint.` });
        return true;
      }
      toast({
        title: 'Falha na conexão',
        description: `HTTP ${res.status}`,
        variant: 'destructive',
      });
      return false;
    } catch (e: unknown) {
      // ignore-audit
      toast({
        title: 'Erro de rede',
        description: e instanceof Error ? e.message : 'falha desconhecida',
        variant: 'destructive',
      });
      return false;
    } finally {
      setTesting(false);
    }
  }, []);

  const saveCredentials = useCallback(async () => {
    if (!draftUrl || !draftKey) {
      toast({
        title: 'Campos obrigatórios',
        description: 'URL e Chave Anon não podem ficar vazios.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    setSaveError(null);

    if (isAdmin === false) {
      const msg =
        'Você precisa ser admin ou dev para salvar conexões do sistema. Faça login com uma conta com esse nível de acesso.';
      setSaveError(msg);
      toast({ title: 'Sem permissão', description: msg, variant: 'destructive' });
      setSaving(false);
      return;
    }

    const payload: SystemConnectionPayload = {
      name: 'FATOR X',
      provider: 'supabase_external',
      config: { url: draftUrl, anon_key: draftKey },
      is_active: true,
    };

    try {
      const existing = connections.find(
        (c) => c.provider === 'supabase_external' || c.name === 'FATOR X'
      );
      const insertPayload = currentUserId ? { ...payload, created_by: currentUserId } : payload;

      const { data, error } = await safeClient.from<SystemConnection>('system_connections', (q) =>
        existing
          ? q.update(payload).eq('id', existing.id).select()
          : q.insert(insertPayload).select()
      );

      if (error) {
        const msg = `Falha na escrita [Provider: ${payload.provider}]: ${error.message}${error.code ? ` (Code: ${error.code})` : ''}`;
        setSaveError(msg);
        toast({ title: 'Erro ao salvar no Supabase', description: msg, variant: 'destructive' });
        return;
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        const msg = `A requisição foi processada, mas nenhum dado foi retornado. Verifique se as permissões de RLS permitem a inserção/atualização.`;
        setSaveError(msg);
        toast({ title: 'Escrita não confirmada', description: msg, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Confirmando gravação...',
        description: 'Aguardando sincronização do banco.',
      });

      await new Promise((resolve) => setTimeout(resolve, 800));

      const { data: verify, error: verifyError } = await safeClient.single<{
        id: string;
        updated_at: string | null;
      }>('system_connections', (q) =>
        q.select('id, updated_at').eq('provider', 'supabase_external').eq('name', 'FATOR X')
      );

      if (verifyError || !verify) {
        const msg = `O SELECT de validação falhou: ${verifyError?.message ?? 'Registro não encontrado'}. Tente recarregar a página.`;
        setSaveError(msg);
        toast({ title: 'Confirmação falhou', description: msg, variant: 'destructive' });
        return;
      }

      setExternalUrl(draftUrl);
      setExternalKey(draftKey);
      setEditOpen(false);
      updateRuntimeExternalConfig(draftUrl, draftKey);

      toast({
        title: 'Credenciais salvas e validadas',
        description: `Configuração atualizada via runtime. Redirecionando para Status da Ponte...`,
      });

      setTimeout(() => {
        window.location.href = '/admin/bridge-status';
      }, 1500);

      await fetchConnections();
    } catch (e: unknown) {
      const msg = `[Exceção] ${e instanceof Error ? e.message : 'Falha desconhecida ao processar a requisição.'}`;
      setSaveError(msg);
      toast({ title: 'Erro inesperado', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [draftUrl, draftKey, isAdmin, connections, currentUserId, fetchConnections]);

  return {
    activeTab,
    handleTabChange,
    connections,
    externalUrl,
    externalKey,
    editOpen,
    draftUrl,
    setDraftUrl,
    draftKey,
    setDraftKey,
    testing,
    saving,
    saveError,
    isAdmin,
    openEditor,
    cancelEdit,
    testConnection,
    saveCredentials,
  };
}
