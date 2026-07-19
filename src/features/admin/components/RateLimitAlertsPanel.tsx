import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, BellOff, ExternalLink, Settings2, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useRateLimitAlerts,
  loadThresholds,
  saveThresholds,
  type AlertSeverity,
  type RateLimitAlertThresholds,
} from '@/features/admin/hooks/useRateLimitAlerts';
import {
  useRateLimitAlertNotifier,
  loadNotifyPrefs,
  saveNotifyPrefs,
  requestBrowserNotificationPermission,
  type NotifyPreferences,
} from '@/features/admin/hooks/useRateLimitAlertNotifier';
import { toast } from 'sonner';

const SEVERITY_STYLES: Record<AlertSeverity, { badge: string; border: string; label: string }> = {
  critical: {
    badge: 'bg-destructive text-destructive-foreground',
    border: 'border-l-destructive',
    label: 'Crítico',
  },
  high: {
    badge: 'bg-warning text-warning-foreground',
    border: 'border-l-warning',
    label: 'Alto',
  },
  medium: {
    badge: 'bg-primary/80 text-primary-foreground',
    border: 'border-l-primary',
    label: 'Médio',
  },
  low: {
    badge: 'bg-muted text-muted-foreground',
    border: 'border-l-muted-foreground',
    label: 'Baixo',
  },
};

/** Rate Limit Alerts Panel component. */
export function RateLimitAlertsPanel() {
  const [thresholds, setThresholds] = useState<RateLimitAlertThresholds>(() => loadThresholds());
  const [notifyPrefs, setNotifyPrefs] = useState<NotifyPreferences>(() => loadNotifyPrefs());
  const { alerts, counts, loading } = useRateLimitAlerts(thresholds);
  useRateLimitAlertNotifier(alerts, notifyPrefs);

  const summary = useMemo(
    () =>
      (['critical', 'high', 'medium', 'low'] as AlertSeverity[]).map((sev) => ({
        sev,
        count: counts[sev],
      })),
    [counts]
  );

  const handleSaveThresholds = (next: RateLimitAlertThresholds) => {
    setThresholds(next);
    saveThresholds(next);
  };

  const handleSaveNotifyPrefs = async (next: NotifyPreferences) => {
    if (next.browserNotifications && !notifyPrefs.browserNotifications) {
      const perm = await requestBrowserNotificationPermission();
      if (perm !== 'granted') {
        toast.error('Permissão de notificação negada pelo navegador.');
        next = { ...next, browserNotifications: false };
      }
    }
    setNotifyPrefs(next);
    saveNotifyPrefs(next);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-5 h-5 text-warning" />
            Alertas de Rate Limit
          </CardTitle>
          <CardDescription>
            Alertas automáticos quando um IP ou endpoint ultrapassa os thresholds.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <NotifyPrefsPopover value={notifyPrefs} onSave={handleSaveNotifyPrefs} />
          <ThresholdsPopover value={thresholds} onSave={handleSaveThresholds} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {summary.map(({ sev, count }) => (
            <Badge
              key={sev}
              variant="outline"
              className={count > 0 ? SEVERITY_STYLES[sev].badge : ''}
            >
              {SEVERITY_STYLES[sev].label}: {count}
            </Badge>
          ))}
        </div>

        {loading && alerts.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando alertas…</p>
        )}

        {!loading && alerts.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Nenhum alerta ativo. Todos os IPs e endpoints estão dentro dos limites.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {alerts.map((alert) => {
            const style = SEVERITY_STYLES[alert.severity];
            return (
              <div
                key={alert.id}
                className={`rounded-md border border-l-4 ${style.border} bg-card p-3 flex items-start justify-between gap-3`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={style.badge}>{style.label}</Badge>
                    <Badge variant="outline" className="text-xs">
                      {alert.scope === 'ip' ? 'IP' : 'Endpoint'}
                    </Badge>
                    <p className="text-sm font-medium truncate">{alert.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link to={alert.detailsHref}>
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Detalhes
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ThresholdsPopover({
  value,
  onSave,
}: {
  value: RateLimitAlertThresholds;
  onSave: (next: RateLimitAlertThresholds) => void;
}) {
  const [draft, setDraft] = useState(value);

  const numberField = (v: number, set: (n: number) => void, label: string, id: string) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={1}
        value={v}
        onChange={(e) => set(Math.max(1, Number(e.target.value) || 1))}
        className="h-8"
      />
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-4 h-4 mr-1" />
          Thresholds
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium mb-2">Por IP</p>
          <div className="grid grid-cols-3 gap-2">
            {numberField(draft.ip.low, (n) => setDraft({ ...draft, ip: { ...draft.ip, low: n } }), 'Baixo', 'ip-low')}
            {numberField(draft.ip.medium, (n) => setDraft({ ...draft, ip: { ...draft.ip, medium: n } }), 'Médio', 'ip-med')}
            {numberField(draft.ip.high, (n) => setDraft({ ...draft, ip: { ...draft.ip, high: n } }), 'Alto', 'ip-high')}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Por Endpoint</p>
          <div className="grid grid-cols-3 gap-2">
            {numberField(draft.endpoint.low, (n) => setDraft({ ...draft, endpoint: { ...draft.endpoint, low: n } }), 'Baixo', 'ep-low')}
            {numberField(draft.endpoint.medium, (n) => setDraft({ ...draft, endpoint: { ...draft.endpoint, medium: n } }), 'Médio', 'ep-med')}
            {numberField(draft.endpoint.high, (n) => setDraft({ ...draft, endpoint: { ...draft.endpoint, high: n } }), 'Alto', 'ep-high')}
          </div>
        </div>
        <div>
          {numberField(
            draft.blockedCritical,
            (n) => setDraft({ ...draft, blockedCritical: n }),
            'Bloqueios → Crítico',
            'blocked-critical'
          )}
        </div>
        <Button size="sm" className="w-full" onClick={() => onSave(draft)}>
          Salvar thresholds
        </Button>
    </PopoverContent>
    </Popover>
  );
}

function NotifyPrefsPopover({
  value,
  onSave,
}: {
  value: NotifyPreferences;
  onSave: (next: NotifyPreferences) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Preferências de notificação">
          {value.enabled ? <Bell className="w-4 h-4 mr-1" /> : <BellOff className="w-4 h-4 mr-1" />}
          Notificações
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="notify-enabled" className="text-sm">Ativar toasts automáticos</Label>
          <Switch
            id="notify-enabled"
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="notify-min-sev" className="text-xs">Notificar a partir de</Label>
          <Select
            value={draft.minSeverity}
            onValueChange={(v) => setDraft({ ...draft, minSeverity: v as NotifyPreferences['minSeverity'] })}
          >
            <SelectTrigger id="notify-min-sev" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Baixo</SelectItem>
              <SelectItem value="medium">Médio</SelectItem>
              <SelectItem value="high">Alto</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="notify-browser" className="text-sm">Notificações do navegador</Label>
          <Switch
            id="notify-browser"
            checked={draft.browserNotifications}
            onCheckedChange={(v) => setDraft({ ...draft, browserNotifications: v })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Toasts aparecem quando um novo IP ou endpoint entra em alerta ou escala de severidade.
        </p>
        <Button size="sm" className="w-full" onClick={() => onSave(draft)}>
          Salvar preferências
        </Button>
      </PopoverContent>
    </Popover>
  );
}
