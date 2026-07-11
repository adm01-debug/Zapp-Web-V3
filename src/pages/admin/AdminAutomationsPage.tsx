import { useMemo, useState } from 'react';
import {
  useAdminAutomations,
  TRIGGER_LABEL,
  EMPTY_RULE,
  type Rule,
  type TriggerType,
} from '@/hooks/admin/useAdminAutomations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Tag,
  Send,
  Clock,
  AlertTriangle,
  Building2,
  Radio,
} from 'lucide-react';

const SLA_LEVELS = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

export default function AdminAutomationsPage() {
  const {
    rules,
    channels,
    departments,
    loading,
    save: hookSave,
    remove,
    toggleActive,
    adjustPriority,
    channelMap,
    deptMap,
  } = useAdminAutomations();

  const [editing, setEditing] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);

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
      escalate_sla: {
        ...EMPTY_RULE.actions.escalate_sla,
        ...(cloned.actions?.escalate_sla ?? {}),
      },
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
          <Label className="text-xs">Canal</Label>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger>
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
          <Label className="text-xs">Filial / Departamento</Label>
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger>
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
          <Label className="text-xs">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
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
        {loading && <p className="text-muted-foreground">Carregando…</p>}
        {!loading && filtered.length === 0 && (
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
                  title="Subir"
                >
                  ↑
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => adjustPriority(r, 10)}
                  title="Descer"
                >
                  ↓
                </Button>
                <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                <Button aria-label="Editar regra" size="icon" variant="ghost" onClick={() => startEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button aria-label="Remover regra" size="icon" variant="ghost" onClick={() => (confirm("Remover esta regra?") && remove(r.id))}>
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
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  rows={2}
                  value={editing.description ?? ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>

              {/* Escopo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Canal (opcional)</Label>
                  <Select
                    value={editing.channel_id ?? 'none'}
                    onValueChange={(v) =>
                      setEditing({ ...editing, channel_id: v === 'none' ? null : v })
                    }
                  >
                    <SelectTrigger>
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
                  <Label>Filial / Departamento (opcional)</Label>
                  <Select
                    value={editing.department_id ?? 'none'}
                    onValueChange={(v) =>
                      setEditing({ ...editing, department_id: v === 'none' ? null : v })
                    }
                  >
                    <SelectTrigger>
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
                  <Label>Gatilho</Label>
                  <Select
                    value={editing.trigger_type}
                    onValueChange={(v: TriggerType) =>
                      setEditing({ ...editing, trigger_type: v, trigger_config: {} })
                    }
                  >
                    <SelectTrigger>
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
                  <Label>Prioridade (menor = primeiro)</Label>
                  <Input
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
                    <Label>Tempo (segundos)</Label>
                    <Input
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
                      <Label>De quem?</Label>
                      <Select
                        value={editing.trigger_config?.side ?? 'any'}
                        onValueChange={(v) =>
                          setEditing({
                            ...editing,
                            trigger_config: { ...editing.trigger_config, side: v },
                          })
                        }
                      >
                        <SelectTrigger>
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
                  <Label>Palavras-chave (separadas por vírgula)</Label>
                  <Input
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
                  <Label>Etiquetas alvo (separadas por vírgula — vazio = qualquer)</Label>
                  <Input
                    value={
                      Array.isArray(editing.trigger_config?.tags)
                        ? editing.trigger_config.tags.join(', ')
                        : (editing.trigger_config?.tag ?? '')
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
                  <Label>Sugerir resposta (rascunho com IA)</Label>
                  <Switch
                    checked={!!editing.actions.suggest_reply}
                    onCheckedChange={(v) =>
                      setEditing({ ...editing, actions: { ...editing.actions, suggest_reply: v } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Enviar resposta automaticamente</Label>
                  <Switch
                    checked={!!editing.actions.auto_send}
                    onCheckedChange={(v) =>
                      setEditing({ ...editing, actions: { ...editing.actions, auto_send: v } })
                    }
                  />
                </div>

                <div>
                  <Label>Tags a aplicar (separadas por vírgula)</Label>
                  <Input
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
                    <Label className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Escalar SLA
                    </Label>
                    <Switch
                      checked={!!editing.actions.escalate_sla?.enabled}
                      onCheckedChange={(v) =>
                        setEditing({
                          ...editing,
                          actions: {
                            ...editing.actions,
                            escalate_sla: {
                              ...(editing.actions.escalate_sla ?? {}),
                              enabled: v,
                            },
                          },
                        })
                      }
                    />
                  </div>
                  {editing.actions.escalate_sla?.enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Novo nível</Label>
                        <Select
                          value={editing.actions.escalate_sla?.level ?? 'high'}
                          onValueChange={(v) =>
                            setEditing({
                              ...editing,
                              actions: {
                                ...editing.actions,
                                escalate_sla: {
                                  ...editing.actions.escalate_sla,
                                  level: v,
                                },
                              },
                            })
                          }
                        >
                          <SelectTrigger>
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
                        <Label className="text-xs">Motivo (opcional)</Label>
                        <Input
                          value={editing.actions.escalate_sla?.reason ?? ''}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              actions: {
                                ...editing.actions,
                                escalate_sla: {
                                  ...editing.actions.escalate_sla,
                                  reason: e.target.value,
                                },
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
                  <Label>Template fixo (opcional — pula IA)</Label>
                  <Textarea
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
                  <Label>Instrução adicional para a IA (opcional)</Label>
                  <Textarea
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
