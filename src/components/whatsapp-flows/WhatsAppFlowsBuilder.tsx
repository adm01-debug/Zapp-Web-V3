import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Workflow,
  Trash2,
  Edit,
  Eye,
  Type,
  ListChecks,
  CalendarDays,
  ToggleLeft,
  ChevronDown,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlowComponentPreview } from './FlowComponentPreview';
import type { FlowComponent } from './FlowComponentPreview';

interface FlowScreen {
  id: string;
  title: string;
  layout: FlowComponent[];
}

interface WhatsAppFlow {
  id: string;
  name: string;
  description: string | null;
  flow_json: Json;
  screens: FlowScreen[];
  status: string;
  whatsapp_flow_id: string | null;
  created_at: string;
}

const COMPONENT_TYPES = [
  { type: 'TextHeading', label: 'Título', icon: Type },
  { type: 'TextBody', label: 'Texto', icon: Type },
  { type: 'TextInput', label: 'Campo de Texto', icon: Type },
  { type: 'TextArea', label: 'Área de Texto', icon: Type },
  { type: 'DatePicker', label: 'Data', icon: CalendarDays },
  { type: 'RadioButtonsGroup', label: 'Escolha Única', icon: ToggleLeft },
  { type: 'CheckboxGroup', label: 'Múltipla Escolha', icon: ListChecks },
  { type: 'Dropdown', label: 'Dropdown', icon: ChevronDown },
  { type: 'Footer', label: 'Botão de Ação', icon: Send },
] as const;

