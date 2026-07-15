/**
 * AlertThresholdsPanel — UI para configurar thresholds de alertas
 * em tempo real do webhook + lista dos últimos 5 alertas disparados.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Bell, ChevronDown, ChevronUp, ShieldAlert, Volume2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DEFAULT_ALERT_CONFIG,
  saveAlertConfig,
  type WebhookAlertConfig,
} from '@/lib/webhookHealthAlerts';
import { toast } from 'sonner';
import type { RecentAlertEntry } from '@/hooks/useWebhookHealthAlerts';

interface Props {
  config: WebhookAlertConfig;
  onChange: (next: WebhookAlertConfig) => void;
  recentAlerts: RecentAlertEntry[];
  activeCount: number;
}

export function AlertThresholdsPanel({ config, onChange, recentAlerts, activeCount }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WebhookAlertConfig>(config);

  const apply = () => {
    onChange(draft);
    saveAlertConfig(draft);
    toast.success('Configuração de alertas salva');
  };

  const reset = () => {
    setDraft(DEFAULT_ALERT_CONFIG);
    onChange(DEFAULT_ALERT_CONFIG);
    saveAlertConfig(DEFAULT_ALERT_CONFIG);
    toast.success('Thresholds restaurados ao padrão');
  };

  const dirty =
    draft.invalidRatePct !== config.invalidRatePct ||
    draft.minSampleSize !== config.minSampleSize ||
    draft.silenceMinutes !== config.silenceMinutes ||
    draft.enabled !== config.enabled;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Alertas em tempo real
                {activeCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {activeCount} ativo{activeCount > 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Toast + som + notificação do navegador quando a validação HMAC degradar
                ou o webhook ficar em silêncio.
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Master switch */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Ativar alertas
                </div>
                <div className="text-xs text-muted-foreground">
                  Quando desativado, o polling de saúde para e nada é disparado.
                </div>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
              />
            </div>

            {/* Thresholds */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invalid-rate">% inválido tolerado</Label>
                <Input
                  id="invalid-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={draft.invalidRatePct}
                  disabled={!draft.enabled}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      invalidRatePct: clamp(Number(e.target.value), 0, 100),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Acima disso na janela de 15 min, dispara alerta.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="min-sample">Amostra mínima</Label>
                <Input
                  id="min-sample"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.minSampleSize}
                  disabled={!draft.enabled}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      minSampleSize: clamp(Number(e.target.value), 0, 10_000),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Eventos mínimos pra avaliar (anti-ruído).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="silence">Silêncio máximo (min)</Label>
                <Input
                  id="silence"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.silenceMinutes}
                  disabled={!draft.enabled}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      silenceMinutes: clamp(Number(e.target.value), 1, 1440),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Alerta se instância ativa ficar sem eventos por X min.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={apply} disabled={!dirty}>
                Aplicar e salvar
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Restaurar padrão
              </Button>
            </div>

            {/* Recent fired alerts */}
            <div className="space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Últimos alertas disparados
              </div>
              {recentAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">
                  Nenhum alerta disparado nesta sessão.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {recentAlerts.map((a, idx) => (
                    <li
                      key={`${a.instance}-${a.type}-${a.firedAt}-${idx}`}
                      className="flex items-start gap-3 rounded-md border bg-muted/30 px-3 py-2 text-xs"
                    >
                      <Badge
                        variant={a.type === 'signature_spike' ? 'destructive' : 'warning'}
                        className="shrink-0"
                      >
                        {a.type === 'signature_spike' ? 'spike' : 'silêncio'}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{a.instance}</div>
                        <div className="text-muted-foreground truncate">{a.reason}</div>
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(a.firedAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
