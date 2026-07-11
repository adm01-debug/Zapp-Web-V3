import { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Conversation } from '@/types/chat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from '@/components/ui/motion';
import { Search, Filter } from 'lucide-react';
import { ConversationItem } from './conversation-list/ConversationItem';
import { useDensity } from '@/hooks/useDensity';

const _ITEM_HEIGHT = 140;
const _COMPACT_ITEM_HEIGHT = 80;

interface VirtualizedConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
  compactMode?: boolean;
  onArchive?: (conversation: Conversation) => void;
  onMarkRead?: (conversation: Conversation) => void;
}

export function VirtualizedConversationList({
  conversations,
  selectedId,
  onSelect,
  compactMode: forceCompact = false,
}: VirtualizedConversationListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const parentRef = useRef<HTMLDivElement>(null);
  const { density } = useDensity();
  const isCompactMode = density === 'compact' || density === 'dense' || forceCompact;
  const itemHeight = isCompactMode ? 82 : 96; // Consistência com VirtualizedRealtimeList

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const matchesSearch =
        conv.contact.name.toLowerCase().includes(search.toLowerCase()) ||
        conv.contact.phone.includes(search);
      const matchesFilter = filter === 'all' || conv.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [conversations, search, filter]);

  const counts = useMemo(
    () => ({
      all: conversations.length,
      open: conversations.filter((c) => c.status === 'open').length,
      pending: conversations.filter((c) => c.status === 'pending').length,
      waiting: conversations.filter((c) => c.status === 'waiting').length,
    }),
    [conversations]
  );

  const virtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
  });

  return (
    <div className="flex h-full flex-col border-r border-border/30 bg-sidebar">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={cn(
          'sticky top-0 z-20 border-b border-border/10 bg-sidebar/50 p-5 backdrop-blur-md',
          isCompactMode ? 'space-y-3' : 'space-y-5'
        )}
      >
        <div className="flex items-center justify-between">
          <h2
            className={cn(
              'font-display font-semibold tracking-normal text-foreground/90',
              isCompactMode ? 'text-[14px]' : 'text-[15px]'
            )}
          >
            Conversas
          </h2>
          <div className="flex items-center gap-1">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground transition-all hover:bg-primary/10"
              >
                <Filter className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
          </div>
        </div>

        <div className="group relative">
          <div className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 items-center justify-center">
            <Search className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors duration-300 group-focus-within:scale-110 group-focus-within:text-primary" />
          </div>
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'h-9 rounded-full border-border/20 bg-muted/20 pl-10 text-xs font-light tracking-tight transition-all duration-300',
              'placeholder:text-muted-foreground/40',
              'shadow-sm focus:border-primary/30 focus:bg-background focus:ring-4 focus:ring-primary/5',
              isCompactMode && 'h-8'
            )}
          />
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="w-full">
          <TabsList
            className={cn(
              'h-9 w-full gap-1 rounded-lg border-none bg-muted/20 p-1',
              isCompactMode && 'h-8'
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
                  'flex-1 rounded-md text-[11px] font-normal tracking-tight transition-all duration-300',
                  'data-[state=active]:bg-background data-[state=active]:font-medium data-[state=active]:text-primary data-[state=active]:shadow-sm',
                  'text-muted-foreground/70 hover:text-foreground/80',
                  isCompactMode && 'py-0.5 text-[9px]'
                )}
              >
                {t.label}
                <span className="ml-1 text-[10px] font-light opacity-50">{t.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </motion.div>

      <div
        ref={parentRef}
        className="scrollbar-thin flex-1 overflow-auto"
        role="listbox"
        aria-label="Lista de conversas virtualizada"
      >
        {filteredConversations.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhuma conversa encontrada"
            description="Ajuste os filtros"
            illustration="inbox"
            size={isCompactMode ? 'xs' : 'sm'}
          />
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const conversation = filteredConversations[virtualRow.index];
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
                  <ConversationItem
                    conversation={conversation}
                    isSelected={selectedId === conversation.id}
                    onSelect={onSelect}
                    compact={isCompactMode}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
