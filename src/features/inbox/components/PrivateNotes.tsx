import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyNote, Plus, Trash2, Send, Loader2, AlertCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useContactNotes } from '@/hooks/useContactNotes';

interface PrivateNotesProps {
  contactId: string;
}

export function PrivateNotes({ contactId }: PrivateNotesProps) {
  const {
    notes,
    isLoading,
    error: loadError,
    refetch,
    addNote,
    deleteNote,
    isAdding: isSaving,
    isDeleting,
    currentProfileId,
  } = useContactNotes(contactId);
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleAddNote = async () => {
    const content = newNote.trim();
    if (!content) return;
    setAddError(null);
    try {
      await addNote(content);
      setNewNote('');
      setIsAddingNote(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Não foi possível salvar a nota.');
    }
  };

  const handleDeleteNote = async (id: string) => {
    setDeleteError(null);
    setDeletingId(id);
    try {
      await deleteNote(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível remover a nota.');
    } finally {
      setDeletingId((curr) => (curr === id ? null : curr));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <StickyNote className="w-4 h-4" />
          <span>Notas Privadas</span>
          <Loader2 className="w-3 h-3 animate-spin ml-1" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <StickyNote className="w-4 h-4" />
          <span>Notas Privadas</span>
        </div>
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Erro ao carregar notas</p>
            <p className="text-destructive/80 mt-0.5">
              {loadError instanceof Error ? loadError.message : 'Tente novamente.'}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <StickyNote className="w-4 h-4" />
          <span>Notas Privadas</span>
        </div>
        {!isAddingNote && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsAddingNote(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              Nova nota
            </Button>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isAddingNote && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <Textarea
              placeholder="Adicione uma nota privada (visível apenas para atendentes)..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              autoFocus
              disabled={isSaving}
              aria-invalid={!!addError}
              aria-describedby={addError ? 'private-notes-add-error' : undefined}
            />
            {addError && (
              <div
                id="private-notes-add-error"
                role="alert"
                className="flex items-start gap-2 p-2 rounded-md border border-destructive/40 bg-destructive/5 text-xs text-destructive"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="flex-1">{addError}</span>
                <button
                  type="button"
                  onClick={() => setAddError(null)}
                  className="hover:opacity-70"
                  aria-label="Fechar mensagem de erro"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAddingNote(false);
                  setNewNote('');
                  setAddError(null);
                }}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!newNote.trim() || isSaving}
                className="bg-whatsapp hover:bg-whatsapp-dark"
                aria-busy={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" aria-hidden="true" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3 mr-1" aria-hidden="true" />
                    Salvar
                  </>
                )}
              </Button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
        <AnimatePresence>
          {notes.map((note, index) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: index * 0.05 }}
              className="group p-3 bg-muted/50 rounded-lg border border-border/50 hover:border-border transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground flex-1">{note.content}</p>
                {note.author_id === currentProfileId && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDeleteNote(note.id)}
                    disabled={isDeleting}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </motion.button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Avatar className="w-4 h-4">
                  <AvatarImage src={note.author?.avatar_url || undefined} alt={note.author?.name || ""} />
                  <AvatarFallback className="text-[8px]">
                    {note.author?.name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-muted-foreground">
                  {note.author?.name || 'Desconhecido'} • {format(new Date(note.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {notes.length === 0 && !isAddingNote && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma nota adicionada
          </p>
        )}
      </div>
    </div>
  );
}
