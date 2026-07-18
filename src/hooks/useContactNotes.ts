import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactNotes');

export interface ContactNote {
  id: string;
  contact_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles?: { id: string; name: string; avatar_url: string | null } | null;
}

export function useContactNotes(contactId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['contact-notes', contactId],
    queryFn: async () => {
      if (!contactId || !user) return [];
      const { data, error } = await supabase
        .from('contact_notes')
        .select('*, profiles(id, name, avatar_url)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactNote[];
    },
    enabled: !!contactId && !!user,
  });

  const addNote = useMutation({
    mutationFn: async (content: string) => {
      if (!contactId || !user) return null;
      const { data, error } = await supabase
        .from('contact_notes')
        .insert({ contact_id: contactId, author_id: user.id, content })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
    },
    onError: (err: Error) => log.error('Error adding note:', err),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('contact_notes')
        .update({ content })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
    },
    onError: (err: Error) => log.error('Error updating note:', err),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contact_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
    },
    onError: (err: Error) => log.error('Error deleting note:', err),
  });

  return {
    notes,
    isLoading,
    addNote,
    updateNote,
    deleteNote,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] }),
  };
}
