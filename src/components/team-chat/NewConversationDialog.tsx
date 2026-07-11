import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, User, Users, Loader2, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { useCreateTeamConversation } from '@/hooks/useTeamChat';
import { cn } from '@/lib/utils';

import { getLogger } from '@/lib/logger';
const log = getLogger('NewConversationDialog');

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onOpenChange, onCreated }: Props) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'direct' | 'group' | 'department'>('direct');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const createMutation = useCreateTeamConversation();

  const _isAdmin = profile?.role === 'admin';

  const { data: teammates = [], isLoading: loadingTeammates } = useQuery({
    queryKey: ['team-profiles-for-chat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, is_active')
        .neq('id', profile?.id || '')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!profile && tab !== 'department',
  });

  const { data: departments = [], isLoading: loadingDepts } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!profile && tab === 'department',
  });

  const filteredTeammates = useMemo(() => {
    if (!search.trim()) return teammates;
    const q = search.toLowerCase();
    return teammates.filter(
      (t) => t.name?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)
    );
  }, [teammates, search]);

  const filteredDepts = useMemo(() => {
    if (!search.trim()) return departments;
    const q = search.toLowerCase();
    return departments.filter(
      (d) => d.name?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q)
    );
  }, [departments, search]);

  const toggleMember = (id: string) => {
    if (tab === 'direct') {
      setSelectedIds([id]);
    } else {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
  };

  const handleCreate = async () => {
    if (tab === 'department' && !selectedDeptId) return;
    if (tab !== 'department' && selectedIds.length === 0) return;
    if (tab === 'group' && selectedIds.length < 2) {
      return; // Groups need at least 2 other members
    }

    try {
      const payload: any = { type: tab }; // ignore-audit (any pré-existente; payload montado dinamicamente por aba)

      if (tab === 'department') {
        const dept = departments.find((d) => d.id === selectedDeptId);
        payload.departmentId = selectedDeptId;
        payload.name = dept?.name;
      } else {
        payload.name = tab === 'group' ? groupName.trim() || undefined : undefined;
        payload.memberIds = selectedIds;
      }

      const result = await createMutation.mutateAsync(payload);
      setSelectedIds([]);
      setSelectedDeptId(null);
      setGroupName('');
      setSearch('');
      onCreated(result.id);
    } catch (err) {
      log.error('Unexpected error in NewConversationDialog:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as any);
            setSelectedIds([]);
            setSelectedDeptId(null);
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1 gap-1.5">
              <User className="h-3.5 w-3.5" /> Direto
            </TabsTrigger>
            <TabsTrigger value="group" className="flex-1 gap-1.5">
              <Users className="h-3.5 w-3.5" /> Grupo
            </TabsTrigger>
            <TabsTrigger value="department" className="flex-1 gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Depto
            </TabsTrigger>
          </TabsList>

          <div className="mt-3 space-y-3">
            {tab === 'group' && (
              <Input
                placeholder="Nome do grupo (ex: Marketing, Suporte...)"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={60}
                aria-label="Nome do grupo"
                autoFocus
              />
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={tab === 'department' ? 'Buscar departamentos...' : 'Buscar colegas...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="max-h-60 space-y-0.5 overflow-auto rounded-lg border p-1">
              {tab === 'department' ? (
                loadingDepts ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    Carregando departamentos...
                  </div>
                ) : filteredDepts.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    Nenhum departamento encontrado
                  </div>
                ) : (
                  filteredDepts.map((d) => {
                    const isSelected = selectedDeptId === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDeptId(d.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md p-2.5 transition-colors',
                          'hover:bg-accent/50',
                          isSelected && 'bg-primary/10'
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                          {d.description && (
                            <p className="truncate text-xs text-muted-foreground">
                              {d.description}
                            </p>
                          )}
                        </div>
                        <div
                          className={cn(
                            'h-4 w-4 shrink-0 rounded-full border-2',
                            isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                          )}
                        />
                      </button>
                    );
                  })
                )
              ) : loadingTeammates ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Carregando...</div>
              ) : filteredTeammates.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum colega encontrado
                </div>
              ) : (
                filteredTeammates.map((t) => {
                  const isSelected = selectedIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleMember(t.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md p-2.5 transition-colors',
                        'hover:bg-accent/50',
                        isSelected && 'bg-primary/10'
                      )}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={t.avatar_url || undefined} />
                        <AvatarFallback className="bg-muted text-xs">
                          {t.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.email}</p>
                      </div>
                      {tab === 'group' ? (
                        <Checkbox checked={isSelected} className="shrink-0" />
                      ) : (
                        <div
                          className={cn(
                            'h-4 w-4 shrink-0 rounded-full border-2',
                            isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                          )}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Tabs>

        <Button
          onClick={handleCreate}
          disabled={
            createMutation.isPending ||
            (tab === 'department'
              ? !selectedDeptId
              : selectedIds.length === 0 || (tab === 'group' && selectedIds.length < 2))
          }
          className="mt-2 w-full rounded-xl"
        >
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {tab === 'department'
            ? 'Criar Grupo do Departamento'
            : tab === 'direct'
              ? 'Iniciar Conversa'
              : `Criar Grupo (${selectedIds.length} membros)`}
        </Button>
        {tab === 'group' && selectedIds.length > 0 && selectedIds.length < 2 && (
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Selecione pelo menos 2 membros para criar um grupo
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
