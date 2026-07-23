import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { queryExternalProxy } from '@/lib/externalProxy';
import { TABLES, TABLE_CATEGORIES, type CatalogTable } from './catalog';
import { getLogger } from '@/lib/logger';

const log = getLogger('AdminExternalDbExplorer.Catalog');

interface CountState {
  count: number | null;
  error?: string;
  loading: boolean;
}

interface Props {
  onPickTable: (table: string) => void;
}

/** Table Catalog Block. */
export function TableCatalogBlock({ onPickTable }: Props) {
  const [counts, setCounts] = useState<Record<string, CountState>>({});
  const [running, setRunning] = useState(false);

  const loadCounts = async () => {
    setRunning(true);
    setCounts(Object.fromEntries(TABLES.map((t) => [t.name, { count: null, loading: true }])));
    // Sequencial leve para não saturar o proxy (32 tabelas).
    for (const t of TABLES) {
      try {
        const res = await queryExternalProxy({
          table: t.name,
          select: 'id',
          limit: 1,
          countMode: 'estimated',
        });
        setCounts((prev) => ({
          ...prev,
          [t.name]: { count: res.count ?? 0, loading: false, error: res.error },
        }));
      } catch (e) {
        log.warn('count failed', { table: t.name, err: (e as Error).message });
        setCounts((prev) => ({
          ...prev,
          [t.name]: { count: null, loading: false, error: (e as Error).message },
        }));
      }
    }
    setRunning(false);
  };

  useEffect(() => {
    void loadCounts();
     
  }, []);

  const renderCard = (t: CatalogTable) => {
    const c = counts[t.name];
    return (
      <button
        key={t.name}
        type="button"
        onClick={() => onPickTable(t.name)}
        className="text-left rounded-md border p-3 hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <div className="flex items-center justify-between gap-2">
          <code className="text-xs font-medium truncate">{t.name}</code>
          {c?.loading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : c?.error ? (
            <Badge variant="destructive" className="text-[10px]">erro</Badge>
          ) : c?.count != null ? (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {c.count.toLocaleString('pt-BR')}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
      </button>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" /> Catálogo de tabelas
        </CardTitle>
        <Button variant="outline" size="sm" onClick={loadCounts} disabled={running}>
          <RefreshCw className={`h-4 w-4 mr-1 ${running ? 'animate-spin' : ''}`} />
          Recontar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {TABLE_CATEGORIES.map((cat) => {
          const items = TABLES.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{cat}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map(renderCard)}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground pt-2 border-t">
          Contagens são estimadas (<code>countMode: estimated</code>) — clique num card para abrir o explorador.
        </p>
      </CardContent>
    </Card>
  );
}
