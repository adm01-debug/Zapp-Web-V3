import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Tag,
  Sparkles,
  User,
  FileText,
  Clock,
  BarChart3,
  Brain,
  Info,
  TagsIcon,
  Smartphone,
  Image,
  ListTodo,
  Bell,
  TrendingUp,
  ShoppingBag,
  GitBranch,
  X,
  Activity,
  CheckCheck,
} from 'lucide-react';
import { Conversation, Contact } from '@/types/chat';

import { ContactInfoSection } from './ContactInfoSection';
import { AssignmentSection } from './AssignmentSection';
import { ContactStatsSection } from './ContactStatsSection';
import { SLAAndAITagsSection } from './SLAAndAITagsSection';
import { SLADeliveryConfigSection } from './SLADeliveryConfigSection';
import { ExternalContact360Panel } from './ExternalContact360Panel';
import { ContactIntelligencePanel } from './ContactIntelligencePanel';
import { WhatsAppStatusSection } from './WhatsAppStatusSection';
import { PrivateNotes } from '../PrivateNotes';
import { ConversationHistory } from '../ConversationHistory';
import { MediaGallery } from '../MediaGallery';
import { ConversationTasksPanel } from '../ConversationTasksPanel';
import { RemindersPanel } from '../RemindersPanel';
import { ConversationMemoryPanel } from '../ConversationMemoryPanel';
import { LeadRiskScorePanel } from '../LeadRiskScorePanel';
import { ContactPurchasesPanel } from '../ContactPurchasesPanel';
import { ConversationTimeline } from '../ConversationTimeline';
import { SLATimelineSection } from './SLATimelineSection';
import { DeliveryStatsPanel } from '../DeliveryStatsPanel';

import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { log } from '@/lib/logger';
import type {
  EnrichedContactData,
  AIConversationTag,
  SLAInfo,
} from '@/hooks/useContactEnrichedData';
import { dbFrom } from '@/integrations/datasource/db';

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.3, ease: 'easeOut' as const },
  }),
};

interface ContactAccordionSectionsProps {
  contact: Contact;
  conversation: Conversation;
  enrichedData: EnrichedContactData | null;
  aiTags: AIConversationTag[];
  slaInfo: SLAInfo | null;
  profileId: string | null;
}

