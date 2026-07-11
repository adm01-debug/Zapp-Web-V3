import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTalkX, TalkXCampaign } from '@/hooks/useTalkX';

export const VARIABLES = [
  { key: '{{nome}}', label: 'Primeiro Nome', desc: 'Insere o primeiro nome do contato' },
  { key: '{{nome_completo}}', label: 'Nome Completo', desc: 'Insere o nome completo do contato' },
  { key: '{{apelido}}', label: 'Apelido', desc: 'Usa apelido se disponível, senão primeiro nome' },
  { key: '{{empresa}}', label: 'Empresa', desc: 'Nome da empresa do contato' },
  { key: '{{saudacao}}', label: 'Saudação', desc: 'Automático: Bom dia / Boa tarde / Boa noite' },
];

export const MESSAGE_TEMPLATES = [
  { name: 'Saudação simples', template: '{{saudacao}}, {{nome}}! Tudo bem? 😊' },
  {
    name: 'Promoção',
    template:
      '{{saudacao}}, {{nome}}! 🎉 Temos uma oferta especial para você! Entre em contato para saber mais.',
  },
  {
    name: 'Follow-up',
    template:
      'Oi, {{apelido}}! Passando para saber se conseguiu ver nossa última mensagem. Fico à disposição! 🙏',
  },
  {
    name: 'Boas-vindas',
    template:
      '{{saudacao}}, {{nome}}! Seja muito bem-vindo(a) à {{empresa}}! Estamos felizes em ter você conosco. 🤝',
  },
  {
    name: 'Lembrete',
    template:
      'Oi, {{apelido}}! Só passando para lembrar sobre nosso compromisso. Qualquer dúvida, estou por aqui! 📌',
  },
  {
    name: 'Agradecimento',
    template:
      '{{saudacao}}, {{nome}}! Muito obrigado pela confiança! Foi um prazer atender você. ⭐',
  },
];

export const MEDIA_TYPES = [
  { value: 'image', label: 'Imagem', icon: 'Image' as const },
  { value: 'video', label: 'Vídeo', icon: 'Video' as const },
  { value: 'document', label: 'Documento', icon: 'FileText' as const },
  { value: 'audio', label: 'Áudio', icon: 'Music' as const },
];