export function WhatsAppFlowsBuilder() {
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<WhatsAppFlow | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingScreen, setEditingScreen] = useState<number>(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_flows')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) {
      setFlows(
        data.map((f) => ({
          ...f,
          screens: (Array.isArray(f.screens) ? f.screens : []) as unknown as FlowScreen[],
        })) as WhatsAppFlow[]
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const createFlow = async () => {
    if (!formName.trim()) return;
    const defaultScreens: FlowScreen[] = [
      {
        id: crypto.randomUUID(),
        title: 'Tela 1',
        layout: [
          { id: crypto.randomUUID(), type: 'TextHeading', text: 'Bem-vindo' },
          { id: crypto.randomUUID(), type: 'TextBody', text: 'Preencha o formulário abaixo.' },
          { id: crypto.randomUUID(), type: 'Footer', label: 'Continuar' },
        ],
      },
    ];
    const { error: insertError } = await supabase.from('whatsapp_flows').insert({
      name: formName,
      description: formDescription || null,
      screens: defaultScreens as unknown as Json,
    });
    if (insertError) {
      toast({ title: 'Erro', description: insertError.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Flow criado!' });
    setShowCreateDialog(false);
    setFormName('');
    setFormDescription('');
    fetchFlows();
  };

  const deleteFlow = async (id: string) => {
    await supabase.from('whatsapp_flows').delete().eq('id', id);
    if (selectedFlow?.id === id) setSelectedFlow(null);
    toast({ title: 'Flow removido' });
    fetchFlows();
  };

  const updateFlowScreens = async (screens: FlowScreen[]) => {
    if (!selectedFlow) return;
    setSelectedFlow({ ...selectedFlow, screens });
    await supabase
      .from('whatsapp_flows')
      .update({ screens: screens as unknown as Json })
      .eq('id', selectedFlow.id);
  };

  const addScreen = () => {
    if (!selectedFlow) return;
    updateFlowScreens([
      ...selectedFlow.screens,
      {
        id: crypto.randomUUID(),
        title: `Tela ${selectedFlow.screens.length + 1}`,
        layout: [
          { id: crypto.randomUUID(), type: 'TextHeading' as const, text: 'Nova Tela' },
          { id: crypto.randomUUID(), type: 'Footer' as const, label: 'Continuar' },
        ],
      },
    ]);
  };

  const addComponent = (type: string) => {
    if (!selectedFlow) return;
    const screens = [...selectedFlow.screens];
    const newComp: FlowComponent = {
      id: crypto.randomUUID(),
      type: type as FlowComponent['type'],
      label: type === 'Footer' ? 'Enviar' : undefined,
      name: [
        'TextInput',
        'TextArea',
        'DatePicker',
        'RadioButtonsGroup',
        'CheckboxGroup',
        'Dropdown',
      ].includes(type)
        ? `field_${Date.now()}`
        : undefined,
      text: ['TextHeading', 'TextSubheading', 'TextBody'].includes(type) ? 'Texto aqui' : undefined,
      options: ['RadioButtonsGroup', 'CheckboxGroup', 'Dropdown'].includes(type)
        ? [
            { id: '1', title: 'Opção 1' },
            { id: '2', title: 'Opção 2' },
          ]
        : undefined,
    };
    const footerIdx = screens[editingScreen].layout.findIndex((c) => c.type === 'Footer');
    if (footerIdx >= 0) screens[editingScreen].layout.splice(footerIdx, 0, newComp);
    else screens[editingScreen].layout.push(newComp);
    updateFlowScreens(screens);
  };

  const removeComponent = (compIdx: number) => {
    if (!selectedFlow) return;
    const screens = [...selectedFlow.screens];
    screens[editingScreen].layout.splice(compIdx, 1);
    updateFlowScreens(screens);
  };

  if (!selectedFlow) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader
          title="WhatsApp Flows"
          subtitle="Crie formulários e fluxos interativos nativos do WhatsApp"
          actions={
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Flow
            </Button>
          }
        />
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {flows.map((flow) => (
              <motion.div
                key={flow.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card
                  className="group cursor-pointer border-border/30 bg-card/50 transition-all hover:border-secondary/30"
                  onClick={() => {
                    setSelectedFlow(flow);
                    setEditingScreen(0);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                        <Workflow className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFlow(flow.id);
                          }}
                          aria-label="Excluir flow"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <h3 className="mb-1 text-sm font-semibold">{flow.name}</h3>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {flow.description || 'Sem descrição'}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {flow.screens.length} telas
                      </Badge>
                      <Badge
                        variant={flow.status === 'published' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {flow.status === 'published' ? 'Publicado' : 'Rascunho'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
          {flows.length === 0 && !loading && (
            <div className="py-16 text-center text-muted-foreground">
              <Workflow className="mx-auto mb-3 h-12 w-12 opacity-20" />
              <p className="font-medium">Nenhum WhatsApp Flow</p>
              <p className="text-sm">Crie formulários nativos para coletar dados no WhatsApp</p>
            </div>
          )}
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo WhatsApp Flow</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Cadastro de Lead"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={createFlow}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const currentScreen = selectedFlow.screens[editingScreen];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={selectedFlow.name}
        subtitle="Editor de WhatsApp Flow"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelectedFlow(null)}>
              ← Voltar
            </Button>
            <Button
              variant="outline"
              onClick={() => setPreviewMode(!previewMode)}
              className="gap-2"
            >
              {previewMode ? <Edit className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {previewMode ? 'Editar' : 'Preview'}
            </Button>
            <Button onClick={addScreen} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Tela
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 gap-4 overflow-hidden px-6 pb-6">
        <div className="w-48 flex-shrink-0 space-y-2 overflow-y-auto">
          {selectedFlow.screens.map((screen, idx) => (
            <button
              key={screen.id}
              onClick={() => setEditingScreen(idx)}
              className={cn(
                'w-full rounded-lg border p-3 text-left text-sm transition-all',
                idx === editingScreen
                  ? 'border-secondary bg-secondary/10 text-secondary'
                  : 'border-border/30 bg-card/30 text-muted-foreground hover:border-border'
              )}
            >
              <div className="font-medium">{screen.title}</div>
              <div className="mt-0.5 text-[10px]">{screen.layout.length} componentes</div>
            </button>
          ))}
        </div>
        <div className="flex flex-1 gap-4">
          {!previewMode && (
            <div className="w-52 flex-shrink-0 space-y-1 overflow-y-auto">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Componentes
              </p>
              {COMPONENT_TYPES.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  onClick={() => addComponent(type)}
                  className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-1 items-start justify-center">
            <div className="w-[320px] rounded-[2rem] border border-border/30 bg-card p-2 shadow-xl">
              <div className="overflow-hidden rounded-[1.5rem] bg-background">
                <div className="flex h-8 items-center justify-center bg-primary/10">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {currentScreen?.title}
                  </span>
                </div>
                <div className="min-h-[400px] space-y-3 p-4">
                  {currentScreen?.layout.map((comp, idx) => (
                    <FlowComponentPreview
                      key={comp.id}
                      comp={comp}
                      preview={previewMode}
                      onRemove={() => removeComponent(idx)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
