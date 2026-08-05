import { queryKeys } from '@/services/api/queryKeys';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';

const log = getLogger('SicoobBridgeDashboard');
import {
  Building2,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  MessageSquare,
  CheckCircle,
  Clock,
  ShieldAlert,
  Send,
  XCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { isValidUUID } from '@/utils/uuid';

// DASHBOARD-13 — sinalização (fora do escopo desta branch — exige migration):
//  pg_cron para sicoob-outbox-consumer AUSENTE (db_crons não lista job sicoob; a edge declara
//  'Invocado por pg_cron a cada 1 min' em supabase/functions/sicoob-outbox-consumer/index.ts).
//  Sem o job, itens em sicoob_reply_outbox com status pending/failed nunca são drenados.
//  Também exige a RPC sicoob_outbox_claim (a edge tem fallback SELECT+UPDATE, então a RPC é
//  opcional em runtime, mas o cron é obrigatório).

interface SicoobMapping {
  id: string;
  contact_id: string;
  sicoob_user_id: string;
  sicoob_vendedor_id: string;
  sicoob_singular_id: string;
  zappweb_agent_id: string | null;
  created_at: string;
}

interface SicoobMessage {
  id: string;
  content: string;
  sender: string;
  created_at: string;
  contact_id: string;
  status: string;
}

interface SicoobOutboxItem {
  id: string;
  contact_id: string | null;
  message_id: string | null;
  agent_id: string | null;
  content: string | null;
  status: string | null;
  attempts: number | null;
  created_at: string | null;
  next_attempt_at: string | null;
  processed_at: string | null;
  last_error: string | null;
}

const OUTBOX_STATUSES = ['pending', 'processing', 'failed', 'sent', 'abandoned'] as const;

/** Sicoob Bridge Dashboard component. */
export function SicoobBridgeDashboard() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: queryKeys.adminOps.sicoobBridge(),
    queryFn: async () => {
      try {
        const { data: mappingData } = await supabase
          .from('sicoob_contact_mapping')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        const mappings = (mappingData || []) as SicoobMapping[];
        const contactIds = mappings.map((m) => m.contact_id).filter(isValidUUID);

        let recentMessages: SicoobMessage[] = [];
        if (contactIds.length > 0) {
          const { data: msgData } = await supabase
            .from('messages')
            .select('id, content, sender, created_at, contact_id, status')
            .in('contact_id', contactIds.slice(0, 20))
            .order('created_at', { ascending: false })
            .limit(30);
          recentMessages = (msgData || []) as SicoobMessage[];
        }

        return { mappings, recentMessages };
      } catch (err) {
        log.warn('Failed to load Sicoob data:', err);
        return { mappings: [] as SicoobMapping[], recentMessages: [] as SicoobMessage[] };
      }
    },
  });

  const mappings = useMemo(() => data?.mappings ?? [], [data?.mappings]);
  const recentMessages = useMemo(() => data?.recentMessages ?? [], [data?.recentMessages]);
  const loading = isFetching;
  const loadData = () => {
    void refetch();
  };

  // Estado real da fila sicoob_reply_outbox (read-only; RLS pode bloquear → erro tratado)
  const outboxQuery = useQuery({
    queryKey: queryKeys.adminOps.sicoobOutbox(),
    queryFn: async (): Promise<SicoobOutboxItem[]> => {
      const { data, error } = await supabase
        .from('sicoob_reply_outbox')
        .select(
          'id, contact_id, message_id, agent_id, content, status, attempts, created_at, next_attempt_at, processed_at, last_error'
        )
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as SicoobOutboxItem[]) ?? [];
    },
    staleTime: 30_000,
  });

  const outbox = useMemo(() => outboxQuery.data ?? [], [outboxQuery.data]);
  const outboxCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of outbox) {
      const status = item.status ?? 'unknown';
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [outbox]);

  const pendingCount = (outboxCounts.pending ?? 0) + (outboxCounts.processing ?? 0);
  const failedCount = outboxCounts.failed ?? 0;
  const sentCount = outboxCounts.sent ?? 0;
  const abandonedCount = outboxCounts.abandoned ?? 0;
  const lastProcessedAt = useMemo(
    () =>
      outbox.reduce<string | null>((latest, item) => {
        if (!item.processed_at) return latest;
        return !latest || item.processed_at > latest ? item.processed_at : latest;
      }, null),
    [outbox]
  );
  const statusColor: Record<string, string> = {
    pending: 'bg-warning/10 text-warning',
    processing: 'bg-info/10 text-info',
    failed: 'bg-destructive/10 text-destructive',
    sent: 'bg-success/10 text-success',
    abandoned: 'bg-muted text-muted-foreground',
  };

  const { inbound, outbound, uniqueSingulars } = useMemo(
    () => ({
      inbound: recentMessages.filter((m) => m.sender === 'contact').length,
      outbound: recentMessages.filter((m) => m.sender === 'agent').length,
      uniqueSingulars: new Set(mappings.map((m) => m.sicoob_singular_id)).size,
    }),
    [recentMessages, mappings]
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Sicoob Bridge</h2>
          <p className="text-sm text-muted-foreground">
            Status da integração Sicoob Gifts → ZappWeb
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 text-xs"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pb-4 pt-4 text-center">
            <p className="text-2xl font-bold text-primary">{mappings.length}</p>
            <p className="text-xs text-muted-foreground">Contatos Mapeados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-4 pt-4 text-center">
            <p className="text-2xl font-bold text-foreground">{uniqueSingulars}</p>
            <p className="text-xs text-muted-foreground">Singulares</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-4 pt-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <ArrowDownLeft className="h-4 w-4 text-success" />
              <p className="text-2xl font-bold text-success">{inbound}</p>
            </div>
            <p className="text-xs text-muted-foreground">Recebidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-4 pt-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <ArrowUpRight className="h-4 w-4 text-info" />
              <p className="text-2xl font-bold text-info">{outbound}</p>
            </div>
            <p className="text-xs text-muted-foreground">Enviadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Bridge Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="h-5 w-5 text-success" /> Endpoints da Bridge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 rounded-lg border bg-muted/50 p-3 text-xs">
            <p>
              <Badge variant="secondary" className="mr-2 text-[9px]">
                POST
              </Badge>{' '}
              /functions/v1/sicoob-bridge
            </p>
            <p className="pl-16 text-muted-foreground">
              → Recebe mensagens do Sicoob (action: new_message, mark_read)
            </p>
          </div>
          <div className="space-y-1 rounded-lg border bg-muted/50 p-3 text-xs">
            <p>
              <Badge variant="secondary" className="mr-2 text-[9px]">
                AUTO
              </Badge>{' '}
              /functions/v1/sicoob-bridge-reply
            </p>
            <p className="pl-16 text-muted-foreground">
              → Trigger automático ao responder contato Sicoob
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Auth: Bearer token via secret{' '}
            <code className="rounded bg-muted px-1">SICOOB_BRIDGE_SECRET</code>
          </p>
        </CardContent>
      </Card>

      {/* Consumidor: sinalização pg_cron ausente */}
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Sinalização DASHBOARD-13 — pg_cron ausente</AlertTitle>
        <AlertDescription>
          O edge <code>sicoob-outbox-consumer</code> é invocado por pg_cron a cada 1 min
          (supabase/functions/sicoob-outbox-consumer/index.ts), mas <b>nenhum job cron existe</b> em produção
          (db_crons não lista sicoob). Sem o job, itens <code>pending/failed</code> de{' '}
          <code>sicoob_reply_outbox</code> nunca são entregues ao Sicoob. Criação do job (e da RPC{' '}
          <code>sicoob_outbox_claim</code>, se desejada) fica fora do escopo desta branch — exige migration.
        </AlertDescription>
      </Alert>

      {/* Estado do Outbox */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-warning" /> Estado do Outbox
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {outboxQuery.isFetching ? 'atualizando…' : `${outbox.length} itens (últimos 50)`}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outboxQuery.error ? (
            <p className="py-3 text-sm text-destructive">
              Falha ao ler sicoob_reply_outbox (RLS sem policy de SELECT para o papel atual):{' '}
              {outboxQuery.error.message}
            </p>
          ) : outboxQuery.isLoading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando outbox…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {OUTBOX_STATUSES.map((status) => (
                <div
                  key={status}
                  className={`rounded-lg p-3 text-center ${statusColor[status] ?? 'bg-muted/30'}`}
                >
                  <p className="text-xl font-bold">{outboxCounts[status] ?? 0}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{status}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Send className="h-3 w-3 text-warning" /> Na fila (pending/processing): {pendingCount}
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-destructive" /> Falhas: {failedCount}
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-success" /> Entregues: {sentCount}
            </span>
            <span>Abandonados: {abandonedCount}</span>
            {lastProcessedAt && (
              <span>
                Último processamento: {new Date(lastProcessedAt).toLocaleString('pt-BR')}
              </span>
            )}
            {!lastProcessedAt && !outboxQuery.isLoading && (
              <span>Nenhum item processado ainda (consumidor nunca rodou?).</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fila de Respostas (outbox) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5" /> Fila de Respostas (sicoob_reply_outbox)
            <Badge variant="secondary" className="ml-auto text-[10px]">{outbox.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outboxQuery.error ? (
            <p className="py-4 text-center text-sm text-destructive">
              Sem permissão de leitura (RLS): {outboxQuery.error.message}
            </p>
          ) : outbox.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum item na outbox. Respostas de agentes a contatos Sicoob aparecerão aqui.
            </p>
          ) : (
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">Status</th>
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">Conteúdo</th>
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">Tentativas</th>
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">Criado</th>
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">Próx. tentativa</th>
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {outbox.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/30">
                      <td className="p-2">
                        <Badge variant="outline" className={`text-[9px] ${statusColor[item.status ?? ''] ?? ''}`}>
                          {item.status ?? 'unknown'}
                        </Badge>
                      </td>
                      <td className="max-w-[240px] truncate p-2">{item.content ?? '—'}</td>
                      <td className="p-2">{item.attempts ?? 0}</td>
                      <td className="p-2 text-muted-foreground">
                        {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {item.next_attempt_at ? new Date(item.next_attempt_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="max-w-[180px] truncate p-2 text-destructive">{item.last_error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5" /> Mensagens Recentes
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {recentMessages.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma mensagem Sicoob ainda. A bridge registrará atividade aqui.
            </p>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-auto">
              {recentMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  {msg.sender === 'contact' ? (
                    <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{msg.content}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString('pt-BR')}
                      </span>
                      <Badge variant="outline" className="text-[9px]">
                        {msg.sender === 'contact' ? 'Sicoob → Zapp' : 'Zapp → Sicoob'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mappings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" /> Mapeamento de Contatos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mappings.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum mapeamento criado.
            </p>
          ) : (
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">
                      Singular ID
                    </th>
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">
                      Sicoob User
                    </th>
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">
                      Vendedor
                    </th>
                    <th scope="col" className="p-2 text-left font-medium text-muted-foreground">
                      Data
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-muted/30">
                      <td className="p-2">{m.sicoob_singular_id}</td>
                      <td className="max-w-[150px] truncate p-2">{m.sicoob_user_id}</td>
                      <td className="max-w-[150px] truncate p-2">{m.sicoob_vendedor_id}</td>
                      <td className="p-2 text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
