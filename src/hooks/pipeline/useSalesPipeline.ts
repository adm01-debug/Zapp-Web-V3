// @ts-nocheck
/**
 * useSalesPipeline — Wave 3 (2026-07-06)
 * Camada de dados extraída de SalesPipelineView (componente ficou UI + drag view-state).
 * Preserva: Promise.all (incl. dbFrom datasource), canal realtime zapp.sales_deals,
 * sync de formulário do dialog e atividades de stage_change.
 */
import { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';
import type { Deal } from '@/components/pipeline/DealCard';
import { dbFrom } from '@/integrations/datasource/db';

export interface PipelineStage { id: string; name: string; color: string; position: number; }

export function useSalesPipeline() {
  const mountedRef = useMountedRef();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDealDialog, setShowDealDialog] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  const [formTitle, setFormTitle] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formStageId, setFormStageId] = useState('');
  const [formContactId, setFormContactId] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [formPriority, setFormPriority] = useState('medium');
  const [formCloseDate, setFormCloseDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [stagesRes, dealsRes, contactsRes, agentsRes] = await Promise.all([
      supabase.from('sales_pipeline_stages').select('*').order('position'),
      safeClient.from('sales_deals', (q) => q.select('*, contacts(name, phone), profiles!sales_deals_assigned_to_fkey(name)').order('created_at', { ascending: false })),
      dbFrom('contacts').select('id, name, phone').limit(200),
      supabase.from('profiles').select('id, name').eq('is_active', true),
    ]);
    if (!mountedRef.current) return;
    if (stagesRes.data) setStages(stagesRes.data);
    if (dealsRes.data) {
      const dealsRows = dealsRes.data as Array<Deal & { contacts: { name: string; phone: string } | null; profiles: { name: string } | null; tags?: string[] }>;
      setDeals(dealsRows.map((d) => ({ ...d, tags: d.tags || [], contact: d.contacts, assignee: d.profiles })));
    }
    if (contactsRes.data) setContacts(contactsRes.data);
    if (agentsRes.data) setAgents(agentsRes.data);
    setLoading(false);
  }, [mountedRef]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const channel = supabase.channel('deals-changes').on('postgres_changes', { event: '*', schema: 'zapp', table: 'sales_deals' }, () => fetchData()).subscribe(); // public.sales_deals é VIEW — realtime só emite da tabela-base zapp.sales_deals (publicada + RLS auth_full_access)
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const openNewDeal = (stageId?: string) => { setEditingDeal(null); setFormTitle(''); setFormValue(''); setFormStageId(stageId || stages[0]?.id || ''); setFormContactId(''); setFormAssignedTo(''); setFormPriority('medium'); setFormCloseDate(''); setFormNotes(''); setShowDealDialog(true); };
  const openEditDeal = (deal: Deal) => { setEditingDeal(deal); setFormTitle(deal.title); setFormValue(String(deal.value || '')); setFormStageId(deal.stage_id || ''); setFormContactId(deal.contact_id || ''); setFormAssignedTo(deal.assigned_to || ''); setFormPriority(deal.priority); setFormCloseDate(deal.expected_close_date || ''); setFormNotes(deal.notes || ''); setShowDealDialog(true); };

  const saveDeal = async () => {
    if (!formTitle.trim()) return;
    const payload = { title: formTitle, value: parseFloat(formValue) || 0, stage_id: formStageId || null, contact_id: formContactId || null, assigned_to: formAssignedTo || null, priority: formPriority, expected_close_date: formCloseDate || null, notes: formNotes || null };
    if (editingDeal) { const { error } = await supabase.from('sales_deals').update(payload).eq('id', editingDeal.id); if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; } toast({ title: 'Deal atualizado!' }); }
    else { const { error } = await supabase.from('sales_deals').insert(payload); if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; } toast({ title: 'Deal criado!' }); }
    setShowDealDialog(false); fetchData();
  };

  const moveDeal = async (dealId: string, newStageId: string) => { const current = deals.find(d => d.id === dealId); if (current?.stage_id === newStageId) return; const { error } = await supabase.from('sales_deals').update({ stage_id: newStageId }).eq('id', dealId); if (error) { toast({ title: 'Erro ao mover deal', description: error.message, variant: 'destructive' }); return; } await supabase.from('deal_activities').insert({ deal_id: dealId, activity_type: 'stage_change', description: `Movido para ${stages.find(s => s.id === newStageId)?.name}` }); fetchData(); };
  const deleteDeal = async (id: string) => { await supabase.from('sales_deals').delete().eq('id', id); toast({ title: 'Deal removido' }); fetchData(); };
  const markAsWon = async (deal: Deal) => { await supabase.from('sales_deals').update({ status: 'won', won_at: new Date().toISOString() }).eq('id', deal.id); toast({ title: '🎉 Deal ganho!', description: `${deal.title} - R$ ${(deal.value ?? 0).toLocaleString('pt-BR')}` }); fetchData(); };
  const markAsLost = async (deal: Deal) => { await supabase.from('sales_deals').update({ status: 'lost', lost_at: new Date().toISOString() }).eq('id', deal.id); toast({ title: 'Deal perdido', description: deal.title }); fetchData(); };

  return {
    stages, deals, loading, contacts, agents,
    showDealDialog, setShowDealDialog, editingDeal,
    formTitle, setFormTitle, formValue, setFormValue, formStageId, setFormStageId,
    formContactId, setFormContactId, formAssignedTo, setFormAssignedTo,
    formPriority, setFormPriority, formCloseDate, setFormCloseDate, formNotes, setFormNotes,
    fetchData, openNewDeal, openEditDeal, saveDeal, moveDeal, deleteDeal, markAsWon, markAsLost,
  };
}
