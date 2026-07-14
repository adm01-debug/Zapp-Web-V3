import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDateTimeCompact } from '@/lib/formatters';
import type { TypeAggregate } from './aggregations';

interface WebhookDetailTableProps {
  byType: TypeAggregate[];
}

export function WebhookDetailTable({ byType }: WebhookDetailTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Detalhamento por tipo</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Processados</TableHead>
              <TableHead className="text-right">Erros</TableHead>
              <TableHead className="text-right">% erro</TableHead>
              <TableHead>Último evento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byType.map((row) => {
              const pct = row.total > 0 ? (row.errored / row.total) * 100 : 0;
              const high = pct > 5;
              return (
                <TableRow key={row.type}>
                  <TableCell className="text-xs">{row.type}</TableCell>
                  <TableCell className="text-right font-semibold">{row.total}</TableCell>
                  <TableCell className="text-right text-success">{row.processed}</TableCell>
                  <TableCell className={cn('text-right', row.errored > 0 && 'text-destructive')}>
                    {row.errored}
                  </TableCell>
                  <TableCell className="text-right">
                    {high ? (
                      <Badge variant="destructive" className="text-xs">
                        {pct.toFixed(1)}%
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTimeCompact(row.lastAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
