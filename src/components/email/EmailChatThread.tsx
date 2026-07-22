
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
import { useEmailSLA } from '@/hooks/useEmailManagement';

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
    .filter((m) => !m.is_sent)
    .map((m) => m.from_email ?? '')
    .filter(Boolean);
  const replyTo =
    externalEmails.length > 0 ? [externalEmails[0]] : (thread.participant_emails ?? []);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex h-[70px] flex-col justify-center border-b border-border/10 bg-background/80 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-primary/5 md:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">
              {thread.subject || '(sem assunto)'}
            </h2>
            <div className="mt-0.5 flex h-4 items-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[hsl(var(--muted-foreground))]">
                {thread.message_count} {thread.message_count === 1 ? 'mensagem' : 'mensagens'}
              </span>
              {thread.participant_emails && thread.participant_emails.length > 0 && (
                <>
                  <span className="mx-1.5 h-1 w-1 rounded-full bg-border" />
                  <span className="max-w-md truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-[hsl(var(--muted-foreground))]">
                    {thread.participant_emails.join(', ')}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {slaRecord && (
              <EmailSLABadge
                status={slaStatus}
                receivedAt={slaRecord.received_at}
                frtMinutes={slaRecord.frt_minutes}
                thresholdMinutes={slaRecord.sla_threshold_minutes}
              />
            )}

            {/* Labels */}
            {thread.label_ids.filter((l) => !['INBOX', 'UNREAD', 'STARRED'].includes(l)).length >
              0 && (
              <div className="flex gap-1">
                {thread.label_ids
                  .filter((l) => !['INBOX', 'UNREAD', 'STARRED'].includes(l))
                  .slice(0, 2)
                  .map((l) => (
                    <Badge
                      key={l}
                      variant="outline"
                      className="h-4.5 border-0 bg-primary/10 px-2 text-[9px] font-black uppercase tracking-widest text-primary shadow-sm"
                    >
                      {l}
                    </Badge>
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
            <div className="flex h-full flex-col space-y-6 p-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'flex max-w-[80%] flex-col gap-2',
                    i % 2 === 0 ? 'items-end self-end' : 'items-start self-start'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                  </div>
                  <div
                    className={cn(
                      'h-16 w-64 animate-pulse rounded-2xl bg-muted',
                      i % 2 === 0 ? 'rounded-tr-none' : 'rounded-tl-none'
                    )}
                  />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
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

      <div className="border-t border-border/10 bg-background/80 backdrop-blur-xl">
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
