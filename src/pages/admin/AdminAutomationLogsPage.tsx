// @ts-nocheck
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { Sparkles, RefreshCcw, Eye, ScrollText } from 'lucide-react';
import { useAutomationLogs } from './useAutomationLogs';
import type { AutomationLogsFilters } from './useAutomationLogs';
import { PAGE_SIZE, STATUS_META, statusBadge, Section, KV, Pre } from './automationLogsHelpers';
import type { ExecutionRow } from './automationLogsHelpers';

/** Admin Automation Logs Page. */
export default function AdminAutomationLogsPage() {
  const [filterRule, setFilterRule] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterJid, setFilterJid] = useState('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<ExecutionRow | null>(null);

  const filters: AutomationLogsFilters = {
    filterRule,
    filterStatus,
    filterJid,
    filterFrom,
    filterTo,
    page,
  };
  const { rows, rules, ruleNameById, loading, load } = useAutomationLogs(filters);

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
                <KV k="ID" v={detail.id} />
                <KV k="Quando" v={new Date(detail.created_at).toLocaleString()} />
                <KV k="Status" v={STATUS_META[detail.status]?.label ?? detail.status} />
                <KV k="Conversa" v={detail.remote_jid} />
                <KV k="Instância" v={detail.instance_name ?? '—'} />
                {detail.acted_at && (
                  <KV k="Ação em" v={new Date(detail.acted_at).toLocaleString()} />
                )}
              </Section>

              <Section title="Regra (snapshot no disparo)">
                {detail.rule_snapshot ? (
                  <>
                    <KV k="Nome" v={String(detail.rule_snapshot.name ?? '—')} />
                    <KV k="Gatilho" v={String(detail.rule_snapshot.trigger_type ?? '—')} />
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