export function ContactAccordionSections({
  contact,
  conversation,
  enrichedData,
  aiTags,
  slaInfo,
  profileId,
}: ContactAccordionSectionsProps) {
  const [mediaOpen, setMediaOpen] = useState(false);
  // Lazy: só montamos o componente da galeria depois do primeiro clique,
  // garantindo zero requisições/efeitos enquanto o usuário só navega no inbox.
  const [mediaMounted, setMediaMounted] = useState(false);

  // Fecha a galeria e descarta o componente ao trocar de contato para
  // evitar estado aberto indevido e liberar a query da lista.
  useEffect(() => {
    setMediaOpen(false);
    setMediaMounted(false);
  }, [contact.id]);

  const openMedia = () => {
    setMediaMounted(true);
    setMediaOpen(true);
  };

  return (
    <>
      <Section
        key="info-section"
        index={0}
        value="info"
        icon={<Info className="h-3.5 w-3.5 text-primary" />}
        label="Informações"
      >
        <ContactInfoSection contact={contact} enrichedData={enrichedData} />
      </Section>

      <Section
        key="wa-status-section"
        index={1}
        value="whatsapp-status"
        icon={<Smartphone className="h-3.5 w-3.5 text-primary" />}
        label="Status WhatsApp"
      >
        <WhatsAppStatusSection phone={contact.phone} />
      </Section>

      {(slaInfo || aiTags.length > 0) && (
        <Section
          key="sla-ai-section"
          index={1}
          value="sla-ai"
          icon={<Brain className="h-3.5 w-3.5 text-primary" />}
          label="SLA & Inteligência"
        >
          <SLAAndAITagsSection slaInfo={slaInfo} aiTags={aiTags} />
        </Section>
      )}

      <Section
        key="sla-config-section"
        index={1.2}
        value="sla-config"
        icon={<Clock className="h-3.5 w-3.5 text-primary" />}
        label="Configurações de SLA"
      >
        <SLADeliveryConfigSection contactId={contact.id} />
      </Section>

      {isExternalConfigured && (
        <div key="external-sections">
          <Section
            key="crm-360-section"
            index={2}
            value="crm-360"
            icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
            label="CRM 360°"
          >
            <ExternalContact360Panel phone={contact.phone} />
          </Section>
          <Section
            key="intelligence-section"
            index={2.5}
            value="intelligence"
            icon={<Brain className="h-3.5 w-3.5 text-primary" />}
            label="Inteligência Comercial"
          >
            <ContactIntelligencePanel phone={contact.phone} />
          </Section>
        </div>
      )}

      <Section
        key="tags-section"
        index={3}
        value="tags"
        icon={<Tag className="h-3.5 w-3.5 text-primary" />}
        label="Tags"
        badge={
          contact.tags.length + conversation.tags.length > 0
            ? contact.tags.length + conversation.tags.length
            : undefined
        }
      >
        <TagsContent contact={contact} conversation={conversation} />
      </Section>

      <Section
        key="assignment-section"
        index={4}
        value="assignment"
        icon={<User className="h-3.5 w-3.5 text-primary" />}
        label="Atribuição"
      >
        <AssignmentSection conversation={conversation} />
      </Section>

      <Section
        key="tasks-section"
        index={5.5}
        value="tasks"
        icon={<ListTodo className="h-3.5 w-3.5 text-primary" />}
        label="Tarefas"
      >
        <ConversationTasksPanel contactId={contact.id} profileId={profileId} />
      </Section>

      <Section
        key="reminders-section"
        index={5.7}
        value="reminders"
        icon={<Bell className="h-3.5 w-3.5 text-primary" />}
        label="Lembretes"
      >
        <RemindersPanel contactId={contact.id} profileId={profileId} />
      </Section>

      <Section
        key="memory-section"
        index={5.9}
        value="memory"
        icon={<Brain className="h-3.5 w-3.5 text-primary" />}
        label="Memória Viva"
      >
        <ConversationMemoryPanel contactId={contact.id} profileId={profileId} />
      </Section>

      <Section
        key="scoring-section"
        index={6}
        value="scoring"
        icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}
        label="Scoring & LGPD"
      >
        <LeadRiskScorePanel contactId={contact.id} />
      </Section>

      <Section
        key="purchases-section"
        index={6.2}
        value="purchases"
        icon={<ShoppingBag className="h-3.5 w-3.5 text-primary" />}
        label="Compras & Propostas"
      >
        <ContactPurchasesPanel contactId={contact.id} profileId={profileId} />
      </Section>

      <Section
        key="notes-section"
        index={6}
        value="notes"
        icon={<FileText className="h-3.5 w-3.5 text-primary" />}
        label="Notas Privadas"
      >
        <PrivateNotes contactId={contact.id} />
      </Section>

      <Section
        key="timeline-section"
        index={6.8}
        value="timeline"
        icon={<GitBranch className="h-3.5 w-3.5 text-primary" />}
        label="Linha do Tempo"
      >
        <ConversationTimeline contactId={contact.id} />
      </Section>

      <Section
        key="history-section"
        index={7}
        value="history"
        icon={<Clock className="h-3.5 w-3.5 text-primary" />}
        label="Histórico"
      >
        <ConversationHistory
          contactId={contact.id}
          contactPhone={contact.phone}
          onSelectConversation={(id) => log.debug('Selected conversation:', id)}
        />
      </Section>

      <Section
        key="delivery-stats-section"
        index={7.3}
        value="delivery-stats"
        icon={<CheckCheck className="h-3.5 w-3.5 text-primary" />}
        label="Entregas & Leituras"
      >
        <DeliveryStatsPanel remoteJid={contact.id} />
      </Section>

      <Section
        key="sla-timeline-section"
        index={7.5}
        value="sla-timeline"
        icon={<Activity className="h-3.5 w-3.5 text-primary" />}
        label="Linha do tempo do atendimento"
      >
        <SLATimelineSection conversation={conversation} />
      </Section>

      <motion.div custom={8} initial="hidden" animate="visible" variants={sectionVariants}>
        <AccordionItem value="stats" className="border-border/10">
          <AccordionTrigger className="bg-background px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-background/5 hover:no-underline dark:bg-background">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              Estatísticas
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <ContactStatsSection contactId={contact.id} />
          </AccordionContent>
        </AccordionItem>
        <SharedMediaAccordionItem contactId={contact.id} onOpen={openMedia} />
      </motion.div>
      {mediaMounted && (
        <MediaGallery contactId={contact.id} open={mediaOpen} onOpenChange={setMediaOpen} />
      )}
    </>
  );
}

