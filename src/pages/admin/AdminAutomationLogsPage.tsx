// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sparkles,
  RefreshCcw,
  Eye,
  ScrollText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExecutionRow {
  id: string;
  rule_id: string | null;
  remote_jid: string;
  instance_name: string | null;
  status: 'pending' | 'executed' | 'dismissed' | 'error' | string;
  trigger_payload: Record<string, unknown>;
  suggestion_text: string | null;
  applied_tags: string[] | null;
  recommended_tag: string | null;
  kb_sources: string[] | null;
  rule_snapshot: Record<string, unknown>;
  channel_id: string | null;
  department_id: string | null;
  error_message: string | null;
  error_at: string | null;
  acted_at: string | null;
  acted_by: string | null;
  created_at: string;
}

interface RuleLite {
  id: string;
  name: string;
}

const STATUS_META: Record<
  string,
  { label: string; icon: LucideIcon; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pendente', icon: Clock, variant: 'outline' },
  accepted: { label: 'Aceita', icon: CheckCircle2, variant: 'default' },
  executed: { label: 'Executada', icon: CheckCircle2, variant: 'default' },
  dismissed: { label: 'Descartada', icon: XCircle, variant: 'secondary' },
  failed: { label: 'Falhou', icon: AlertTriangle, variant: 'destructive' },
};

type AutomationStatus = 'pending' | 'accepted' | 'executed' | 'dismissed' | 'failed';

const PAGE_SIZE = 50;

