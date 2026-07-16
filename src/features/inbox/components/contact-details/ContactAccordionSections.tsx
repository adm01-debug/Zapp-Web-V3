import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Tag,
  Sparkles,
  User,
  FileText,
  Clock,
  BarChart3,
  Brain,
  Info,
  Smartphone,
  ListTodo,
  Bell,
  TrendingUp,
  ShoppingBag,
  GitBranch,
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
import { Section, sectionVariants } from './ContactAccordionSection';
import { ContactTagsContent } from './ContactTagsContent';
import { SharedMediaAccordionItem } from './SharedMediaAccordionItem';

import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { log } from '@/lib/logger';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import type {
  EnrichedContactData,
  AIConversationTag,
  SLAInfo,
} from '@/hooks/useContactEnrichedData';

interface ContactAccordionSectionsProps {
  contact: Contact;
  conversation: Conversation;
  enrichedData: EnrichedContactData | null;
  aiTags: AIConversationTag[];
  slaInfo: SLAInfo | null;
  profileId: string | null;
  isLoadingAITags?: boolean;
  isLoadingSLA?: boolean;
  aiTagsError?: Error | null;
  slaError?: Error | null;
  onRetryAITags?: () => void;
  onRetrySLA?: () => void;
}

export function ContactAccordionSections({
  contact,
  conversation,
  enrichedData,
  aiTags,
  slaInfo,
  profileId,
  isLoadingAITags,
  isLoadingSLA,
  aiTagsError,
  slaError,
  onRetryAITags,
  onRetrySLA,
}: ContactAccordionSectionsProps) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaMounted, setMediaMounted] = useState(false);

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
        index={0}
        value="info"
        icon={<Info className="h-3.5 w-3.5 text-primary" />}
        label="Informações"
      >
        <ContactInfoSection contact={contact} enrichedData={enrichedData} />
      </Section>

      <Section
        index={1}
        value="whatsapp-status"
        icon={<Smartphone className="h-3.5 w-3.5 text-primary" />}
        label="Status WhatsApp"
      >
        <WhatsAppStatusSection phone={contact.phone} />
      </Section>

      {(slaInfo ||
        aiTags.length > 0 ||
        isLoadingAITags ||
        isLoadingSLA ||
        aiTagsError ||
        slaError) && (
        <Section
          index={1}
          value="sla-ai"
          icon={<Brain className="h-3.5 w-3.5 text-primary" />}
          label="SLA & Inteligência"
        >
          <SLAAndAITagsSection
            slaInfo={slaInfo}
            aiTags={aiTags}
            isLoadingAITags={isLoadingAITags}
            isLoadingSLA={isLoadingSLA}
            aiTagsError={aiTagsError}
            slaError={slaError}
            onRetryAITags={onRetryAITags}
            onRetrySLA={onRetrySLA}
          />
        </Section>
      )}

      <Section
        index={1.2}
        value="sla-config"
        icon={<Clock className="h-3.5 w-3.5 text-primary" />}
        label="Configurações de SLA"
      >
        <SectionErrorBoundary sectionName="Configurações de SLA">
          <SLADeliveryConfigSection contactId={contact.id} />
        </SectionErrorBoundary>
      </Section>

      {isExternalConfigured && (
        <div key="external-sections">
          <Section
            index={2}
            value="crm-360"
            icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
            label="CRM 360°"
          >
            <SectionErrorBoundary sectionName="CRM 360°">
              <ExternalContact360Panel phone={contact.phone} />
            </SectionErrorBoundary>
          </Section>
          <Section
            index={2.5}
            value="intelligence"
            icon={<Brain className="h-3.5 w-3.5 text-primary" />}
            label="Inteligência Comercial"
          >
            <SectionErrorBoundary sectionName="Inteligência Comercial">
              <ContactIntelligencePanel phone={contact.phone} />
            </SectionErrorBoundary>
          </Section>
        </div>
      )}

      <Section
        index={3}
        value="tags"
        icon={<Tag className="h-3.5 w-3.5 text-primary" />}
        label="Tags"
        badge={
          (contact.tags ?? []).length + conversation.tags.length > 0
            ? (contact.tags ?? []).length + conversation.tags.length
            : undefined
        }
      >
        <ContactTagsContent contact={contact} conversation={conversation} />
      </Section>

      <Section
        index={4}
        value="assignment"
        icon={<User className="h-3.5 w-3.5 text-primary" />}
        label="Atribuição"
      >
        <AssignmentSection conversation={conversation} />
      </Section>

      <Section
        index={5.5}
        value="tasks"
        icon={<ListTodo className="h-3.5 w-3.5 text-primary" />}
        label="Tarefas"
      >
        <SectionErrorBoundary sectionName="Tarefas">
          <ConversationTasksPanel contactId={contact.id} profileId={profileId} />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={5.7}
        value="reminders"
        icon={<Bell className="h-3.5 w-3.5 text-primary" />}
        label="Lembretes"
      >
        <SectionErrorBoundary sectionName="Lembretes">
          <RemindersPanel contactId={contact.id} profileId={profileId} />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={5.9}
        value="memory"
        icon={<Brain className="h-3.5 w-3.5 text-primary" />}
        label="Memória Viva"
      >
        <SectionErrorBoundary sectionName="Memória Viva">
          <ConversationMemoryPanel contactId={contact.id} profileId={profileId} />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={6}
        value="scoring"
        icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}
        label="Scoring & LGPD"
      >
        <SectionErrorBoundary sectionName="Scoring & LGPD">
          <LeadRiskScorePanel contactId={contact.id} />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={6.2}
        value="purchases"
        icon={<ShoppingBag className="h-3.5 w-3.5 text-primary" />}
        label="Compras & Propostas"
      >
        <SectionErrorBoundary sectionName="Compras & Propostas">
          <ContactPurchasesPanel contactId={contact.id} profileId={profileId} />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={6}
        value="notes"
        icon={<FileText className="h-3.5 w-3.5 text-primary" />}
        label="Notas Privadas"
      >
        <SectionErrorBoundary sectionName="Notas Privadas">
          <PrivateNotes contactId={contact.id} />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={6.8}
        value="timeline"
        icon={<GitBranch className="h-3.5 w-3.5 text-primary" />}
        label="Linha do Tempo"
      >
        <SectionErrorBoundary sectionName="Linha do Tempo">
          <ConversationTimeline contactId={contact.id} />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={7}
        value="history"
        icon={<Clock className="h-3.5 w-3.5 text-primary" />}
        label="Histórico"
      >
        <SectionErrorBoundary sectionName="Histórico">
          <ConversationHistory
            contactId={contact.id}
            contactPhone={contact.phone}
            onSelectConversation={(id) => log.debug('Selected conversation:', id)}
          />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={7.3}
        value="delivery-stats"
        icon={<CheckCheck className="h-3.5 w-3.5 text-primary" />}
        label="Entregas & Leituras"
      >
        <SectionErrorBoundary sectionName="Entregas & Leituras">
          <DeliveryStatsPanel remoteJid={contact.id} />
        </SectionErrorBoundary>
      </Section>

      <Section
        index={7.5}
        value="sla-timeline"
        icon={<Activity className="h-3.5 w-3.5 text-primary" />}
        label="Linha do tempo do atendimento"
      >
        <SectionErrorBoundary sectionName="Linha do tempo do atendimento">
          <SLATimelineSection conversation={conversation} />
        </SectionErrorBoundary>
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
