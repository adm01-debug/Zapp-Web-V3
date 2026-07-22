import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { WebhookTableDensity, WebhookViewColumns } from '@/hooks/useWebhookViewPreferences';


interface WebhookEvent {
  id?: string;
  created_at: string;
  event_type: string;
  instance_name?: string | null;
  signature_valid?: boolean | null;
  error_message?: string | null;
  processed?: boolean | null;
}

interface VisibleColumns {
  when: boolean;
  event: boolean;
  instance: boolean;
  signature: boolean;
  status: boolean;
  action: boolean;
}

interface Prefs {
  visibleColumns: VisibleColumns;
  tableDensity: 'default' | 'compact';
}

interface WebhookEventsTableProps {
  scopeLabel: string;
  events: WebhookEvent[];
  filteredEvents: WebhookEvent[];
  eventsLoading: boolean;
  prefs: Prefs;
  activeFilterCount: number;
  recheckingId: string | null;
  handleRecheck: (id: string) => void;
  clearAllFiltersAndUrl: () => void;
}

/** Webhook Events Table. */
export function WebhookEventsTable({
  scopeLabel,
  events,
  filteredEvents,
  eventsLoading,
  prefs,
  activeFilterCount,
  recheckingId,
  handleRecheck,
  clearAllFiltersAndUrl,
}: WebhookEventsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Últimos eventos recebidos — {scopeLabel}
          {activeFilterCount > 0 && (
            <Badge variant="secondary">
              {filteredEvents.length} de {events.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Top 20 eventos das últimas 24 horas — atualiza a cada 30s.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {eventsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum webhook recebido nas últimas 24h.
          </p>
        ) : filteredEvents.length === 0 ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum evento corresponde aos filtros atuais.
            </p>
            <Button variant="outline" size="sm" onClick={clearAllFiltersAndUrl}>
              Limpar filtros
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className={`w-full text-sm ${
                prefs.tableDensity === 'compact' ? '[&_td]:py-1 [&_th]:py-1' : ''
              }`}
            >
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  {prefs.visibleColumns.when && (
                    <th scope="col" className="py-2 pr-4">
                      Quando
                    </th>
                  )}
                  {prefs.visibleColumns.event && (
                    <th scope="col" className="py-2 pr-4">
                      Evento
                    </th>
                  )}
                  {prefs.visibleColumns.instance && (
                    <th scope="col" className="py-2 pr-4">
                      Instância
                    </th>
                  )}
                  {prefs.visibleColumns.signature && (
                    <th scope="col" className="py-2 pr-4">
                      Assinatura
                    </th>
                  )}
                  {prefs.visibleColumns.status && (
                    <th scope="col" className="py-2 pr-4">
                      Status
                    </th>
                  )}
                  {prefs.visibleColumns.action && (
                    <th scope="col" className="py-2 pr-4 text-right">
                      Ação
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredEvents.slice(0, 20).map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    {prefs.visibleColumns.when && (
                      <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                        {formatDistanceToNow(new Date(e.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </td>
                    )}
                    {prefs.visibleColumns.event && (
                      <td className="py-2 pr-4 text-xs">{e.event_type}</td>
                    )}
                    {prefs.visibleColumns.instance && (
                      <td className="py-2 pr-4 text-xs">{e.instance_name ?? '—'}</td>
                    )}
                    {prefs.visibleColumns.signature && (
                      <td className="py-2 pr-4">
                        {e.signature_valid === true ? (
                          <Badge variant="success">válida</Badge>
                        ) : e.signature_valid === false ? (
                          <Badge variant="destructive">inválida</Badge>
                        ) : (
                          <Badge variant="subtle">—</Badge>
                        )}
                      </td>
                    )}
                    {prefs.visibleColumns.status && (
                      <td className="py-2 pr-4">
                        {e.error_message ? (
                          <Badge variant="destructive">erro</Badge>
                        ) : e.processed ? (
                          <Badge variant="success">ok</Badge>
                        ) : (
                          <Badge variant="subtle">pendente</Badge>
                        )}
                      </td>
                    )}
                    {prefs.visibleColumns.action && (
                      <td className="py-2 pr-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={recheckingId === e.id}
                          onClick={() => handleRecheck(e.id ?? '')}
                          aria-label="Revalidar assinatura"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${recheckingId === e.id ? 'animate-spin' : ''}`}
                          />
                          <span className="ml-1 text-xs">Revalidar</span>
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
