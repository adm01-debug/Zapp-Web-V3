/**
 * AdminInboxSyncStatusPage — Saúde do Inbox ↔ FATOR X (`evolution_messages`).
 *
 * Verifica se o pipeline está sincronizando:
 *  - Última mensagem recebida (inbound) e enviada (outbound) e há quanto tempo.
 *  - Total de mensagens nas janelas de 5min / 1h / 24h.
 *  - Top 10 conversas (remote_jid) por contagem nas últimas 24h, com último evento.
 *  - Logs básicos: últimas falhas (`public.failed_messages`) e últimas auditorias
 *    (`zapp.audit_logs`) — fontes locais que cobrem retries/erros do envio.
 *
 * Fonte FATOR X: lida via `queryExternalProxy` (mesmo caminho do Inbox).
 * Refresh manual + auto-poll (15s) com pausa quando a aba está oculta.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  BellRing,
} from 'lucide-react';
import { useAdminInboxSync } from './useAdminInboxSync';
import { timeAgo, INSTANCE, MIN_THRESHOLD, MAX_THRESHOLD } from './inboxSyncUtils';

export default function AdminInboxSyncStatusPage() {
  const {
    loading,
    refreshing,
    error,
    lastRefresh,
    alertThresholdMin,
    buckets,
    lastEvents,
    topConversations,
    failed,
    audit,
    health,
    fetchAll,
    handleThresholdChange,
  } = useAdminInboxSync();

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6 text-primary" />
            Status de sincronização do Inbox
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verifica o pipeline FATOR X (<code className="">evolution_messages</code>) que alimenta
            o Inbox em tempo real. Atualiza a cada 15s.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor="inbound-threshold"
              className="whitespace-nowrap text-xs text-muted-foreground"
            >
              Alerta após
            </Label>
            <Input
              id="inbound-threshold"
              type="number"
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              value={alertThresholdMin}
              onChange={(e) => handleThresholdChange(e.target.value)}
              className="h-8 w-20"
              aria-label="Minutos sem inbound antes de alertar"
            />
            <span className="text-xs text-muted-foreground">min sem inbound</span>
          </div>
          <Badge variant={health.variant} className="gap-1">
            {health.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {health.label}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => void fetchAll()} disabled={refreshing}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </header>

      {health.alerting && !loading && (
        <Alert variant="destructive">
          <BellRing className="h-4 w-4" />
          <AlertTitle>Sem mensagens inbound há {health.ageMinutes ?? '—'} min</AlertTitle>
          <AlertDescription>
            O cursor externo (<code className="">evolution_messages</code>) não recebe mensagens da
            instância <strong>{INSTANCE}</strong> há mais de{' '}
            <strong>{alertThresholdMin} min</strong>. Verifique o webhook em{' '}
            <Link to="/admin/webhook-overview" className="underline">
              Webhook Overview
            </Link>{' '}
            e o status da instância em{' '}
            <Link to="/admin/channels" className="underline">
              Canais
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao consultar o status</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {buckets.map((b) => (
          <Card key={b.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <MessageSquare className="h-4 w-4" /> {b.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && b.count === null ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-3xl font-bold tabular-nums">{b.count ?? 0}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">mensagens recebidas/enviadas</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Últimos eventos por direção</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowDownLeft className="h-4 w-4 text-primary" />
              Inbound (recebida)
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {timeAgo(lastEvents.inboundAt)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{lastEvents.inboundAt ?? '—'}</p>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              Outbound (enviada)
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {timeAgo(lastEvents.outboundAt)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{lastEvents.outboundAt ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Top conversas (24h)</span>
            <span className="text-xs font-normal text-muted-foreground">
              amostra de até 500 mensagens recentes
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && topConversations.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : topConversations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma mensagem nas últimas 24h.
            </p>
          ) : (
            <ul className="divide-y">
              {topConversations.map((c, idx) => (
                <li key={c.remote_jid} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-sm text-muted-foreground">#{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.push_name || c.remote_jid.split('@')[0]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{c.remote_jid}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{c.count}</p>
                    <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {timeAgo(c.lastAt)}
                    </p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    aria-label={`Abrir conversa com ${c.remote_jid}`}
                  >
                    <Link to={`/?contact=${encodeURIComponent(c.remote_jid)}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">Falhas recentes de envio</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {failed.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sem falhas registradas. ✅
                </p>
              ) : (
                <ul className="space-y-2 pr-2">
                  {failed.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="destructive" className="text-[10px]">
                          {f.status ?? 'failed'}
                        </Badge>
                        <span className="text-muted-foreground">{timeAgo(f.created_at)}</span>
                      </div>
                      <p className="mt-1 break-words">{f.error_message ?? '—'}</p>
                      {f.retry_count != null && f.retry_count > 0 && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {f.retry_count} tentativa(s) de retry
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Auditoria recente</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {audit.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sem entradas de auditoria.
                </p>
              ) : (
                <ul className="space-y-2 pr-2">
                  {audit.map((a) => (
                    <li key={a.id} className="rounded-md border bg-muted/30 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{a.action ?? '—'}</span>
                        <span className="text-muted-foreground">{timeAgo(a.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">
                        {a.entity_type ?? '—'}
                        {a.entity_id ? ` · ${a.entity_id.slice(0, 8)}…` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {lastRefresh && (
        <p className="text-right text-xs text-muted-foreground">
          Última atualização: {lastRefresh.toLocaleTimeString('pt-BR')}
        </p>
      )}
    </div>
  );
}
