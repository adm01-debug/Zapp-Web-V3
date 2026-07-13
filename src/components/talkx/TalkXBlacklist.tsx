import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';
import { ShieldBan, Trash2, Plus, Search, UserX, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface BlacklistEntry {
  id: string;
  contact_id: string;
  reason: string | null;
  created_at: string;
  contacts: {
    name: string;
    phone: string;
    company: string | null;
    avatar_url: string | null;
  } | null;
}

const OPT_OUT_REASONS = [
  'Solicitação do cliente',
  'Número inválido / bounce',
  'Reclamação de spam',
  'Contato duplicado',
  'Outro',
];

export function TalkXBlacklist() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [reason, setReason] = useState(OPT_OUT_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [contactSearch, setContactSearch] = useState('');

  const { data: blacklist = [], isLoading } = useQuery({
    queryKey: ['talkx-blacklist'],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_blacklist')
        .select('*, contacts:contact_id(name, phone, company, avatar_url)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as BlacklistEntry[];
    },
    staleTime: Infinity,
  });

  const { data: availableContacts = [] } = useQuery({
    queryKey: ['contacts-for-blacklist'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, company')
        .not('phone', 'is', null)
        .order('name');
      return data || [];
    },
    enabled: showAddDialog,
    staleTime: 300_000,
  });

  const blacklistedIds = useMemo(() => new Set(blacklist.map((b) => b.contact_id)), [blacklist]);

  const filteredAvailable = useMemo(() => {
    const nonBlocked = availableContacts.filter((c) => !blacklistedIds.has(c.id));
    if (!contactSearch.trim()) return nonBlocked.slice(0, 50);
    const q = contactSearch.toLowerCase();
    return nonBlocked
      .filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q))
      .slice(0, 50);
  }, [availableContacts, blacklistedIds, contactSearch]);

  const filteredBlacklist = useMemo(() => {
    if (!search.trim()) return blacklist;
    const q = search.toLowerCase();
    return blacklist.filter(
      (b) =>
        b.contacts?.name?.toLowerCase().includes(q) ||
        b.contacts?.phone?.includes(q) ||
        b.reason?.toLowerCase().includes(q)
    );
  }, [blacklist, search]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('id').single();
      const finalReason = reason === 'Outro' ? customReason || 'Outro' : reason;
      const { error } = await fromTable('talkx_blacklist').insert({
        contact_id: selectedContactId,
        reason: finalReason,
        blocked_by: profile?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-blacklist'] });
      toast.success('Contato adicionado à lista negra');
      setShowAddDialog(false);
      setSelectedContactId('');
      setReason(OPT_OUT_REASONS[0]);
      setCustomReason('');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('talkx_blacklist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-blacklist'] });
      toast.success('Contato removido da lista negra');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldBan className="h-5 w-5 text-destructive" />
          <h3 className="font-semibold text-foreground">Lista Negra / Opt-out</h3>
          <Badge variant="secondary" className="text-[10px]">
            {blacklist.length}
          </Badge>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar à Lista Negra</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="blacklist-contact-search">Buscar contato</Label>
                <Input
                  id="blacklist-contact-search"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Nome ou telefone..."
                  className="mt-1"
                />
                <div className="mt-2 max-h-40 divide-y overflow-auto rounded-lg border">
                  {filteredAvailable.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Nenhum contato encontrado
                    </p>
                  ) : (
                    filteredAvailable.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedContactId(c.id)}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          selectedContactId === c.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                        }`}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="blacklist-reason">Motivo</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger id="blacklist-reason" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPT_OUT_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reason === 'Outro' && (
                  <Textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className="mt-2"
                    rows={2}
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!selectedContactId || addMutation.isPending}
                className="gap-1.5"
              >
                <ShieldBan className="h-4 w-4" />
                Bloquear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {blacklist.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar na lista negra"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na lista negra..."
            className="h-9 pl-9 text-sm"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex animate-pulse items-center gap-3 rounded-xl bg-muted/30 p-3"
            >
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="h-3 w-1/4 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredBlacklist.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-8">
            <UserX className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search ? 'Nenhum resultado' : 'Nenhum contato na lista negra'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filteredBlacklist.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-border/50 p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">
                {entry.contacts?.avatar_url ? (
                  <img
                    src={entry.contacts.avatar_url}
                    alt=""
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  (entry.contacts?.name || '?')[0].toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.contacts?.name}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{entry.contacts?.phone}</span>
                  {entry.reason && (
                    <Badge variant="outline" className="h-4 text-[9px]">
                      {entry.reason}
                    </Badge>
                  )}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    aria-label="Remover da lista negra"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover da lista negra?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {entry.contacts?.name} poderá receber mensagens do Talk X novamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => removeMutation.mutate(entry.id)}>
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-destructive/10 bg-destructive/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="text-xs text-muted-foreground">
          Contatos na lista negra são automaticamente excluídos de todos os disparos do Talk X.
        </p>
      </div>
    </div>
  );
}
