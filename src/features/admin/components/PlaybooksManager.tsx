import { queryKeys } from '@/services/api/queryKeys';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { BookOpen, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/schema';

interface PlaybookStep {
  order: number;
  title: string;
  description: string;
  tips: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string | null;
  category: string;
  steps: PlaybookStep[];
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: 'sales', label: 'Vendas' },
  { value: 'support', label: 'Suporte' },
  { value: 'billing', label: 'Financeiro' },
  { value: 'complaint', label: 'Reclamação' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'general', label: 'Geral' },
];

/** Playbooks Manager component. */
export function PlaybooksManager(): JSX.Element {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [viewPlaybook, setViewPlaybook] = useState<Playbook | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [steps, setSteps] = useState<PlaybookStep[]>([]);

  const { data: playbooks = [], isLoading: loading } = useQuery<Playbook[]>({
    queryKey: queryKeys.adminOps.playbooks(),
    queryFn: async () => {
      const { data } = await supabase
        .from('playbooks')
        .select('*')
        .order('category', { ascending: true });
      return (data || []).map((p) => ({
        ...p,
        steps: Array.isArray(p.steps) ? (p.steps as unknown as PlaybookStep[]) : [],
      }));
    },
  });

  const openCreate = (): void => {
    setSelectedPlaybook(null);
    setName('');
    setDescription('');
    setCategory('general');
    setSteps([{ order: 1, title: '', description: '', tips: '' }]);
    setDialogOpen(true);
  };

  const openEdit = (pb: Playbook): void => {
    setSelectedPlaybook(pb);
    setName(pb.name);
    setDescription(pb.description || '');
    setCategory(pb.category);
    setSteps(pb.steps.length > 0 ? pb.steps : [{ order: 1, title: '', description: '', tips: '' }]);
    setDialogOpen(true);
  };

  const addStep = (): void => {
    setSteps((prev) => [...prev, { order: prev.length + 1, title: '', description: '', tips: '' }]);
  };

  const updateStep = (index: number, field: keyof PlaybookStep, value: string): void => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const removeStep = (index: number): void => {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const save = async (): Promise<void> => {
    if (!name.trim()) {
      toast.error('Nome obrigatório');
      return;
    }
    const payload = {
      name: name.trim(),
      description: description || null,
      category,
      steps: steps.filter((s) => s.title.trim()) as Json,
    };

    const { error } = selectedPlaybook
      ? await supabase.from('playbooks').update(payload).eq('id', selectedPlaybook.id)
      : await supabase.from('playbooks').insert(payload);

    if (!error) {
      toast.success(selectedPlaybook ? 'Playbook atualizado' : 'Playbook criado');
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.playbooks() });
    } else {
      toast.error('Erro ao salvar');
    }
  };

  const deletePlaybook = async (id: string): Promise<void> => {
    await supabase.from('playbooks').delete().eq('id', id);
    toast.success('Playbook removido');
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.playbooks() });
  };

  const grouped = playbooks.reduce<Record<string, Playbook[]>>((acc, pb) => {
    (acc[pb.category] = acc[pb.category] || []).push(pb);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-5 w-5 text-primary" />
            Playbooks Operacionais
          </h2>
          <p className="text-sm text-muted-foreground">
            Guias passo-a-passo por tipo de atendimento
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Playbook
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/20" />
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum playbook criado
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([cat, pbs]) => (
          <div key={cat} className="space-y-2">
            <Badge variant="outline" className="text-xs">
              {CATEGORIES.find((c) => c.value === cat)?.label || cat}
            </Badge>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pbs.map((pb) => (
                <Card
                  key={pb.id}
                  className="group cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => setViewPlaybook(pb)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium">{pb.name}</h3>
                        {pb.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {pb.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {pb.steps.length} passos
                          </Badge>
                        </div>
                      </div>
                      <div
                        className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(pb)}
                          aria-label="Editar playbook"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => deletePlaybook(pb.id)}
                          aria-label="Excluir playbook"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* View Playbook Dialog */}
      <Dialog open={!!viewPlaybook} onOpenChange={() => setViewPlaybook(null)}>
        <DialogContent className="sm:max-w-lg">
          {viewPlaybook && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  {viewPlaybook.name}
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                {viewPlaybook.description && (
                  <p className="text-sm text-muted-foreground">{viewPlaybook.description}</p>
                )}
                {viewPlaybook.steps.map((step) => (
                  <div key={step.order} className="flex gap-3 rounded-lg bg-muted/20 p-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {step.order}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{step.title}</p>
                      {step.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                      )}
                      {step.tips && (
                        <div className="mt-1.5 rounded border border-primary/10 bg-primary/5 p-2">
                          <p className="text-[10px] text-primary">💡 {step.tips}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedPlaybook ? 'Editar Playbook' : 'Novo Playbook'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do playbook"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição"
              rows={2}
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-3">
              <p className="text-sm font-medium">Passos</p>
              {steps.map((step, idx) => (
                <div
                  key={step.order}
                  className="space-y-2 rounded-lg border border-border/30 bg-muted/10 p-3"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      Passo {idx + 1}
                    </Badge>
                    {steps.length > 1 && (
                      <Button
                        aria-label="Remover passo do playbook"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeStep(idx)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={step.title}
                    onChange={(e) => updateStep(idx, 'title', e.target.value)}
                    placeholder="Título do passo"
                    className="h-8 text-sm"
                  />
                  <Textarea
                    value={step.description}
                    onChange={(e) => updateStep(idx, 'description', e.target.value)}
                    placeholder="Descrição"
                    rows={2}
                    className="text-sm"
                  />
                  <Input
                    value={step.tips}
                    onChange={(e) => updateStep(idx, 'tips', e.target.value)}
                    placeholder="Dica/tip (opcional)"
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addStep} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar passo
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}