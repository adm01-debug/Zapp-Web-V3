import { useState, useEffect } from 'react';
import {
  Mail,
  MessageSquare,
  Phone,
  Webhook,
  Bell,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react';
import { useNotificationChannels } from '@/hooks/useNotificationChannels';
import type { NotificationChannelConfig, ChannelPatch } from '@/hooks/useNotificationChannels';
import { useUserRole } from '@/features/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Severity constants ──────────────────────────────────────────────────────
const SEVERITY_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  DEBUG: 'bg-muted text-muted-foreground',
  INFO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  WARNING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  ERROR: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

// ── Channel icon/label helpers ──────────────────────────────────────────────
function getChannelIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('email') || lower.includes('mail')) return Mail;
  if (lower.includes('slack')) return MessageSquare;
  if (lower.includes('whatsapp') || lower.includes('phone')) return Phone;
  if (lower.includes('webhook')) return Webhook;
  return Bell;
}

function capitalizeChannelName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ── Draft state per channel ─────────────────────────────────────────────────
interface ChannelDraft {
  enabled: boolean;
  min_severity: string;
  config: Record<string, unknown> | null;
  configText: string;
  configExpanded: boolean;
  configError: string | null;
}

function toDraft(ch: NotificationChannelConfig): ChannelDraft {
  return {
    enabled: ch.enabled,
    min_severity: ch.min_severity ?? 'CRITICAL',
    config: ch.config,
    configText: ch.config ? JSON.stringify(ch.config, null, 2) : '',
    configExpanded: false,
    configError: null,
  };
}

// ── Card component ──────────────────────────────────────────────────────────
interface ChannelCardProps {
  channel: NotificationChannelConfig;
  draft: ChannelDraft;
  isSaving: boolean;
  onDraftChange: (patch: Partial<ChannelDraft>) => void;
  onSave: () => void;
}

function ChannelCard({ channel, draft, isSaving, onDraftChange, onSave }: ChannelCardProps) {
  const Icon = getChannelIcon(channel.channel_name);
  const displayName = capitalizeChannelName(channel.channel_name);
  const isDirty =
    draft.enabled !== channel.enabled ||
    draft.min_severity !== (channel.min_severity ?? 'CRITICAL') ||
    draft.configText !== (channel.config ? JSON.stringify(channel.config, null, 2) : '');

  function handleConfigTextChange(text: string) {
    try {
      const parsed = text.trim() ? JSON.parse(text) : null;
      onDraftChange({ configText: text, config: parsed, configError: null });
    } catch {
      onDraftChange({ configText: text, configError: 'JSON inválido' });
    }
  }

  const severityColor =
    SEVERITY_COLORS[(draft.min_severity as SeverityLevel) ?? 'CRITICAL'] ??
    SEVERITY_COLORS.CRITICAL;

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base leading-snug">{displayName}</CardTitle>
              <CardDescription className="text-xs font-mono mt-0.5">
                {channel.channel_name}
              </CardDescription>
            </div>
          </div>
          <Badge
            className={`shrink-0 text-xs font-semibold px-2 py-0.5 ${draft.enabled ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}
          >
            {draft.enabled ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Enable/Disable switch */}
        <div className="flex items-center justify-between">
          <Label htmlFor={`enabled-${channel.id}`} className="text-sm font-medium">
            Canal habilitado
          </Label>
          <Switch
            id={`enabled-${channel.id}`}
            checked={draft.enabled}
            onCheckedChange={(v) => onDraftChange({ enabled: v })}
          />
        </div>

        {/* Severity selector */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Severidade mínima</Label>
          <div className="flex items-center gap-2">
            <Select
              value={draft.min_severity}
              onValueChange={(v) => onDraftChange({ min_severity: v })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-1.5 py-0.5 rounded ${SEVERITY_COLORS[level]}`}>
                      {level}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className={`text-xs font-semibold px-2 py-1 rounded ${severityColor}`}>
              {draft.min_severity}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Apenas alertas com severidade ≥ <strong>{draft.min_severity}</strong> serão enviados por
            este canal.
          </p>
        </div>

        {/* Config JSON — collapsible */}
        <div className="space-y-1.5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors"
            onClick={() => onDraftChange({ configExpanded: !draft.configExpanded })}
          >
            {draft.configExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Configuração (JSON)
          </button>

          {draft.configExpanded && (
            <div className="space-y-1">
              <textarea
                className={`w-full min-h-[120px] rounded-md border px-3 py-2 text-xs font-mono bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring resize-y ${draft.configError ? 'border-destructive' : 'border-input'}`}
                value={draft.configText}
                onChange={(e) => handleConfigTextChange(e.target.value)}
                placeholder='{ "webhook_url": "https://...", "token": "..." }'
                spellCheck={false}
              />
              {draft.configError && (
                <p className="text-xs text-destructive">{draft.configError}</p>
              )}
              {!draft.configError && !draft.configText && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma configuração definida.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {isDirty ? 'Alterações não salvas' : 'Sem alterações'}
          </p>
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving || !!draft.configError || !isDirty}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Salvando…
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
/** Admin page for managing notification_channels_config. */
export default function NotificationChannelsPage() {
  const { isAdmin } = useUserRole();
  const { channels, loading, saving, fetchChannels, updateChannel } = useNotificationChannels();
  const [drafts, setDrafts] = useState<Record<number, ChannelDraft>>({});

  // Sync drafts when channels load
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<number, ChannelDraft> = { ...prev };
      for (const ch of channels) {
        if (!(ch.id in next)) {
          next[ch.id] = toDraft(ch);
        }
      }
      return next;
    });
  }, [channels]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function patchDraft(id: number, patch: Partial<ChannelDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function handleSave(ch: NotificationChannelConfig) {
    const draft = drafts[ch.id];
    if (!draft || draft.configError) return;

    const patch: ChannelPatch = {
      enabled: draft.enabled,
      min_severity: draft.min_severity,
      config: draft.config,
    };

    const ok = await updateChannel(ch.id, patch);
    if (ok) {
      // Reset dirty state by re-syncing from the updated channel
      setDrafts((prev) => ({
        ...prev,
        [ch.id]: { ...prev[ch.id], configText: draft.config ? JSON.stringify(draft.config, null, 2) : '' },
      }));
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-7 h-7 text-primary" />
            Canais de Notificação
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure os canais de envio de alertas e notificações do sistema.
          </p>
        </div>
        <Button variant="outline" onClick={fetchChannels} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Severity scale legend */}
      <Card className="border-dashed">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium mr-1">
              Escala de severidade:
            </span>
            {SEVERITY_LEVELS.map((level, i) => (
              <div key={level} className="flex items-center gap-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${SEVERITY_COLORS[level]}`}>
                  {level}
                </span>
                {i < SEVERITY_LEVELS.length - 1 && (
                  <span className="text-muted-foreground text-xs">&lt;</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Channel cards */}
      {loading && channels.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-1/3 mt-1" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-3 bg-muted rounded" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nenhum canal de notificação configurado.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Insira registros na tabela{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                notification_channels_config
              </code>{' '}
              para configurar canais.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              draft={drafts[ch.id] ?? toDraft(ch)}
              isSaving={!!saving[ch.id]}
              onDraftChange={(patch) => patchDraft(ch.id, patch)}
              onSave={() => handleSave(ch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
