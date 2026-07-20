import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';
import { useMountedRef } from '@/hooks/useMountedRef';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import { getLogger } from '@/lib/logger';
import { extractEvolutionMessageId } from '@/lib/evolutionMessageId';
import { dbFrom } from '@/integrations/datasource/db';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import type { Deal } from '@/components/pipeline/DealCard';

const log = getLogger('useBusinessLogicManagement');

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

/** A B Variant interface definition. */
export interface ABVariant {
  id: string;
  variant_name: string;
  message_content: string;
  send_count: number;
  delivered_count: number;
  read_count: number;
  response_count: number;
  is_winner: boolean;
}

/** Contact Result interface definition. */
export interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

/** Pipeline Stage interface definition. */
export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  position: number;
}

// ═══════════════════════════════════════════════════════════
// Campaign AB Testing Management
// ═══════════════════════════════════════════════════════════

/** Use Business Logic Campaigns Params interface definition. */
export interface UseBusinessLogicCampaignsParams {
  campaignId: string;
}

/** Use Business Logic Campaigns Result interface definition. */
export interface UseBusinessLogicCampaignsResult {
  variants: ABVariant[];
  loading: boolean;
  addVariant: (name: string, content: string) => Promise<boolean>;
  deleteVariant: (id: string) => Promise<void>;
  declareWinner: (id: string) => Promise<void>;
}

