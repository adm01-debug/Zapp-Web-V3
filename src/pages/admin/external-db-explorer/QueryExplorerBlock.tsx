import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Search, Play, Trash2, Plus, Copy, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { queryExternalProxy } from '@/lib/externalProxy';
import { TABLES, RPCS } from './catalog';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';

const log = getLogger('AdminExternalDbExplorer.Query');

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in', 'is'] as const;
type Operator = typeof OPERATORS[number];

interface FilterRow {
  _id: number;
  column: string;
  operator: Operator;
  value: string;
}

interface QueryResult {
  rows: unknown[];
  count?: number;
  ms: number;
  error?: string;
}

export interface QueryExplorerHandle {
  setTable: (table: string) => void;
}

export const QueryExplorerBlock = forwardRef<QueryExplorerHandle>(function QueryExplorerBlock(_props, ref) {
  const [mode, setMode] = useState<'select' | 'rpc'>('select');

  // SELECT state
  const [table, setTable] = useState<string>('evolution_messages');
  const [limit, setLimit] = useState<number>(10);
  const [filters, setFilters] = useState<FilterRow[]>([]);

  // RPC state
  const [rpcName, setRpcName] = useState<string>('rpc_dashboard_home');
  const initialParams = useMemo(
    () => JSON.stringify(RPCS.find((r) => r.name === 'rpc_dashboard_home')?.exampleParams ?? {}, null, 2),
    [],
  );
  const [rpcParamsText, setRpcParamsText] = useState<string>(initialParams);
  const [paramsError, setParamsError] = useState<string | null>(null);

  // Result
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  useImperativeHandle(ref, () => ({
    setTable: (t: string) => {
      setMode('select');
      setTable(t);
      setFilters([]);
      setResult(null);
    },
  }));

  // Switch RPC → preencher params de exemplo
  const onRpcChange = (name: string) => {
    setRpcName(name);
    const def = RPCS.find((r) => r.name === name);
    if (def) {
      setRpcParamsText(JSON.stringify(def.exampleParams, null, 2));
      setParamsError(null);
    }
  };

  const addFilter = () => setFilters((f) => [...f, { _id: Date.now(), column: '', operator: 'eq', value: '' }]);
  const updateFilter = (i: number, patch: Partial<FilterRow>) =>
    setFilters((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, idx) => idx !== i));

  const run = async () => {
    setRunning(true);
    setResult(null);
    const t0 = performance.now();
    try {
      if (mode === 'select') {
        const safeLimit = Math.max(1, Math.min(50, limit || 10));
        const validFilters = filters.filter((f) => f.column.trim() && f.value.trim());
        const res = await queryExternalProxy({
          table,
          select: '*',
          limit: safeLimit,
          countMode: 'estimated',
          filters: validFilters.map((f) => ({
            column: f.column.trim(),
            operator: f.operator,
            value: f.value.trim(),
          })),
        });
        setResult({
          rows: Array.isArray(res.data) ? res.data : [],
          count: res.count,
          ms: Math.round(performance.now() - t0),
          error: res.error,
        });
      } else {
        let parsedParams: Record<string, unknown> = {};
        try {
          parsedParams = rpcParamsText.trim() ? JSON.parse(rpcParamsText) : {};
          setParamsError(null);
        } catch (e) {
          setParamsError(`JSON inválido: ${(e as Error).message}`);
          setRunning(false);
          return;
        }
        const res = await queryExternalProxy({
          action: 'rpc',
          rpc: rpcName,
          params: parsedParams,
        });
        const data = res.data as unknown;
        setResult({
          rows: Array.isArray(data) ? (data as unknown[]) : data == null ? [] : [data],
          ms: Math.round(performance.now() - t0),
          error: res.error,
        });
      }
    } catch (e) {
      log.error('query failed', { mode, err: (e as Error).message });
      setResult({
        rows: [],
        ms: Math.round(performance.now() - t0),
        error: (e as Error).message,
      });
    } finally {
      setRunning(false);
    }
  };

  const copyJson = () => {
    if (!result) return;
    void navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2));
    toast.success('JSON copiado');
  };

  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const target = mode === 'select' ? table : rpcName;
    a.href = url;
    a.download = `fatorx-${target}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo(() => {
    if (!result?.rows.length) return [];
    const first = result.rows[0];
    if (first && typeof first === 'object') return Object.keys(first as Record<string, unknown>);
    return ['value'];
  }, [result]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4" /> Explorador (read-only)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'select' | 'rpc' /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */)}>
          <TabsList>
            <TabsTrigger value="select">SELECT tabela</TabsTrigger>
            <TabsTrigger value="rpc">Chamar RPC</TabsTrigger>
          </TabsList>

          <TabsContent value="select" className="space-y-3 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <div>
                <Label className="text-xs">Tabela</Label>
                <Select value={table} onValueChange={setTable}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TABLES.map((t) => (
                      <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Limit (1–50)</Label>
                <Input
                  type="number" min={1} max={50}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-28"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Filtros</Label>
                <Button variant="outline" size="sm" onClick={addFilter} disabled={filters.length >= 5}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              {filters.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem filtros — retorna últimos N registros.</p>
              )}
              <div className="space-y-2">
                {filters.map((f, i) => (
                  <div key={f._id} className="grid grid-cols-[1fr_120px_1fr_auto] gap-2">
                    <Input
                      placeholder="coluna (ex: remote_jid)"
                      value={f.column}
                      onChange={(e) => updateFilter(i, { column: e.target.value })}
                    />
                    <Select value={f.operator} onValueChange={(v) => updateFilter(i, { operator: v as Operator  /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="valor"
                      value={f.value}
                      onChange={(e) => updateFilter(i, { value: e.target.value })}
                    />
                    <Button aria-label="Remover filtro" variant="ghost" size="icon" onClick={() => removeFilter(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rpc" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">RPC</Label>
              <Select value={rpcName} onValueChange={onRpcChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RPCS.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name}{' '}<span className="text-muted-foreground">— {r.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Params (JSON)</Label>
              <textarea
                value={rpcParamsText}
                onChange={(e) => setRpcParamsText(e.target.value)}
                rows={8}
                spellCheck={false}
                aria-label="Parâmetros RPC em JSON"
                className="w-full  text-xs rounded-md border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {paramsError && <p className="text-xs text-destructive mt-1">{paramsError}</p>}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
            Executar
          </Button>
          {result && (
            <>
              <Button variant="outline" size="sm" onClick={copyJson}>
                <Copy className="h-3 w-3 mr-1" /> Copiar JSON
              </Button>
              <Button variant="outline" size="sm" onClick={downloadJson}>
                <Download className="h-3 w-3 mr-1" /> Baixar
              </Button>
            </>
          )}
        </div>

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <Badge variant={result.error ? 'destructive' : 'secondary'}>
                {result.error ? 'ERRO' : 'OK'}
              </Badge>
              <span>{result.ms} ms</span>
              <span>•</span>
              <span>{result.rows.length} linha(s) retornada(s)</span>
              {result.count != null && (
                <>
                  <span>•</span>
                  <span>~{result.count.toLocaleString('pt-BR')} no total</span>
                </>
              )}
            </div>

            {result.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Erro do proxy</AlertTitle>
                <AlertDescription className=" text-xs">{result.error}</AlertDescription>
              </Alert>
            )}

            {result.rows.length > 0 && (
              <div className="rounded-md border overflow-auto max-h-[480px]">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {columns.map((c) => (
                        <th key={c} scope="col" className="text-left p-2 font-medium whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => {
                      const rowRec = row as Record<string, unknown>;
                      const rowKey = String(rowRec.id ?? rowRec.uuid ?? i);
                      return (
                      <tr key={rowKey} className="border-t hover:bg-muted/50">
                        {columns.map((c) => {
                          const v = (row as Record<string, unknown>)?.[c];
                          const isObj = v != null && typeof v === 'object';
                          const display = v == null ? '—' : isObj ? JSON.stringify(v) : String(v);
                          const truncated = display.length > 80 ? display.slice(0, 80) + '…' : display;
                          return (
                            <td key={c} className="p-2 align-top max-w-xs" title={display}>
                              <span className={isObj ? ' text-muted-foreground' : ''}>{truncated}</span>
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
