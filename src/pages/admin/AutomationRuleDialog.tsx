import { Button } from '@/components/ui/button';
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
import { AlertTriangle } from 'lucide-react';
import { TRIGGER_LABEL, type Rule, type TriggerType } from '@/hooks/admin/useAdminAutomations';

const SLA_LEVELS = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

interface Channel {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Rule | null;
  setEditing: (r: Rule) => void;
  onSave: () => Promise<void>;
  channels: Channel[];
  departments: Department[];
}

export function AutomationRuleDialog({
  open,
  onOpenChange,
  editing,
  setEditing,
  onSave,
  channels,
  departments,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

            {/* Config por tipo de gatilho */}
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
                      value={editing.trigger_config?.side ?? 'any'}
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

            {(editing.trigger_type === 'tag_applied' || editing.trigger_type === 'tag_removed') && (
              <div>
                <Label htmlFor="auto-trigger-tags">
                  Etiquetas alvo (separadas por vírgula — vazio = qualquer)
                </Label>
                <Input
                  id="auto-trigger-tags"
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
                                ...editing.actions.escalate_sla,
                                level: v,
                              },
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