/** Manages A/B campaign variants, analytics, and winner declaration. */
export function useBusinessLogicCampaignsManagement(
  params: UseBusinessLogicCampaignsParams
): UseBusinessLogicCampaignsResult {
  const { campaignId } = params;
  const [variants, setVariants] = useState<ABVariant[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVariants = useCallback(async () => {
    if (!campaignId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('campaign_ab_variants')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at');
    if (!error && data) {
      setVariants(
        data.map((v) => ({
          id: v.id,
          variant_name: v.variant_name,
          message_content: v.message_content,
          send_count: v.send_count ?? 0,
          delivered_count: v.delivered_count ?? 0,
          read_count: v.read_count ?? 0,
          response_count: v.response_count ?? 0,
          is_winner: v.is_winner ?? false,
        }))
      );
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    void fetchVariants();
  }, [fetchVariants]);

  const addVariant = async (name: string, content: string): Promise<boolean> => {
    const { error } = await supabase.from('campaign_ab_variants').insert({
      campaign_id: campaignId,
      variant_name: name,
      message_content: content,
    });
    if (error) {
      toast({ title: 'Erro ao criar variante', variant: 'destructive' });
      return false;
    }
    await fetchVariants();
    return true;
  };

  const deleteVariant = async (id: string): Promise<void> => {
    const { error } = await supabase.from('campaign_ab_variants').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir variante', variant: 'destructive' });
      return;
    }
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const declareWinner = async (id: string): Promise<void> => {
    const { error: resetError } = await supabase
      .from('campaign_ab_variants')
      .update({ is_winner: false })
      .eq('campaign_id', campaignId);
    if (resetError) {
      toast({ title: 'Erro ao resetar variantes anteriores', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('campaign_ab_variants')
      .update({ is_winner: true })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro ao declarar vencedor', variant: 'destructive' });
      return;
    }
    setVariants((prev) => prev.map((v) => ({ ...v, is_winner: v.id === id })));
  };

  return { variants, loading, addVariant, deleteVariant, declareWinner };
}

// ═══════════════════════════════════════════════════════════
// Catalog Send Product Management
// ═══════════════════════════════════════════════════════════

/** Use Business Logic Catalog Params interface definition. */
export interface UseBusinessLogicCatalogParams {
  step: 'configure' | 'selectContact';
  onSuccess: () => void;
}

/** Use Business Logic Catalog Result interface definition. */
export interface UseBusinessLogicCatalogResult {
  contactSearch: string;
  setContactSearch: (value: string) => void;
  contactResults: ContactResult[];
  searchingContacts: boolean;
  selectedContact: ContactResult | null;
  setSelectedContact: (contact: ContactResult | null) => void;
  resetContactSelection: () => void;
  isSending: boolean;
  sendProductToContact: (
    contact: ContactResult,
    message: string,
    imageUrls: string[]
  ) => Promise<void>;
}

/** Manages product catalog sending to contacts with image uploads and media handling. */
export function useBusinessLogicCatalogManagement(
  params: UseBusinessLogicCatalogParams
): UseBusinessLogicCatalogResult {
  const { step, onSuccess } = params;
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (step !== 'selectContact' || !contactSearch.trim()) {
      setContactResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingContacts(true);
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .or(
          `name.ilike.%${sanitizePostgrestFilter(contactSearch)}%,phone.ilike.%${sanitizePostgrestFilter(contactSearch)}%`
        )
        .limit(15);
      setContactResults(data || []);
      setSearchingContacts(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [contactSearch, step]);

  useEffect(() => {
    if (step !== 'selectContact') return;
    setSearchingContacts(true);
    let isMounted = true;
    dbFrom('contacts')
      .select('id, name, phone, avatar_url')
      .order('updated_at', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        if (!isMounted) return;
        if (!contactSearch.trim()) setContactResults(data || []);
        setSearchingContacts(false);
      })
      .catch(() => {
        if (isMounted) setSearchingContacts(false);
      });
    return () => {
      isMounted = false;
    };
  }, [step, contactSearch]);

  const resetContactSelection = useCallback(() => {
    setSelectedContact(null);
    setContactSearch('');
  }, []);

  const sendProductToContact = useCallback(
    async (contact: ContactResult, message: string, imageUrls: string[]) => {
      setIsSending(true);
      try {
        const { data: connections, error: connError } = await supabase
          .from('whatsapp_connections')
          .select('id, name, instance_id')
          .eq('status', 'connected')
          .limit(1);
        if (connError) {
          log.error('Failed to fetch WhatsApp connections:', connError);
          throw connError;
        }

        const connection = connections?.[0];
        const evoName = connection
          ? evolutionInstanceName({
              instance_name: connection.name,
              instance_id: connection.instance_id,
            })
          : null;
        if (!evoName) {
          toast({
            title: 'Nenhuma conexão WhatsApp ativa com nome de instância válido.',
            variant: 'destructive',
          });
          return;
        }

        for (const imgUrl of imageUrls) {
          const { data: dbResult } = await supabase
            .from('messages')
            .insert({
              contact_id: contact.id,
              content: imgUrl,
              sender: 'agent',
              message_type: 'image',
              status: 'sending',
              whatsapp_connection_id: connection?.id || null,
            })
            .select('id')
            .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

          const { data: apiResult } = await supabase.functions.invoke('evolution-api', {
            body: {
              action: 'send-media',
              instanceName: evoName,
              number: contact.phone,
              mediatype: 'image',
              media: imgUrl,
              caption: '',
            },
          });

          const externalId = extractEvolutionMessageId(apiResult);
          if (dbResult?.id && externalId) {
            await dbFrom('messages')
              .update({ external_id: externalId, status: 'sent' })
              .eq('id', dbResult.id);
          }
        }

        const { data: textDbResult } = await supabase
          .from('messages')
          .insert({
            contact_id: contact.id,
            content: message,
            sender: 'agent',
            message_type: 'text',
            status: 'sending',
            whatsapp_connection_id: connection?.id || null,
          })
          .select('id')
          .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

        const { data: textApiResult } = await supabase.functions.invoke('evolution-api', {
          body: {
            action: 'send-text',
            instanceName: evoName,
            number: contact.phone,
            text: message,
          },
        });

        const textExternalId = extractEvolutionMessageId(textApiResult);
        if (textDbResult?.id && textExternalId) {
          await dbFrom('messages')
            .update({ external_id: textExternalId, status: 'sent' })
            .eq('id', textDbResult.id);
        }

        toast({ title: '✅ Produto enviado!', description: `Enviado para ${contact.name}` });
        onSuccess();
      } catch (err) {
        log.error('Error sending product:', err);
        toast({ title: 'Erro ao enviar produto', variant: 'destructive' });
      } finally {
        setIsSending(false);
      }
    },
    [onSuccess]
  );

  return {
    contactSearch,
    setContactSearch,
    contactResults,
    searchingContacts,
    selectedContact,
    setSelectedContact,
    resetContactSelection,
    isSending,
    sendProductToContact,
  };
}

// ═══════════════════════════════════════════════════════════
// Sales Pipeline Management
// ═══════════════════════════════════════════════════════════

/** Use Business Logic Pipeline Params type definition. */
export type UseBusinessLogicPipelineParams = Record<string, never>;

/** Use Business Logic Pipeline Result interface definition. */
export interface UseBusinessLogicPipelineResult {
  stages: PipelineStage[];
  deals: Deal[];
  loading: boolean;
  contacts: { id: string; name: string; phone: string }[];
  agents: { id: string; name: string }[];
  showDealDialog: boolean;
  setShowDealDialog: (show: boolean) => void;
  editingDeal: Deal | null;
  formTitle: string;
  setFormTitle: (value: string) => void;
  formValue: string;
  setFormValue: (value: string) => void;
  formStageId: string;
  setFormStageId: (value: string) => void;
  formContactId: string;
  setFormContactId: (value: string) => void;
  formAssignedTo: string;
  setFormAssignedTo: (value: string) => void;
  formPriority: string;
  setFormPriority: (value: string) => void;
  formCloseDate: string;
  setFormCloseDate: (value: string) => void;
  formNotes: string;
  setFormNotes: (value: string) => void;
  fetchData: () => Promise<void>;
  openNewDeal: (stageId?: string) => void;
  openEditDeal: (deal: Deal) => void;
  saveDeal: () => Promise<void>;
  moveDeal: (dealId: string, newStageId: string) => Promise<void>;
  deleteDeal: (id: string) => Promise<void>;
  markAsWon: (deal: Deal) => Promise<void>;
  markAsLost: (deal: Deal) => Promise<void>;
}

/** Manages sales pipeline stages, deals, activities, and deal lifecycle (won/lost). */
export function useBusinessLogicPipelineManagement(
  _params: UseBusinessLogicPipelineParams = {}
): UseBusinessLogicPipelineResult {
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
    try {
      const [stagesRes, dealsRes, contactsRes, agentsRes] = await Promise.all([
        supabase.from('sales_pipeline_stages').select('*').order('position'),
        safeClient.from('sales_deals', (q) =>
          q
            .select('*, contacts(name, phone), profiles!sales_deals_assigned_to_fkey(name)')
            .order('created_at', { ascending: false })
        ),
        dbFrom('contacts').select('id, name, phone').limit(200),
        supabase.from('profiles').select('id, name').eq('is_active', true),
      ]);
      if (!mountedRef.current) return;

      if (stagesRes.error) throw stagesRes.error;
      if (dealsRes.error) throw dealsRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (agentsRes.error) throw agentsRes.error;

      if (stagesRes.data) setStages(stagesRes.data);
      if (dealsRes.data) {
        const dealsRows = dealsRes.data as Array<
          Deal & {
            contacts: { name: string; phone: string } | null;
            profiles: { name: string } | null;
            tags?: string[];
          }
        >;
        setDeals(
          dealsRows.map((d) => ({
            ...d,
            tags: d.tags || [],
            contact: d.contacts,
            assignee: d.profiles,
          }))
        );
      }
      if (contactsRes.data) setContacts(contactsRes.data);
      if (agentsRes.data) setAgents(agentsRes.data);
    } catch (err) {
      if (!mountedRef.current) return;
      log.error('Error fetching pipeline data:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [mountedRef]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('deals-changes')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'sales_deals' }, () =>
        fetchData()
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const openNewDeal = (stageId?: string) => {
    setEditingDeal(null);
    setFormTitle('');
    setFormValue('');
    setFormStageId(stageId || stages[0]?.id || '');
    setFormContactId('');
    setFormAssignedTo('');
    setFormPriority('medium');
    setFormCloseDate('');
    setFormNotes('');
    setShowDealDialog(true);
  };

  const openEditDeal = (deal: Deal) => {
    setEditingDeal(deal);
    setFormTitle(deal.title);
    setFormValue(String(deal.value || ''));
    setFormStageId(deal.stage_id || '');
    setFormContactId(deal.contact_id || '');
    setFormAssignedTo(deal.assigned_to || '');
    setFormPriority(deal.priority);
    setFormCloseDate(deal.expected_close_date || '');
    setFormNotes(deal.notes || '');
    setShowDealDialog(true);
  };

  const saveDeal = async () => {
    if (!formTitle.trim()) return;
    const payload = {
      title: formTitle,
      value: parseFloat(formValue) || 0,
      stage_id: formStageId || null,
      contact_id: formContactId || null,
      assigned_to: formAssignedTo || null,
      priority: formPriority,
      expected_close_date: formCloseDate || null,
      notes: formNotes || null,
    };
    if (editingDeal) {
      const { error } = await supabase.from('sales_deals').update(payload).eq('id', editingDeal.id);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Deal atualizado!' });
    } else {
      const { error } = await supabase.from('sales_deals').insert(payload);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Deal criado!' });
    }
    setShowDealDialog(false);
    fetchData();
  };

  const moveDeal = async (dealId: string, newStageId: string) => {
    const current = deals.find((d) => d.id === dealId);
    if (current?.stage_id === newStageId) return;
    const { error } = await supabase
      .from('sales_deals')
      .update({ stage_id: newStageId })
      .eq('id', dealId);
    if (error) {
      toast({ title: 'Erro ao mover deal', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('deal_activities').insert({
      deal_id: dealId,
      activity_type: 'stage_change',
      description: `Movido para ${stages.find((s) => s.id === newStageId)?.name}`,
    });
    fetchData();
  };

  const deleteDeal = async (id: string) => {
    const { error } = await supabase.from('sales_deals').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao remover deal', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deal removido' });
    fetchData();
  };

  const markAsWon = async (deal: Deal) => {
    const { error } = await supabase
      .from('sales_deals')
      .update({ status: 'won', won_at: new Date().toISOString() })
      .eq('id', deal.id);
    if (error) {
      toast({
        title: 'Erro ao marcar como ganho',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: '🎉 Deal ganho!',
      description: `${deal.title} - R$ ${(deal.value ?? 0).toLocaleString('pt-BR')}`,
    });
    fetchData();
  };

  const markAsLost = async (deal: Deal) => {
    const { error } = await supabase
      .from('sales_deals')
      .update({ status: 'lost', lost_at: new Date().toISOString() })
      .eq('id', deal.id);
    if (error) {
      toast({
        title: 'Erro ao marcar como perdido',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Deal perdido', description: deal.title });
    fetchData();
  };

  return {
    stages,
    deals,
    loading,
    contacts,
    agents,
    showDealDialog,
    setShowDealDialog,
    editingDeal,
    formTitle,
    setFormTitle,
    formValue,
    setFormValue,
    formStageId,
    setFormStageId,
    formContactId,
    setFormContactId,
    formAssignedTo,
    setFormAssignedTo,
    formPriority,
    setFormPriority,
    formCloseDate,
    setFormCloseDate,
    formNotes,
    setFormNotes,
    fetchData,
    openNewDeal,
    openEditDeal,
    saveDeal,
    moveDeal,
    deleteDeal,
    markAsWon,
    markAsLost,
  };
}
