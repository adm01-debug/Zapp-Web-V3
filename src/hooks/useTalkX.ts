// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useTalkXManagement } from '@/hooks/useIntegrationManagement';

export function useTalkX() {
  return useTalkXManagement();
  failed_count: number;
  delivered_count: number;
  whatsapp_connection_id: string | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  media_url: string | null;
  media_type: string | null;
  scheduled_at: string | null;
}

export interface TalkXRecipient {
  id: string;
  campaign_id: string;
  contact_id: string;
  personalized_message: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  created_at: string;
  contacts?: {
    name: string;
    nickname: string | null;
    phone: string;
    company: string | null;
    avatar_url: string | null;
  };
}

type CampaignPayload = Omit<Partial<TalkXCampaign>, 'id' | 'created_at' | 'updated_at'>;

export function useTalkX() {
  const queryClient = useQueryClient();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ['talkx-campaigns'],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalkXCampaign[]; // ignore-audit: narrows variables_config from Supabase Json to string[]
    },
  });

  const recipientsQuery = useQuery({
    queryKey: ['talkx-recipients', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const { data, error } = await safeClient.from<TalkXRecipient>('talkx_recipients', (q) =>
        q
          .select('*, contacts:contact_id(name, nickname, phone, company, avatar_url)')
          .eq('campaign_id', selectedCampaignId)
          .order('created_at')
      );
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedCampaignId,
  });

  const createCampaign = useMutation({
    mutationFn: async (campaign: CampaignPayload) => {
      const { data: profile } = await supabase.from('profiles').select('id').single();

      const { data, error } = await fromTable('talkx_campaigns')
        .insert({ ...campaign, created_by: profile?.id })
        .select()
        .single();
      if (error) throw error;
      return data as TalkXCampaign; // ignore-audit: narrows variables_config from Supabase Json to string[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha Talk X criada!');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...updates }: CampaignPayload & { id: string }) => {
      const { data, error } = await fromTable('talkx_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as TalkXCampaign; // ignore-audit: narrows variables_config from Supabase Json to string[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromTable('talkx_campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha excluída');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRecipients = useMutation({
    mutationFn: async ({
      campaignId,
      contactIds,
    }: {
      campaignId: string;
      contactIds: string[];
    }) => {
      const rows = contactIds.map((contact_id) => ({
        campaign_id: campaignId,
        contact_id,
      }));
      const { error } = await fromTable('talkx_recipients').insert(rows);
      if (error) throw error;

      await fromTable('talkx_campaigns')
        .update({ total_recipients: contactIds.length })
        .eq('id', campaignId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-recipients'] });
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Contatos adicionados!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startCampaign = useCallback(
    async (campaignId: string) => {
      const trace = newRequestId('talkx-start');
      try {
        const { data, error } = await supabase.functions.invoke('talkx-send', {
          body: { campaignId, action: 'start' },
          headers: trace.headers,
        });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
        toast.success('Campanha Talk X iniciada! 🚀');
        return data;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        toast.error(`Erro ao iniciar: ${msg}`);
      }
    },
    [queryClient]
  );

  const pauseCampaign = useCallback(
    async (campaignId: string) => {
      const trace = newRequestId('talkx-pause');
      try {
        await supabase.functions.invoke('talkx-send', {
          body: { campaignId, action: 'pause' },
          headers: trace.headers,
        });
        queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
        toast.info('Campanha pausada');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        toast.error(`Erro ao pausar: ${msg}`);
      }
    },
    [queryClient]
  );

  const cancelCampaign = useCallback(
    async (campaignId: string) => {
      const trace = newRequestId('talkx-cancel');
      try {
        await supabase.functions.invoke('talkx-send', {
          body: { campaignId, action: 'cancel' },
          headers: trace.headers,
        });
        queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
        toast.info('Campanha cancelada');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        toast.error(`Erro ao cancelar: ${msg}`);
      }
    },
    [queryClient]
  );

  /**
   * Pré-valida números via `evolution-api/check-numbers` antes de iniciar a
   * campanha. Retorna a partição `{ valid, invalid }` para que o caller
   * possa decidir se segue, avisa o usuário ou remove inválidos.
   * Falhas de rede tornam-se "todos válidos" — best-effort, nunca bloqueia.
   */
  const validateRecipientsViaWhatsApp = useCallback(
    async (
      instanceName: string,
      phones: string[]
    ): Promise<{ valid: string[]; invalid: string[] }> => {
      const unique = Array.from(new Set(phones.map((p) => p.replace(/\D/g, '')).filter(Boolean)));
      if (unique.length === 0) return { valid: [], invalid: [] };
      try {
        const { data, error } = await supabase.functions.invoke('evolution-api/check-numbers', {
          body: { instanceName, numbers: unique },
        });
        if (error) throw error;
        const list = Array.isArray((data as { numbers?: unknown[] })?.numbers)
          ? (data as { numbers: Array<{ number: string; exists?: boolean }> }).numbers
          : [];
        const validSet = new Set(
          list.filter((n) => n.exists).map((n) => n.number.replace(/\D/g, ''))
        );
        const valid = unique.filter((p) => validSet.has(p));
        const invalid = unique.filter((p) => !validSet.has(p));
        return { valid, invalid };
      } catch {
        return { valid: unique, invalid: [] };
      }
    },
    []
  );

  return {
    campaigns: campaignsQuery.data || [],
    isLoading: campaignsQuery.isLoading,
    recipients: recipientsQuery.data || [],
    recipientsLoading: recipientsQuery.isLoading,
    selectedCampaignId,
    setSelectedCampaignId,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    addRecipients,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    validateRecipientsViaWhatsApp,
    refetchCampaigns: campaignsQuery.refetch,
  };
}
