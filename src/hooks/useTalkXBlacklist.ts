import { useMemo } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';

export interface BlacklistEntry {
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

export function useTalkXBlacklist(showAddDialog: boolean) {
  const queryClient = useQueryClient();

  const { data: blacklist = [], isLoading } = useQuery({
    queryKey: queryKeys.talkx.blacklist(),
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
    queryKey: queryKeys.talkx.contactsForBlacklist(),
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

  const addMutation = useMutation({
    mutationFn: async ({
      contactId,
      reason,
    }: {
      contactId: string;
      reason: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle();
      const { error } = await fromTable('talkx_blacklist').insert({
        contact_id: contactId,
        reason,
        blocked_by: profile?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.talkx.blacklist() });
      toast.success('Contato adicionado à lista negra');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('talkx_blacklist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.talkx.blacklist() });
      toast.success('Contato removido da lista negra');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { blacklist, isLoading, availableContacts, blacklistedIds, addMutation, removeMutation };
}
