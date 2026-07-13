import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth';
import { MentionInput } from './MentionInput';

interface NoteRow {
  id: string;
  content: string;
  created_at: string;
  author?: { id?: string; name?: string; avatar_url?: string } | null;
}

export function InternalNotesPanel({ contactId }: { contactId: string }) {
  const [newNote, setNewNote] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: notes, isLoading } = useQuery<NoteRow[]>({
    queryKey: ['internal-notes', contactId],
    queryFn: async () => {
      const { data, error } = await safeClient.from<NoteRow>('contact_notes', (q) =>
        q
          .select(`id, content, created_at, author:author_id (id, name, avatar_url)`)
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(50)
      );
      if (error) throw error;
      return (data || []) as NoteRow[];
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!profile) throw new Error('Profile not found');
      const { error } = await supabase.from('contact_notes').insert({
        contact_id: contactId,
        content,
        author_id: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal-notes', contactId] });
      setNewNote('');
      toast.success('Nota adicionada!');
    },
    onError: () => toast.error('Erro ao adicionar nota'),
  });

  const renderNoteContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <Badge key={`${part}-${i}`} variant="secondary" className="mx-0.5 text-xs">
            {part}
          </Badge>
        );
      }
      return <span key={`${part}-${i}`}>{part}</span>;
    });
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          Notas Internas
          <Badge variant="secondary" className="ml-auto">
            {notes?.length || 0}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notes?.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">Nenhuma nota ainda</p>
              <p className="text-xs">Use @ para mencionar colegas</p>
            </div>
          ) : (
            <div className="space-y-3 pr-2">
              <AnimatePresence>
                {notes?.map((note, index) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="rounded-lg border bg-muted/50 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={note.author?.avatar_url} alt={note.author?.name || ''} />
                        <AvatarFallback className="text-xs">
                          {note.author?.name?.substring(0, 2).toUpperCase() || 'NA'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{note.author?.name || 'Anônimo'}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {format(new Date(note.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm">{renderNoteContent(note.content)}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
        <div className="border-t pt-2">
          <MentionInput
            value={newNote}
            onChange={setNewNote}
            onSubmit={() => newNote.trim() && addNoteMutation.mutate(newNote)}
            placeholder="Adicionar nota... (@nome para mencionar)"
            disabled={addNoteMutation.isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
