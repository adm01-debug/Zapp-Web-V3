/**
 * Context configurations for `ContextualEmptyState`.
 *
 * Each key maps to a named empty-state preset. Add new contexts here to make
 * them available across the app via the `<ContextualEmptyState context="...">` prop.
 *
 * @see ContextualEmptyState.tsx for the rendering component
 * @see ConvenienceExports.tsx for pre-wired single-purpose components
 * @see index.ts for the public barrel export
 */
import { MessageSquare, Users, Search, LayoutList, BarChart2, Tag, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Configuration object for a single empty-state context. */
export interface EmptyStateConfig {
  /** Icon component from lucide-react displayed above the title. */
  icon: LucideIcon;
  /** Short heading shown to the user (e.g. "Nenhuma conversa"). */
  title: string;
  /** Supportive description that explains what the empty state means. */
  description: string;
  /** Optional label for the primary call-to-action button. */
  actionLabel?: string;
}

/**
 * Map from context key → empty-state configuration.
 *
 * Extend this object to add new contexts. The key must match the `context`
 * prop passed to `<ContextualEmptyState>`.
 */
export const contextConfigs: Record<string, EmptyStateConfig> = {
  inbox: {
    icon: Inbox,
    title: 'Nenhuma conversa',
    description: 'Sua caixa de entrada está vazia. Novas conversas aparecerão aqui.',
    actionLabel: 'Nova conversa',
  },
  contacts: {
    icon: Users,
    title: 'Nenhum contato',
    description: 'Nenhum contato encontrado. Importe ou adicione contatos para começar.',
    actionLabel: 'Importar contatos',
  },
  chats: {
    icon: MessageSquare,
    title: 'Nenhuma mensagem',
    description: 'Selecione uma conversa ou inicie uma nova para começar.',
  },
  search: {
    icon: Search,
    title: 'Sem resultados',
    description: 'Nenhum resultado para sua busca. Tente termos diferentes.',
  },
  queue: {
    icon: LayoutList,
    title: 'Fila vazia',
    description: 'Não há itens na fila no momento.',
  },
  reports: {
    icon: BarChart2,
    title: 'Sem dados',
    description: 'Não há dados disponíveis para o período selecionado.',
  },
  tags: {
    icon: Tag,
    title: 'Nenhuma tag',
    description: 'Nenhuma tag criada ainda. Crie tags para organizar suas conversas.',
    actionLabel: 'Criar tag',
  },
};
