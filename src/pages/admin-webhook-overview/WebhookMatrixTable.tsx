import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { openWebhookEventsWithFilters } from '@/lib/webhookEventsDeepLink';
import type { MatrixAggregate } from './aggregations';

interface WebhookMatrixTableProps {
  matrix: MatrixAggregate;
}

/** Webhook Matrix Table. */
export function WebhookMatrixTable({ matrix }: WebhookMatrixTableProps) {
  if (matrix.instances.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Distribuição: tipo × instância</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Clique numa célula para abrir o log filtrado por tipo + instância.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[420px]">
          <Table>
            <caption className="sr-only">
              Contagem de eventos de webhook por tipo e instância, com cor de intensidade
              representando volume relativo. Células com volume são clicáveis e abrem o log filtrado
              correspondente.
            </caption>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[220px]">Tipo</TableHead>
                {matrix.instances.map((i) => (
                  <TableHead key={i} className="text-center text-xs">
                    {i}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.types.map((t) => {
                const rowTotal = matrix.instances.reduce(
                  (s, i) => s + (matrix.matrix[t]?.[i] ?? 0),
                  0
                );
                const max = Math.max(...matrix.instances.map((i) => matrix.matrix[t]?.[i] ?? 0), 1);
                return (
                  <TableRow key={t}>
                    <TableCell className="text-xs">{t}</TableCell>
                    {matrix.instances.map((i) => {
                      const count = matrix.matrix[t]?.[i] ?? 0;
                      const intensity = count === 0 ? 0 : Math.min(1, count / max);
                      const cellStyle = count
                        ? {
                            backgroundColor: `hsl(var(--primary) / ${(intensity * 0.35).toFixed(2)})`,
                          }
                        : undefined;
                      return (
                        <TableCell key={i} className="p-0 text-center text-xs" style={cellStyle}>
                          {count > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                openWebhookEventsWithFilters({ eventType: t, instance: i })
                              }
                              title={`Abrir log: ${t} em ${i} (${count} evento${count === 1 ? '' : 's'})`}
                              className="h-full w-full cursor-pointer px-2 py-2 transition-shadow hover:ring-2 hover:ring-inset hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
                            >
                              {count}
                            </button>
                          ) : (
                            <span className="block px-2 py-2 text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-semibold">{rowTotal}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
