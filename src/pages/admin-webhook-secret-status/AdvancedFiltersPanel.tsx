import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronUp, Filter, RotateCcw, X, Columns3, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  type WebhookStatusFilter,
  type WebhookTableDensity,
  type WebhookViewColumns,
  type WebhookViewPreferences,
} from '@/hooks/useWebhookViewPreferences';

interface Props {
  prefs: WebhookViewPreferences;
  setPref: <K extends keyof WebhookViewPreferences>(key: K, value: WebhookViewPreferences[K]) => void;
  setVisibleColumn: (column: keyof WebhookViewColumns, visible: boolean) => void;
  clearFilters: () => void;
  resetPrefs: () => void;
  activeFilterCount: number;
  availableEventTypes: string[];
  currentInstance: string | null;
  /** Optional: clear the instance filter (URL param). When omitted, the instance chip is shown without a remove button. */
  onClearInstance?: () => void;
}

const STATUS_OPTIONS: Array<{ value: WebhookStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'valid', label: 'Válidas' },
  { value: 'invalid', label: 'Inválidas' },
  { value: 'unsigned', label: 'Sem assinatura' },
  { value: 'errored', label: 'Com erro' },
];

const COLUMN_LABELS: Record<keyof WebhookViewColumns, string> = {
  when: 'Quando',
  event: 'Evento',
  instance: 'Instância',
  signature: 'Assinatura',
  status: 'Status',
  action: 'Ação',
};

