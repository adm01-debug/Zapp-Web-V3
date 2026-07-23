import {
  AlertTriangle, RefreshCw, CheckCircle2,
  Clock, RotateCw, PlayCircle, Server,
  Lock, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  useFailedMessagesStats,
  FailedMessageKpiCard,
  FailedMessageTableRow,
} from '@/features/admin';
import { useUserRole } from '@/features/auth';
import { cn } from '@/lib/utils';
import { RetryConfigPanel } from '@/features/admin';
import { BulkReprocessGuidedDialog } from '@/features/admin';
import { DLQAuditHistory } from '@/components/monitoring/DLQAuditHistory';
import { toast } from 'sonner';
import { openContactInChat } from '@/lib/openContactInChat';
import { useFailedMessagesUI } from '@/features/admin/hooks/monitoring/useFailedMessagesUI';
import { type RootCause } from '@/lib/failureRootCause';
import { type FailedMessageRow } from '@/features/admin/hooks/monitoring/useFailedMessages';

// Sub-components can be extracted to separate files if needed, but keeping them here for now
// to maintain the 1:1 migration while reducing the main file size.
import { FailedMessagesFilters } from './failed-messages/FailedMessagesFilters';
import { FailedMessagesBulkActions } from './failed-messages/FailedMessagesBulkActions';
import { FailedMessagesRootCauseChart } from './failed-messages/FailedMessagesRootCauseChart';
import { FailedMessagesErrorCodeChart } from './failed-messages/FailedMessagesErrorCodeChart';
import { FailedMessageDetailsSheet } from './failed-messages/FailedMessageDetailsSheet';
import { FailedMessagesBulkAbandonDialog } from './failed-messages/FailedMessagesBulkAbandonDialog';

function extractMessageIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const candidates = [
    p.message_id,
    p.messageId,
    p.id,
    (p.key as Record<string, unknown> | undefined)?.id,
    (p.options as Record<string, unknown> | undefined)?.message_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

/** Admin Failed Messages Page. */
export default function AdminFailedMessagesPage() {
  const { isDev, isAdmin } = useUserRole();
  const canEdit = isDev;
  const readOnly = !canEdit;

  const ui = useFailedMessagesUI();
  const { api, sortedRows } = ui;
  const { data: stats } = useFailedMessagesStats();

  const handleViewInChat = async (row: FailedMessageRow) => {
    if (!row.remote_jid) {
      toast.error('Mensagem sem destinatário identificado');
      return;
    }
    const messageId = extractMessageIdFromPayload(row.payload) ?? undefined;
    const ok = await openContactInChat({ remoteJid: row.remote_jid, messageId });
    if (!ok) toast.error('Contato não encontrado no inbox');
  };

  const totalPages = Math.max(1, Math.ceil(api.total / ui.pageSize));

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-warning" />
            Dead-Letter Queue — Mensagens com Falha
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mensagens da Evolution API que falharam por erros transitórios e estão na fila de reprocesso automático.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void api.refetch()}
            disabled={api.isRefetching}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', api.isRefetching && 'animate-spin')} />
            Atualizar
          </Button>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => api.triggerReprocess.mutate()}
              disabled={api.triggerReprocess.isPending}
            >
              <PlayCircle className={cn('h-4 w-4 mr-2', api.triggerReprocess.isPending && 'animate-spin')} />
              Reprocessar agora
            </Button>
          )}
        </div>
      </header>

      {readOnly && isAdmin && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" />
          <span>Modo somente leitura — ações de reprocesso e abandono são restritas à equipe técnica (dev).</span>
        </div>
      )}

      {/* Retry config */}
      <RetryConfigPanel />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <FailedMessageKpiCard icon={Clock} label="Pendentes" value={api.aggregates.pending} tone="warning" />
        <FailedMessageKpiCard icon={RotateCw} label="Reprocessando" value={api.aggregates.retrying} tone="info" />
        <FailedMessageKpiCard icon={XCircle} label="Abandonados" value={api.aggregates.abandoned24h} tone="destructive" />
        <FailedMessageKpiCard
          icon={CheckCircle2}
          label="Sucesso após retry"
          value={`${api.aggregates.successAfterRetryRate}%`}
          tone="success"
        />
        <FailedMessageKpiCard
          icon={Server}
          label="Top instância"
          value={api.aggregates.topInstance ? `${api.aggregates.topInstance.instance} (${api.aggregates.topInstance.count})` : '—'}
          tone="info"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FailedMessagesRootCauseChart
          stats={api.aggregates.byRootCause}
          filter={ui.rootCauseFilter}
          onFilterChange={(v) => ui.setRootCauseFilter(v as RootCause | 'all')}
        />
        <FailedMessagesErrorCodeChart
          stats={api.aggregates.byErrorCode}
          filter={ui.errorCodeFilter}
          onFilterChange={(v) => ui.setErrorCodeFilter(v)}
        />
      </div>

      <FailedMessagesFilters ui={ui} stats={stats} />

      <FailedMessagesBulkActions
        canEdit={canEdit}
        selectedCount={ui.selectedIds.size}
        onClearSelection={() => ui.setSelectedIds(new Set())}
        onReprocess={() => ui.setGuidedReprocessOpen(true)}
        onAbandon={() => ui.setConfirmBulkAbandon(true)}
        isBulkRetrying={api.bulkRetry.isPending}
        isBulkAbandoning={api.bulkAbandon.isPending}
      />

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {api.total} item{api.total === 1 ? '' : 's'}
            {api.total > ui.pageSize && (
              <span className="text-xs text-muted-foreground font-normal ml-1">
                · página {ui.page + 1} de {totalPages}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {api.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : sortedRows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">Nenhuma mensagem na fila.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {canEdit && <TableHead className="w-10">Select</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead className="text-center">Tentativas</TableHead>
                  <TableHead>Última</TableHead>
                  <TableHead>Próxima</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => (
                  <FailedMessageTableRow
                    key={row.id}
                    row={row}
                    canEdit={canEdit}
                    isSelected={ui.selectedIds.has(row.id)}
                    onToggle={ui.toggleOne}
                    onSelect={ui.setSelected}
                    onViewInChat={handleViewInChat}
                    onRetry={(id) => api.retryNow.mutate(id)}
                    onAbandon={(id) => api.abandon.mutate(id)}
                    isRetrying={api.retryNow.isPending}
                    isAbandoning={api.abandon.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DLQAuditHistory />

      <FailedMessagesBulkAbandonDialog ui={ui} onConfirm={(ids, reason) => api.bulkAbandon.mutate({ ids, reason })} />
      <BulkReprocessGuidedDialog
        open={ui.guidedReprocessOpen}
        onOpenChange={ui.setGuidedReprocessOpen}
        selectedRows={sortedRows.filter(r => ui.selectedIds.has(r.id))}
        onConfirm={async (ids, reason) => {
          return api.bulkRetry.mutateAsync({ ids, reason });
        }}
        isPending={api.bulkRetry.isPending}
      />
      <FailedMessageDetailsSheet
        selected={ui.selected}
        onClose={() => ui.setSelected(null)}
        onViewInChat={handleViewInChat}
      />
    </div>
  );
}