export function useCampaignEditor(campaign: TalkXCampaign | null, onClose: () => void) {
  const { createCampaign, updateCampaign, addRecipients } = useTalkX();

  const [name, setName] = useState(campaign?.name || '');
  const [messageTemplate, setMessageTemplate] = useState(campaign?.message_template || '');
  const [typingDelay, setTypingDelay] = useState([
    (campaign?.typing_delay_min || 1500) / 1000,
    (campaign?.typing_delay_max || 4000) / 1000,
  ]);
  const [sendInterval, setSendInterval] = useState([
    (campaign?.send_interval_min || 5000) / 1000,
    (campaign?.send_interval_max || 15000) / 1000,
  ]);
  const [connectionId, setConnectionId] = useState(campaign?.whatsapp_connection_id || '');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [mediaUrl, setMediaUrl] = useState(campaign?.media_url || '');
  const [mediaType, setMediaType] = useState(campaign?.media_type || '');
  const [hasMedia, setHasMedia] = useState(!!campaign?.media_url);
  const [isScheduled, setIsScheduled] = useState(!!campaign?.scheduled_at);
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : ''
  );

  const { data: connections } = useQuery({
    queryKey: ['wa-connections-talkx'],
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('id, name, phone_number, status')
        .eq('status', 'connected');
      return data || [];
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ['contacts-talkx'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, nickname, phone, company, avatar_url, tags')
        .not('phone', 'is', null)
        .order('name');
      return data || [];
    },
  });

  const { companies, tags } = useMemo(() => {
    if (!contacts) return { companies: [] as string[], tags: [] as string[] };
    const companySet = new Set<string>();
    const tagSet = new Set<string>();
    contacts.forEach((c) => {
      if (c.company) companySet.add(c.company);
      if (c.tags && Array.isArray(c.tags)) c.tags.forEach((t: string) => tagSet.add(t));
    });
    return { companies: Array.from(companySet).sort(), tags: Array.from(tagSet).sort() };
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    let result = contacts;
    if (companyFilter !== 'all') result = result.filter((c) => c.company === companyFilter);
    if (tagFilter !== 'all')
      result = result.filter((c) => c.tags && Array.isArray(c.tags) && c.tags.includes(tagFilter));
    if (contactSearch.trim()) {
      const q = contactSearch.toLowerCase();
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.nickname?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.company?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [contacts, contactSearch, companyFilter, tagFilter]);

  const previewMessage = useMemo(() => {
    const sample = contacts?.[0] || { name: 'João Silva', nickname: 'Joãozinho', company: 'Acme' };
    const firstName = (sample.name || '').split(' ')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return messageTemplate
      .replace(/\{\{nome\}\}/gi, firstName)
      .replace(/\{\{nome_completo\}\}/gi, sample.name || '')
      .replace(/\{\{apelido\}\}/gi, sample.nickname || firstName)
      .replace(/\{\{empresa\}\}/gi, sample.company || '')
      .replace(/\{\{saudacao\}\}/gi, greeting);
  }, [messageTemplate, contacts]);

  const estimatedTime = useMemo(() => {
    if (selectedContacts.length === 0) return null;
    const totalSeconds =
      selectedContacts.length *
      ((typingDelay[0] + typingDelay[1]) / 2 + (sendInterval[0] + sendInterval[1]) / 2);
    const minutes = Math.ceil(totalSeconds / 60);
    if (minutes < 60) return `~${minutes} min`;
    return `~${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ''}`;
  }, [selectedContacts.length, typingDelay, sendInterval]);

  const insertVariable = useCallback((v: string) => setMessageTemplate((prev) => prev + v), []);

  const toggleContact = useCallback((id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback(() => {
    const ids = filteredContacts.map((c) => c.id);
    const allSelected = ids.every((id) => selectedContacts.includes(id));
    setSelectedContacts((prev) =>
      allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    );
  }, [filteredContacts, selectedContacts]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Partial<TalkXCampaign> = {
        name,
        message_template: messageTemplate,
        typing_delay_min: Math.round(typingDelay[0] * 1000),
        typing_delay_max: Math.round(typingDelay[1] * 1000),
        send_interval_min: Math.round(sendInterval[0] * 1000),
        send_interval_max: Math.round(sendInterval[1] * 1000),
        whatsapp_connection_id: connectionId || null,
        media_url: hasMedia ? mediaUrl || null : null,
        media_type: hasMedia ? mediaType || null : null,
        scheduled_at: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: isScheduled && scheduledAt ? 'scheduled' : undefined,
      };
      if (campaign) {
        await updateCampaign.mutateAsync({ id: campaign.id, ...payload });
      } else {
        const newCampaign = await createCampaign.mutateAsync(payload);
        if (newCampaign && selectedContacts.length > 0) {
          await addRecipients.mutateAsync({
            campaignId: newCampaign.id,
            contactIds: selectedContacts,
          });
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }, [
    name,
    messageTemplate,
    typingDelay,
    sendInterval,
    connectionId,
    hasMedia,
    mediaUrl,
    mediaType,
    isScheduled,
    scheduledAt,
    campaign,
    selectedContacts,
    onClose,
    createCampaign,
    updateCampaign,
    addRecipients,
  ]);

  const clearFilters = useCallback(() => {
    setCompanyFilter('all');
    setTagFilter('all');
  }, []);
  const toggleMedia = useCallback((v: boolean) => {
    setHasMedia(v);
    if (!v) {
      setMediaUrl('');
      setMediaType('');
    }
  }, []);
  const toggleSchedule = useCallback((v: boolean) => {
    setIsScheduled(v);
    if (!v) setScheduledAt('');
  }, []);

  return {
    name,
    setName,
    messageTemplate,
    setMessageTemplate,
    typingDelay,
    setTypingDelay,
    sendInterval,
    setSendInterval,
    connectionId,
    setConnectionId,
    selectedContacts,
    showPreview,
    setShowPreview,
    contactSearch,
    setContactSearch,
    saving,
    companyFilter,
    setCompanyFilter,
    tagFilter,
    setTagFilter,
    mediaUrl,
    setMediaUrl,
    mediaType,
    setMediaType,
    hasMedia,
    isScheduled,
    scheduledAt,
    setScheduledAt,
    connections,
    contacts,
    companies,
    tags,
    filteredContacts,
    previewMessage,
    estimatedTime,
    insertVariable,
    toggleContact,
    selectAll,
    handleSave,
    clearFilters,
    toggleMedia,
    toggleSchedule,
  };
}