export function AdvancedFiltersPanel({
  prefs,
  setPref,
  setVisibleColumn,
  clearFilters,
  resetPrefs,
  activeFilterCount,
  availableEventTypes,
  currentInstance,
  onClearInstance,
}: Props) {
  const [open, setOpen] = useState(activeFilterCount > 0);
  const [reasonDraft, setReasonDraft] = useState(prefs.reasonSearch);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Debounce reason search input.
  useEffect(() => {
    const t = setTimeout(() => {
      if (reasonDraft !== prefs.reasonSearch) setPref('reasonSearch', reasonDraft);
    }, 300);
    return () => clearTimeout(t);
  }, [reasonDraft, prefs.reasonSearch, setPref]);

  // If the external prefs change (reset), sync the draft.
  useEffect(() => {
    setReasonDraft(prefs.reasonSearch);
  }, [prefs.reasonSearch]);

  const isInstancePinned = useMemo(
    () => Boolean(prefs.pinnedInstance) && prefs.pinnedInstance === currentInstance,
    [prefs.pinnedInstance, currentInstance],
  );

  const handlePinToggle = (checked: boolean) => {
    if (checked) {
      if (!currentInstance) {
        toast.message('Selecione uma instância antes de fixar.');
        return;
      }
      setPref('pinnedInstance', currentInstance);
      toast.success(`Instância "${currentInstance}" fixada como padrão.`);
    } else {
      setPref('pinnedInstance', null);
      toast.message('Instância padrão removida.');
    }
  };

  const handleClearFilters = () => {
    clearFilters();
    setReasonDraft('');
    toast.message('Filtros limpos.');
  };

  const handleResetPrefs = () => {
    resetPrefs();
    setReasonDraft('');
    toast.success('Preferências restauradas ao padrão.');
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="gap-2"
            aria-expanded={open}
          >
            <Filter className="h-4 w-4" />
            <span className="font-medium">Filtros avançados</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount} ativo{activeFilterCount > 1 ? 's' : ''}
              </Badge>
            )}
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClearOpen(true)}
              disabled={activeFilterCount === 0}
              className="gap-1"
              aria-label="Limpar filtros"
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtros
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetPrefs}
              className="gap-1"
              aria-label="Restaurar padrões"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar padrões
            </Button>
          </div>
        </div>

        {/* Active filters summary — always visible, auto-updates on any pref change */}
        {(() => {
          const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
          if (currentInstance) {
            chips.push({
              key: 'instance',
              label: `Instância: ${currentInstance}`,
              onClear: onClearInstance ?? (() => {}),
            });
          }
          if (prefs.statusFilter !== 'all') {
            const statusLabel =
              STATUS_OPTIONS.find((o) => o.value === prefs.statusFilter)?.label ??
              prefs.statusFilter;
            chips.push({
              key: 'status',
              label: `Status: ${statusLabel}`,
              onClear: () => setPref('statusFilter', 'all'),
            });
          }
          if (prefs.reasonSearch.trim()) {
            chips.push({
              key: 'reason',
              label: `Motivo: "${prefs.reasonSearch.trim()}"`,
              onClear: () => setPref('reasonSearch', ''),
            });
          }
          if (prefs.eventTypeFilter) {
            chips.push({
              key: 'event',
              label: `Tipo: ${prefs.eventTypeFilter}`,
              onClear: () => setPref('eventTypeFilter', null),
            });
          }
          if (chips.length === 0) return null;
          return (
            <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-live="polite">
              <span className="text-xs text-muted-foreground mr-1">Filtros ativos:</span>
              {chips.map((c) => (
                <Badge
                  key={c.key}
                  variant="secondary"
                  className="gap-1 pl-2 pr-1 py-0.5"
                >
                  <span className="text-xs">{c.label}</span>
                  <button
                    type="button"
                    onClick={c.onClear}
                    className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                    aria-label={`Remover filtro ${c.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          );
        })()}

        {open && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Status filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Status de validação</Label>
              <Select
                value={prefs.statusFilter}
                onValueChange={(v) => setPref('statusFilter', v as WebhookStatusFilter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason search */}
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="webhook-reason-search">Motivo contém…</Label>
              <Input
                id="webhook-reason-search"
                leftIcon={Search}
                placeholder="ex.: HMAC mismatch, timeout"
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
              />
            </div>

            {/* Event type filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de evento</Label>
              <Select
                value={prefs.eventTypeFilter ?? '__all__'}
                onValueChange={(v) =>
                  setPref('eventTypeFilter', v === '__all__' ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os tipos</SelectItem>
                  {availableEventTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Density */}
            <div className="space-y-1.5">
              <Label className="text-xs">Densidade da tabela</Label>
              <Select
                value={prefs.tableDensity}
                onValueChange={(v) => setPref('tableDensity', v as WebhookTableDensity /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comfortable">Confortável</SelectItem>
                  <SelectItem value="compact">Compacta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pin instance */}
            <div className="space-y-1.5">
              <Label className="text-xs">Instância padrão</Label>
              <div className="flex items-center justify-between rounded-md border bg-background h-10 px-3">
                <span className="text-sm text-muted-foreground truncate">
                  {prefs.pinnedInstance
                    ? `Fixada: ${prefs.pinnedInstance}`
                    : 'Sem instância fixada'}
                </span>
                <Switch
                  checked={isInstancePinned}
                  onCheckedChange={handlePinToggle}
                  aria-label="Fixar instância atual como padrão"
                />
              </div>
            </div>

            {/* Visible columns */}
            <div className="space-y-1.5">
              <Label className="text-xs">Colunas visíveis</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-10">
                    <span className="flex items-center gap-2 text-sm">
                      <Columns3 className="h-4 w-4" />
                      {Object.values(prefs.visibleColumns).filter(Boolean).length} de{' '}
                      {Object.keys(prefs.visibleColumns).length} visíveis
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56" align="end">
                  <div className="space-y-2">
                    {(Object.keys(COLUMN_LABELS) as Array<keyof WebhookViewColumns>).map((col) => (
                      <label
                        key={col}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={prefs.visibleColumns[col]}
                          onCheckedChange={(c) => setVisibleColumn(col, c === true)}
                        />
                        {COLUMN_LABELS[col]}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar filtros atuais?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} ativo
              {activeFilterCount > 1 ? 's' : ''} (status, motivo, tipo de evento e
              instância selecionada) ser{activeFilterCount > 1 ? 'ão' : 'á'} removido
              {activeFilterCount > 1 ? 's' : ''}. Suas preferências salvas (colunas,
              densidade e instância fixada) permanecem intactas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleClearFilters();
                setConfirmClearOpen(false);
              }}
            >
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}