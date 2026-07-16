import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Loader2, UserPlus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { TeamConversation } from '@/hooks/useTeamChat';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { queryKeys } from '@/services/api/queryKeys';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: TeamConversation;
}

export function AddMembersDialog({ open, onOpenChange, conversation }: Props) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const existingMemberIds = useMemo(
    () => new Set(conversation.members?.map((m) => m.profile_id) || []),
    [conversation.members]
  );

  const { data: teammates = [], isLoading } = useQuery({
    queryKey: queryKeys.teamProfiles.forAddMembers(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []).filter((t) => !existingMemberIds.has(t.id));
    },
    enabled: open && !!profile,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return teammates;
    const q = search.toLowerCase();
    return teammates.filter(
      (t) => t.name?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)
    );
  }, [teammates, search]);

  const addMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      const { error } = await supabase.from('team_conversation_members').insert(
        memberIds.map((pid) => ({
          conversation_id: conversation.id,
          profile_id: pid,
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.conversations() });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.messages(conversation.id) });
      toast.success(`${selectedIds.length} membro(s) adicionado(s)`);
      setSelectedIds([]);
      setSearch('');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('Erro ao adicionar membros');
    },
  });

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAdd = () => {
    if (selectedIds.length === 0) return;
    addMutation.mutate(selectedIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Adicionar Membros
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar colegas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              aria-label="Buscar colegas para adicionar"
              autoFocus
            />
          </div>

          {selectedIds.length > 0 && (
            <p className="text-xs text-muted-foreground">{selectedIds.length} selecionado(s)</p>
          )}

          <div
            className="max-h-60 space-y-0.5 overflow-auto rounded-lg border p-1"
            role="listbox"
            aria-label="Colegas disponíveis"
          >
            {isLoading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {search ? 'Nenhum colega encontrado' : 'Todos os colegas já fazem parte do grupo'}
              </div>
            ) : (
              filtered.map((t) => {
                const isSelected = selectedIds.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleMember(t.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md p-2.5 transition-colors',
                      'hover:bg-accent/50',
                      isSelected && 'bg-primary/10'
                    )}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={t.avatar_url || undefined} alt={t.name || ''} />
                      <AvatarFallback className="bg-muted text-xs">
                        {t.name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.email}</p>
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
          className="mt-2 w-full rounded-xl"
        >
          {addMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          Adicionar{' '}
          {selectedIds.length > 0
            ? `(${selectedIds.length} membro${selectedIds.length !== 1 ? 's' : ''})`
            : ''}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
