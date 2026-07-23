import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from './button';
import {
  MessageSquare, Users, BarChart3, Phone, Tag, Inbox,
  FileText, Bell, Search, Plus, ArrowRight, Sparkles,
  Megaphone, Bot, Kanban, Plug, Package, LucideIcon,
} from 'lucide-react';
import { illustrations } from './empty-state-illustrations';

/** Empty State Context type alias. */
export type EmptyStateContext =
  | 'inbox' | 'contacts' | 'dashboard' | 'calls' | 'tags'
  | 'search' | 'notifications' | 'generic' | 'transcriptions'
  | 'campaigns' | 'chatbot' | 'pipeline' | 'reports' | 'integrations'
  | 'templates' | 'catalog';

interface Action {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

interface EmptyStateProps {
  // Primary content
  title: string;
  description: string;

  // Context/variant (determines icon, colors, illustration)
  context?: EmptyStateContext;

  // Actions
  action?: Action;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };

  // Styling
  className?: string;
  compact?: boolean;
  size?: 'sm' | 'md' | 'lg' | string;
  illustration?: EmptyStateContext | string;

  // Custom icon override
  icon?: LucideIcon;
}

// Icon mapping
const contextIcons: Record<EmptyStateContext, LucideIcon> = {
  inbox: MessageSquare,
  contacts: Users,
  dashboard: BarChart3,
  calls: Phone,
  tags: Tag,
  search: Search,
  notifications: Bell,
  generic: Inbox,
  transcriptions: FileText,
  campaigns: Megaphone,
  chatbot: Bot,
  pipeline: Kanban,
  integrations: Plug,
  reports: BarChart3,
  templates: FileText,
  catalog: Package,
};

// Color/gradient configurations for each context
const contextConfigs: Record<EmptyStateContext, { gradient: string }> = {
  inbox: { gradient: 'from-primary/10 via-transparent to-secondary/10' },
  contacts: { gradient: 'from-info/10 to-success/10' },
  dashboard: { gradient: 'from-primary/10 to-accent/10' },
  calls: { gradient: 'from-primary/10 via-transparent to-secondary/10' },
  tags: { gradient: 'from-accent/10 to-primary/10' },
  search: { gradient: 'from-muted/10 to-muted/10' },
  notifications: { gradient: 'from-primary/10 via-transparent to-secondary/10' },
  generic: { gradient: 'from-primary/10 via-transparent to-secondary/10' },
  transcriptions: { gradient: 'from-primary/10 via-transparent to-secondary/10' },
  campaigns: { gradient: 'from-warning/10 to-primary/10' },
  chatbot: { gradient: 'from-primary/10 to-secondary/10' },
  pipeline: { gradient: 'from-success/10 to-primary/10' },
  integrations: { gradient: 'from-secondary/10 to-info/10' },
  reports: { gradient: 'from-info/10 to-primary/10' },
  templates: { gradient: 'from-primary/10 to-warning/10' },
  catalog: { gradient: 'from-success/10 to-warning/10' },
};

/**
 * Unified EmptyState component supporting both illustration-based
 * and configuration-based empty states.
 */
