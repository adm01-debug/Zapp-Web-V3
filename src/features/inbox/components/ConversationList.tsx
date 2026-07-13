import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { Conversation } from '@/types/chat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConversationItem } from './conversation-list/ConversationItem';
import type { ConversationItemData } from './conversation-list/conversationItemShared';
import { ConversationContextMenu } from './ConversationContextMenu';
import { useDensity } from '@/hooks/useDensity';

import { Search, Filter } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
  isLoading?: boolean;
}

function toConversationItemData(conversation: Conversation): ConversationItemData {
  return {
    id: conversation.id,
    contact: conversation.contact,
    status: conversation.status,
    unreadCount: conversation.unreadCount,
    lastMessage: conversation.lastMessage
      ? {
          content: conversation.lastMessage.content,
          created_at:
            conversation.lastMessage.created_at ?? conversation.lastMessage.timestamp.toISOString(),
        }
      : null,
    updatedAt: conversation.updatedAt.toISOString(),
    sentiment: conversation.sentiment,
    sentimentScore: conversation.sentimentScore,
    assignedTo: conversation.assignedTo?.id ?? null,
    priority: conversation.priority,
  };
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading = false,
  search = '',
  setSearch,
  filter = 'all',
  setFilter,
}: ConversationListProps & {
  search?: string;
  setSearch?: (v: string) => void;
  filter?: string;
  setFilter?: (v: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { density } = useDensity();
  const isCompactMode = density === 'compact' || density === 'dense';

  const virtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isCompactMode ? 64 : 78),
    overscan: 10,
  });

  const counts = useMemo(() => {
    return {
      all: conversations.length,
      open: conversations.filter((c) => c.status === 'open').length,
      pending: conversations.filter((c) => c.status === 'pending').length,
      waiting: conversations.filter((c) => c.status === 'waiting').length,
    };
  }, [conversations]);

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border bg-background">
      {/* Header */}
      <div
        className={cn(
          'shrink-0 border-b border-border/40 bg-background/50 backdrop-blur-md transition-all duration-300',
          isCompactMode ? 'space-y-2 p-2' : 'space-y-4 p-4'
        )}
      >
        <div className="flex items-center justify-between">
          <h2
            className={cn(
              'select-none font-bold tracking-tight text-foreground',
              isCompactMode ? 'text-[15px]' : 'text-lg'
            )}
          >
            Conversas
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Filtrar conversas"
              className={cn(
                'rounded-full text-muted-foreground hover:bg-accent hover:text-foreground',
                isCompactMode ? 'h-7 w-7' : 'h-8 w-8'
              )}
            >
              <Filter className={cn(isCompactMode ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="group relative">
          <div className="pointer-events-none absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center">
            <Search
              className={cn(
                'text-muted-foreground transition-colors group-focus-within:text-primary',
                isCompactMode ? 'h-3.5 w-3.5' : 'h-4 w-4'
              )}
            />
          </div>
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch?.(e.target.value)}
            className={cn(
              'rounded-2xl border-none bg-muted/40 pl-9 pr-4 text-foreground shadow-sm transition-all duration-300 placeholder:text-muted-foreground/50 hover:bg-muted/60 focus:bg-background focus-visible:ring-2 focus-visible:ring-primary/20',
              isCompactMode ? 'h-[30px] text-[12px]' : 'h-[36px] text-sm'
            )}
          />
        </div>

        {/* Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter?.(v)} className="w-full">
          <TabsList
            className={cn(
              'w-full rounded-xl border-none bg-muted/30 p-1',
              isCompactMode ? 'h-8' : 'h-9'
            )}
          >
            {[
              { id: 'all', label: 'Todas', count: counts.all },
              { id: 'open', label: 'Abertas', count: counts.open },
              { id: 'pending', label: 'Pendentes', count: counts.pending },
              { id: 'waiting', label: 'Aguardando', count: counts.waiting },
            ].map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className={cn(
                  'flex-1 rounded-lg font-semibold text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm',
                  isCompactMode ? 'h-6 text-[10px]' : 'h-7 text-[11px]'
                )}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Conversations List */}
      <div
        ref={parentRef}
        className="scrollbar-none flex-1 overflow-y-auto"
        role="listbox"
        aria-label="Lista de conversas"
      >
        {isLoading ? (
          <div className="space-y-0 duration-500 animate-in fade-in">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="relative flex items-start gap-3.5 overflow-hidden border-b border-border/40 p-3"
              >
                <div className="h-[49px] w-[49px] shrink-0 animate-pulse rounded-full bg-muted/40" />
                <div className="min-w-0 flex-1 space-y-2.5 py-1">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 animate-pulse rounded-lg bg-muted/40" />
                    <div className="h-3 w-12 animate-pulse rounded-lg bg-muted/30" />
                  </div>
                  <div className="h-3.5 w-full animate-pulse rounded-lg bg-muted/20" />
                  <div className="h-3 w-1/2 animate-pulse rounded-lg bg-muted/10" />
                </div>
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-background/5 to-transparent" />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="text-center">
              <div
                className={cn(
                  'mx-auto flex items-center justify-center rounded-full bg-muted/30',
                  isCompactMode ? 'mb-3 h-12 w-12' : 'mb-4 h-16 w-16'
                )}
              >
                <Search
                  className={cn('text-muted-foreground/50', isCompactMode ? 'h-5 w-5' : 'h-7 w-7')}
                />
              </div>
              <h3
                className={cn(
                  'mb-1 font-semibold text-foreground',
                  isCompactMode ? 'text-[13px]' : 'text-base'
                )}
              >
                Nenhuma conversa
              </h3>
              <p
                className={cn(
                  'mx-auto max-w-[200px] text-muted-foreground',
                  isCompactMode ? 'text-[11px]' : 'text-sm'
                )}
              >
                {search ? 'Nenhum resultado para sua busca' : 'Suas conversas aparecerão aqui'}
              </p>
            </div>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const conversation = conversations[virtualRow.index];
              const itemData = toConversationItemData(conversation);
              const isSelected = selectedId === conversation.id;

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ConversationContextMenu
                    conversationId={conversation.id}
                    contactName={conversation.contact.name}
                    isMuted={conversation.is_muted}
                  >
                    <ConversationItem
                      conversation={itemData}
                      isSelected={isSelected}
                      onSelect={() => onSelect(conversation)}
                    />
                  </ConversationContextMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
