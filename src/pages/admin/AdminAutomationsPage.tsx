// @ts-nocheck
import { useMemo, useState } from 'react';
import {
  useAdminAutomations,
  TRIGGER_LABEL,
  EMPTY_RULE,
  type Rule,
} from '@/hooks/admin/useAdminAutomations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Tag,
  Send,
  Clock,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Building2,
  Radio,
} from 'lucide-react';
import { AutomationRuleDialog } from './AutomationRuleDialog';


// Ensure escalate_sla always has required properties with proper types
function normalizeEscalateSla(
  partial: Partial<typeof EMPTY_RULE.actions.escalate_sla> | undefined
): typeof EMPTY_RULE.actions.escalate_sla {
  return {
    enabled: partial?.enabled ?? false,
    level: (partial?.level as string) ?? 'high',
    reason: partial?.reason ?? '',
  };
}


export default function AdminAutomationsPage() {
  const {
    rules,
    channels,
    departments,
    loading,
    error,
    reload,
    save: hookSave,
    remove,
    toggleActive,
    adjustPriority,
    channelMap,
    deptMap,
  } = useAdminAutomations();


  const [editing, setEditing] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (filterChannel !== 'all' && (r.channel_id ?? 'none') !== filterChannel) return false;
      if (filterDepartment !== 'all' && (r.department_id ?? 'none') !== filterDepartment)
        return false;
      if (filterStatus === 'active' && !r.is_active) return false;
      if (filterStatus === 'inactive' && r.is_active) return false;
      return true;
    });
  }, [rules, filterChannel, filterDepartment, filterStatus]);

  const startNew = () => {
    setEditing({ ...(EMPTY_RULE as Rule), id: '' });
    setOpen(true);
  };

  const startEdit = (r: Rule) => {
    const cloned = JSON.parse(JSON.stringify(r)) as Rule;
    cloned.actions = {
      ...EMPTY_RULE.actions,
      ...(cloned.actions ?? {}),
      escalate_sla: normalizeEscalateSla(cloned.actions?.escalate_sla),
    };
    setEditing(cloned);
    setOpen(true);
  };

  const save = async () => {
    const ok = await hookSave(editing);
    if (ok) {
      setOpen(false);
      setEditing(null);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> Automações por gatilho
          </h1>
          <p className="text-sm text-muted-foreground">
            Regras por canal e filial: sugestão de resposta com IA, aplicação de tag e escalonamento
            de SLA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/automations/logs">
            <Button variant="outline" size="sm">
              Audit trail
            </Button>
          </a>
          <Button onClick={startNew}>
            <Plus className="mr-1 h-4 w-4" /> Nova regra
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-[180px]">
          <Label className="text-xs" htmlFor="filter-channel">
            Canal
          </Label>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger id="filter-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="none">Sem canal (global)</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs" htmlFor="filter-department">
            Filial / Departamento
          </Label>
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger id="filter-department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="none">Sem filial (global)</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs" htmlFor="filter-status">
            Status
          </Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger id="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="inactive">Inativas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {rules.length} regras
        </div>
      </Card>

      <div className="space-y-3">
        {loading && (
          <div role="status" aria-live="polite" aria-label="Carregando automações">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="mb-3 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-1/3" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
              </Card>
            ))}
          </div>
        )}
        {!loading && error && (
          <Card
            role="alert"
            aria-live="assertive"
            data-testid="automations-error"
            className="border-destructive/40 bg-destructive/5 p-6"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <div className="flex-1 space-y-2">
                <h2 className="font-semibold text-destructive">
                  Não foi possível carregar as automações
                </h2>
                <p className="text-sm text-muted-foreground">
                  {error.message || 'Ocorreu um erro inesperado ao buscar as regras. Tente novamente em instantes.'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { void reload(); }}
                    disabled={loading}
                    data-testid="automations-retry"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                    Tentar novamente
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowErrorDetails((v) => !v)}
                    data-testid="automations-error-toggle"
                    aria-expanded={showErrorDetails}
                  >
                    {showErrorDetails ? 'Ocultar detalhes' : 'Ver detalhes técnicos'}
                  </Button>
                </div>
                {showErrorDetails && (
                  <pre
                    data-testid="automations-error-details"
                    className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground"
                  >
{JSON.stringify(
  {
    name: error.name,
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 6),
    cause: (error as { cause?: unknown }).cause ?? null,
    timestamp: new Date().toISOString(),
  },
  null,
  2
)}
                  </pre>
                )}
              </div>
            </div>
          </Card>
        )}
        {!loading && !error && filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            Nenhuma regra com esses filtros.
          </Card>
        )}

        {filtered.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium">{r.name}</h3>
                  <Badge variant={r.is_active ? 'default' : 'secondary'}>
                    {r.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                  <Badge variant="outline">{TRIGGER_LABEL[r.trigger_type]}</Badge>
                  <Badge variant="outline" className="text-xs">
                    Prioridade {r.priority}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Clock className="mr-1 h-3 w-3" />
                    cooldown {r.cooldown_seconds}s
                  </Badge>
                  {r.channel_id && channelMap[r.channel_id] && (
                    <Badge variant="outline" className="text-xs">
                      <Radio className="mr-1 h-3 w-3" />
                      {channelMap[r.channel_id]}
                    </Badge>
                  )}
                  {r.department_id && deptMap[r.department_id] && (
                    <Badge variant="outline" className="text-xs">
                      <Building2 className="mr-1 h-3 w-3" />
                      {deptMap[r.department_id]}
                    </Badge>
                  )}
                </div>
                {r.description && (
                  <p className="mb-2 text-sm text-muted-foreground">{r.description}</p>
                )}
                <div className="flex flex-wrap gap-1 text-xs">
                  {r.actions?.suggest_reply && (
                    <Badge variant="secondary">
                      <Sparkles className="mr-1 h-3 w-3" />
                      Sugerir
                    </Badge>
                  )}
                  {r.actions?.auto_send && (
                    <Badge variant="secondary">
                      <Send className="mr-1 h-3 w-3" />
                      Auto-enviar
                    </Badge>
                  )}
                  {Array.isArray(r.actions?.apply_tags) && r.actions.apply_tags.length > 0 && (
                    <Badge variant="secondary">
                      <Tag className="mr-1 h-3 w-3" />
                      {r.actions.apply_tags.join(', ')}
                    </Badge>
                  )}
                  {r.actions?.escalate_sla?.enabled && (
                    <Badge variant="destructive">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      SLA → {r.actions.escalate_sla.level ?? 'high'}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => adjustPriority(r, -10)}
                  aria-label="Subir prioridade"
                >
                  ↑
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => adjustPriority(r, 10)}
                  aria-label="Descer prioridade"
                >
                  ↓
                </Button>
                <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                <Button
                  aria-label="Editar regra"
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit(r)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  aria-label="Remover regra"
                  size="icon"
                  variant="ghost"
                  onClick={() => confirm('Remover esta regra?') && remove(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar regra' : 'Nova regra'}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="auto-name">Nome</Label>
                <Input
                  id="auto-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="auto-description">Descrição</Label>
                <Textarea
                  id="auto-description"
                  rows={2}
                  value={editing.description ?? ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>

              {/* Escopo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="auto-channel">Canal (opcional)</Label>
                  <Select
                    value={editing.channel_id ?? 'none'}
                    onValueChange={(v) =>
                      setEditing({ ...editing, channel_id: v === 'none' ? null : v })
                    }
                  >
                    <SelectTrigger id="auto-channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todos os canais</SelectItem>
                      {channels.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="auto-department">Filial / Departamento (opcional)</Label>
                  <Select
                    value={editing.department_id ?? 'none'}
                    onValueChange={(v) =>
                      setEditing({ ...editing, department_id: v === 'none' ? null : v })
                    }
                  >
                    <SelectTrigger id="auto-department">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todas as filiais</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="auto-trigger">Gatilho</Label>
                  <Select
                    value={editing.trigger_type}
                    onValueChange={(v: TriggerType) =>
                      setEditing({ ...editing, trigger_type: v, trigger_config: {} })
                    }
                  >
                    <SelectTrigger id="auto-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="auto-priority">Prioridade (menor = primeiro)</Label>
                  <Input
                    id="auto-priority"
                    type="number"
                    value={editing.priority}
                    onChange={(e) =>
                      setEditing({ ...editing, priority: Number(e.target.value) || 100 })
                    }
                  />
                </div>
              </div>

              {/* Config por tipo */}
              {(editing.trigger_type === 'first_response_pending' ||
                editing.trigger_type === 'inactivity') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="auto-threshold-seconds">Tempo (segundos)</Label>
                    <Input
                      id="auto-threshold-seconds"
                      type="number"
                      value={editing.trigger_config?.threshold_seconds ?? 60}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          trigger_config: {
                            ...editing.trigger_config,
                            threshold_seconds: Number(e.target.value) || 60,
                          },
                        })
                      }
                    />
                  </div>
                  {editing.trigger_type === 'inactivity' && (
                    <div>
                      <Label htmlFor="auto-inactivity-side">De quem?</Label>
                      <Select
                        value={((editing as any).trigger_config?.side as string) ?? 'any'}
                        onValueChange={(v) =>
                          setEditing({
                            ...editing,
                            trigger_config: { ...editing.trigger_config, side: v },
                          })
                        }
                      >
                        <SelectTrigger id="auto-inactivity-side">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Qualquer lado</SelectItem>
                          <SelectItem value="client">Cliente parou</SelectItem>
                          <SelectItem value="agent">Agente parou</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {editing.trigger_type === 'keyword_match' && (
                <div>
                  <Label htmlFor="auto-keywords">Palavras-chave (separadas por vírgula)</Label>
                  <Input
                    id="auto-keywords"
                    value={(editing.trigger_config?.keywords ?? []).join(', ')}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        trigger_config: {
                          ...editing.trigger_config,
                          keywords: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    placeholder="orçamento, cancelar, reembolso"
                  />
                </div>
              )}

              {(editing.trigger_type === 'tag_applied' ||
                editing.trigger_type === 'tag_removed') && (
                <div>
                  <Label htmlFor="auto-trigger-tags">
                    Etiquetas alvo (separadas por vírgula — vazio = qualquer)
                  </Label>
                  <Input
                    id="auto-trigger-tags"
                    value={
                      Array.isArray((editing as any).trigger_config?.tags)
                        ? ((editing as any).trigger_config.tags as string[]).join(', ')
                        : (((editing as any).trigger_config?.tag ?? '') as string)
                    }
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        trigger_config: {
                          ...editing.trigger_config,
                          tags: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    placeholder="vip, urgente"
                  />
                </div>
              )}

              {/* Ações */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-medium">Ações</h4>

                <div className="flex items-center justify-between">
                  <Label htmlFor="action-suggest-reply">Sugerir resposta (rascunho com IA)</Label>
                  <Switch
                    id="action-suggest-reply"
                    checked={!!editing.actions.suggest_reply}
                    onCheckedChange={(v) =>
                      setEditing({ ...editing, actions: { ...editing.actions, suggest_reply: v } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="action-auto-send">Enviar resposta automaticamente</Label>
                  <Switch
                    id="action-auto-send"
                    checked={!!editing.actions.auto_send}
                    onCheckedChange={(v) =>
                      setEditing({ ...editing, actions: { ...editing.actions, auto_send: v } })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="action-apply-tags">Tags a aplicar (separadas por vírgula)</Label>
                  <Input
                    id="action-apply-tags"
                    value={(editing.actions.apply_tags ?? []).join(', ')}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        actions: {
                          ...editing.actions,
                          apply_tags: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                </div>

                {/* Escalonar SLA */}
                <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="action-escalate-sla" className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Escalar SLA
                    </Label>
                    <Switch
                      id="action-escalate-sla"
                      checked={!!editing.actions.escalate_sla?.enabled}
                      onCheckedChange={(v) =>
                        setEditing({
                          ...editing,
                          actions: {
                            ...editing.actions,
                            escalate_sla: {
                              ...normalizeEscalateSla(editing.actions.escalate_sla),
                              enabled: v,
                            } as any,
                          },
                        })
                      }
                    />
                  </div>
                  {editing.actions.escalate_sla?.enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs" htmlFor="escalate-level">
                          Novo nível
                        </Label>
                        <Select
                          value={editing.actions.escalate_sla?.level ?? 'high'}
                          onValueChange={(v) =>
                            setEditing({
                              ...editing,
                              actions: {
                                ...editing.actions,
                                escalate_sla: {
                                  ...normalizeEscalateSla(editing.actions.escalate_sla),
                                  level: v,
                                } as any,
                              },
                            })
                          }
                        >
                          <SelectTrigger id="escalate-level">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SLA_LEVELS.map((l) => (
                              <SelectItem key={l.value} value={l.value}>
                                {l.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs" htmlFor="escalate-reason">
                          Motivo (opcional)
                        </Label>
                        <Input
                          id="escalate-reason"
                          value={editing.actions.escalate_sla?.reason ?? ''}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              actions: {
                                ...editing.actions,
                                escalate_sla: {
                                  ...editing.actions.escalate_sla,
                                  reason: e.target.value,
                                } as any,
                              },
                            })
                          }
                          placeholder="Sem resposta há > 1h"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="action-template">Template fixo (opcional — pula IA)</Label>
                  <Textarea
                    id="action-template"
                    rows={2}
                    value={editing.actions.template ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        actions: { ...editing.actions, template: e.target.value },
                      })
                    }
                    placeholder="Olá! Recebemos sua mensagem e vamos responder em breve."
                  />
                </div>

                <div>
                  <Label htmlFor="action-ai-prompt">Instrução adicional para a IA (opcional)</Label>
                  <Textarea
                    id="action-ai-prompt"
                    rows={2}
                    value={editing.actions.ai_prompt ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        actions: { ...editing.actions, ai_prompt: e.target.value },
                      })
                    }
                    placeholder="Ex: Sempre confirmar prazo de 24h e oferecer o catálogo."
                  />
                </div>

                <div>
                  <Label>Cooldown (segundos)</Label>
                  <Input
                    type="number"
                    value={editing.cooldown_seconds}
                    onChange={(e) =>
                      setEditing({ ...editing, cooldown_seconds: Number(e.target.value) || 300 })
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tempo mínimo entre disparos da mesma regra na mesma conversa.
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}