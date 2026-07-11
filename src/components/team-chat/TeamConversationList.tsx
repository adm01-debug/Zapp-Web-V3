import { TeamConversation } from '@/hooks/useTeamChat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Users, User, Building2, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo, forwardRef, useEffect, useRef } from 'react';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth';
import { DepartmentManagementDialog } from './DepartmentManagementDialog';

interface Props {
  conversations: TeamConversation[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
}

export const TeamConversationList = forwardRef<HTMLDivElement, Props>(function TeamConversationList(
  { conversations, isLoading, selectedId, onSelect, onNewConversation },
  _ref
) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'direct' | 'group' | 'department'>('all');
  const [mgmtDept, setMgmtDept] = useState<{ id: string; name: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const _listRef = useRef<HTMLDivElement>(null);

  const isAdmin = profile?.role === 'admin';

  const debouncedSearch = useDebouncedValue(search, 300);

  const filtered = useMemo(() => {
    let filteredList = conversations;

    if (filterType !== 'all') {
      filteredList = filteredList.filter((c) => c.type === filterType);
    }

    if (!debouncedSearch.trim()) return filteredList;

    const q = debouncedSearch.toLowerCase();
    return filteredList.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.last_message?.content.toLowerCase().includes(q)
    );
  }, [conversations, debouncedSearch, filterType]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD/CTRL + F to search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Arrow navigation if something is selected or focus is on list
      if (selectedId && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        const currentIndex = filtered.findIndex((c) => c.id === selectedId);
        if (e.key === 'ArrowDown' && currentIndex < filtered.length - 1) {
          e.preventDefault();
          onSelect(filtered[currentIndex + 1].id);
        } else if (e.key === 'ArrowUp' && currentIndex > 0) {
          e.preventDefault();
          onSelect(filtered[currentIndex - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedId, onSelect]);

  return (
    <>
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight text-foreground">Teams</h2>
          <Button size="icon" variant="ghost" onClick={onNewConversation} title="Nova conversa">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar conversas... (⌘F)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 border-border/40 bg-background pl-8 focus:ring-primary/20"
          />
        </div>
        <div className="scrollbar-none flex items-center gap-1 overflow-x-auto pb-1">
          <Button
            variant={filterType === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 rounded-full px-2 text-[11px]"
            onClick={() => setFilterType('all')}
          >
            Todos
          </Button>
          <Button
            variant={filterType === 'direct' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 rounded-full px-2 text-[11px]"
            onClick={() => setFilterType('direct')}
          >
            <User className="h-3 w-3" /> Chats
          </Button>
          <Button
            variant={filterType === 'group' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 rounded-full px-2 text-[11px]"
            onClick={() => setFilterType('group')}
          >
            <Users className="h-3 w-3" /> Grupos
          </Button>
          <Button
            variant={filterType === 'department' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 rounded-full px-2 text-[11px]"
            onClick={() => setFilterType('department')}
          >
            <Building2 className="h-3 w-3" /> Deptos
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto" role="listbox" aria-label="Lista de conversas">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 text-muted-foreground/40" />
            <p>{search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}</p>
            {!search && (
              <p className="text-xs text-muted-foreground/60">
                Clique em + para iniciar uma nova conversa
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 p-1">
            {filtered.map((conv, index) => (
              <button
                key={conv.id}
                tabIndex={0}
                data-testid={`conversation-${conv.id}`}
                data-test-name={conv.name}
                onClick={() => onSelect(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(conv.id);
                  }
                }}
                role="option"
                aria-selected={selectedId === conv.id}
                aria-setsize={filtered.length}
                aria-posinset={index + 1}
                aria-label={`Conversa com ${conv.name || 'Sem nome'}${(conv.unread_count ?? 0) > 0 ? `, ${conv.unread_count} não lidas` : ''}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors',
                  'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1',
                  selectedId === conv.id && 'border-r-2 border-primary bg-primary/10'
                )}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={conv.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {conv.type === 'department' ? (
                      <Building2 className="h-4 w-4" />
                    ) : conv.type === 'group' ? (
                      <Users className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium text-foreground">
                      {conv.name || 'Sem nome'}
                    </span>
                    {conv.last_message && (
                      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(conv.last_message.created_at), {
                          addSuffix: false,
                          locale: ptBR,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-1.5">
                    <p className="flex-1 truncate text-xs text-muted-foreground">
                      {conv.last_message?.content ||
                        (conv.type === 'department' ? 'Canal do departamento' : 'Sem mensagens')}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isAdmin && conv.type === 'department' && conv.department_id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMgmtDept({
                              id: conv.department_id!,
                              name: conv.name || 'Departamento',
                            });
                          }}
                          title="Gerenciar membros"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(conv.unread_count ?? 0) > 0 && (
                        <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px]">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {mgmtDept && (
        <DepartmentManagementDialog
          department={mgmtDept}
          open={!!mgmtDept}
          onOpenChange={(open) => !open && setMgmtDept(null)}
        />
      )}
    </>
  );
});
