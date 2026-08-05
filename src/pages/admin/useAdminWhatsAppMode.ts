import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { fromTable } from '@/lib/supabaseHelpers';
import {
  getWhatsAppMode,
  invalidateWhatsAppModeCache,
  getCloudWebhookUrl,
  type WhatsAppMode,
} from '@/lib/whatsappAdapter';
import { useToast } from '@/hooks/use-toast';
import type { SecretStatus, VerifyResult } from './adminWhatsAppModeTypes';

/** Estado das credenciais oficiais persistidas na TABELA (por conexão). */
export interface TableCredStatus {
  connection_id: string;
  connection_name: string;
  phone_number_id: string | null;
  waba_id: string | null;
  has_access_token: boolean;
  has_app_secret: boolean;
}

/** use Admin Whats App Mode. */
export function useAdminWhatsAppMode() {
  const { toast } = useToast();
  const [mode, setMode] = useState<WhatsAppMode>('unofficial');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secrets, setSecrets] = useState<SecretStatus[] | null>(null);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [tableCreds, setTableCreds] = useState<TableCredStatus[] | null>(null);
  const [tableCredsLoading, setTableCredsLoading] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const webhookUrl = getCloudWebhookUrl();

  const refresh = useCallback(async () => {
    setLoading(true);
    const m = await getWhatsAppMode(true);
    setMode(m);
    setLoading(false);
  }, []);

  /**
   * WHATSAPP-06: o status agora reflete TAMBÉM a tabela
   * `whatsapp_official_credentials_safe` (por conexão), além dos secrets de
   * ambiente do edge `whatsapp-cloud-secrets-status`. A view segura é a mesma
   * fonte usada pelo OfficialApiConfigDialog, então o que o admin vê aqui é o
   * que foi realmente persistido pelo formulário de credenciais.
   */
  const refreshTableCreds = useCallback(async () => {
    setTableCredsLoading(true);
    try {
      const safeView = fromTable('whatsapp_official_credentials_safe') as unknown as {
        select: (columns: string) => Promise<{
          data: Array<{
            connection_id: string | null;
            phone_number_id: string | null;
            waba_id: string | null;
            has_access_token: boolean | null;
            has_app_secret: boolean | null;
          }> | null;
          error: unknown;
        }>;
      };
      const [safeRes, connsRes] = await Promise.all([
        safeView.select(
          'connection_id, phone_number_id, waba_id, has_access_token, has_app_secret'
        ),
        supabase.from('whatsapp_connections').select('id, name, api_type').order('name'),
      ]);
      const safeErr = safeRes.error as { message?: string } | null;
      if (safeErr) throw safeErr;
      const connsErr = connsRes.error;
      if (connsErr) throw connsErr;
      const conns = connsRes.data ?? [];
      const byId = new Map(conns.map((c) => [c.id, c.name ?? 'Conexão']));
      setTableCreds(
        (safeRes.data ?? []).map((c) => ({
          connection_id: c.connection_id ?? '',
          connection_name: c.connection_id ? (byId.get(c.connection_id) ?? 'Conexão') : 'Conexão',
          phone_number_id: c.phone_number_id,
          waba_id: c.waba_id,
          has_access_token: Boolean(c.has_access_token),
          has_app_secret: Boolean(c.has_app_secret),
        }))
      );
    } catch (e) {
      setTableCreds(null);
      toast({
        title: 'Falha ao consultar credenciais por conexão',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setTableCredsLoading(false);
    }
  }, [toast]);

  const refreshSecrets = useCallback(async () => {
    setSecretsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-secrets-status');
      if (error) throw error;
      setSecrets((data as { secrets: SecretStatus[] }).secrets);
    } catch (e) {
      toast({
        title: 'Falha ao consultar secrets',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSecretsLoading(false);
    }
    // O botão "Recarregar status" também atualiza o estado por conexão (tabela).
    void refreshTableCreds();
  }, [toast, refreshTableCreds]);

  const runVerify = useCallback(async () => {
    setVerifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-webhook-verify');
      if (error) throw error;
      setVerify(data as VerifyResult); // ignore-audit: narrows Supabase query result to local interface
    } catch (e) {
      toast({
        title: 'Falha na verificação',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setVerifyLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    document.title = 'Modo WhatsApp — Configurações';
    void refresh();
    void refreshSecrets();
    void refreshTableCreds();
  }, [refresh, refreshSecrets, refreshTableCreds]);

  const handleToggle = async (checked: boolean) => {
    const next: WhatsAppMode = checked ? 'official' : 'unofficial';
    setSaving(true);
    try {
      const { error } = await safeClient.rpc('rpc_set_whatsapp_mode', { p_mode: next });
      if (error) throw error;
      invalidateWhatsAppModeCache();
      setMode(next);
      toast({
        title: 'Modo atualizado',
        description:
          next === 'official'
            ? 'Sistema agora envia via WhatsApp Cloud API (oficial).'
            : 'Sistema agora envia via Evolution API (não-oficial).',
      });
    } catch (e) {
      toast({
        title: 'Falha ao atualizar modo',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: 'Copiado', description: text });
  };

  const allConfigured = secrets ? secrets.every((s) => s.configured) : false;
  const missingCount = secrets ? secrets.filter((s) => !s.configured).length : 0;

  return {
    mode,
    loading,
    saving,
    secrets,
    secretsLoading,
    tableCreds,
    tableCredsLoading,
    verify,
    verifyLoading,
    webhookUrl,
    allConfigured,
    missingCount,
    refresh,
    refreshSecrets,
    refreshTableCreds,
    runVerify,
    handleToggle,
    copy,
  };
}
