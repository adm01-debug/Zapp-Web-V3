import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Loader2, UserPlus } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { TeamConversation } from '@/hooks/useTeamChat';
import { useActiveTeamProfiles, useAddConversationMembers } from '@/hooks/useTeamChatMembers';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { queryKeys } from '@/services/api/queryKeys';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: TeamConversation;
}

/** Add Members Dialog component for the team chat section. */
export function AddMembersDialog({ open, onOpenChange, conversation }: Props) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const existingMemberIds = useMemo(
    () => new Set(conversation.members?.map(m => m.profile_id) || []),
    [conversation.members]
  );

  const { data: allProfiles = [], isLoading } = useActiveTeamProfiles(
    open && !!profile,
    queryKeys.teamProfiles.forAddMembers(),
  );
  const teammates = allProfiles.filter(t => !existingMemberIds.has(t.id));

  const filtered = useMemo(() => {
    if (!search.trim()) return teammates;
    const q = search.toLowerCase();
    return teammates.filter(t =>
      t.name?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)
    );
  }, [teammates, search]);

  const addMutation = useAddConversationMembers(conversation.id);
  const handleMutationSuccess = () => {
    toast.success(`${selectedIds.length} membro(s) adicionado(s)`);
    setSelectedIds([]);
    setSearch('');
    onOpenChange(false);
  };

  const toggleMember = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleAdd = () => {
    if (selectedIds.length === 0) return;
    addMutation.mutate(selectedIds, {
      onSuccess: handleMutationSuccess,
      onError: () => toast.error('Erro ao adicionar membros'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Adicionar Membros
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar colegas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
              aria-label="Buscar colegas para adicionar"
              autoFocus
            />
          </div>

          {selectedIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedIds.length} selecionado(s)
            </p>
          )}

          <div className="max-h-60 overflow-auto space-y-0.5 border rounded-lg p-1" role="listbox" aria-label="Colegas disponíveis">
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                {search ? 'Nenhum colega encontrado' : 'Todos os colegas já fazem parte do grupo'}
              </div>
            ) : (
              filtered.map(t => {
                const isSelected = selectedIds.includes(t.id);
                return (
                  <button type="button"
                    key={t.id}
                    onClick={() => toggleMember(t.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-md transition-colors",
                      "hover:bg-accent/50",
                      isSelected && "bg-primary/10"
                    )}
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarImage src={t.avatar_url || undefined} alt={t.name || ""} />
                      <AvatarFallback className="text-xs bg-muted">{t.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                    </div>
                    <Checkbox checked={isSelected} className="shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        <Button
          onClick={handleAdd}
          disabled={selectedIds.length === 0 || addMutation.isPending}
          className="w-full mt-2 rounded-xl"
        >
          {addMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <UserPlus className="w-4 h-4 mr-2" />
          )}
          Adicionar {selectedIds.length > 0 ? `(${selectedIds.length} membro${selectedIds.length !== 1 ? 's' : ''})` : ''}
        </Button>
      </DialogContent>
    </Dialog>
  );
}