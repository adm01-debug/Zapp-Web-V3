import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, CircleCheck, CircleX } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { InstanceValidationStats } from './instanceAggregations';

interface InstanceBreakdownTableProps {
  stats: InstanceValidationStats[];
  onSelectInstance: (instance: string) => void;
}

type SortKey = 'instance' | 'total' | 'validationRate' | 'lastEventAt';

/** Instance Breakdown Table. */
export function InstanceBreakdownTable({ stats, onSelectInstance }: InstanceBreakdownTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const arr = [...stats];
    arr.sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      switch (sortKey) {
        case 'instance':
          av = a.instance;
          bv = b.instance;
          break;
        case 'total':
          av = a.total;
          bv = b.total;
          break;
        case 'validationRate':
          av = a.validationRate;
          bv = b.validationRate;
          break;
        case 'lastEventAt':
          av = a.lastEventAt ? new Date(a.lastEventAt).getTime() : 0;
          bv = b.lastEventAt ? new Date(b.lastEventAt).getTime() : 0;
          break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [stats, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'instance' ? 'asc' : 'desc');
    }
  };

  const isStale = (lastAt: string | null) => {
    if (!lastAt) return true;
    return Date.now() - new Date(lastAt).getTime() > 60 * 60 * 1000; // 1h
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Por instância</CardTitle>
        <CardDescription>
          Clique numa linha para filtrar a página por essa instância.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma instância nas últimas 24h.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th scope="col" className="py-2 pr-4">
                    <SortButton label="Instância" onClick={() => toggleSort('instance')} active={sortKey === 'instance'} dir={sortDir} />
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right">
                    <SortButton label="Total 24h" onClick={() => toggleSort('total')} active={sortKey === 'total'} dir={sortDir} />
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right">Validados</th>
                  <th scope="col" className="py-2 pr-4 text-right">
                    <SortButton label="% Válido" onClick={() => toggleSort('validationRate')} active={sortKey === 'validationRate'} dir={sortDir} />
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    <SortButton label="Último evento" onClick={() => toggleSort('lastEventAt')} active={sortKey === 'lastEventAt'} dir={sortDir} />
                  </th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const stale = isStale(s.lastEventAt);
                  return (
                    <tr
                      key={s.instance}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                      tabIndex={0}
                      onClick={() => onSelectInstance(s.instance)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectInstance(s.instance)}
                    >
                      <td className="py-2 pr-4  text-xs">{s.instance}</td>
                      <td className="py-2 pr-4 text-right ">
                        {s.total.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 pr-4 text-right ">
                        {s.validated.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 pr-4 text-right ">
                        {s.validationRate < 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={
                              s.validationRate >= 99
                                ? 'text-success'
                                : s.validationRate >= 90
                                ? 'text-warning'
                                : 'text-destructive'
                            }
                          >
                            {s.validationRate.toFixed(2)}%
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {s.lastEventAt
                          ? formatDistanceToNow(new Date(s.lastEventAt), {
                              addSuffix: true,
                              locale: ptBR,
                            })
                          : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        {stale ? (
                          <Badge variant="destructive" className="gap-1">
                            <CircleX className="h-3 w-3" /> inativa
                          </Badge>
                        ) : s.errored > 0 ? (
                          <Badge variant="warning" className="gap-1">
                            {s.errored} erros
                          </Badge>
                        ) : (
                          <Badge variant="success" className="gap-1">
                            <CircleCheck className="h-3 w-3" /> ativa
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SortButtonProps {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}

function SortButton({ label, active, dir, onClick }: SortButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-1 -ml-1 text-xs uppercase font-medium text-muted-foreground hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ml-1 ${active ? 'opacity-100' : 'opacity-30'}`} />
      {active && <span className="sr-only">{dir === 'asc' ? 'ascending' : 'descending'}</span>}
    </Button>
  );
}
