import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import {
  getWhatsAppMode,
  invalidateWhatsAppModeCache,
  getCloudWebhookUrl,
  type WhatsAppMode,
} from '@/lib/whatsappAdapter';
import { useToast } from '@/hooks/use-toast';
import type { SecretStatus, VerifyResult } from './adminWhatsAppModeTypes';

/** use Admin Whats App Mode. */
export function useAdminWhatsAppMode() {
  const { toast } = useToast();
  const [mode, setMode] = useState<WhatsAppMode>('unofficial');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secrets, setSecrets] = useState<SecretStatus[] | null>(null);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const webhookUrl = getCloudWebhookUrl();

  const refresh = useCallback(async () => {
    setLoading(true);
    const m = await getWhatsAppMode(true);
    setMode(m);
    setLoading(false);
  }, []);

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
  }, [toast]);

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
  }, [refresh, refreshSecrets]);

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
    verify,
    verifyLoading,
    webhookUrl,
    allConfigured,
    missingCount,
    refresh,
    refreshSecrets,
    runVerify,
    handleToggle,
    copy,
  };
}
