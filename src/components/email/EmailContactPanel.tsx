import { useState } from 'react';
import { User, Mail, Tag, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type EmailThread, type EmailMessage } from '@/hooks/gmail/gmailTypes';
import { EmailSLABadge, SLAProgressBar } from './EmailSLABadge';
import { useEmailSLA } from '@/hooks/useEmailSLA';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getInitialsFromNameOrEmail } from '@/lib/formatters';

interface EmailContactPanelProps {
  thread: EmailThread | null;
  messages: EmailMessage[];
  accountId: string | null;
  className?: string;
}


function getAvatarColor(email: string | null): string {
  const colors = ['bg-primary','bg-primary','bg-primary','bg-warning','bg-destructive'];
  const code = (email ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[code % colors.length];
}

export function EmailContactPanel({ thread, messages, accountId, className }: EmailContactPanelProps) {
  const [showAllMessages, setShowAllMessages] = useState(false);
  const { getRecord, getStatus } = useEmailSLA(accountId);

  if (!thread) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-6', className)}>
        <User className="h-10 w-10 opacity-20" />
        <p className="text-sm">Selecione um email para ver os detalhes</p>
      </div>
    );
  }

  // Participante principal (remetente do primeiro email recebido)
  const firstReceived = messages.find(m => !m.is_sent);
  const fromName = firstReceived?.from_name ?? null;
  const fromEmail = firstReceived?.from_email ?? thread.participant_emails?.[0] ?? '';

  const slaRecord = getRecord(thread.thread_id);
  const slaStatus = getStatus(thread.thread_id);

  // Contagem de mensagens enviadas/recebidas
  const sentCount     = messages.filter(m => m.is_sent).length;
  const receivedCount = messages.filter(m => !m.is_sent).length;

  const recentMessages = showAllMessages ? messages : messages.slice(-5);

  return (
    <div className={cn('flex flex-col h-full overflow-y-auto', className)}>
      {/* Contact header */}
      <div className="p-4 text-center border-b">
        <Avatar className="h-14 w-14 mx-auto mb-3">
          <AvatarFallback className={cn('text-foreground text-lg font-semibold', getAvatarColor(fromEmail))}>
            {getInitialsFromNameOrEmail(fromName, fromEmail)}
          </AvatarFallback>
        </Avatar>
        {fromName && <h3 className="font-semibold text-sm">{fromName}</h3>}
        <a
          href={`mailto:${fromEmail}`}
          className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center gap-1 mt-0.5"
        >
          <Mail className="h-3 w-3" />
          <span>{fromEmail}</span>
        </a>
      </div>

      <div className="flex-1 space-y-4 p-4">
        {/* SLA info */}
        {slaRecord && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">SLA</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <EmailSLABadge
                  status={slaStatus}
                  receivedAt={slaRecord.received_at}
                  frtMinutes={slaRecord.frt_minutes}
                  thresholdMinutes={slaRecord.sla_threshold_minutes}
                />
              </div>
              {!slaRecord.first_reply_at && (
                <SLAProgressBar
                  receivedAt={slaRecord.received_at}
                  thresholdMinutes={slaRecord.sla_threshold_minutes}
                />
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Recebido</span>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="font-medium">
                      {formatDistanceToNow(new Date(slaRecord.received_at), { locale: ptBR, addSuffix: true })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {format(new Date(slaRecord.received_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TooltipContent>
                </Tooltip>
              </div>
              {slaRecord.frt_minutes != null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">1ª resposta em</span>
                  <span className="font-medium text-primary">
                    {slaRecord.frt_minutes}min
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        <Separator />

        {/* Thread info */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Thread</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Assunto</span>
              <span className="font-medium text-right max-w-32 truncate">{thread.subject || '(sem assunto)'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Mensagens</span>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{receivedCount} recebidos</Badge>
                  </TooltipTrigger>
                  <TooltipContent>Mensagens recebidas</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">{sentCount} enviados</Badge>
                  </TooltipTrigger>
                  <TooltipContent>Mensagens enviadas</TooltipContent>
                </Tooltip>
              </div>
            </div>
            {thread.last_message_at && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Última atividade</span>
                <span className="font-medium">
                  {formatDistanceToNow(new Date(thread.last_message_at), { locale: ptBR, addSuffix: true })}
                </span>
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* Participantes */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Participantes</h4>
          <div className="space-y-2">
            {(thread.participant_emails ?? []).map(email => (
              <div key={email} className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className={cn('text-foreground text-[10px]', getAvatarColor(email))}>
                    {email[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs truncate">{email}</span>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Labels */}
        {thread.label_ids.filter(l => !['INBOX','UNREAD','STARRED','SENT'].includes(l)).length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Labels</h4>
            <div className="flex flex-wrap gap-1">
              {thread.label_ids
                .filter(l => !['INBOX','UNREAD','STARRED','SENT'].includes(l))
                .map(l => (
                  <Badge key={l} variant="outline" className="text-[10px] h-5 px-2">
                    <Tag className="h-2.5 w-2.5 mr-1" />
                    {l}
                  </Badge>
                ))}
            </div>
          </section>
        )}

        <Separator />

        {/* Histórico resumido */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico</h4>
            {messages.length > 5 && (
              <button
                className="text-[10px] text-primary hover:underline"
                onClick={() => setShowAllMessages(v => !v)}
              >
                {showAllMessages ? 'Ver menos' : `Ver todos (${messages.length})`}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {recentMessages.map(msg => (
              <div key={msg.id} className={cn('flex items-start gap-2 text-xs rounded-md px-2 py-1.5', msg.is_sent ? 'bg-primary/5' : 'bg-muted/40')}>
                <MessageSquare className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', msg.is_sent ? 'text-primary' : 'text-muted-foreground')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium truncate">{msg.is_sent ? 'Você' : (msg.from_name || msg.from_email)}</span>
                    {msg.internal_date && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(new Date(msg.internal_date), "dd/MM HH:mm")}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate">{msg.snippet}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
