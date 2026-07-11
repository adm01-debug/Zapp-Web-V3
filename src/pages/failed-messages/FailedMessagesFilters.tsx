import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ALL_ROOT_CAUSES, getRootCauseMeta } from '@/lib/failureRootCause';

export function FailedMessagesFilters({ ui, stats }: { ui: any; stats: any }) {
  const { api } = ui;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Filtros</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label className="text-xs text-muted-foreground">Buscar (JID, código, mensagem)</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={ui.searchInput}
              onChange={(e) => ui.setSearchInput(e.target.value)}
              placeholder="ex.: 5511..., ETIMEDOUT, 503"
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            Janela {ui.useCustomRange && <span className="text-warning">(ignorada)</span>}
          </label>
          <Select
            value={String(ui.hours)}
            onValueChange={(v) => ui.setHours(Number(v))}
            disabled={ui.useCustomRange}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última hora</SelectItem>
              <SelectItem value="6">Últimas 6h</SelectItem>
              <SelectItem value="24">Últimas 24h</SelectItem>
              <SelectItem value="168">Últimos 7 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">De</label>
          <Input
            type="datetime-local"
            value={ui.customFrom}
            onChange={(e) => ui.setCustomFrom(e.target.value)}
            className="w-[200px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <Input
            type="datetime-local"
            value={ui.customTo}
            onChange={(e) => ui.setCustomTo(e.target.value)}
            className="w-[200px]"
          />
        </div>
        {(ui.customFrom || ui.customTo) && (
          <div className="flex flex-col justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                ui.setCustomFrom('');
                ui.setCustomTo('');
              }}
            >
              Limpar datas
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={ui.statusFilter} onValueChange={(v) => ui.setStatusFilter(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="retrying">Reprocessando</SelectItem>
              <SelectItem value="succeeded">Sucesso</SelectItem>
              <SelectItem value="abandoned">Abandonado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Instância</label>
          <Select value={ui.instanceFilter} onValueChange={ui.setInstanceFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(stats?.by_instance ?? []).map((i: any) => (
                <SelectItem key={i.instance} value={i.instance}>
                  {i.instance} ({i.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Causa raiz</label>
          <Select value={ui.rootCauseFilter} onValueChange={(v) => ui.setRootCauseFilter(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {ALL_ROOT_CAUSES.map((c) => {
                const meta = getRootCauseMeta(c);
                const count =
                  api.aggregates.byRootCause.find((x: any) => x.cause === c)?.count ?? 0;
                return (
                  <SelectItem key={c} value={c}>
                    {meta.label}
                    {count > 0 ? ` (${count})` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Motivo (error_code)</label>
          <Select value={ui.errorCodeFilter} onValueChange={ui.setErrorCodeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {api.aggregates.byErrorCode.map((r: any) => (
                <SelectItem key={r.code} value={r.code}>
                  {r.code} ({r.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
