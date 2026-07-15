// @ts-nocheck
import { useState, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { supabase } from '@/integrations/supabase/client';
import { safeWhatsAppConnectionsQuery } from '@/integrations/supabase/safe-queries';
import { toast } from 'sonner';
import { Loader2, Settings, Shield, User, Tag, History, RotateCcw } from 'lucide-react';
import { getLogger } from '@/lib/logger';
import {
  SettingsTabContent,
  PrivacyTabContent,
  LabelsTabContent,
} from './InstanceSettingsTabContent';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/schema';

const log = getLogger('InstanceSettingsDialog');

interface ReconnectionLog {
  id: string;
  result: 'success' | string;
  created_at: string;
  attempt_number: number;
  error_message: string | null;
}

interface EvolutionInstanceSettings {
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

interface EvolutionLabel {
  id: string;
  name: string;
  color: string;
}

interface ReconnectionLogRow {
  id: string;
  status: string | null;
  created_at: string | null;
  attempt_number: number | null;
  error_message: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeInstanceSettings(value: unknown): EvolutionInstanceSettings {
  if (!isRecord(value)) return {};
  return {
    rejectCall: typeof value.rejectCall === 'boolean' ? value.rejectCall : undefined,
    msgCall: typeof value.msgCall === 'string' ? value.msgCall : undefined,
    groupsIgnore: typeof value.groupsIgnore === 'boolean' ? value.groupsIgnore : undefined,
    alwaysOnline: typeof value.alwaysOnline === 'boolean' ? value.alwaysOnline : undefined,
    readMessages: typeof value.readMessages === 'boolean' ? value.readMessages : undefined,
    readStatus: typeof value.readStatus === 'boolean' ? value.readStatus : undefined,
    syncFullHistory: typeof value.syncFullHistory === 'boolean' ? value.syncFullHistory : undefined,
  };
}

function normalizeReconnectionLogs(rows: ReconnectionLogRow[]): ReconnectionLog[] {
  return rows.map((row) => ({
    id: row.id,
    result: row.status ?? 'failed',
    created_at: row.created_at ?? new Date(0).toISOString(),
    attempt_number: row.attempt_number ?? 0,
    error_message: row.error_message,
  }));
}

function normalizeLabels(value: unknown): EvolutionLabel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = typeof item.id === 'string' ? item.id : typeof item._id === 'string' ? item._id : '';
    const name = typeof item.name === 'string' ? item.name : typeof item.label === 'string' ? item.label : '';
    const color = typeof item.color === 'string' ? item.color : 'hsl(var(--primary))';
    return id && name ? [{ id, name, color }] : [];
  });
}

interface InstanceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  connectionName: string;
  connectionId?: string;
}

const SETTINGS_ITEMS = [
  { key: 'rejectCall', label: 'Rejeitar chamadas', desc: 'Rejeita chamadas automaticamente' },
  { key: 'groupsIgnore', label: 'Ignorar grupos', desc: 'Não processar mensagens de grupos' },
  { key: 'alwaysOnline', label: 'Sempre online', desc: 'Mantém o status como online' },
  {
    key: 'readMessages',
    label: 'Leitura automática',
    desc: 'Marca mensagens como lidas automaticamente',
  },
  { key: 'readStatus', label: 'Ver status', desc: 'Marca status/stories como visualizados' },
  {
    key: 'syncFullHistory',
    label: 'Sincronizar histórico',
    desc: 'Baixa todo o histórico de mensagens',
  },
] as const;

const PRIVACY_ITEMS = [
  { key: 'readreceipts', label: 'Confirmação de leitura' },
  { key: 'profile', label: 'Foto de perfil' },
  { key: 'status', label: 'Status/recado' },
  { key: 'online', label: 'Online' },
  { key: 'last', label: 'Visto por último' },
  { key: 'groupadd', label: 'Adicionar em grupos' },
] as const;

const PRIVACY_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'contacts', label: 'Contatos' },
  { value: 'contact_blacklist', label: 'Contatos exceto...' },
  { value: 'none', label: 'Ninguém' },
];

