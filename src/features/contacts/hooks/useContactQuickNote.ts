/**
 * useContactQuickNote.ts — Quick note CRUD for contacts on EXTERNAL CRM database
 *
 * FIXED: Now uses contactsDB bridge (external DB) instead of Lovable Cloud.
 * Notes are stored in `contact_notes` table on the GESTÃO DE CLIENTES database.
 */
import { useState, useCallback } from 'react';
import { contactsDB, type ContactNote } from '@/lib/contactsDB';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactQuickNote');

export function useContactQuickNote(contactId: string | undefined, userId: string | undefined) {
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!contactId || !isExternalConfigured) return;
    setIsLoading(true);
    try {
      const data = await contactsDB.notes.list(contactId);
      setNotes(data);
    } catch (err) {
      log.error('Error loading contact notes', err);
    } finally {
      setIsLoading(false);
    }
  }, [contactId]);

  const addNote = useCallback(async (content: string, noteType = 'quick') => {
    if (!contactId || !userId || !content.trim()) return null;
    setIsSaving(true);
    try {
      const note = await contactsDB.notes.create({
        contact_id: contactId,
        user_id: userId,
        content: content.trim(),
        note_type: noteType,
      });
      setNotes(prev => [note, ...prev]);
      toast.success('Nota salva');
      return note;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar nota';
      toast.error(msg);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [contactId, userId]);

  const updateNote = useCallback(async (noteId: string, content: string) => {
    if (!content.trim()) return;
    try {
      await contactsDB.notes.update(noteId, content.trim());
      setNotes(prev =>
        prev.map(n => n.id === noteId ? { ...n, content: content.trim(), updated_at: new Date().toISOString() } : n)
      );
      toast.success('Nota atualizada');
    } catch (err) {
      toast.error('Erro ao atualizar nota');
    }
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      await contactsDB.notes.delete(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast.success('Nota removida');
    } catch (err) {
      toast.error('Erro ao remover nota');
    }
  }, []);

  return {
    notes,
    isLoading,
    isSaving,
    loadNotes,
    addNote,
    updateNote,
    deleteNote,
    isConfigured: isExternalConfigured,
  };
}
