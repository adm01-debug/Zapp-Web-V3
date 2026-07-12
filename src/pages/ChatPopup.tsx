// @ts-nocheck
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useMessages } from '@/features/inbox';
import { Conversation } from '@/types/chat';
import { log } from '@/lib/logger';

type ContactRow = Tables<'contacts'>;
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { dbFrom } from '@/integrations/datasource/db';
import { Minus, Maximize2, Minimize2, X, MessageSquare } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const ChatPanel = lazy(() => import('@/features/inbox').then((m) => ({ default: m.ChatPanel })));

export default function ChatPopup() {
  const { contactId } = useParams<{ contactId: string }>();
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const { messages } = useMessages({
    contactId: contactId || '',
    enabled: !!contactId,
  });

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('contacts').select('*').eq('id', contactId).single();
      if (cancelled) return;
      if (data) {
        setContact(data);
        document.title = `Chat — ${data.name}`;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const conversation: Conversation | null = contact
    ? {
        id: contactId!,
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          avatar: contact.avatar_url || undefined,
          email: contact.email || undefined,
          tags: contact.tags || [],
          createdAt: new Date(contact.created_at),
        },
        status: 'open',
        lastMessage: undefined,
        unreadCount: 0,
        tags: contact.tags || [],
        priority: contact.ai_priority === 'high' ? 'high' : 'medium',
        createdAt: new Date(contact.created_at),
        updatedAt: new Date(contact.updated_at),
        assignedTo: undefined,
      }
    : null;

  const legacyMessages = messages;

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!contactId) return;
      await dbFrom('messages').insert({
        contact_id: contactId,
        content,
        sender: 'agent',
        message_type: 'text',
      });
    },
    [contactId]
  );

  const handleSendAudio = useCallback(
    async (blob: Blob) => {
      if (!contactId) return;
      try {
        const fileName = `audio_${contactId}_${Date.now()}.webm`;
        const { error: uploadError } = await supabase.storage
          .from('whatsapp-media')
          .upload(fileName, blob, { contentType: blob.type || 'audio/webm' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);

        await dbFrom('messages').insert({
          contact_id: contactId,
          content: '🎵 Mensagem de áudio',
          sender: 'agent',
          message_type: 'audio',
          media_url: urlData.publicUrl,
        });
      } catch (err) {
        log.error('Failed to send audio from popup:', err);
      }
    },
    [contactId]
  );

  const handleClose = () => window.close();

  const handleToggleMaximize = () => {
    if (isMaximized) {
      window.resizeTo(440, 680);
      setIsMaximized(false);
    } else {
      window.resizeTo(screen.availWidth, screen.availHeight);
      window.moveTo(0, 0);
      setIsMaximized(true);
    }
  };

  // ── Loading State ──
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="absolute inset-0 animate-pulse rounded-full border-2 border-primary/20" />
          </div>
          <div className="space-y-2 text-center">
            <Skeleton className="mx-auto h-4 w-28" />
            <Skeleton className="mx-auto h-3 w-20" />
          </div>
        </div>
      </div>
    );
  }

  // ── Not Found ──
  if (!contact || !conversation) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Contato não encontrado</p>
        <Button variant="outline" size="sm" onClick={handleClose}>
          Fechar janela
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        {/* ── Thin Window Controls Bar ── */}
        <div className="flex h-8 shrink-0 select-none items-center justify-end border-b border-border/50 bg-card/60 px-2">
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                  onClick={() => window.resizeTo(440, 48)}
                  aria-label="Minimizar janela"
                >
                  <Minus className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Minimizar
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                  onClick={handleToggleMaximize}
                  aria-label={isMaximized ? 'Restaurar janela' : 'Maximizar janela'}
                >
                  {isMaximized ? (
                    <Minimize2 className="h-3 w-3" />
                  ) : (
                    <Maximize2 className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isMaximized ? 'Restaurar' : 'Maximizar'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded text-muted-foreground hover:text-destructive"
                  onClick={handleClose}
                  aria-label="Fechar janela"
                >
                  <X className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Fechar
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Full Chat Content (with full header & all features) ── */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  <span className="text-xs text-muted-foreground">Carregando conversa...</span>
                </div>
              </div>
            }
          >
            <ChatPanel
              key={contactId}
              conversation={conversation}
              messages={legacyMessages}
              onSendMessage={handleSendMessage}
              onSendAudio={handleSendAudio}
            />
          </Suspense>
        </div>
      </div>
    </TooltipProvider>
  );
}
