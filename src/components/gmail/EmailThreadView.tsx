import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Reply, Printer, MoreHorizontal, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { supabase as _supabase } from '@/integrations/supabase/client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;
import { type EmailMessage, type EmailThread } from '@/hooks/gmail/gmailTypes';
import { EmailChatBubble } from '../email/EmailChatBubble';
import { EmailSLABadge, SLAProgressBar } from '../email/EmailSLABadge';
import { EmailChatReplyBar } from '../email/EmailChatReplyBar';
import { useEmailSLA } from '@/hooks/useEmailSLA';
import { emailMarkRead } from '@/hooks/gmail/gmailApi';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EmailThreadViewProps {
  thread: EmailThread | null;
  accountId: string;
  onBack?: () => void;
  className?: string;
}

export function EmailThreadView({ thread, accountId, onBack, className }: EmailThreadViewProps) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [replyMode, setReplyMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { getRecord, getStatus, markReplied } = useEmailSLA(accountId);

  // Carrega mensagens da thread selecionada
  useEffect(() => {
    if (!thread) {
      setMessages([]);
      return;
    }

    setIsLoading(true);
    supabase
      .from('email_messages')
      .select('*, email_attachments(*)')
      .eq('thread_id_ref', thread.id)
      .order('internal_date', { ascending: true })
      .then(({ data, error }: { data: EmailMessage[] | null; error: unknown }) => {
        setIsLoading(false);
        if (error || !data) return;
        setMessages(data as EmailMessage[]);

        // Auto-marcar como lido
        const unreadIds = (data as EmailMessage[])
          .filter((m) => !m.is_read)
          .map((m) => m.message_id);
        if (unreadIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          emailMarkRead({ accountId, messageIds: unreadIds, read: true } as any).catch(
            (e: unknown) => {
              console.warn('[EmailThreadView] auto-mark-read failed:', e);
            }
          );
          void supabase
            .from('email_messages')
            .update({ is_read: true })
            .in('message_id', unreadIds)
            .then();
          void supabase
            .from('email_threads')
            .update({ unread_count: 0 })
            .eq('id', thread.id)
            .then();
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, accountId]);

  // Realtime: novas mensagens
  useEffect(() => {
    if (!thread) return;
    const channel = supabase
      .channel(`thread_${thread.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'email_messages',
          filter: `thread_id_ref=eq.${thread.id}`,
        },
        (payload) => {
          const newMsg = payload.new as EmailMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Auto-scroll
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  // Auto-scroll quando mensagens carregam
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
    }
  }, [isLoading, messages.length]);

  if (!thread) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-4 text-muted-foreground',
          className
        )}
      >
        <Mail className="h-16 w-16 opacity-10" />
        <div className="text-center">
          <p className="font-semibold">Nenhuma thread selecionada</p>
          <p className="mt-1 text-sm">Selecione um email na lista para visualizar</p>
        </div>
      </div>
    );
  }

  const slaRecord = getRecord(thread.thread_id);
  const slaStatus = getStatus(thread.thread_id);

  const externalEmails = messages
    .filter((m) => !m.is_sent)
    .map((m) => m.from_email ?? '')
    .filter(Boolean);
  const replyTo = [
    ...new Set([...externalEmails.slice(0, 1), ...(thread.participant_emails ?? [])]),
  ];

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', className)}>
      {/* Header */}
      <div className="flex-none border-b bg-card px-4 py-3">
        <div className="flex items-start gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 h-8 w-8 shrink-0"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold leading-tight">
              {thread.subject || '(sem assunto)'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}
              </span>
              {thread.last_message_at && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(thread.last_message_at), "dd 'de' MMM, HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {slaRecord && (
              <EmailSLABadge
                status={slaStatus}
                receivedAt={slaRecord.received_at}
                frtMinutes={slaRecord.frt_minutes}
                thresholdMinutes={slaRecord.sla_threshold_minutes}
              />
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setReplyMode(true)}>
                  <Reply className="mr-2 h-4 w-4" />
                  Responder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Labels */}
        {thread.label_ids.filter((l) => !['INBOX', 'UNREAD', 'STARRED', 'SENT'].includes(l))
          .length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 pl-11">
            {thread.label_ids
              .filter((l) => !['INBOX', 'UNREAD', 'STARRED', 'SENT'].includes(l))
              .map((l) => (
                <Badge key={l} variant="secondary" className="h-4 px-1.5 text-[10px]">
                  {l}
                </Badge>
              ))}
          </div>
        )}

        {/* SLA progress */}
        {slaRecord && !slaRecord.first_reply_at && (
          <SLAProgressBar
            receivedAt={slaRecord.received_at}
            thresholdMinutes={slaRecord.sla_threshold_minutes}
            className="mt-2 pl-11"
          />
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Mail className="h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhuma mensagem nesta thread</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40 pb-4">
            {messages.map((msg, idx) => (
              <EmailChatBubble
                key={msg.id}
                message={msg}
                accountId={accountId}
                slaStatus={idx === 0 ? slaStatus : null}
                isFirst={idx === messages.length - 1}
                onReply={() => setReplyMode(true)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply bar */}
      {replyMode ? (
        <EmailChatReplyBar
          accountId={accountId}
          threadId={thread.id}
          threadEmailId={thread.thread_id}
          toEmails={replyTo}
          subject={thread.subject ?? ''}
          onSent={() => {
            setReplyMode(false);
            markReplied(thread.thread_id);
          }}
        />
      ) : (
        <div className="flex-none border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full gap-2"
            onClick={() => setReplyMode(true)}
          >
            <Reply className="h-4 w-4" />
            Responder
          </Button>
        </div>
      )}
    </div>
  );
}
