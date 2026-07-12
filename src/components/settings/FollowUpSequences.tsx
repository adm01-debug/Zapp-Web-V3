import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Clock, ArrowRight, Zap, MessageSquare } from 'lucide-react';
import { FollowUpExecutionsHistory } from './FollowUpExecutionsHistory';
import { useFollowUpSequences, type Step } from '@/hooks/followup/useFollowUpSequences';

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
  const { sequences, isLoading, createMutation, toggleMutation, deleteMutation } =
    useFollowUpSequences();

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
      ) : sequences.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Zap className="mx-auto mb-2 h-10 w-10 opacity-30" />
          <p>Nenhuma sequência criada ainda.</p>
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

      {/* Execution History */}
      <FollowUpExecutionsHistory />
    </div>
  );
}