function SharedMediaAccordionItem({
  contactId,
  onOpen,
}: {
  contactId: string;
  onOpen: () => void;
}) {
  const queryClient = useQueryClient();
  const itemRef = useRef<HTMLDivElement>(null);
  const prefetchedRef = useRef(false);

  const { data: count, isLoading } = useQuery({
    queryKey: ['shared-media-count', contactId],
    queryFn: async () => {
      const { count, error } = await dbFrom('messages')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .not('media_url', 'is', null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });

  // Reseta o flag ao trocar de contato para permitir nova prefetch.
  useEffect(() => {
    prefetchedRef.current = false;
  }, [contactId]);

  // Observa o data-state do AccordionItem (Radix). Quando abre pela primeira
  // vez, faz prefetch da primeira página de mídia para a galeria abrir
  // instantânea, sem precisar montar o modal.
  useEffect(() => {
    const el = itemRef.current;
    if (!el || !contactId) return;

    const PAGE_SIZE = 24;
    const prefetchFirstPage = () => {
      if (prefetchedRef.current) return;
      prefetchedRef.current = true;
      // Mesma queryKey usada por MediaGallery — quando o modal montar,
      // pega do cache sem refetch.
      // Cache "preview" — não conflita com a query completa do modal
      // (queryKey diferente). Aquece conexão + traz thumbnails da 1a pagina.
      queryClient.prefetchQuery({
        queryKey: ['media-gallery-preview', contactId, PAGE_SIZE],
        queryFn: async () => {
          const { data, error } = await dbFrom('messages')
            .select('id, media_url, message_type, content, created_at')
            .eq('contact_id', contactId)
            .not('media_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);
          if (error) throw error;
          return data || [];
        },
        staleTime: 30_000,
      });
    };

    if (el.getAttribute('data-state') === 'open') prefetchFirstPage();
    const obs = new MutationObserver(() => {
      if (el.getAttribute('data-state') === 'open') prefetchFirstPage();
    });
    obs.observe(el, { attributes: true, attributeFilter: ['data-state'] });
    return () => obs.disconnect();
  }, [contactId, queryClient]);

  const label = isLoading
    ? '…'
    : count === 0
      ? 'vazio'
      : `${count} ${count === 1 ? 'arquivo' : 'arquivos'}`;

  return (
    <AccordionItem ref={itemRef} value="media" className="border-border/10">
      <AccordionTrigger className="bg-background px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-background/5 hover:no-underline dark:bg-background">
        <div className="flex w-full items-center justify-between gap-2 pr-2">
          <div className="flex items-center gap-2">
            <Image className="h-3.5 w-3.5" />
            Mídia Compartilhada
          </div>
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-[10px] font-medium normal-case tracking-normal"
            aria-label={`${count ?? 0} arquivos compartilhados`}
          >
            {label}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={onOpen}
          disabled={count === 0}
        >
          <Image className="h-3.5 w-3.5" />
          {count && count > 0 ? `Abrir galeria (${count})` : 'Sem mídias compartilhadas'}
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
}

// Reusable accordion section wrapper
function Section({
  index,
  value,
  icon,
  label,
  badge,
  children,
}: {
  index: number;
  value: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div custom={index} initial="hidden" animate="visible" variants={sectionVariants}>
      <AccordionItem value={value} className="border-border/10">
        <AccordionTrigger className="bg-background px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-background/5 hover:no-underline dark:bg-background">
          <div className="flex items-center gap-2">
            {icon}
            {label}
            {badge !== undefined && (
              <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {badge}
              </span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">{children}</AccordionContent>
      </AccordionItem>
    </motion.div>
  );
}

function TagsContent({ contact, conversation }: { contact: Contact; conversation: Conversation }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {contact.tags.map((tag, i) => (
        <motion.div
          key={`contact-${tag}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
        >
          <Badge
            variant="secondary"
            className="group/tag flex cursor-default items-center gap-1 border border-primary/20 bg-primary/10 text-foreground transition-all hover:scale-105 hover:bg-primary/20"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {tag}
            <X className="h-3 w-3 cursor-pointer opacity-0 transition-all hover:text-destructive group-hover/tag:opacity-100" />
          </Badge>
        </motion.div>
      ))}
      {conversation.tags.map((tag, i) => (
        <motion.div
          key={`conv-${tag}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: (contact.tags.length + i) * 0.03 }}
        >
          <Badge
            variant="outline"
            className="group/tag flex cursor-default items-center gap-1 border-border/30 transition-all hover:scale-105 hover:border-primary/30"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            {tag}
            <X className="h-3 w-3 cursor-pointer opacity-0 transition-all hover:text-destructive group-hover/tag:opacity-100" />
          </Badge>
        </motion.div>
      ))}
      {contact.tags.length === 0 && conversation.tags.length === 0 && (
        <div className="flex w-full flex-col items-center gap-1.5 py-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/20">
            <TagsIcon className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-xs text-muted-foreground/60">Nenhuma tag adicionada</p>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 border border-dashed border-border/40 text-xs hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="mr-1 h-3 w-3" />
        Adicionar
      </Button>
    </div>
  );
}
