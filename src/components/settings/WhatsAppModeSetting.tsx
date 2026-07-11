import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  getWhatsAppMode,
  invalidateWhatsAppModeCache,
  type WhatsAppMode,
} from '@/lib/whatsappAdapter';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, Zap, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface IntegrationProfile {
  provider: 'evolution' | 'cloud';
  default_instance: string | null;
  display_phone: string | null;
  waba_name: string | null;
  migration_status: 'pending' | 'migrated' | 'pending_credentials' | 'noop' | 'error';
  migration_notes: string | null;
  migrated_at: string | null;
}

/**
 * Seletor de modo WhatsApp (Oficial Cloud API vs Não-oficial Evolution).
 * Persistência por workspace via `global_settings.whatsapp_mode` (RPC `rpc_set_whatsapp_mode`).
 * Reusa a mesma fonte de verdade da página /admin/whatsapp-mode.
 */
export function WhatsAppModeSetting() {
  const [mode, setMode] = useState<WhatsAppMode>('unofficial');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<IntegrationProfile | null>(null);
  const [migrating, setMigrating] = useState(false);

  const loadProfile = useCallback(async () => {
    // deno-lint-ignore no-explicit-any
    const { data } = await supabase.rpc('rpc_get_active_integration_profile' as any);
    if (data) setProfile(data as IntegrationProfile);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const m = await getWhatsAppMode(true);
      setMode(m);
      await loadProfile();
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRunMigration = async () => {
    setMigrating(true);
    try {
      // deno-lint-ignore no-explicit-any
      const { error } = await supabase.rpc('rpc_migrate_whatsapp_integration' as any);
      if (error) throw error;
      invalidateWhatsAppModeCache();
      await refresh();
      toast.success('Migração de integração re-executada');
    } catch (e) {
      toast.error(`Falha na migração: ${e instanceof Error ? e.message : 'erro'}`);
    } finally {
      setMigrating(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    const next: WhatsAppMode = checked ? 'official' : 'unofficial';
    const previous = mode;
    setSaving(true);
    setMode(next); // optimistic
    try {
      // deno-lint-ignore no-explicit-any
      const { error } = await supabase.rpc('rpc_set_whatsapp_mode' as any, {
        p_mode: next,
      });
      if (error) throw error;
      invalidateWhatsAppModeCache();
      toast.success(
        next === 'official'
          ? 'Modo oficial (Cloud API) ativado para o workspace'
          : 'Modo não-oficial (Evolution) ativado para o workspace'
      );
    } catch (e) {
      setMode(previous);
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast.error(`Falha ao alterar modo: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const Icon = mode === 'official' ? ShieldCheck : Zap;

  return (
    <div className="space-y-3 rounded-lg border border-border/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Modo de WhatsApp</Label>
              <Badge
                variant={mode === 'official' ? 'default' : 'secondary'}
                className="text-[10px]"
              >
                {mode === 'official' ? 'Oficial' : 'Não-oficial'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === 'official'
                ? 'Envios e webhooks via WhatsApp Cloud API (Meta). Requer templates aprovados fora da janela 24h.'
                : 'Envios e webhooks via Evolution API (Baileys). Sem limites de templates.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(loading || saving) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Switch
            checked={mode === 'official'}
            disabled={loading || saving}
            onCheckedChange={handleToggle}
            aria-label="Alternar para modo oficial Cloud API"
          />
        </div>
      </div>
      <p className="pl-7 text-[11px] text-muted-foreground/80">
        Preferência salva por workspace. Alterações afetam todos os usuários imediatamente.
      </p>

      {profile && (
        <div className="ml-7 mt-2 space-y-1 rounded-md border border-border/30 bg-muted/20 p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Perfil ativo:</span>
              <Badge variant="outline" className="text-[10px]">
                {profile.provider === 'cloud' ? 'Meta Cloud' : 'Evolution'}
              </Badge>
              <Badge
                variant={
                  profile.migration_status === 'migrated'
                    ? 'default'
                    : profile.migration_status === 'pending_credentials'
                      ? 'secondary'
                      : 'outline'
                }
                className="text-[10px]"
              >
                {profile.migration_status === 'migrated' && 'migrado'}
                {profile.migration_status === 'pending_credentials' && 'credenciais pendentes'}
                {profile.migration_status === 'pending' && 'pendente'}
                {profile.migration_status === 'noop' && 'sem alterações'}
                {profile.migration_status === 'error' && 'erro'}
              </Badge>
              {profile.default_instance && (
                <span className="text-muted-foreground">
                  instância: <code>{profile.default_instance}</code>
                </span>
              )}
              {profile.display_phone && (
                <span className="text-muted-foreground">
                  tel: <code>{profile.display_phone}</code>
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={handleRunMigration}
              disabled={migrating}
            >
              {migrating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span className="ml-1">Re-migrar</span>
            </Button>
          </div>
          {profile.migration_notes && (
            <p className="text-[11px] text-muted-foreground">{profile.migration_notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
