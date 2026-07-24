import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Eye, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioRecorder } from './AudioRecorder';
import { WhisperAudioPlayer } from './WhisperAudioPlayer';
import { isValidUUID } from '@/utils/uuid';

interface WhisperMessage {
  id: string;
  contact_id: string;
  sender_id: string;
  content: string | null;
  audio_url: string | null;
  created_at: string;
  sender?: { name: string; avatar_url?: string | null };
}

interface WhisperModeProps {
  contactId: string;
  targetAgentId?: string | null;
  className?: string;
  defaultExpanded?: boolean;
}

/** Collapsible compose panel for sending private whisper messages to a specific agent within a conversation. */
export function WhisperMode({
  contactId,
  targetAgentId,
  className,
  defaultExpanded = false,
}: WhisperModeProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contactIsUUID = isValidUUID(contactId ?? '');

  const { data: whispers = [], isLoading } = useQuery<WhisperMessage[]>({
    queryKey: queryKeys.whispers.contact(contactId),
    queryFn: async () => {
      if (!contactIsUUID) return [];
      const { data, error } = await safeClient.from<WhisperMessage>('whisper_messages', (q) =>
        q
          .select('*, sender:profiles!whisper_messages_sender_id_fkey(name, avatar_url)')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: true })
          .limit(50)
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId && !!profile && contactIsUUID,
    refetchOnWindowFocus: false,
  });

  const sendWhisper = useMutation({
    mutationFn: async ({ content, audioUrl }: { content?: string; audioUrl?: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      const payload = {
        contact_id: contactId,
        sender_id: profile.id,
        target_agent_id: targetAgentId ?? profile.id,
        content: content ?? null,
        audio_url: audioUrl ?? null,
      };
      const { error } = await safeClient.from('whisper_messages', (q) => q.insert(payload));
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: queryKeys.whispers.contact(contactId) });
    },
    onError: (err) => {
      toast.error('Erro ao enviar whisper: ' + (err as Error).message);
    },
  });

  useEffect(() => {
    if (!contactIsUUID) return;
    const channel = supabase
      .channel(`whisper-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'zapp',
          table: 'whisper_messages',
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.whispers.contact(contactId) });
          setIsExpanded(true);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [contactId, queryClient, contactIsUUID]);

  useEffect(() => {
    if (isExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [whispers, isExpanded]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendWhisper.mutate({ content: trimmed });
  }, [message, sendWhisper]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
        className
      )}
    >
      <button type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between rounded-t-lg px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
      >
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" />
          <span>Modo Whisper</span>
          {whispers.length > 0 && (
            <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-800 dark:text-amber-200">
              {whispers.length}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {isExpanded && (
        <div className="flex flex-col">
          <div className="max-h-40 flex-1 space-y-1.5 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              </div>
            ) : whispers.length === 0 ? (
              <p className="py-2 text-center text-xs text-amber-600 dark:text-amber-400">
                Nenhuma mensagem interna ainda
              </p>
            ) : (
              whispers.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    'flex flex-col gap-0.5',
                    w.sender_id === profile?.id ? 'items-end' : 'items-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs',
                      w.sender_id === profile?.id
                        ? 'bg-amber-300 text-amber-900 dark:bg-amber-700 dark:text-amber-100'
                        : 'border border-amber-200 bg-card text-amber-800 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200'
                    )}
                  >
                    {w.sender && w.sender_id !== profile?.id && (
                      <p className="mb-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        {w.sender.name}
                      </p>
                    )}
                    {w.audio_url ? (
                      <WhisperAudioPlayer audioUrl={w.audio_url} />
                    ) : (
                      <p className="break-words">{w.content}</p>
                    )}
                    <p className="mt-0.5 text-[10px] opacity-60">
                      {format(new Date(w.created_at), 'HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex gap-1.5 border-t border-amber-200 p-2 dark:border-amber-800">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Mensagem interna (visível só para a equipe)..."
              className="max-h-24 min-h-[36px] flex-1 resize-none border-amber-200 bg-card text-xs focus:ring-amber-300 dark:border-amber-700 dark:bg-amber-900"
              rows={1}
            />
            <div className="flex flex-col gap-1">
              <AudioRecorder
                onAudioReady={async (blob) => {
                  const fileName = `whisper-${Date.now()}.webm`;
                  const { data, error } = await supabase.storage
                    .from('audio-messages')
                    .upload(`whispers/${fileName}`, blob, { contentType: 'audio/webm' });
                  if (error) {
                    toast.error('Erro ao enviar áudio');
                    return;
                  }
                  const {
                    data: { publicUrl },
                  } = supabase.storage.from('audio-messages').getPublicUrl(data.path);
                  sendWhisper.mutate({ audioUrl: publicUrl });
                }}
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 bg-warning text-warning-foreground hover:bg-warning/90"
                aria-label="Enviar sussurro"
                onClick={handleSend}
                disabled={!message.trim() || sendWhisper.isPending}
              >
                {sendWhisper.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
