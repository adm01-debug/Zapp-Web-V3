/**
 * AdminInboxSyncStatusPage — Saúde do Inbox ↔ FATOR X (`evolution_messages`).
 *
 * Verifica se o pipeline está sincronizando:
 *  - Última mensagem recebida (inbound) e enviada (outbound) e há quanto tempo.
 *  - Total de mensagens nas janelas de 5min / 1h / 24h.
 *  - Top 10 conversas (remote_jid) por contagem nas últimas 24h, com último evento.
 *  - Logs básicos: últimas falhas (`public.failed_messages`) e últimas auditorias
 *    (`public.audit_logs`) — fontes locais que cobrem retries/erros do envio.
 *
 * Fonte FATOR X: lida via `queryExternalProxy` (mesmo caminho do Inbox).
 * Refresh manual + auto-poll (15s) com pausa quando a aba está oculta.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Activity, RefreshCw, AlertTriangle, CheckCircle2, MessageSquare,
  Clock, ArrowDownLeft, ArrowUpRight, ExternalLink, BellRing,
} from 'lucide-react';
import { queryExternalProxy } from '@/lib/externalProxy';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';

const log = getLogger('AdminInboxSyncStatusPage');
const INSTANCE = 'wpp2';
const POLL_MS = 15_000;

const BUCKET_CONFIGS: Array<{ label: string; sinceMs: number }> = [
  { label: 'Últimos 5 min', sinceMs: 5 * 60_000 },
  { label: 'Última 1 h', sinceMs: 60 * 60_000 },
  { label: 'Últimas 24 h', sinceMs: 24 * 60 * 60_000 },
];

// Threshold padrão para alerta de inatividade inbound (em minutos).
// Persistido em localStorage para sobreviver a reloads.
const ALERT_THRESHOLD_KEY = 'admin:inbox-sync:inbound-alert-threshold-min';
const DEFAULT_ALERT_THRESHOLD_MIN = 10;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 1440; // 24h

type SyncBucket = { label: string; sinceMs: number; count: number | null };

interface InboundOutboundLast {
  inboundAt: string | null;
  outboundAt: string | null;
}

interface ConversationCount {
  remote_jid: string;
  push_name: string | null;
  count: number;
  lastAt: string;
}

interface FailedRow {
  id: string;
  created_at: string;
  error_message: string | null;
  retry_count: number | null;
  status: string | null;
}

interface AuditRow {
  id: string;
  created_at: string;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

function classifyHealth(
  lastInboundIso: string | null,
  alertThresholdMin: number,
): {
  variant: 'default' | 'secondary' | 'destructive';
  label: string;
  ok: boolean;
  /** True quando ultrapassou o threshold configurado pelo admin. */
  alerting: boolean;
  ageMinutes: number | null;
} {
  if (!lastInboundIso) {
    return { variant: 'destructive', label: 'Sem dados', ok: false, alerting: true, ageMinutes: null };
  }
  const ms = Date.now() - new Date(lastInboundIso).getTime();
  const ageMinutes = Math.max(0, Math.floor(ms / 60_000));
  const thresholdMs = alertThresholdMin * 60_000;
  if (ms >= thresholdMs) {
    return { variant: 'destructive', label: 'Sem sincronia', ok: false, alerting: true, ageMinutes };
  }
  // "Lento" = passou de 50% do threshold mas ainda dentro.
  if (ms >= thresholdMs / 2) {
    return { variant: 'secondary', label: 'Lento', ok: true, alerting: false, ageMinutes };
  }
  return { variant: 'default', label: 'Saudável', ok: true, alerting: false, ageMinutes };
}

function readStoredThreshold(): number {
  if (typeof window === 'undefined') return DEFAULT_ALERT_THRESHOLD_MIN;
  const raw = window.localStorage.getItem(ALERT_THRESHOLD_KEY);
  if (!raw) return DEFAULT_ALERT_THRESHOLD_MIN;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_ALERT_THRESHOLD_MIN;
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, parsed));
}

export default function AdminInboxSyncStatusPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Threshold de alerta configurável (em minutos) — persistido em localStorage.
  const [alertThresholdMin, setAlertThresholdMin] = useState<number>(() => readStoredThreshold());
  // Marca o último ISO de inbound já alertado para evitar disparar toast a cada
  // poll enquanto o problema persiste. Reseta quando uma nova inbound chega.
  const alertedForInboundRef = useRef<string | null>(null);


  const [buckets, setBuckets] = useState<SyncBucket[]>(() =>
    BUCKET_CONFIGS.map(c => ({ ...c, count: null })),
  );
  const [lastEvents, setLastEvents] = useState<InboundOutboundLast>({
    inboundAt: null, outboundAt: null,
  });
  const [topConversations, setTopConversations] = useState<ConversationCount[]>([]);
  const [failed, setFailed] = useState<FailedRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);

    try {
      // 1) Buckets de contagem (5m, 1h, 24h) — usamos `countMode: 'exact'` com
      // `limit: 1` para evitar baixar payloads (queremos só o total).
      const bucketResults = await Promise.all(
        BUCKET_CONFIGS.map((b) =>
          queryExternalProxy({
            table: 'evolution_messages',
            select: 'id',
            filters: [
              { column: 'instance_name', operator: 'eq', value: INSTANCE },
              { column: 'created_at', operator: 'gte', value: new Date(Date.now() - b.sinceMs).toISOString() },
            ],
            limit: 1,
            countMode: 'exact',
          }),
        ),
      );

      // 2) Última inbound + outbound (independentes).
      const [lastInbound, lastOutbound] = await Promise.all([
        queryExternalProxy<{ created_at: string }>({
          table: 'evolution_messages',
          select: 'created_at',
          filters: [
            { column: 'instance_name', operator: 'eq', value: INSTANCE },
            { column: 'from_me', operator: 'eq', value: false },
          ],
          order: { column: 'created_at', ascending: false },
          limit: 1,
        }),
        queryExternalProxy<{ created_at: string }>({
          table: 'evolution_messages',
          select: 'created_at',
          filters: [
            { column: 'instance_name', operator: 'eq', value: INSTANCE },
            { column: 'from_me', operator: 'eq', value: true },
          ],
          order: { column: 'created_at', ascending: false },
          limit: 1,
        }),
      ]);

      // 3) Top conversas por volume (24h) — pegamos uma janela ampla e
      // agrupamos no cliente. O proxy não tem GROUP BY direto, então
      // limitamos a 500 amostras (suficiente para top 10).
      const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const sample = await queryExternalProxy<{
        remote_jid: string; push_name: string | null; created_at: string;
      }>({
        table: 'evolution_messages',
        select: 'remote_jid,push_name,created_at',
        filters: [
          { column: 'instance_name', operator: 'eq', value: INSTANCE },
          { column: 'created_at', operator: 'gte', value: since24h },
        ],
        order: { column: 'created_at', ascending: false },
        limit: 500,
      });
      const grouped = new Map<string, ConversationCount>();
      for (const row of sample.data) {
        const cur = grouped.get(row.remote_jid);
        if (cur) {
          cur.count += 1;
          if (row.created_at > cur.lastAt) {
            cur.lastAt = row.created_at;
            if (row.push_name) cur.push_name = row.push_name;
          }
        } else {
          grouped.set(row.remote_jid, {
            remote_jid: row.remote_jid,
            push_name: row.push_name,
            count: 1,
            lastAt: row.created_at,
          });
        }
      }
      const topConv = Array.from(grouped.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // 4) Logs locais — falhas + auditoria.
      const [failedRes, auditRes] = await Promise.all([
        supabase
          .from('failed_messages')
          .select('id, created_at, error_message, retry_count, status')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('audit_logs')
          .select('id, created_at, action, entity_type, entity_id')
          .order('created_at', { ascending: false })
          .limit(15),
      ]);

      // Aplica todos os estados de uma vez (evita flicker entre fetches).
      setBuckets((prev) =>
        prev.map((b, i) => ({ ...b, count: bucketResults[i].count ?? bucketResults[i].data.length })),
      );
      setLastEvents({
        inboundAt: lastInbound.data[0]?.created_at ?? null,
        outboundAt: lastOutbound.data[0]?.created_at ?? null,
      });
      setTopConversations(topConv);
      setFailed((failedRes.data ?? []) as FailedRow[]);
      setAudit((auditRes.data ?? []) as AuditRow[]);
      setLastRefresh(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao consultar o status.';
      log.error('fetchAll failed', err);
      setError(msg);
      if (!silent) toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Auto-poll com pausa quando a aba não está visível.
  useEffect(() => {
    let id: number | null = null;
    const tick = () => {
      if (document.visibilityState === 'visible') void fetchAll(true);
    };
    id = window.setInterval(tick, POLL_MS);
    return () => { if (id !== null) window.clearInterval(id); };
  }, [fetchAll]);

  const health = useMemo(
    () => classifyHealth(lastEvents.inboundAt, alertThresholdMin),
    [lastEvents.inboundAt, alertThresholdMin],
  );

  // Persiste threshold sempre que muda.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ALERT_THRESHOLD_KEY, String(alertThresholdMin));
  }, [alertThresholdMin]);

  // Dispara toast.error UMA vez por episódio quando ultrapassa o threshold.
  // O dedupe usa o ISO da última inbound conhecida como chave: enquanto não
  // chegar uma inbound mais nova, não re-alerta a cada poll.
  useEffect(() => {
    if (!health.alerting || loading) return;
    const key = lastEvents.inboundAt ?? '__no_inbound__';
    if (alertedForInboundRef.current === key) return;
    alertedForInboundRef.current = key;
    const minutesLabel = health.ageMinutes != null
      ? `${health.ageMinutes}min sem inbound`
      : 'nenhuma inbound encontrada';
    log.warn('[inbox-sync] inactivity alert fired', {
      lastInboundAt: lastEvents.inboundAt,
      ageMinutes: health.ageMinutes,
      thresholdMin: alertThresholdMin,
    });
    toast.error('Inbox sem mensagens recebidas', {
      description: `${minutesLabel} (limite: ${alertThresholdMin}min). Verifique webhook e instância "${INSTANCE}".`,
      duration: 10_000,
    });
  }, [health.alerting, health.ageMinutes, lastEvents.inboundAt, alertThresholdMin, loading]);

  // Quando uma nova inbound chega e estamos saudáveis de novo, libera o
  // alerta para um próximo episódio.
  useEffect(() => {
    if (!health.alerting && lastEvents.inboundAt) {
      // só reseta quando o alerta anterior referia-se a OUTRO ISO (ou ao
      // estado "sem dados") — assim evita reset durante a janela ainda OK.
      if (alertedForInboundRef.current && alertedForInboundRef.current !== lastEvents.inboundAt) {
        alertedForInboundRef.current = null;
      }
    }
  }, [health.alerting, lastEvents.inboundAt]);

  const handleThresholdChange = useCallback((raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, parsed));
    setAlertThresholdMin(clamped);
    // Reseta o dedupe para que a nova régua tome efeito imediatamente.
    alertedForInboundRef.current = null;
  }, []);

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Status de sincronização do Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifica o pipeline FATOR X (<code className="">evolution_messages</code>)
            que alimenta o Inbox em tempo real. Atualiza a cada 15s.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="inbound-threshold" className="text-xs text-muted-foreground whitespace-nowrap">
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
            {health.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {health.label}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchAll()}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </header>

      {health.alerting && !loading && (
        <Alert variant="destructive">
          <BellRing className="h-4 w-4" />
          <AlertTitle>Sem mensagens inbound há {health.ageMinutes ?? '—'} min</AlertTitle>
          <AlertDescription>
            O cursor externo (<code className="">evolution_messages</code>) não recebe
            mensagens da instância <strong>{INSTANCE}</strong> há mais de{' '}
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

      {/* Buckets de contagem */}
      <div className="grid gap-4 sm:grid-cols-3">
        {buckets.map((b) => (
          <Card key={b.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" /> {b.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && b.count === null ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-3xl font-bold tabular-nums">
                  {b.count ?? 0}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">mensagens recebidas/enviadas</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Últimos eventos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Últimos eventos por direção</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowDownLeft className="h-4 w-4 text-primary" />
              Inbound (recebida)
            </div>
            <p className="text-2xl font-semibold mt-1 tabular-nums">{timeAgo(lastEvents.inboundAt)}</p>
            <p className="text-xs text-muted-foreground  mt-0.5">
              {lastEvents.inboundAt ?? '—'}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              Outbound (enviada)
            </div>
            <p className="text-2xl font-semibold mt-1 tabular-nums">{timeAgo(lastEvents.outboundAt)}</p>
            <p className="text-xs text-muted-foreground  mt-0.5">
              {lastEvents.outboundAt ?? '—'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Top conversas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
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
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma mensagem nas últimas 24h.
            </p>
          ) : (
            <ul className="divide-y">
              {topConversations.map((c, idx) => (
                <li key={c.remote_jid} className="py-2 flex items-center gap-3">
                  <span className="text-sm  w-6 text-muted-foreground">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.push_name || c.remote_jid.split('@')[0]}
                    </p>
                    <p className="text-xs text-muted-foreground  truncate">
                      {c.remote_jid}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{c.count}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {timeAgo(c.lastAt)}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2" aria-label={`Abrir conversa com ${c.remote_jid}`}>
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

      {/* Logs locais */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">Falhas recentes de envio</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {failed.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Sem falhas registradas. ✅
                </p>
              ) : (
                <ul className="space-y-2 pr-2">
                  {failed.map((f) => (
                    <li key={f.id} className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="destructive" className="text-[10px]">
                          {f.status ?? 'failed'}
                        </Badge>
                        <span className="text-muted-foreground">{timeAgo(f.created_at)}</span>
                      </div>
                      <p className="mt-1 break-words">{f.error_message ?? '—'}</p>
                      {f.retry_count != null && f.retry_count > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
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
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Sem entradas de auditoria.
                </p>
              ) : (
                <ul className="space-y-2 pr-2">
                  {audit.map((a) => (
                    <li key={a.id} className="rounded-md border bg-muted/30 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className=" font-medium">{a.action ?? '—'}</span>
                        <span className="text-muted-foreground">{timeAgo(a.created_at)}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">
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
        <p className="text-xs text-muted-foreground text-right">
          Última atualização: {lastRefresh.toLocaleTimeString('pt-BR')}
        </p>
      )}
    </div>
  );
}
