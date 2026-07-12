import { useRef, useEffect } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { type EmailThread, type EmailMessage } from '@/hooks/gmail/gmailTypes';
import { EmailChatBubble } from './EmailChatBubble';
import { EmailChatReplyBar } from './EmailChatReplyBar';
import { EmailSLABadge, SLAProgressBar } from './EmailSLABadge';
import { useEmailSLA } from '@/hooks/useEmailSLA';

interface EmailChatThreadProps {
  thread: EmailThread;
  messages: EmailMessage[];
  accountId: string;
  isLoading: boolean;
  onBack?: () => void;
  className?: string;
}

export function EmailChatThread({
  thread,
  messages,
  accountId,
  isLoading,
  onBack,
  className,
}: EmailChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { getRecord, getStatus, markReplied } = useEmailSLA(accountId);

  const slaRecord = getRecord(thread.thread_id);
  const slaStatus = getStatus(thread.thread_id);

  // Auto-scroll para o final ao carregar novas mensagens
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isLoading]);

  // Recebe emails dos participantes para reply
  const externalEmails = messages
    .filter(m => !m.is_sent)
    .map(m => m.from_email ?? '')
    .filter(Boolean);
  const replyTo = externalEmails.length > 0 ? [externalEmails[0]] : thread.participant_emails ?? [];

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/10 bg-background/80 backdrop-blur-xl sticky top-0 z-10 shadow-sm h-[70px] flex flex-col justify-center">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button aria-label="Voltar" variant="ghost" size="icon" className="w-8 h-8 md:hidden rounded-full hover:bg-primary/5" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="flex-1 min-w-0">
            <h2 className=" font-bold text-[15px] text-foreground truncate tracking-tight leading-tight">
              {thread.subject || '(sem assunto)'}
            </h2>
            <div className="flex items-center h-4 mt-0.5">
              <span className=" text-[11px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-[0.04em]">
                {thread.message_count} {thread.message_count === 1 ? 'mensagem' : 'mensagens'}
              </span>
              {thread.participant_emails && thread.participant_emails.length > 0 && (
                <>
                  <span className="mx-1.5 w-1 h-1 rounded-full bg-border" />
                  <span className=" text-[11px] text-[hsl(var(--muted-foreground))] font-semibold truncate max-w-md uppercase tracking-[0.04em]">
                    {thread.participant_emails.join(', ')}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {slaRecord && (
              <EmailSLABadge
                status={slaStatus}
                receivedAt={slaRecord.received_at}
                frtMinutes={slaRecord.frt_minutes}
                thresholdMinutes={slaRecord.sla_threshold_minutes}
              />
            )}
            
            {/* Labels */}
            {thread.label_ids.filter(l => !['INBOX','UNREAD','STARRED'].includes(l)).length > 0 && (
              <div className="flex gap-1">
                {thread.label_ids
                  .filter(l => !['INBOX','UNREAD','STARRED'].includes(l))
                  .slice(0, 2)
                  .map(l => (
                    <Badge key={l} variant="outline" className="text-[9px] h-4.5 px-2 font-black uppercase tracking-widest border-0 bg-primary/10 text-primary shadow-sm">{l}</Badge>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* SLA Progress Overlay */}
        {slaRecord && !slaRecord.first_reply_at && (
          <div className="absolute bottom-0 left-0 right-0">
            <SLAProgressBar
              receivedAt={slaRecord.received_at}
              thresholdMinutes={slaRecord.sla_threshold_minutes}
              className="h-0.5 rounded-none bg-transparent"
            />
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/20 bg-background/30">
          {isLoading ? (
            <div className="flex flex-col h-full p-4 space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className={cn("flex flex-col gap-2 max-w-[80%]", i % 2 === 0 ? "self-end items-end" : "self-start items-start")}>
                  <div className="flex gap-2 items-center">
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                  </div>
                  <div className={cn("h-16 w-64 bg-muted animate-pulse rounded-2xl", i % 2 === 0 ? "rounded-tr-none" : "rounded-tl-none")} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              <Mail className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhuma mensagem</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <EmailChatBubble
                key={msg.id}
                message={msg}
                accountId={accountId}
                slaStatus={idx === 0 ? slaStatus : null}
                isFirst={idx === messages.length - 1}
                onReply={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="bg-background/80 backdrop-blur-xl border-t border-border/10">
        <EmailChatReplyBar
          accountId={accountId}
          threadId={thread.id}
          threadEmailId={thread.thread_id}
          toEmails={replyTo}
          subject={thread.subject ?? ''}
          onSent={() => {
            markReplied(thread.thread_id);
          }}
          className="border-none"
        />
      </div>
    </div>
  );
}
