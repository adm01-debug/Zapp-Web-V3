import { useMemo } from 'react';
import { useFailedMessages } from '@/features/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { AlertTriangle, UsersRound, Smartphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { aggregateByAgent, aggregateByChannel } from './aggregations';

interface Props {
  windowHours: number;
}

/** Dispatch Errors Block. */
export function DispatchErrorsBlock({ windowHours }: Props) {
  const { data, isLoading, error } = useFailedMessages({ hours: windowHours, pageSize: 500 });

  const rows = data?.rows ?? [];
  const byAgent = useMemo(() => aggregateByAgent(rows), [rows]);
  const byChannel = useMemo(() => aggregateByChannel(rows), [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-warning-foreground" />
          Erros de dispatch
          <Badge variant="outline" className="ml-1">{rows.length} falhas</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <p className="text-sm text-destructive">Erro: {(error as Error).message}</p>
        ) : rows.length === 0 ? (
          <GenericEmptyState
            icon={AlertTriangle}
            title="Sem falhas de dispatch"
            description="Nenhuma mensagem falhou no envio nesta janela."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <UsersRound className="h-4 w-4" /> Por agente
              </h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agente</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Top motivos</TableHead>
                      <TableHead>Última falha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byAgent.slice(0, 10).map((a) => (
                      <TableRow key={a.agent}>
                        <TableCell className="text-xs  truncate max-w-[180px]" title={a.agent}>
                          {a.agent}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {a.total} <span className="text-muted-foreground">({a.pct}%)</span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1">
                            {a.topReasons.map((r) => (
                              <Badge key={r.reason} variant="secondary" className="text-[10px]">
                                {r.reason} · {r.count}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {a.lastErrorAt
                            ? formatDistanceToNow(new Date(a.lastErrorAt), { addSuffix: true, locale: ptBR })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Por canal/instância
              </h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instância</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Último erro</TableHead>
                      <TableHead>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byChannel.slice(0, 10).map((c) => (
                      <TableRow key={c.instance}>
                        <TableCell className="text-xs ">{c.instance}</TableCell>
                        <TableCell className="text-right text-xs">
                          {c.total} <span className="text-muted-foreground">({c.pct}%)</span>
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]" title={c.lastError ?? ''}>
                          {c.lastError ?? '—'}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {c.lastErrorAt
                            ? formatDistanceToNow(new Date(c.lastErrorAt), { addSuffix: true, locale: ptBR })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