export function EmptyState({
  title,
  description,
  context = 'generic',
  action,
  actionLabel,
  onAction,
  secondaryAction,
  className,
  compact = false,
  illustration: illustrationOverride,
  icon: iconOverride,
}: EmptyStateProps) {
  const Icon = iconOverride || contextIcons[context] || Inbox;
  const illustrationKey = (illustrationOverride as EmptyStateContext | undefined) ?? context;
  const illustration = illustrations[illustrationKey as keyof typeof illustrations];
  const config = contextConfigs[context];
  const resolvedAction = action ?? (actionLabel && onAction ? { label: actionLabel, onClick: onAction } : undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'p-6' : 'p-8 md:p-12',
        className
      )}
    >
      {/* Illustration if available */}
      {illustration && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className={cn('relative mb-6', compact ? 'w-32 h-24' : 'w-48 h-36 md:w-56 md:h-44')}
        >
          {illustration}
          <div className="absolute inset-0 -z-10 blur-3xl">
            <div className={cn('w-full h-full bg-gradient-to-br rounded-full', config.gradient)} />
          </div>
        </motion.div>
      )}

      {/* Icon with badge */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
        className={cn(
          'flex items-center justify-center rounded-2xl mb-4',
          compact ? 'w-12 h-12' : 'w-14 h-14',
          config.gradient,
          'bg-gradient-to-br'
        )}
      >
        <Icon className={cn('text-primary', compact ? 'w-6 h-6' : 'w-7 h-7')} />
      </motion.div>

      {/* Title */}
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={cn('font-semibold text-foreground mb-2', compact ? 'text-lg' : 'text-xl md:text-2xl')}
      >
        {title}
      </motion.h3>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={cn('text-muted-foreground max-w-md mb-6', compact ? 'text-sm' : 'text-base')}
      >
        {description}
      </motion.p>

      {/* Actions */}
      {(resolvedAction || secondaryAction) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          {resolvedAction && (
            <Button
              onClick={resolvedAction.onClick}
              className="group shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
            >
              {resolvedAction.icon || <Plus className="w-4 h-4 mr-2" />}
              {resolvedAction.label}
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="ghost"
              onClick={secondaryAction.onClick}
              className="text-muted-foreground hover:text-foreground"
            >
              {secondaryAction.label}
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================
// PRESET EMPTY STATES — exported for convenience
// ============================================================

/** Inbox Empty State function. */
export function InboxEmptyState({ onStartChat }: { onStartChat?: () => void }) {
  return (
    <EmptyState
      context="inbox"
      title="Nenhuma conversa ainda"
      description="Suas conversas aparecerão aqui. Comece a atender clientes ou aguarde novas mensagens."
      action={
        onStartChat
          ? {
              label: 'Iniciar conversa',
              onClick: onStartChat,
              icon: <MessageSquare className="w-4 h-4 mr-2" />,
            }
          : undefined
      }
    />
  );
}

/** Contacts Empty State function. */
export function ContactsEmptyState({ onAddContact }: { onAddContact?: () => void }) {
  return (
    <EmptyState
      context="contacts"
      title="Nenhum contato cadastrado"
      description="Adicione contatos para gerenciar suas conversas e manter o histórico organizado."
      action={
        onAddContact
          ? { label: 'Adicionar contato', onClick: onAddContact, icon: <Users className="w-4 h-4 mr-2" /> }
          : undefined
      }
    />
  );
}

/** Dashboard Empty State function. */
export function DashboardEmptyState({ onExplore }: { onExplore?: () => void }) {
  return (
    <EmptyState
      context="dashboard"
      title="Sem dados para exibir"
      description="Comece a atender para ver métricas e insights sobre seu desempenho aqui."
      action={
        onExplore ? { label: 'Ir para Inbox', onClick: onExplore, icon: <Sparkles className="w-4 h-4 mr-2" /> } : undefined
      }
    />
  );
}

/** Search Empty State function. */
export function SearchEmptyState({ query }: { query?: string }) {
  return (
    <EmptyState
      context="search"
      title={query ? `Nenhum resultado para "${query}"` : 'Busque por algo'}
      description={
        query
          ? 'Tente usar termos diferentes ou verificar a ortografia.'
          : 'Digite palavras-chave para encontrar conversas, contatos ou mensagens.'
      }
    />
  );
}

/** Notifications Empty State function. */
export function NotificationsEmptyState() {
  return (
    <EmptyState
      context="notifications"
      title="Você está em dia!"
      description="Nenhuma notificação no momento. Novas atualizações aparecerão aqui."
      compact
    />
  );
}

/** Tags Empty State function. */
export function TagsEmptyState({ onCreateTag }: { onCreateTag?: () => void }) {
  return (
    <EmptyState
      context="tags"
      title="Nenhuma etiqueta criada"
      description="Crie etiquetas para organizar e categorizar suas conversas e contatos."
      action={
        onCreateTag ? { label: 'Criar etiqueta', onClick: onCreateTag, icon: <Tag className="w-4 h-4 mr-2" /> } : undefined
      }
    />
  );
}

/** Calls Empty State function. */
export function CallsEmptyState() {
  return (
    <EmptyState
      context="calls"
      title="Nenhuma ligação registrada"
      description="O histórico de chamadas aparecerá aqui quando você fizer ou receber ligações."
    />
  );
}

/** Transcriptions Empty State function. */
export function TranscriptionsEmptyState() {
  return (
    <EmptyState
      context="transcriptions"
      title="Nenhuma transcrição disponível"
      description="Transcrições de áudios e chamadas serão exibidas aqui automaticamente."
    />
  );
}

/** Campaigns Empty State function. */
export function CampaignsEmptyState({ onCreateCampaign }: { onCreateCampaign?: () => void }) {
  return (
    <EmptyState
      context="campaigns"
      title="Nenhuma campanha criada"
      description="Crie campanhas para engajar seus contatos em escala."
      action={
        onCreateCampaign
          ? { label: 'Nova Campanha', onClick: onCreateCampaign, icon: <Megaphone className="w-4 h-4 mr-2" /> }
          : undefined
      }
    />
  );
}

/** Chatbot Empty State function. */
export function ChatbotEmptyState({ onCreateFlow }: { onCreateFlow?: () => void }) {
  return (
    <EmptyState
      context="chatbot"
      title="Nenhum fluxo configurado"
      description="Automatize o atendimento criando fluxos de chatbot inteligentes."
      action={
        onCreateFlow
          ? { label: 'Criar Fluxo', onClick: onCreateFlow, icon: <Bot className="w-4 h-4 mr-2" /> }
          : undefined
      }
    />
  );
}

/** Pipeline Empty State function. */
export function PipelineEmptyState({ onCreateDeal }: { onCreateDeal?: () => void }) {
  return (
    <EmptyState
      context="pipeline"
      title="Pipeline vazio"
      description="Gerencie suas oportunidades de venda movendo deals entre etapas."
      action={
        onCreateDeal ? { label: 'Criar Deal', onClick: onCreateDeal, icon: <Kanban className="w-4 h-4 mr-2" /> } : undefined
      }
    />
  );
}

/** Reports Empty State function. */
export function ReportsEmptyState() {
  return (
    <EmptyState
      context="reports"
      title="Sem dados para exibir"
      description="Os relatórios serão gerados automaticamente conforme sua equipe atender."
    />
  );
}

/** Integrations Empty State function. */
export function IntegrationsEmptyState({ onExplore }: { onExplore?: () => void }) {
  return (
    <EmptyState
      context="integrations"
      title="Nenhuma integração ativa"
      description="Conecte ferramentas externas para potencializar seu atendimento."
      action={
        onExplore
          ? { label: 'Explorar Integrações', onClick: onExplore, icon: <Plug className="w-4 h-4 mr-2" /> }
          : undefined
      }
    />
  );
}

/** Templates Empty State function. */
export function TemplatesEmptyState({ onCreateTemplate }: { onCreateTemplate?: () => void }) {
  return (
    <EmptyState
      context="templates"
      title="Nenhum template criado"
      description="Crie templates de mensagem para agilizar suas respostas."
      action={
        onCreateTemplate
          ? { label: 'Criar Template', onClick: onCreateTemplate, icon: <FileText className="w-4 h-4 mr-2" /> }
          : undefined
      }
    />
  );
}

/** Catalog Empty State function. */
export function CatalogEmptyState({ onAddProduct }: { onAddProduct?: () => void }) {
  return (
    <EmptyState
      context="catalog"
      title="Catálogo vazio"
      description="Adicione produtos e serviços para compartilhar com seus clientes."
      action={
        onAddProduct
          ? { label: 'Adicionar Produto', onClick: onAddProduct, icon: <Package className="w-4 h-4 mr-2" /> }
          : undefined
      }
    />
  );
}