export function InstanceSettingsDialog({
  open,
  onOpenChange,
  instanceName,
  connectionName,
  connectionId,
}: InstanceSettingsDialogProps) {
  const {
    getSettings,
    setSettings,
    fetchProfile,
    updateProfileName,
    updateProfileStatus,
    updateProfilePicture,
    removeProfilePicture,
    updatePrivacySettings,
    findLabels,
    isLoading,
  } = useEvolutionApi();
  const mountedRef = useMountedRef();

  const [settingsData, setSettingsData] = useState<Record<string, boolean | string>>({
    rejectCall: false,
    msgCall: '',
    groupsIgnore: false,
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: false,
  });
  const [auditLogs, setAuditLogs] = useState<ReconnectionLog[]>([]);
  const [loadingTab, setLoadingTab] = useState('');
  const [reconnectConfig, setReconnectConfig] = useState<{
    enabled: boolean;
    interval: number;
    maxAttempts: number;
    loopProtection: boolean;
  }>({
    enabled: true,
    interval: 30,
    maxAttempts: 5,
    loopProtection: false,
  });
  const [profile, setProfile] = useState<{
    name: string;
    status: string;
    pictureUrl: string;
  }>({
    name: '',
    status: '',
    pictureUrl: '',
  });
  const [privacy, setPrivacy] = useState<Record<string, string>>({
    readreceipts: 'all',
    profile: 'all',
    status: 'all',
    online: 'all',
    last: 'all',
    groupadd: 'all',
  });
  const [labels, setLabels] = useState<EvolutionLabel[]>([]);

  useEffect(() => {
    if (open && instanceName) {
      loadSettings();
      loadProfile();
      if (connectionId) {
        loadReconnectConfig();
      }
    }
  }, [open, instanceName, connectionId]);

  const loadReconnectConfig = async () => {
    if (!connectionId) return;
    try {
      const safeQueries = safeWhatsAppConnectionsQuery(supabase as unknown as SupabaseClient<Database>);
      const { data, error } = await safeQueries.getById(connectionId);

      if (!error && data && mountedRef.current) {
        setReconnectConfig({
          enabled: data.auto_reconnect_enabled ?? true,
          interval: data.reconnect_interval_seconds ?? 30,
          maxAttempts: data.max_reconnect_attempts ?? 5,
          loopProtection: data.loop_protection_active ?? false,
        });
      }
    } catch (err) {
      log.error('Error loading reconnect config:', err);
    }
  };

  const saveReconnectConfig = async () => {
    if (!connectionId) return;
    try {
      const { error } = await supabase
        .from('whatsapp_connections')
        .update({
          auto_reconnect_enabled: reconnectConfig.enabled,
          reconnect_interval_seconds: reconnectConfig.interval,
          max_reconnect_attempts: reconnectConfig.maxAttempts,
          loop_protection_active: reconnectConfig.loopProtection,
        })
        .eq('id', connectionId);

      if (error) throw error;
      toast.success('Política de reconexão salva!');
    } catch (err) {
      log.error('Error saving reconnect config:', err);
      toast.error('Falha ao salvar política');
    }
  };

  const loadAuditLogs = async () => {
    if (!connectionId) return;
    setLoadingTab('audit');
    try {
      const { data, error } = await supabase
        .from('reconnection_logs')
        .select('*')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data && mountedRef.current) {
        setAuditLogs(normalizeReconnectionLogs(data as ReconnectionLogRow[]));
      }
    } catch (err) {
      log.error('Error loading audit logs:', err);
    }
    if (mountedRef.current) setLoadingTab('');
  };

  const loadSettings = async () => {
    setLoadingTab('settings');
    try {
      const data = normalizeInstanceSettings(await getSettings(instanceName));
      if (data && mountedRef.current)
        setSettingsData({
          rejectCall: data.rejectCall ?? false,
          msgCall: data.msgCall ?? '',
          groupsIgnore: data.groupsIgnore ?? false,
          alwaysOnline: data.alwaysOnline ?? false,
          readMessages: data.readMessages ?? false,
          readStatus: data.readStatus ?? false,
          syncFullHistory: data.syncFullHistory ?? false,
        });
    } catch (err) {
      log.error('Error loading settings:', err);
    }
    if (mountedRef.current) setLoadingTab('');
  };

  const loadProfile = async () => {
    try {
      const raw = (await fetchProfile(instanceName)) as {
        name?: string;
        status?: string;
        profilePictureUrl?: string;
      } | null;
      if (raw && mountedRef.current)
        setProfile({
          name: raw.name ?? '',
          status: raw.status ?? '',
          pictureUrl: raw.profilePictureUrl ?? '',
        });
    } catch (err) {
      log.error('Error loading profile:', err);
    }
  };

  const loadLabels = async () => {
    setLoadingTab('labels');
    try {
      const data = await findLabels(instanceName);
      if (mountedRef.current) setLabels(normalizeLabels(data));
    } catch (err) {
      log.error('Error loading labels:', err);
    }
    if (mountedRef.current) setLoadingTab('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configurações — {connectionName}
          </DialogTitle>
          <DialogDescription>
            Gerencie configurações, perfil, privacidade e etiquetas da instância
          </DialogDescription>
        </DialogHeader>
        <Tabs
          defaultValue="settings"
          onValueChange={(v) => {
            if (v === 'labels') loadLabels();
          }}
        >
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="settings">
              <Settings className="mr-1 h-4 w-4" /> Config
            </TabsTrigger>
            <TabsTrigger value="profile">
              <User className="mr-1 h-4 w-4" /> Perfil
            </TabsTrigger>
            <TabsTrigger value="privacy">
              <Shield className="mr-1 h-4 w-4" /> Privacid.
            </TabsTrigger>
            <TabsTrigger value="audit" onClick={loadAuditLogs}>
              <History className="mr-1 h-4 w-4" /> Auditoria
            </TabsTrigger>
            <TabsTrigger value="labels">
              <Tag className="mr-1 h-4 w-4" /> Tags
            </TabsTrigger>
          </TabsList>

          <TabsContent value="audit" className="mt-4 space-y-4">
            <div className="rounded-xl border border-border/20 bg-muted/5 p-4">
              <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <RotateCcw className="h-4 w-4 text-primary" /> Política de Reconexão
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reconnect-interval">Intervalo (segundos)</Label>
                  <Input
                    id="reconnect-interval"
                    type="number"
                    value={reconnectConfig.interval}
                    onChange={(e) =>
                      setReconnectConfig((p) => ({ ...p, interval: parseInt(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reconnect-max-attempts">Máximo de Tentativas</Label>
                  <Input
                    id="reconnect-max-attempts"
                    type="number"
                    value={reconnectConfig.maxAttempts}
                    onChange={(e) =>
                      setReconnectConfig((p) => ({ ...p, maxAttempts: parseInt(e.target.value) }))
                    }
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-background/50 p-2">
                <div className="space-y-0.5">
                  <Label htmlFor="loop-protection">Proteção contra Loop</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Pausa automática se houver muitas quedas seguidas
                  </p>
                </div>
                <Switch
                  id="loop-protection"
                  checked={reconnectConfig.loopProtection}
                  onCheckedChange={(v) => setReconnectConfig((p) => ({ ...p, loopProtection: v }))}
                />
              </div>
              <Button onClick={saveReconnectConfig} size="sm" className="mt-4 h-8 w-full text-xs">
                Salvar Política
              </Button>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Histórico de Tentativas</h4>
              <ScrollArea className="h-[200px] w-full rounded-md border border-border/20 bg-muted/5 p-2">
                {loadingTab === 'audit' ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Nenhuma tentativa registrada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-col gap-1 rounded-lg border border-border/10 bg-background p-2 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <Badge
                            variant={log.result === 'success' ? 'default' : 'destructive'}
                            className="h-4 text-[9px]"
                          >
                            {log.result === 'success' ? 'Sucesso' : 'Falha'}
                          </Badge>
                          <span className="text-muted-foreground">
                            {format(new Date(log.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-muted-foreground">Tentativa #{log.attempt_number}</p>
                        {log.error_message && (
                          <p className="truncate font-mono text-destructive">{log.error_message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTabContent
              settingsData={settingsData}
              settingsItems={SETTINGS_ITEMS}
              onChange={(k, v) => setSettingsData((p) => ({ ...p, [k]: v }))}
              onSave={async () => {
                try {
                  await setSettings({ instanceName, ...settingsData });
                  toast.success('Configurações salvas!');
                } catch {
                  toast.error('Erro ao salvar');
                }
              }}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="profile" className="mt-4 space-y-4">
            {profile.pictureUrl && (
              <div className="flex justify-center">
                <img
                  src={profile.pictureUrl}
                  alt="Foto do perfil da instância"
                  className="h-24 w-24 rounded-full border-2 border-primary/30 object-cover"
                />
              </div>
            )}
            <div>
              <Label htmlFor="profile-name">Nome</Label>
              <Input
                id="profile-name"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nome do perfil"
              />
            </div>
            <div>
              <Label htmlFor="profile-status">Recado (Status)</Label>
              <Input
                id="profile-status"
                value={profile.status}
                onChange={(e) => setProfile((p) => ({ ...p, status: e.target.value }))}
                placeholder="Seu recado aqui..."
              />
            </div>
            <div>
              <Label htmlFor="profile-picture-url">Nova foto de perfil (URL)</Label>
              <div className="flex gap-2">
                <Input
                  id="profile-picture-url"
                  value={profile.pictureUrl}
                  onChange={(e) => setProfile((p) => ({ ...p, pictureUrl: e.target.value }))}
                  placeholder="https://exemplo.com/foto.jpg"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      if (profile.pictureUrl) {
                        await updateProfilePicture(instanceName, profile.pictureUrl);
                        toast.success('Foto atualizada!');
                      }
                    } catch {
                      toast.error('Erro ao atualizar foto');
                    }
                  }}
                >
                  Aplicar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    try {
                      await removeProfilePicture(instanceName);
                      setProfile((p) => ({ ...p, pictureUrl: '' }));
                      toast.success('Foto removida');
                    } catch {
                      toast.error('Erro ao remover foto');
                    }
                  }}
                >
                  Remover
                </Button>
              </div>
            </div>
            <Button
              onClick={async () => {
                try {
                  if (profile.name) await updateProfileName(instanceName, profile.name);
                  if (profile.status) await updateProfileStatus(instanceName, profile.status);
                  toast.success('Perfil atualizado!');
                } catch {
                  toast.error('Erro ao atualizar perfil');
                }
              }}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Perfil
            </Button>
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyTabContent
              privacy={privacy}
              privacyItems={PRIVACY_ITEMS}
              privacyOptions={PRIVACY_OPTIONS}
              onChange={(k, v) => setPrivacy((p) => ({ ...p, [k]: v }))}
              onSave={async () => {
                try {
                  await updatePrivacySettings({ instanceName, ...privacy });
                  toast.success('Privacidade atualizada!');
                } catch {
                  toast.error('Erro ao atualizar');
                }
              }}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="labels">
            <LabelsTabContent labels={labels} loading={loadingTab === 'labels'} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}