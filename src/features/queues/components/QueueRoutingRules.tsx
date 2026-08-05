import { useState } from 'react';
import { useQueueRoutingRules, type QueueRoutingRule, type QueueRoutingRuleInsert } from '@/hooks/useQueueRoutingRules';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, AlertTriangle, Route } from 'lucide-react';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<string, string> = {
  keyword: 'Palavra-chave',
  contact_tag: 'Tag de Contato',
  department: 'Departamento',
  time_based: 'Horário',
  round_robin: 'Round Robin',
};

const RULE_TYPES = Object.keys(RULE_TYPE_LABELS);

// ─────────────────────────────────────────────
// Form helpers
// ─────────────────────────────────────────────

type RuleFormData = {
  rule_type: string;
  priority: number;
  condition: string; // raw JSON edited by the user
  is_active: boolean;
};

const DEFAULT_FORM: RuleFormData = {
  rule_type: 'keyword',
  priority: 10,
  condition: '{}',
  is_active: true,
};

function ruleToForm(rule: QueueRoutingRule): RuleFormData {
  return {
    rule_type: rule.rule_type ?? 'keyword',
    priority: rule.priority ?? 10,
    condition: rule.condition ? JSON.stringify(rule.condition, null, 2) : '{}',
    is_active: rule.is_active ?? true,
  };
}

function tryParseCondition(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function conditionPreview(condition: QueueRoutingRule['condition']): string {
  if (!condition) return '{}';
  const str = JSON.stringify(condition);
  return str.length > 70 ? `${str.slice(0, 67)}…` : str;
}

// ─────────────────────────────────────────────
// Rule dialog
// ─────────────────────────────────────────────

interface RuleDialogProps {
  open: boolean;
  isEditing: boolean;
  form: RuleFormData;
  isPending: boolean;
  jsonError: string | null;
  onChange: (field: keyof RuleFormData, value: string | number | boolean) => void;
  onSave: () => void;
  onClose: () => void;
}

function RuleDialog({ open, isEditing, form, isPending, jsonError, onChange, onSave, onClose }: RuleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Regra de Roteamento' : 'Nova Regra de Roteamento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Rule type */}
          <div className="space-y-1.5">
            <Label htmlFor="rrule-type">Tipo de Regra</Label>
            <Select
              value={form.rule_type}
              onValueChange={(v) => onChange('rule_type', v)}
            >
              <SelectTrigger id="rrule-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {RULE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label htmlFor="rrule-priority">
              Prioridade{' '}
              <span className="text-xs text-muted-foreground">(menor = maior precedência)</span>
            </Label>
            <Input
              id="rrule-priority"
              type="number"
              min={0}
              max={9999}
              value={form.priority}
              onChange={(e) => onChange('priority', Number(e.target.value))}
            />
          </div>

          {/* Condition JSON */}
          <div className="space-y-1.5">
            <Label htmlFor="rrule-condition">
              Condição{' '}
              <span className="text-xs text-muted-foreground">(JSON)</span>
            </Label>
            <Textarea
              id="rrule-condition"
              value={form.condition}
              onChange={(e) => onChange('condition', e.target.value)}
              rows={4}
              className={jsonError ? 'border-destructive focus-visible:ring-destructive' : ''}
              placeholder='{"keyword": "urgente"}'
            />
            {jsonError && (
              <p className="text-xs text-destructive">{jsonError}</p>
            )}
          </div>

          {/* Active switch */}
          <div className="flex items-center gap-3">
            <Switch
              id="rrule-active"
              checked={form.is_active}
              onCheckedChange={(v) => onChange('is_active', v)}
            />
            <Label htmlFor="rrule-active">Regra ativa</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? 'Salvando…' : isEditing ? 'Salvar' : 'Criar Regra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

interface Props {
  /** The queue whose routing rules are managed. */
  queueId: string;
}

/**
 * QueueRoutingRules — FILAS-04
 *
 * Displays and edits `zapp.queue_routing_rules` for a given queue.
 * Renders a compact list with inline switch toggles, edit and delete buttons,
 * and a dialog for creating/editing rules.
 */
export function QueueRoutingRules({ queueId }: Props) {
  const { rules, isLoading, createRule, updateRule, deleteRule } = useQueueRoutingRules(queueId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<QueueRoutingRule | null>(null);
  const [form, setForm] = useState<RuleFormData>(DEFAULT_FORM);
  const [jsonError, setJsonError] = useState<string | null>(null);

  function openCreate() {
    setEditingRule(null);
    setForm(DEFAULT_FORM);
    setJsonError(null);
    setDialogOpen(true);
  }

  function openEdit(rule: QueueRoutingRule) {
    setEditingRule(rule);
    setForm(ruleToForm(rule));
    setJsonError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingRule(null);
    setJsonError(null);
  }

  function handleFormChange(field: keyof RuleFormData, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'condition') setJsonError(null);
  }

  function handleSave() {
    const parsedCondition = tryParseCondition(form.condition);
    if (parsedCondition === null) {
      setJsonError('JSON inválido — corrija o formato antes de salvar.');
      return;
    }

    const payload: QueueRoutingRuleInsert = {
      rule_type: form.rule_type,
      priority: form.priority,
      condition: parsedCondition,
      is_active: form.is_active,
    };

    if (editingRule?.id) {
      updateRule.mutate({ id: editingRule.id, data: payload }, { onSuccess: closeDialog });
    } else {
      createRule.mutate(payload, { onSuccess: closeDialog });
    }
  }

  const isPending = createRule.isPending || updateRule.isPending;

  return (
    <>
      {/* Header row */}
      <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Route className="h-4 w-4 text-primary" />
          Regras de Roteamento
          {!isLoading && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {rules.length}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={openCreate}
        >
          <Plus className="h-3 w-3" />
          Adicionar
        </Button>
      </div>

      {/* Rule list */}
      {isLoading ? (
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      ) : rules.length === 0 ? (
        <div className="mt-2 flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 opacity-50" />
          Nenhuma regra configurada para esta fila
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2.5 rounded-md border border-border/30 bg-muted/10 px-3 py-1.5 transition-colors hover:bg-muted/30"
            >
              <Switch
                checked={rule.is_active ?? true}
                onCheckedChange={(checked) =>
                  updateRule.mutate({ id: rule.id!, data: { is_active: checked } })
                }
                aria-label="Ativar/desativar regra"
                className="scale-75"
              />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
                  {RULE_TYPE_LABELS[rule.rule_type ?? ''] ?? rule.rule_type ?? '—'}
                </Badge>
                <span className="truncate text-xs text-muted-foreground">
                  {conditionPreview(rule.condition)}
                </span>
              </div>
              <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                prio&nbsp;{rule.priority ?? 0}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Editar regra"
                onClick={() => openEdit(rule)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Excluir regra"
                onClick={() => deleteRule.mutate(rule.id!)}
                disabled={deleteRule.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <RuleDialog
        open={dialogOpen}
        isEditing={!!editingRule}
        form={form}
        isPending={isPending}
        jsonError={jsonError}
        onChange={handleFormChange}
        onSave={handleSave}
        onClose={closeDialog}
      />
    </>
  );
}