export default function AdminAutomationLogsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ExecutionRow[]>([]);
  const [rules, setRules] = useState<RuleLite[]>([]);
  const [loading, setLoading] = useState(false);

  const [filterRule, setFilterRule] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterJid, setFilterJid] = useState('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [page, setPage] = useState(0);

  const [detail, setDetail] = useState<ExecutionRow | null>(null);

  const mountedRef = useMountedRef();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await safeClient.from<ExecutionRow>('automation_executions', (q) => {
      let query = q
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (filterRule !== 'all') query = query.eq('rule_id', filterRule);
      if (filterStatus !== 'all') query = query.eq('status', filterStatus as AutomationStatus);
      if (filterJid.trim()) query = query.ilike('remote_jid', `%${filterJid.trim()}%`);
      if (filterFrom) query = query.gte('created_at', new Date(filterFrom).toISOString());
      if (filterTo) {
        const to = new Date(filterTo);
        to.setHours(23, 59, 59, 999);
        query = query.lte('created_at', to.toISOString());
      }
      return query;
    });
    if (!mountedRef.current) return;
    if (error) {
      // Silently show empty state when table doesn't exist yet (pending migration)
      const isMissing =
        error.message?.includes('does not exist') || (error as { code?: string }).code === '42P01';
      if (!isMissing) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      }
      setRows([]);
    } else {
      setRows((data ?? []) as ExecutionRow[]);
    }
    setLoading(false);
  }, [page, filterRule, filterStatus, filterJid, filterFrom, filterTo, toast]);

  useEffect(() => {
    supabase
      .from('automations')
      .select('id,name')
      .order('name')
      .then(({ data }) => {
        if (mountedRef.current) setRules((data ?? []) as RuleLite[]);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: novas execuções aparecem no topo
  useEffect(() => {
    const ch = supabase
      .channel('automation-executions-audit')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'automation_executions' },
        () => {
          if (page === 0) void load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [page, load]);

  const ruleNameById = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);

  const statusBadge = (s: string) => {
    const meta = STATUS_META[s] ?? { label: s, icon: ScrollText, variant: 'outline' };
    const Icon = meta.icon;
    return (
      <Badge variant={meta.variant} className="gap-1">
        <Icon className="h-3 w-3" /> {meta.label}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ScrollText className="h-5 w-5 text-primary" /> Audit trail de automações
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico completo: gatilho, condições avaliadas, ações aplicadas e sugestão da IA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className="mr-1 h-4 w-4" /> Atualizar
          </Button>
          <Link to="/admin/automations">
            <Button size="sm" variant="ghost">
              <Sparkles className="mr-1 h-4 w-4" /> Regras
            </Button>
          </Link>
        </div>
      </div>

      <Card className="mb-4 grid grid-cols-1 gap-3 p-3 md:grid-cols-5">
        <div>
          <Label className="text-xs">Regra</Label>
          <Select
            value={filterRule}
            onValueChange={(v) => {
              setPage(0);
              setFilterRule(v);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {rules.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select
            value={filterStatus}
            onValueChange={(v) => {
              setPage(0);
              setFilterStatus(v);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="accepted">Aceita</SelectItem>
              <SelectItem value="executed">Executada</SelectItem>
              <SelectItem value="dismissed">Descartada</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Conversa (jid)</Label>
          <Input
            value={filterJid}
            onChange={(e) => {
              setPage(0);
              setFilterJid(e.target.value);
            }}
            placeholder="55..."
          />
        </div>
        <div>
          <Label className="text-xs">De</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => {
              setPage(0);
              setFilterFrom(e.target.value);
            }}
          />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => {
              setPage(0);
              setFilterTo(e.target.value);
            }}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Quando</TableHead>
              <TableHead>Regra</TableHead>
              <TableHead>Conversa</TableHead>
              <TableHead>Gatilho</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma execução com esses filtros.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const triggerType =
                r.rule_snapshot?.trigger_type ?? r.trigger_payload?.trigger_type ?? '—';
              const ruleName =
                r.rule_snapshot?.name ??
                (r.rule_id ? ruleNameById[r.rule_id] : null) ??
                '(regra removida)';
              const tagsCount = (r.applied_tags ?? []).length;
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                  <TableCell className="text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">{ruleName}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">{r.remote_jid}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {triggerType}
                    </Badge>
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-wrap gap-1">
                      {r.suggestion_text && <Badge variant="secondary">Sugestão</Badge>}
                      {tagsCount > 0 && <Badge variant="secondary">{tagsCount} tag(s)</Badge>}
                      {r.recommended_tag && <Badge variant="secondary">tag IA</Badge>}
                      {r.error_message && <Badge variant="destructive">erro</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Ver detalhes do log"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetail(r);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Página {page + 1} • {rows.length} registros
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Detalhe da execução</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-4 text-sm">
              <Section title="Identificação">
                <KV k="ID" v={detail.id} mono />
                <KV k="Quando" v={new Date(detail.created_at).toLocaleString()} />
                <KV k="Status" v={STATUS_META[detail.status]?.label ?? detail.status} />
                <KV k="Conversa" v={detail.remote_jid} mono />
                <KV k="Instância" v={detail.instance_name ?? '—'} />
                {detail.acted_at && (
                  <KV k="Ação em" v={new Date(detail.acted_at).toLocaleString()} />
                )}
              </Section>

              <Section title="Regra (snapshot no disparo)">
                {detail.rule_snapshot ? (
                  <>
                    <KV k="Nome" v={detail.rule_snapshot.name ?? '—'} />
                    <KV k="Gatilho" v={detail.rule_snapshot.trigger_type ?? '—'} />
                    <KV k="Prioridade" v={String(detail.rule_snapshot.priority ?? '—')} />
                    <KV k="Cooldown (s)" v={String(detail.rule_snapshot.cooldown_seconds ?? '—')} />
                    <Pre title="Condições" data={detail.rule_snapshot.trigger_config ?? {}} />
                    <Pre title="Ações configuradas" data={detail.rule_snapshot.actions ?? {}} />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Snapshot indisponível (execução anterior à v2 do audit trail).
                  </p>
                )}
              </Section>

              <Section title="Avaliação do gatilho">
                <Pre title="Payload" data={detail.trigger_payload ?? {}} />
              </Section>

              <Section title="Ações tomadas">
                <KV k="Tags aplicadas" v={(detail.applied_tags ?? []).join(', ') || '—'} />
                <KV k="Tag recomendada (IA)" v={detail.recommended_tag ?? '—'} />
                <KV k="Fontes da KB" v={(detail.kb_sources ?? []).join(', ') || '—'} />
                {detail.suggestion_text && (
                  <div>
                    <Label className="text-xs">Mensagem sugerida</Label>
                    <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">
                      {detail.suggestion_text}
                    </div>
                  </div>
                )}
              </Section>

              {(detail.error_message || detail.error_at) && (
                <Section title="Erro">
                  {detail.error_at && (
                    <KV k="Quando" v={new Date(detail.error_at).toLocaleString()} />
                  )}
                  <div className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                    {detail.error_message}
                  </div>
                </Section>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? 'max-w-[280px] truncate' : 'max-w-[280px] truncate'}>{v}</span>
    </div>
  );
}

function Pre({ title, data }: { title: string; data: unknown }) {
  return (
    <div>
      <Label className="text-xs">{title}</Label>
      <pre className="mt-1 max-h-[200px] overflow-x-auto rounded-md border bg-muted/30 p-2 text-[11px]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}