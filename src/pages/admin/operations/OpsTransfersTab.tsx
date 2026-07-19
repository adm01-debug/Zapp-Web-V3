import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Clock, ShieldAlert, TrendingUp } from "lucide-react";
import { useTransfersPaginated } from "@/features/admin/hooks/monitoring/useTransfersPaginated";

const PAGE_SIZE = 25;

/** Ops Transfers Tab. */
export function OpsTransfersTab() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [priority, setPriority] = useState<number | null>(null);

  const { data, isLoading, isError, error } = useTransfersPaginated({
    status, priority, page, pageSize: PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const deniedReason = data?.deniedReason ?? null;

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      pending: acc.pending + (r.status === 'pending' ? 1 : 0),
      escalated: acc.escalated + (r.status === 'escalated' ? 1 : 0),
      expired: acc.expired + (r.sla_deadline && new Date(r.sla_deadline) < new Date() ? 1 : 0),
    }),
    { pending: 0, escalated: 0, expired: 0 },
  ), [rows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      {deniedReason && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>{deniedReason}</AlertDescription>
        </Alert>
      )}

      {isError && !deniedReason && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falha ao carregar transferências</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : 'Erro desconhecido.'}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes (página)</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totals.pending}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Escalados (página)</CardTitle>
            <TrendingUp className="h-4 w-4 text-warning-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totals.escalated}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SLA Estourado (página)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{totals.expired}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle>Transferências ({total})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status ?? 'all'} onValueChange={(v) => { setPage(0); setStatus(v === 'all' ? null : v); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="accepted">Aceita</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
                <SelectItem value="rejected">Recusada</SelectItem>
                <SelectItem value="expired">Expirada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority?.toString() ?? 'all'} onValueChange={(v) => { setPage(0); setPriority(v === 'all' ? null : Number(v)); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as prioridades</SelectItem>
                <SelectItem value="4">P1 — Urgente</SelectItem>
                <SelectItem value="3">P2 — Alta</SelectItem>
                <SelectItem value="2">P3 — Normal</SelectItem>
                <SelectItem value="1">P4 — Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-4">Contato</th>
                  <th scope="col" className="py-2 pr-4">Origem → Destino</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Prioridade</th>
                  <th scope="col" className="py-2 pr-4">SLA</th>
                  <th scope="col" className="py-2 pr-4">Criada</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      {deniedReason ? 'Sem acesso a esta lista.' : 'Nenhuma transferência encontrada.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const expired = r.sla_deadline && new Date(r.sla_deadline) < new Date();
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-4">{r.contact_name ?? r.remote_jid ?? '—'}</td>
                        <td className="py-2 pr-4">{r.source_instance ?? '—'} → {r.target_instance ?? '—'}</td>
                        <td className="py-2 pr-4"><Badge variant="secondary">{r.status}</Badge></td>
                        <td className="py-2 pr-4">{r.priority ?? '—'}</td>
                        <td className="py-2 pr-4">
                          {expired ? <Badge variant="destructive">Estourado</Badge> : (r.sla_deadline ?? '—')}
                        </td>
                        <td className="py-2 pr-4">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
