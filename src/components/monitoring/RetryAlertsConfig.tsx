import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bell, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_RETRY_DEDUPE_MODE,
  resolveThresholds,
  saveThresholds,
  savePerInstanceThresholds,
  saveRetryAlertDedupeMode,
  type PerInstanceThresholds,
  type RetryAlertDedupeMode,
  type RetryThresholds,
} from '@/lib/retryAlerts';

interface RetryAlertsConfigProps {
  value: RetryThresholds;
  onChange: (t: RetryThresholds) => void;
  perInstance?: PerInstanceThresholds;
  onPerInstanceChange?: (next: PerInstanceThresholds) => void;
  /** Granularidade do dedupe de toasts. Default: 'instance+kind'. */
  dedupeMode?: RetryAlertDedupeMode;
  onDedupeModeChange?: (next: RetryAlertDedupeMode) => void;
  /** Instances detected in the current dataset — surfaced first in the picker. */
  knownInstances?: string[];
  hasBreaches?: boolean;
}

function sanitize(t: RetryThresholds): RetryThresholds {
  return {
    p95Attempts: Math.max(1, Number(t.p95Attempts) || DEFAULT_THRESHOLDS.p95Attempts),
    failureRatePct: Math.max(
      1,
      Math.min(100, Number(t.failureRatePct) || DEFAULT_THRESHOLDS.failureRatePct),
    ),
    minSampleSize: Math.max(1, Number(t.minSampleSize) || DEFAULT_THRESHOLDS.minSampleSize),
  };
}

