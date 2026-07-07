import { useEffect, useRef, useState, useCallback } from 'react';
import { EditContactDialog } from './contact-details/EditContactDialog';
import { Conversation } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { ContactHeaderSection } from './contact-details/ContactHeaderSection';
import { ContactAccordionSections } from './contact-details/ContactAccordionSections';
import { useContactEnrichedData } from '@/hooks/useContactEnrichedData';
import { useConversationActions } from '@/hooks/useConversationActions';
import { Accordion } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { KnowledgeBaseSearchPanel } from './KnowledgeBaseSearchPanel';
import { AnalysisBadges } from './AnalysisBadges';

const ACCORDION_STORAGE_KEY = 'contact-details-accordion-state';

function getStoredAccordionState(): string[] {
  try {
    const stored = localStorage.getItem(ACCORDION_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* storage unavailable */ }
  return ['info', 'crm-360', 'intelligence', 'tags', 'assignment', 'custom-fields', 'notes', 'history', 'sla-timeline', 'stats'];
}

function saveAccordionState(value: string[]) {
  try {
    localStorage.setItem(ACCORDION_STORAGE_KEY, JSON.stringify(value));
  } catch { /* storage unavailable */ }
}

interface ContactDetailsProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ContactDetails({ conversation, onClose }: ContactDetailsProps) {
  const contact = conversation.contact;
  // Hook call before any conditionals
  const { enrichedData, aiTags, slaInfo } = useContactEnrichedData(contact.id);
  const { profileId } = useConversationActions();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string[]>(getStoredAccordionState);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setShowCompactHeader(scrollRef.current.scrollTop > 180);
  }, []);

  const handleAccordionChange = useCallback((value: string[]) => {
    setAccordionValue(value);
    saveAccordionState(value);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault(); onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && panelRef.current) {
        e.preventDefault();
        panelRef.current.querySelector('textarea')?.focus();
        toast.info('📝 Notas Privadas');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && panelRef.current) {
        e.preventDefault(); toast.info('🏷️ Seção de Tags');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'edit': setEditDialogOpen(true); break;
      case 'vip':
        undoToast({
          message: `${contact.name} marcado como VIP`,
          icon: '⭐',
          onUndo: () => { toast.info('VIP removido'); },
        });
        break;
      case 'archive':
        undoToast({
          message: `${contact.name} arquivado`,
          icon: '📦',
          onUndo: () => { toast.info('Contato restaurado'); },
        });
        break;
      case 'block':
        undoToast({
          message: `${contact.name} bloqueado`,
          icon: '🚫',
          onUndo: () => { toast.info('Contato desbloqueado'); },
        });
        break;
    }
  };

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }} ref={panelRef} role="complementary" aria-label="Detalhes do contato"
      data-contact-details data-contact-id={contact.id}
      tabIndex={-1}
      className="w-80 h-full min-h-0 shrink-0 bg-background dark:bg-background border-l border-border/40 flex flex-col overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/20 "
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-card/30 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-5 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
          <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Detalhes do Contato</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar painel de detalhes" className="w-7 h-7 hover:bg-destructive/10 hover:text-destructive transition-colors">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="shrink-0">
        <ContactHeaderSection
          contact={contact} enrichedData={enrichedData} conversation={conversation}
          onQuickAction={handleQuickAction} hasExpandedSections={accordionValue.length > 0}
          onCollapseAll={() => { setAccordionValue([]); saveAccordionState([]); }}
        />
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-background/50">
        <AnalysisBadges contactId={contact.id} className="px-4 pb-2 pt-2" />

        <Accordion type="multiple" value={accordionValue} onValueChange={handleAccordionChange} className="w-full">
          <ContactAccordionSections
            contact={contact} conversation={conversation} enrichedData={enrichedData}
            aiTags={aiTags} slaInfo={slaInfo} profileId={profileId}
          />
        </Accordion>

        <div className="px-3 pb-3">
          <KnowledgeBaseSearchPanel />
        </div>
      </div>


      <EditContactDialog
        open={editDialogOpen} onOpenChange={setEditDialogOpen}
        contact={{
          id: contact.id,
          name: contact.name,
          phone: contact.phone ?? null,
          email: contact.email ?? null,
          company: enrichedData?.company ?? null,
          notes: null,
          tags: contact.tags ?? [],
          phone_numbers: [],
          version: 0,
          lgpd_consent_at: null,
          lgpd_consent_channel: null,
          lgpd_opt_out_at: null,
          lgpd_marketing_consent: false,
          lgpd_data_sharing: false,
          lgpd_profiling: false,
        }}
      />
    </motion.div>
  );
}
