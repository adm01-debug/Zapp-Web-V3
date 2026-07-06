import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Eye, EyeOff, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioRecorder } from './AudioRecorder';
import { WhisperAudioPlayer } from './WhisperAudioPlayer';

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

export function WhisperMode({ contactId, targetAgentId, className, defaultExpanded = false }: WhisperModeProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contactIsUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId ?? '');

  const { data: whispers = [], isLoading } = useQuery<WhisperMessage[]>({
    queryKey: ['whispers', contactId],
    queryFn: async () => {
      if (!contactIsUUID) return [];
      const { data, error } = await (supabase as any) /* TS2589: schema 678 */
        .from('whisper_messages')
        .select('*, sender:profiles!whisper_messages_sender_id_fkey(name, avatar_url)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return ((data || []) as unknown) as WhisperMessage[];
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
      const { error } = await supabase.from('whisper_messages').insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
    },
    onError: (err) => {
      toast.error('Erro ao enviar whisper: ' + (err as Error).message);
    },
  });

  useEffect(() => {
    if (!contactIsUUID) return;
    const channel = supabase
      .channel(`whisper-${contactId}`)
      // Wave 1: whisper_messages is a view in public — repoint to zapp base table
      .on('postgres_changes', { event: 'INSERT', schema: 'zapp', table: 'whisper_messages', filter: `contact_id=eq.${contactId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
        setIsExpanded(true);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className={cn('flex flex-col rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-t-lg transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" />
          <span>Modo Whisper</span>
          {whispers.length > 0 && (
            <span className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              {whispers.length}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {isExpanded && (
        <div className="flex flex-col">
          <div className="flex-1 overflow-y-auto max-h-40 p-2 space-y-1.5">
            {isLoading ? (
              <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-amber-500" /></div>
            ) : whispers.length === 0 ? (
              <p className="text-center text-xs text-amber-600 dark:text-amber-400 py-2">Nenhuma mensagem interna ainda</p>
            ) : (
              whispers.map((w) => (
                <div key={w.id} className={cn('flex flex-col gap-0.5', w.sender_id === profile?.id ? 'items-end' : 'items-start')}>
                  <div className={cn(
                    'max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs',
                    w.sender_id === profile?.id
                      ? 'bg-amber-300 dark:bg-amber-700 text-amber-900 dark:text-amber-100'
                      : 'bg-white dark:bg-amber-900 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700'
                  )}>
                    {w.sender && w.sender_id !== profile?.id && (
                      <p className="font-semibold text-[10px] text-amber-600 dark:text-amber-400 mb-0.5">{w.sender.name}</p>
                    )}
                    {w.audio_url ? (
                      <WhisperAudioPlayer audioUrl={w.audio_url} />
                    ) : (
                      <p className="break-words">{w.content}</p>
                    )}
                    <p className="text-[10px] opacity-60 mt-0.5">{format(new Date(w.created_at), 'HH:mm', { locale: ptBR })}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-amber-200 dark:border-amber-800 p-2 flex gap-1.5">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Mensagem interna (visível só para a equipe)..."
              className="resize-none text-xs min-h-[36px] max-h-24 flex-1 border-amber-200 dark:border-amber-700 bg-white dark:bg-amber-900 focus:ring-amber-300"
              rows={1}
            />
            <div className="flex flex-col gap-1">
              <AudioRecorder
                onAudioReady={async (blob) => {
                  const fileName = `whisper-${Date.now()}.webm`;
                  const { data, error } = await supabase.storage
                    .from('audio-messages')
                    .upload(`whispers/${fileName}`, blob, { contentType: 'audio/webm' });
                  if (error) { toast.error('Erro ao enviar áudio'); return; }
                  const { data: { publicUrl } } = supabase.storage.from('audio-messages').getPublicUrl(data.path);
                  sendWhisper.mutate({ audioUrl: publicUrl });
                }}
              />
              <Button
                size="icon"
                className="w-8 h-8 bg-amber-500 hover:bg-amber-600 text-white shrink-0"
                onClick={handleSend}
                disabled={!message.trim() || sendWhisper.isPending}
              >
                {sendWhisper.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
