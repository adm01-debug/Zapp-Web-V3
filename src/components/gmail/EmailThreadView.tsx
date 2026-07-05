import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Reply, Printer, MoreHorizontal, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { supabase as _supabase } from '@/integrations/supabase/client';
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
    if (!thread) { setMessages([]); return; }

    setIsLoading(true);
    (supabase as any)
      .from('email_messages')
      .select('*, email_attachments(*)')
      .eq('thread_id_ref', thread.id)
      .order('internal_date', { ascending: true })
      .then(({ data, error }: any) => {
        setIsLoading(false);
        if (error || !data) return;
        setMessages(data as EmailMessage[]);

        // Auto-marcar como lido
        const unreadIds = (data as EmailMessage[]).filter((m) => !m.is_read).map((m) => m.message_id);
        if (unreadIds.length > 0) {
          emailMarkRead({ accountId, messageIds: unreadIds, read: true } as any).catch(() => {});
          (supabase as any).from('email_messages').update({ is_read: true }).in('message_id', unreadIds).then(() => {}).catch(() => {});
          (supabase as any).from('email_threads').update({ unread_count: 0 }).eq('id', thread.id).then(() => {}).catch(() => {});
        }
      });
  }, [thread?.id, accountId]);

  // Realtime: novas mensagens
  useEffect(() => {
    if (!thread) return;
    const channel = supabase
      .channel(`thread_${thread.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        // Wave 2: email_messages is a VIEW in public schema — email_app.email_messages is the base table.
        // PostgreSQL views never emit WAL events, so Realtime subscriptions must target the base table.
        schema: 'email_app',
        table: 'email_messages',
        filter: `thread_id_ref=eq.${thread.id}`,
      }, payload => {
        const newMsg = payload.new as EmailMessage;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        // Auto-scroll
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [thread?.id]);

  // Auto-scroll quando mensagens carregam
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
    }
  }, [isLoading, messages.length]);

  if (!thread) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full text-muted-foreground gap-4', className)}>
        <Mail className="h-16 w-16 opacity-10" />
        <div className="text-center">
          <p className="font-semibold">Nenhuma thread selecionada</p>
          <p className="text-sm mt-1">Selecione um email na lista para visualizar</p>
        </div>
      </div>
    );
  }

  const slaRecord = getRecord(thread.thread_id);
  const slaStatus = getStatus(thread.thread_id);

  const externalEmails = messages
    .filter(m => !m.is_sent)
    .map(m => m.from_email ?? '')
    .filter(Boolean);
  const replyTo = [...new Set([...(externalEmails.slice(0, 1)), ...(thread.participant_emails ?? [])])];

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b bg-card">
        <div className="flex items-start gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-0.5" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold leading-tight truncate">
              {thread.subject || '(sem assunto)'}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] text-muted-foreground">
                {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}
              </span>
              {thread.last_message_at && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(thread.last_message_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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
                  <Reply className="h-4 w-4 mr-2" />Responder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" />Imprimir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Labels */}
        {thread.label_ids.filter(l => !['INBOX','UNREAD','STARRED','SENT'].includes(l)).length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap pl-11">
            {thread.label_ids
              .filter(l => !['INBOX','UNREAD','STARRED','SENT'].includes(l))
              .map(l => (
                <Badge key={l} variant="secondary" className="text-[10px] h-4 px-1.5">{l}</Badge>
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
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
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
            className="gap-2 w-full h-9"
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
