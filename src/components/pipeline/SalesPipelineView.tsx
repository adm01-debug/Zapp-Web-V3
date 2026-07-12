import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealCard } from './DealCard';
import { PipelineKPICards } from './PipelineKPICards';
import { useSalesPipeline } from '@/hooks/pipeline/useSalesPipeline';

export function SalesPipelineView() {
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const {
    stages, deals, loading, contacts, agents,
    showDealDialog, setShowDealDialog, editingDeal,
    formTitle, setFormTitle, formValue, setFormValue, formStageId, setFormStageId,
    formContactId, setFormContactId, formAssignedTo, setFormAssignedTo,
    formPriority, setFormPriority, formCloseDate, setFormCloseDate, formNotes, setFormNotes,
    openNewDeal, openEditDeal, saveDeal, moveDeal, deleteDeal, markAsWon, markAsLost,
  } = useSalesPipeline();

  const getStageDeals = (stageId: string) => deals.filter(d => d.stage_id === stageId && d.status === 'open');
  const getStageTotal = (stageId: string) => getStageDeals(stageId).reduce((sum, d) => sum + (d.value || 0), 0);
  const totalPipeline = deals.filter(d => d.status === 'open').reduce((sum, d) => sum + (d.value || 0), 0);
  const wonDeals = deals.filter(d => d.status === 'won');
  const totalWon = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-muted-foreground">Carregando pipeline...</div></div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Pipeline de Vendas" subtitle="Gerencie suas oportunidades de negócio" actions={<Button onClick={() => openNewDeal()} className="gap-2"><Plus className="w-4 h-4" /> Novo Deal</Button>} />
      <PipelineKPICards totalPipeline={totalPipeline} activeDeals={deals.filter(d => d.status === 'open').length} totalWon={totalWon} conversionRate={deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0} />

      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {stages.map((stage) => {
            const stageDeals = getStageDeals(stage.id);
            const isOver = dragOverStage === stage.id;
            return (
              <div key={stage.id} className={cn("flex flex-col w-72 min-w-[288px] rounded-xl border transition-all duration-200", isOver ? "border-secondary bg-secondary/5 shadow-lg shadow-secondary/10" : "border-border/30 bg-card/30")}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }} onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => { e.preventDefault(); if (draggedDeal) moveDeal(draggedDeal, stage.id); setDraggedDeal(null); setDragOverStage(null); }}>
                <div className="p-3 border-b border-border/20">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="font-semibold text-sm text-foreground">{stage.name}</span>
                      <Badge variant="secondary" className="text-xs h-5">{stageDeals.length}</Badge>
                    </div>
                    <Button aria-label="Adicionar deal" variant="ghost" size="icon" className="h-6 w-6" onClick={() => openNewDeal(stage.id)}><Plus className="w-3.5 h-3.5" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">R$ {getStageTotal(stage.id).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin">
                  <AnimatePresence>
                    {stageDeals.map((deal) => (
                      <DealCard key={deal.id} deal={deal} isDragging={draggedDeal === deal.id}
                        onDragStart={() => setDraggedDeal(deal.id)} onDragEnd={() => { setDraggedDeal(null); setDragOverStage(null); }}
                        onEdit={openEditDeal} onMarkWon={markAsWon} onMarkLost={markAsLost} onDelete={deleteDeal} />
                    ))}
                  </AnimatePresence>
                  {stageDeals.length === 0 && <div className="text-center py-8 text-muted-foreground/50 text-xs">Arraste deals aqui</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={showDealDialog} onOpenChange={setShowDealDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingDeal ? 'Editar Deal' : 'Novo Deal'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Nome do deal" /></div>
            <div><Label>Valor (R$)</Label><Input type="number" value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="0,00" /></div>
            <div><Label>Etapa</Label><Select value={formStageId} onValueChange={setFormStageId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Contato</Label><Select value={formContactId} onValueChange={setFormContactId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Responsável</Label><Select value={formAssignedTo} onValueChange={setFormAssignedTo}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Prioridade</Label><Select value={formPriority} onValueChange={setFormPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="high">Alta</SelectItem></SelectContent></Select></div>
            <div><Label>Data prevista</Label><Input type="date" value={formCloseDate} onChange={(e) => setFormCloseDate(e.target.value)} /></div>
            <div className="col-span-2"><Label>Observações</Label><Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDealDialog(false)}>Cancelar</Button>
            <Button onClick={saveDeal}>{editingDeal ? 'Salvar' : 'Criar Deal'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
