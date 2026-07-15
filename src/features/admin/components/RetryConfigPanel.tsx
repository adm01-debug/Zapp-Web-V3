import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings2, RotateCcw, Save, Info, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useInstanceRetryConfig } from '@/hooks/messaging/useInstanceRetryConfig';
import {
  RETRY_CONFIG_RANGES,
  RETRY_CONFIG_FIELDS,
  DEFAULT_RETRY_CONFIG,
  validateRetryConfig,
  hasRetryConfigErrors,
  type RetryConfig,
} from '@/lib/retryConfig';
import { RetryConfigBackoffTable } from './RetryConfigBackoffTable';

const GLOBAL = '_global';

const FIELD_LABELS: Record<keyof RetryConfig, { label: string; help: string; unit: string }> = {
  maxRetries: {
    label: 'Máximo de tentativas',
    help: 'Total incluindo a primeira chamada.',
    unit: '',
  },
  baseBackoffMs: {
    label: 'Backoff inicial',
    help: 'Espera antes da 2ª tentativa (dobra a cada falha).',
    unit: 'ms',
  },
  maxBackoffMs: {
    label: 'Backoff máximo',
    help: 'Limite superior da espera entre tentativas.',
    unit: 'ms',
  },
  timeoutMs: {
    label: 'Timeout por chamada',
    help: 'Aborta a chamada se passar disso.',
    unit: 'ms',
  },
};

function buildPreview(c: RetryConfig): string {
  const steps: string[] = ['1ª: imediata'];
  for (let i = 1; i < c.maxRetries; i++) {
    const delay = Math.min(c.baseBackoffMs * 2 ** (i - 1), c.maxBackoffMs);
    steps.push(`${i + 1}ª: ~${delay}ms`);
  }
  steps.push(`abort em ${Math.round(c.timeoutMs / 1000)}s`);
  return steps.join(' → ');
}

export function RetryConfigPanel() {
  const [instances, setInstances] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(GLOBAL);
  const {
    config,
    globalConfig,
    isLoading,
    isSaving,
    hasInstanceOverride,
    save,
    resetToGlobal,
    resetToDefault,
  } = useInstanceRetryConfig(selected);

  const [draft, setDraft] = useState<RetryConfig>(DEFAULT_RETRY_CONFIG);
  // Tracks whether the user has unsaved edits so background reloads don't clobber them.
  const userHasEditsRef = useRef(false);
  const prevSelectedRef = useRef(selected);
  useEffect(() => {
    const instanceChanged = prevSelectedRef.current !== selected;
    prevSelectedRef.current = selected;
    if (instanceChanged) {
      userHasEditsRef.current = false;
      setDraft(config);
    } else if (!userHasEditsRef.current) {
      setDraft(config);
    }
  }, [config, selected]);

  // Carrega instâncias disponíveis
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('whatsapp_connections')
          .select('instance_id')
          .not('instance_id', 'is', null);
        if (cancelled) return;
        const list = Array.from(
          new Set(
            (data ?? [])
              .map((r) => r.instance_id as string | null)
              .filter((v): v is string => !!v && v.trim() !== '')
          )
        );
        setInstances(list.sort());
      } catch {
        setInstances([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(
    () => RETRY_CONFIG_FIELDS.some((f) => draft[f] !== config[f]),
    [draft, config]
  );
  const validationErrors = useMemo(() => validateRetryConfig(draft), [draft]);
  const isInvalid = hasRetryConfigErrors(validationErrors);

  function updateField(field: keyof RetryConfig, value: number) {
    userHasEditsRef.current = true;
    const r = RETRY_CONFIG_RANGES[field];
    const clamped = Math.min(r.max, Math.max(r.min, Math.floor(value || 0)));
    setDraft((d) => ({ ...d, [field]: clamped }));
  }

  async function handleSave() {
    if (isInvalid) return;
    const partial: Partial<RetryConfig> = {};
    RETRY_CONFIG_FIELDS.forEach((f) => {
      if (draft[f] !== config[f]) partial[f] = draft[f];
    });
    try {
      await save(partial);
      userHasEditsRef.current = false;
    } catch {
      // Erros de validação/persistência já mostram toast no hook.
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="h-4 w-4" />
          Configuração de retry (sem deploy)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Instance selector */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Escopo</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL}>Global (default para todas)</SelectItem>
                {instances.map((i) => (
                  <SelectItem key={i} value={i}>
                    Instância: {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected !== GLOBAL && (
            <Badge variant={hasInstanceOverride ? 'default' : 'outline'}>
              {hasInstanceOverride ? 'override ativo' : 'herdando do global'}
            </Badge>
          )}
        </div>

        {/* Fields */}
        {isLoading ? (
          <div className="space-y-3">
            {RETRY_CONFIG_FIELDS.map((f) => (
              <Skeleton key={f} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {RETRY_CONFIG_FIELDS.map((field) => {
              const meta = FIELD_LABELS[field];
              const range = RETRY_CONFIG_RANGES[field];
              const value = draft[field];
              const inheritedFromGlobal = selected !== GLOBAL && !hasInstanceOverride;
              const fieldError = validationErrors[field];
              return (
                <div key={field} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label className={cn('text-sm font-medium', fieldError && 'text-destructive')}>
                      {meta.label}
                    </Label>
                    <Input
                      type="number"
                      value={value}
                      min={range.min}
                      max={range.max}
                      step={range.step}
                      onChange={(e) => updateField(field, Number(e.target.value))}
                      aria-invalid={!!fieldError}
                      className={cn(
                        'h-8 w-28 text-right tabular-nums',
                        fieldError && 'border-destructive focus-visible:ring-destructive'
                      )}
                    />
                  </div>
                  <Slider
                    value={[value]}
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    onValueChange={([v]) => updateField(field, v)}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{meta.help}</span>
                    {inheritedFromGlobal && (
                      <span className="italic">
                        global: {globalConfig[field]}
                        {meta.unit}
                      </span>
                    )}
                  </div>
                  {fieldError && (
                    <div className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{fieldError}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Validation summary */}
        {isInvalid && (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
            role="alert"
            data-testid="retry-config-validation-banner"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <div className="mb-0.5 font-medium text-destructive">
                Combinações inválidas — corrija antes de salvar
              </div>
              <ul className="list-inside list-disc space-y-0.5 text-destructive/90">
                {Object.entries(validationErrors).map(([k, msg]) => (
                  <li key={k}>{msg}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Preview */}
        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <div className="mb-0.5 font-medium">Comportamento resultante</div>
            <div className="text-muted-foreground">{buildPreview(draft)}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t pt-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || isSaving || isLoading || isInvalid}
          >
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
          {selected !== GLOBAL && hasInstanceOverride && (
            <Button size="sm" variant="outline" onClick={resetToGlobal} disabled={isSaving}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar global
            </Button>
          )}
          {selected === GLOBAL && (
            <Button size="sm" variant="outline" onClick={resetToDefault} disabled={isSaving}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar padrão de fábrica
            </Button>
          )}
        </div>

        <RetryConfigBackoffTable />
      </CardContent>
    </Card>
  );
}