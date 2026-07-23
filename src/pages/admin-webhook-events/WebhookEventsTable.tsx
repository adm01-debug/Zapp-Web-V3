import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDateTimeCompact } from '@/lib/formatters';
import { Inbox, Eye, Webhook } from 'lucide-react';
import type { EvolutionWebhookEvent } from '@/types/evolutionExternal';

function shortJid(jid: string | null) {
  if (!jid) return '—';
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', ' (grupo)');
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('break-all font-medium', mono && 'text-xs')}>{value}</p>
    </div>
  );
}

interface Props {
  filtered: EvolutionWebhookEvent[];
  isLoading: boolean;
  error: unknown;
  total: number;
  selected: EvolutionWebhookEvent | null;
  setSelected: (row: EvolutionWebhookEvent | null) => void;
}

/** Webhook Events Table. */
export function WebhookEventsTable({
  filtered,
  isLoading,
  error,
  total,
  selected,
  setSelected,
}: Props) {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle
            className="flex items-center gap-2 text-sm font-medium"
            data-testid="webhook-events-results-count"
            data-results-count={filtered.length}
          >
            <Inbox className="h-4 w-4" />
            {filtered.length} evento{filtered.length === 1 ? '' : 's'}
            {filtered.length !== total && (
              <span className="font-normal text-muted-foreground"> (de {total} no período)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-destructive">
              Erro ao carregar: {(error as Error).message}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhum evento no período/filtros selecionados.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.id}
                      data-testid="webhook-event-row"
                      data-remote-jid={row.remote_jid ?? ''}
                      data-push-name={row.push_name ?? ''}
                      data-message-type={row.message_type ?? ''}
                      data-status={
                        row.error_message ? 'error' : row.processed ? 'processed' : 'pending'
                      }
                    >
                      <TableCell
                        className="whitespace-nowrap text-xs"
                        data-testid="webhook-event-created-at"
                      >
                        {formatDateTimeCompact(row.created_at)}
                      </TableCell>
                      <TableCell data-testid="webhook-event-event-type">
                        <Badge variant="outline" className="text-xs">
                          {row.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs" data-testid="webhook-event-instance">
                        {row.instance_name}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col">
                          <span data-testid="webhook-event-jid">{shortJid(row.remote_jid)}</span>
                          {row.push_name && (
                            <span
                              className="max-w-[200px] truncate text-muted-foreground"
                              data-testid="webhook-event-push-name"
                            >
                              {row.push_name}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-testid="webhook-event-status">
                        {row.error_message ? (
                          <Badge variant="destructive" className="text-xs">
                            Erro
                          </Badge>
                        ) : row.processed ? (
                          <Badge
                            variant="outline"
                            className="border-success/40 text-xs text-success"
                          >
                            Processado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelected(row)}
                          aria-label="Ver payload"
                          data-testid="webhook-event-details-button"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Details dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              {selected?.event_type}
            </DialogTitle>
            <DialogDescription>
              {selected &&
                `${selected.instance_name} • ${formatDateTimeCompact(selected.created_at)}`}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Instância" value={selected.instance_name} />
                <Field label="Tipo de mensagem" value={selected.message_type || '—'} />
                <Field label="Remote JID" value={selected.remote_jid || '—'} mono />
                <Field label="From me" value={selected.from_me ? 'Sim' : 'Não'} />
                <Field label="Push name" value={selected.push_name || '—'} />
                <Field label="Processado" value={selected.processed ? 'Sim' : 'Não'} />
                <Field label="Processado em" value={formatDateTimeCompact(selected.processed_at)} />
                <Field label="Recebido em" value={formatDateTimeCompact(selected.created_at)} />
              </div>

              {selected.error_message && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-destructive">Erro</p>
                  <ScrollArea className="max-h-32 rounded border border-destructive/30 bg-destructive/5 p-2">
                    <pre className="whitespace-pre-wrap break-all text-xs">
                      {selected.error_message}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Payload completo</p>
                <ScrollArea className="max-h-80 rounded border bg-muted/40 p-2">
                  <pre className="whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