export function RetryAlertsConfig({
  value,
  onChange,
  perInstance = {},
  onPerInstanceChange,
  dedupeMode = DEFAULT_RETRY_DEDUPE_MODE,
  onDedupeModeChange,
  knownInstances = [],
  hasBreaches,
}: RetryAlertsConfigProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'global' | 'instance'>('global');
  const [draft, setDraft] = useState<RetryThresholds>(value);
  const [draftMap, setDraftMap] = useState<PerInstanceThresholds>(perInstance);
  const [draftDedupeMode, setDraftDedupeMode] = useState<RetryAlertDedupeMode>(dedupeMode);
  const [selectedInstance, setSelectedInstance] = useState<string>(knownInstances[0] ?? '');
  const [newInstance, setNewInstance] = useState('');

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      setDraft(value);
      setDraftMap(perInstance);
      setDraftDedupeMode(dedupeMode);
      setSelectedInstance(knownInstances[0] ?? Object.keys(perInstance)[0] ?? '');
    }
  };

  const allInstances = useMemo(() => {
    const set = new Set<string>([...knownInstances, ...Object.keys(draftMap)]);
    return Array.from(set).sort();
  }, [knownInstances, draftMap]);

  // Effective thresholds for the currently-selected instance (used to seed editor).
  const selectedDraft: RetryThresholds = useMemo(() => {
    if (!selectedInstance) return draft;
    return resolveThresholds(selectedInstance, draft, draftMap);
  }, [selectedInstance, draft, draftMap]);

  const updateInstanceField = (field: keyof RetryThresholds, val: number) => {
    if (!selectedInstance) return;
    setDraftMap((prev) => {
      const next: PerInstanceThresholds = { ...prev };
      const current = { ...(next[selectedInstance] ?? {}) };
      current[field] = val;
      next[selectedInstance] = current;
      return next;
    });
  };

  const removeInstanceOverride = (instance: string) => {
    setDraftMap((prev) => {
      const next = { ...prev };
      delete next[instance];
      return next;
    });
  };

  const addInstance = () => {
    const trimmed = newInstance.trim();
    if (!trimmed) return;
    if (trimmed.length > 64) {
      toast.error('Nome de instância muito longo');
      return;
    }
    setDraftMap((prev) => ({ ...prev, [trimmed]: prev[trimmed] ?? {} }));
    setSelectedInstance(trimmed);
    setNewInstance('');
  };

  const handleSave = () => {
    const sanitized = sanitize(draft);
    saveThresholds(sanitized);
    onChange(sanitized);

    // Sanitize per-instance map: keep only finite numeric fields.
    const cleanedMap: PerInstanceThresholds = {};
    for (const [name, partial] of Object.entries(draftMap)) {
      const cleaned: Partial<RetryThresholds> = {};
      if (typeof partial.p95Attempts === 'number' && Number.isFinite(partial.p95Attempts)) {
        cleaned.p95Attempts = Math.max(1, partial.p95Attempts);
      }
      if (typeof partial.failureRatePct === 'number' && Number.isFinite(partial.failureRatePct)) {
        cleaned.failureRatePct = Math.max(1, Math.min(100, partial.failureRatePct));
      }
      if (typeof partial.minSampleSize === 'number' && Number.isFinite(partial.minSampleSize)) {
        cleaned.minSampleSize = Math.max(1, partial.minSampleSize);
      }
      if (Object.keys(cleaned).length > 0) cleanedMap[name] = cleaned;
    }
    savePerInstanceThresholds(cleanedMap);
    onPerInstanceChange?.(cleanedMap);

    saveRetryAlertDedupeMode(draftDedupeMode);
    onDedupeModeChange?.(draftDedupeMode);

    const overrideCount = Object.keys(cleanedMap).length;
    toast.success(
      overrideCount > 0
        ? `Limites salvos · ${overrideCount} override${overrideCount > 1 ? 's' : ''} por instância`
        : 'Limites de alerta atualizados',
    );
    setOpen(false);
  };

  const handleResetGlobal = () => {
    setDraft({ ...DEFAULT_THRESHOLDS });
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs relative"
          aria-label="Configurar alertas de retry"
        >
          <Bell className="w-3.5 h-3.5" />
          Alertas
          {hasBreaches && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive ring-2 ring-background"
              aria-hidden="true"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3">
        <div>
          <p className="text-sm font-semibold">Limites de alerta</p>
          <p className="text-xs text-muted-foreground">
            Dispara alerta quando uma instância ultrapassa os limites na janela atual.
          </p>
        </div>

        <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-1.5">
          <Label htmlFor="dedupe-mode" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Granularidade do toast
          </Label>
          <Select
            value={draftDedupeMode}
            onValueChange={(v) => setDraftDedupeMode(v as RetryAlertDedupeMode)}
          >
            <SelectTrigger id="dedupe-mode" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="instance+kind" className="text-xs">
                Por instância × tipo de violação (p95 e % falha separados)
              </SelectItem>
              <SelectItem value="instance" className="text-xs">
                Por instância apenas (1 toast agregado)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {draftDedupeMode === 'instance+kind'
              ? 'Cada tipo de violação dispara um toast — útil para diagnosticar p95 vs taxa de falha.'
              : 'Um único toast por instância na janela combinando todos os motivos — menos ruído.'}
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'global' | 'instance')}>
          <TabsList className="grid w-full grid-cols-2 h-8">
            <TabsTrigger value="global" className="text-xs">Global</TabsTrigger>
            <TabsTrigger value="instance" className="text-xs">
              Por instância
              {Object.keys(draftMap).length > 0 && (
                <span className="ml-1.5 rounded bg-primary/10 px-1 text-[10px] text-primary">
                  {Object.keys(draftMap).length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="space-y-2.5 mt-3">
            <Field
              label="p95 de tentativas máx."
              value={draft.p95Attempts}
              onChange={(v) => setDraft({ ...draft, p95Attempts: v })}
              hint="Ex.: 3 → alerta se p95 ≥ 3 tentativas"
              min={1}
              max={20}
            />
            <Field
              label="% falha máxima"
              value={draft.failureRatePct}
              onChange={(v) => setDraft({ ...draft, failureRatePct: v })}
              hint="(failed + exhausted) / total × 100"
              min={1}
              max={100}
            />
            <Field
              label="Amostra mínima"
              value={draft.minSampleSize}
              onChange={(v) => setDraft({ ...draft, minSampleSize: v })}
              hint="Instâncias com menos runs são ignoradas"
              min={1}
              max={1000}
            />
            <div className="pt-1">
              <Button variant="ghost" size="sm" onClick={handleResetGlobal} className="text-xs gap-1.5 h-8">
                <RotateCcw className="w-3 h-3" />
                Restaurar padrão
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="instance" className="space-y-3 mt-3">
            <div className="flex items-center gap-2">
              <Select
                value={selectedInstance}
                onValueChange={setSelectedInstance}
                disabled={allInstances.length === 0}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Selecione a instância" />
                </SelectTrigger>
                <SelectContent>
                  {allInstances.map((inst) => (
                    <SelectItem key={inst} value={inst} className="text-xs">
                      {inst}
                      {draftMap[inst] && Object.keys(draftMap[inst]).length > 0 && (
                        <span className="ml-2 text-[10px] text-primary">●</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedInstance && draftMap[selectedInstance] && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => removeInstanceOverride(selectedInstance)}
                  aria-label="Remover override desta instância"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Input
                inputSize="sm"
                placeholder="Adicionar instância (ex.: wpp2)"
                value={newInstance}
                onChange={(e) => setNewInstance(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addInstance();
                  }
                }}
                maxLength={64}
              />
              <Button size="sm" variant="outline" onClick={addInstance} className="h-8 text-xs">
                Adicionar
              </Button>
            </div>

            {selectedInstance ? (
              <div className="space-y-2.5">
                <p className="text-[10px] text-muted-foreground">
                  Editando overrides para <code className="text-foreground">{selectedInstance}</code>.
                  Campos não preenchidos herdam do global.
                </p>
                <Field
                  label="p95 de tentativas máx."
                  value={selectedDraft.p95Attempts}
                  onChange={(v) => updateInstanceField('p95Attempts', v)}
                  min={1}
                  max={20}
                />
                <Field
                  label="% falha máxima"
                  value={selectedDraft.failureRatePct}
                  onChange={(v) => updateInstanceField('failureRatePct', v)}
                  min={1}
                  max={100}
                />
                <Field
                  label="Amostra mínima"
                  value={selectedDraft.minSampleSize}
                  onChange={(v) => updateInstanceField('minSampleSize', v)}
                  min={1}
                  max={1000}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-3 text-center">
                Nenhuma instância detectada. Adicione uma acima.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end pt-1">
          <Button size="sm" onClick={handleSave} className="text-xs h-8">
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  min?: number;
  max?: number;
}

function Field({ label, value, onChange, hint, min, max }: FieldProps) {
  const fieldId = `field-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={fieldId} className="text-xs">{label}</Label>
      <Input
        id={fieldId}
        type="number"
        inputSize="sm"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
