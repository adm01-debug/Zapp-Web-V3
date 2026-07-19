import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactNotes');

/** Contact Note Author interface definition. */
export interface ContactNoteAuthor {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

/** Contact Note interface definition. */
export interface ContactNote {
  id: string;
  contact_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  /** Sempre presente. Quando o autor não é encontrado, retorna um autor placeholder com id === author_id. */
  author: ContactNoteAuthor;
}

export function useContactNotes(contactId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get current user's profile
  const { data: profile } = useQuery({
    queryKey: queryKeys.userProfile.meById(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch notes for this contact
  const { data: notes = [], isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.contactDetails.notes(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_notes')
        .select(`
          id,
          contact_id,
          author_id,
          content,
          created_at,
          updated_at
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch author profiles separately
      const authorIds = [...new Set(data?.map(n => n.author_id) || [])];
      const { data: authors } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', authorIds);

      const authorsMap = new Map<string, ContactNoteAuthor>(
        (authors ?? []).map((a) => [a.id, { id: a.id, name: a.name ?? null, avatar_url: a.avatar_url ?? null }])
      );

      return (data || []).map<ContactNote>((note) => ({
        ...note,
        author: authorsMap.get(note.author_id) ?? { id: note.author_id, name: null, avatar_url: null },
      }));
    },
    enabled: !!contactId,
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!profile?.id) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('contact_notes')
        .insert({
          contact_id: contactId,
          author_id: profile.id,
          content,
        })
        .select()
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.notes(contactId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.internalNotes.contact(contactId) });
      toast({
        title: 'Nota adicionada',
        description: 'A nota foi salva com sucesso.',
      });
    },
    onError: (error) => {
      log.error('Error adding note:', error);
      toast({
        title: 'Erro ao adicionar nota',
        description: 'Não foi possível salvar a nota.',
        variant: 'destructive',
      });
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from('contact_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.notes(contactId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.internalNotes.contact(contactId) });
      toast({
        title: 'Nota removida',
        description: 'A nota foi removida com sucesso.',
      });
    },
    onError: (error) => {
      log.error('Error deleting note:', error);
      toast({
        title: 'Erro ao remover nota',
        description: 'Não foi possível remover a nota.',
        variant: 'destructive',
      });
    },
  });

  const addNote = useCallback((content: string) => {
    return addNoteMutation.mutateAsync(content);
  }, [addNoteMutation]);

  const deleteNote = useCallback((noteId: string) => {
    return deleteNoteMutation.mutateAsync(noteId);
  }, [deleteNoteMutation]);

  return {
    notes,
    isLoading,
    error,
    refetch,
    addNote,
    deleteNote,
    isAdding: addNoteMutation.isPending,
    isDeleting: deleteNoteMutation.isPending,
    currentProfileId: (profile?.id ?? null) as string | null,
  };
}