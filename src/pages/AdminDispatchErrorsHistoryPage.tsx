/**
 * Admin: Histórico imutável de erros de dispatch.
 * Lê de `dispatch_error_logs` (append-only) via RPC com filtros — útil para
 * auditar falhas que já saíram da DLQ operacional (`failed_messages`).
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollText, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { useDispatchErrorLogs } from '@/features/admin';

const RANGE_OPTIONS = [
  { value: '24', label: 'Últimas 24h' },
  { value: '168', label: 'Últimos 7 dias' },
  { value: '720', label: 'Últimos 30 dias' },
  { value: '2160', label: 'Últimos 90 dias' },
] as const;

const PAGE_SIZE = 50;

/** Default export. */
export default function AdminDispatchErrorsHistoryPage() {
  const [hours, setHours] = useState<string>('168');
  const [instance, setInstance] = useState<string>('');
  const [agent, setAgent] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState(0);

  const filters = useMemo(
    () => ({
      hours: Number(hours),
      instance: instance.trim() || null,
      agent: agent.trim() || null,
      search: search.trim() || null,
      page,
      pageSize: PAGE_SIZE,
    }),
    [hours, instance, agent, search, page],
  );

  const { data, isLoading, isFetching, error, refetch } = useDispatchErrorLogs(filters);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Histórico de Erros de Dispatch
            <Badge variant="outline" className="ml-1">{total} registros</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trilha imutável de cada falha de envio. Distinta da DLQ operacional —
            mantém o evento mesmo após retry, sucesso ou abandono.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={hours} onValueChange={(v) => { setHours(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            aria-label="Instância"
            placeholder="Instância (ex.: wpp2)"
            value={instance}
            onChange={(e) => { setInstance(e.target.value); setPage(0); }}
          />
          <Input
            aria-label="E-mail do agente"
            placeholder="E-mail do agente"
            value={agent}
            onChange={(e) => { setAgent(e.target.value); setPage(0); }}
          />
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Busca por remote_jid, código ou mensagem"
              className="pl-8"
              placeholder="Busca em remote_jid, código ou mensagem"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Erro: {(error as Error).message}</p>
          ) : rows.length === 0 ? (
            <GenericEmptyState
              icon={ScrollText}
              title="Sem registros no período"
              description="Nenhum erro de dispatch foi registrado com os filtros atuais."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Tentativa</TableHead>
                  <TableHead>Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(r.occurred_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-xs ">{r.instance_name}</TableCell>
                    <TableCell className="text-xs  truncate max-w-[160px]" title={r.agent_email ?? ''}>
                      {r.agent_email ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs  truncate max-w-[160px]" title={r.remote_jid ?? ''}>
                      {r.remote_jid ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.error_code ? <Badge variant="secondary" className="text-[10px]">{r.error_code}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{r.http_status ?? '—'}</TableCell>
                    <TableCell className="text-xs text-center">{r.retry_count}</TableCell>
                    <TableCell className="text-xs truncate max-w-[260px]" title={r.error_message ?? ''}>
                      {r.error_message ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {pageCount}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
