import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, Clock, ArrowRight, Zap, MessageSquare, Info, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { FollowUpPendingPanel } from './FollowUpPendingPanel';
import { FollowUpExecutionsHistory } from './FollowUpExecutionsHistory';
import { useFollowUpSequences, type Step, type FollowUpSequence } from '@/hooks/followup/useFollowUpSequences';
import { useFollowupBridge } from '@/hooks/useFollowupBridge';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

/** Follow Up Sequences component for the settings section. */
export function FollowUpSequences() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSteps, setNewSteps] = useState<Step[]>([
    {
      step_order: 1,
      delay_hours: 24,
      message_template:
        'Olá {name}! Gostaria de saber se sua dúvida foi resolvida. Posso ajudar em algo mais?',
      is_active: true,
    },
    {
      step_order: 2,
      delay_hours: 168,
      message_template:
        'Olá {name}! Passando para verificar se está tudo bem. Avalie nosso atendimento de 1 a 5 ⭐',
      is_active: true,
    },
  ]);
  const { sequences, isLoading, queryError, createMutation, toggleMutation, deleteMutation } =
    useFollowUpSequences();

  // ── Disparo manual via edge followup-bridge (G8: religa o hook órfão) ──────
  const { mutation: bridgeMutation } = useFollowupBridge();
  const [triggerFor, setTriggerFor] = useState<FollowUpSequence | null>(null);
  const [triggerPhone, setTriggerPhone] = useState('');
  const [triggerInstance, setTriggerInstance] = useState<string>(DEFAULT_WHATSAPP_INSTANCE);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const openTriggerDialog = (seq: FollowUpSequence) => {
    setTriggerFor(seq);
    setTriggerPhone('');
    setTriggerInstance(DEFAULT_WHATSAPP_INSTANCE);
    setTriggerError(null);
  };

  const confirmTrigger = () => {
    if (!triggerFor) return;
    const digits = triggerPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setTriggerError('Informe o número com DDD (mín. 10 dígitos), ex: 5511999999999');
      return;
    }
    setTriggerError(null);
    bridgeMutation.mutate(
      {
        sequence_id: triggerFor.id,
        contact_jid: `${digits}@s.whatsapp.net`,
        instance_name: triggerInstance.trim() || DEFAULT_WHATSAPP_INSTANCE,
        trigger_event: 'manual_ui',
      },
      {
        onSuccess: () => {
          setTriggerFor(null);
          setTriggerPhone('');
        },
      }
    );
  };

  const addStep = () => {
    setNewSteps((prev) => [
      ...prev,
      {
        step_order: prev.length + 1,
        delay_hours: 48,
        message_template: '',
        is_active: true,
      },
    ]);
  };

  const updateStep = (index: number, field: keyof Step, value: string | number | boolean) => {
    setNewSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const removeStep = (index: number) => {
    setNewSteps((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 }))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Zap className="h-5 w-5 text-primary" />
            Follow-up Automático
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sequências automáticas pós-atendimento para engajamento contínuo.
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Sequência
        </Button>
      </div>

      {/* Aviso de integração com o motor real (WHATSAPP-10) */}
      <Alert className="border-info/30 bg-info/5">
        <Info className="h-4 w-4" />
        <AlertTitle>Integrado ao motor Evolution</AlertTitle>
        <AlertDescription className="space-y-1 text-sm">
          <p>
            As sequências abaixo são gravadas em <code>evolution_followup_rules</code> — a mesma
            tabela lida pelo motor de follow-up em produção (edge <code>evolution-followup</code>{' '}
            via cron). O que você gerencia aqui é o que o motor executa.
          </p>
          <p className="text-xs text-muted-foreground">
            A mensagem de cada passo é salva como texto em <code>description</code>. O trigger de
            produção renderiza mensagens via <code>template_id</code> (template aprovado); sem
            seletor de template na UI, valide um disparo real antes de depender da feature.
          </p>
        </AlertDescription>
      </Alert>

      {/* Create Form */}
      {showCreate && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Nova Sequência de Follow-up</CardTitle>
            <CardDescription>
              Defina os passos e tempos de cada mensagem automática.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Sequência</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Pós-Atendimento Padrão"
              />
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Passos ({newSteps.length})
              </Label>

              {newSteps.map((step, i) => (
                <div
                  key={step.step_order}
                  className="relative space-y-3 rounded-lg border bg-muted/30 p-4"
                >
                  {i > 0 && (
                    <div className="absolute -top-3 left-6 flex items-center gap-1 bg-background px-2 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3" />
                      após {step.delay_hours}h
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">Passo {step.step_order}</Badge>
                    {newSteps.length > 1 && (
                      <Button
                        aria-label="Remover passo"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeStep(i)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" /> Atraso (horas)
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={step.delay_hours}
                        onChange={(e) => updateStep(i, 'delay_hours', Number(e.target.value))}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <Textarea
                    value={step.message_template}
                    onChange={(e) => updateStep(i, 'message_template', e.target.value)}
                    placeholder="Mensagem... Use {name} para nome do contato"
                    rows={2}
                  />
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addStep} className="w-full gap-2">
                <Plus className="h-3 w-3" /> Adicionar Passo
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() =>
                  createMutation.mutate(
                    { name: newName, steps: newSteps },
                    {
                      onSuccess: () => {
                        setShowCreate(false);
                        setNewName('');
                      },
                    }
                  )
                }
                disabled={!newName.trim() || createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Sequência'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Sequences */}
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Carregando...</div>
      ) : queryError ? (
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto mb-2 h-10 w-10 text-destructive opacity-60" />
          <p className="font-medium">Não foi possível carregar as regras de follow-up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {queryError instanceof Error ? queryError.message : 'Erro desconhecido'}
          </p>
        </Card>
      ) : sequences.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Zap className="mx-auto mb-2 h-10 w-10 opacity-30" />
          <p>Nenhuma regra de follow-up cadastrada.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => (
            <Card key={seq.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={seq.is_active}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: seq.id, isActive: checked })
                      }
                    />
                    <div>
                      <p className="font-medium">{seq.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {seq.followup_steps?.length || 0} passos • Trigger: {seq.trigger_event}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={seq.is_active ? 'default' : 'secondary'}>
                      {seq.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Button
                      aria-label={`Disparar sequência ${seq.name} manualmente`}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8"
                      disabled={!seq.is_active}
                      title={
                        seq.is_active
                          ? 'Disparar os passos da sequência agora via edge followup-bridge'
                          : 'Ative a sequência para disparar'
                      }
                      onClick={() => openTriggerDialog(seq)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Disparar
                    </Button>
                    <Button
                      aria-label="Excluir sequência"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteMutation.mutate(seq.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Steps preview */}
                {seq.followup_steps && seq.followup_steps.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {seq.followup_steps
                      .sort((a, b) => a.step_order - b.step_order)
                      .map((step, i: number) => (
                        <div key={step.id} className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {step.delay_hours}h
                          </Badge>
                          {i < seq.followup_steps.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pending Follow-ups (G8) */}
      <FollowUpPendingPanel />

      {/* Execution History */}
      <FollowUpExecutionsHistory />

      {/* Manual trigger dialog — edge followup-bridge (G8) */}
      <Dialog open={triggerFor !== null} onOpenChange={(open) => !open && setTriggerFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Disparar "{triggerFor?.name ?? ''}"
            </DialogTitle>
            <DialogDescription>
              Agenda os passos da sequência para um contato agora (via edge{' '}
              <code>followup-bridge</code>). Útil para testar o motor com um
              disparo manual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="trigger-phone">Número WhatsApp (com DDI)</Label>
              <Input
                id="trigger-phone"
                inputMode="numeric"
                placeholder="5511999999999"
                value={triggerPhone}
                onChange={(e) => {
                  setTriggerPhone(e.target.value);
                  setTriggerError(null);
                }}
              />
              {triggerError && (
                <p className="text-xs text-destructive">{triggerError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="trigger-instance">Instância</Label>
              <Input
                id="trigger-instance"
                placeholder={DEFAULT_WHATSAPP_INSTANCE}
                value={triggerInstance}
                onChange={(e) => setTriggerInstance(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTriggerFor(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmTrigger}
              disabled={bridgeMutation.isPending}
              className="gap-2"
            >
              {bridgeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {bridgeMutation.isPending ? 'Disparando...' : 'Disparar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
