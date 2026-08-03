import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEvolutionFallbackStats } from "@/hooks/useEvolutionFallbackStats";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const REASON_LABELS: Record<string, string> = {
  http_404: "HTTP 404",
  not_found_payload: "Payload not_found",
  empty_payload: "Resposta vazia",
  upstream_error: "Erro 5xx upstream",
};

const ACTION_LABELS: Record<string, string> = {
  "find-chats": "Listar chats",
  "find-contacts": "Listar contatos",
  "fetch-profile": "Buscar perfil",
};

/**
 * Card no painel admin que mostra se o WhatsApp (Evolution v2.3.7) está
 * operando com endpoint primário ou se o fallback foi acionado, e com qual
 * frequência. Lê de `rpc_evolution_fallback_stats` (admin/supervisor only).
 *
 * Critério de modo:
 *   - "Primário"        → 0 eventos na última hora
 *   - "Fallback ativo"  → >0 eventos detectados na última hora
 */
export function EvolutionFallbackStatusCard() {
  const [windowHours, setWindowHours] = useState(24);
  const { data, isLoading, error, refetch, isFetching } = useEvolutionFallbackStats(windowHours);

  const status = useMemo(() => {
    if (!data) return { label: "Carregando…", variant: "secondary" as const, icon: Activity };
    if (data.total_last_hour > 0) {
      return { label: "Fallback ativo", variant: "destructive" as const, icon: AlertTriangle };
    }
    if (data.total > 0) {
      return { label: "Primário (com histórico)", variant: "outline" as const, icon: CheckCircle2 };
    }
    return { label: "Primário estável", variant: "default" as const, icon: CheckCircle2 };
  }, [data]);

  const StatusIcon = status.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <StatusIcon className="w-5 h-5" />
            Status conexão WhatsApp (v2.3.7)
            <Badge variant={status.variant}>{status.label}</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Telemetria de detecção de fallback Evolution DB em find-chats, find-contacts e fetch-profile.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(windowHours)} onValueChange={(v) => setWindowHours(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última hora</SelectItem>
              <SelectItem value="24">Últimas 24h</SelectItem>
              <SelectItem value="168">Últimos 7d</SelectItem>
              <SelectItem value="720">Últimos 30d</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-destructive">
            Falha ao carregar estatísticas. Verifique se você tem permissão admin/supervisor.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Última hora" value={data.total_last_hour} highlight={data.total_last_hour > 0} />
              <Stat label={`Janela (${data.window_hours}h)`} value={data.total} />
              <Stat label="Últimos 7 dias" value={data.total_last_7d} />
            </div>

            {data.last_event_at && (
              <p className="text-xs text-muted-foreground">
                Último evento: {formatDistanceToNow(new Date(data.last_event_at), { addSuffix: true, locale: ptBR })}
              </p>
            )}

            {data.by_action.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Por ação</h4>
                <div className="flex flex-wrap gap-2">
                  {data.by_action.map((a) => (
                    <Badge key={a.action} variant="secondary">
                      {ACTION_LABELS[a.action] ?? a.action}: {a.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {data.by_reason.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Por motivo</h4>
                <div className="flex flex-wrap gap-2">
                  {data.by_reason.map((r) => (
                    <Badge key={r.reason} variant="outline">
                      {REASON_LABELS[r.reason] ?? r.reason}: {r.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {data.by_instance.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Por instância</h4>
                <div className="flex flex-wrap gap-2">
                  {data.by_instance.map((i) => (
                    <Badge key={i.instance} variant="secondary">{i.instance}: {i.count}</Badge>
                  ))}
                </div>
              </div>
            )}

            {data.recent.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver últimos {data.recent.length} eventos
                </summary>
                <div className="mt-2 space-y-1 max-h-64 overflow-y-auto rounded border p-2 bg-muted/30">
                  {data.recent.map((ev) => (
                    <div key={ev.ts} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                      <span className="text-muted-foreground tabular-nums">
                        {new Date(ev.ts).toLocaleTimeString("pt-BR")}
                      </span>
                      <span>
                        <Badge variant="outline" className="mr-1">{ACTION_LABELS[ev.action] ?? ev.action}</Badge>
                        <span className="text-muted-foreground">{ev.instance ?? "—"} · </span>
                        <span>{REASON_LABELS[ev.reason] ?? ev.reason}</span>
                      </span>
                      <span className="text-muted-foreground">{ev.status}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {data.total === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum evento de fallback na janela selecionada — endpoint primário operando normalmente.
              </p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-destructive/50 bg-destructive/5" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${highlight ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
