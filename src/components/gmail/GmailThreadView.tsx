import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { Star, Archive, UserPlus, RefreshCw, Reply, ReplyAll, Forward, ChevronDown, ChevronUp, Paperclip, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

interface DynQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  select(cols: string): DynQuery;
  eq(col: string, val: unknown): DynQuery;
  order(col: string, opts: { ascending: boolean }): DynQuery;
}
const dynFrom = (table: string) =>
  (supabase as unknown as { from: (t: string) => DynQuery }).from(table);
import type { EmailThread } from '@/hooks/useEmail';

interface EmailMessage {
  id:           string;
  thread_id:    string;
  email_msg_id: string;
  from_email:   string | null;
  from_name:    string | null;
  to_emails:    string[] | null;
  cc_emails:    string[] | null;
  subject:      string | null;
  snippet:      string | null;
  body_html:    string | null;
  body_text:    string | null;
  is_read:      boolean;
  date:         string | null;
  has_attachments: boolean;
}

interface EmailThreadViewProps {
  thread:        EmailThread;
  onReply?:      (thread: EmailThread) => void;
  onStar?:       (threadId: string, starred: boolean) => void;
  onArchive?:    (threadId: string) => void;
  onAssign?:     (threadId: string, agentId: string | null) => void;
}

function formatFullDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function MessageBubble({
  msg,
  expanded,
  onToggle,
}: {
  msg:      EmailMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header da mensagem */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
            {(msg.from_name ?? msg.from_email ?? '?')[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm truncate">
              {msg.from_name ?? msg.from_email ?? 'Desconhecido'}
            </span>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {msg.has_attachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">{formatFullDate(msg.date)}</span>
              {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </div>
          {!expanded && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.snippet}</p>
          )}
        </div>
      </button>

      {/* Corpo da mensagem */}
      {expanded && (
        <div className="px-4 pb-4">
          {/* Para / CC */}
          <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
            <div>Para: {(msg.to_emails ?? []).join(', ')}</div>
            {msg.cc_emails && msg.cc_emails.length > 0 && (
              <div>CC: {msg.cc_emails.join(', ')}</div>
            )}
          </div>
          {/* Corpo HTML */}
          {msg.body_html ? (
            <div
              className="prose prose-sm max-w-none dark:prose-invert text-sm overflow-auto"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.body_html) }}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap text-foreground">{msg.body_text ?? msg.snippet}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function EmailThreadView({
  thread,
  onReply,
  onStar,
  onArchive,
  onAssign,
}: EmailThreadViewProps) {
  const [messages, setMessages]       = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await dynFrom('email_messages')
        .select('*')
        .eq('thread_id', thread.id)
        .order('date', { ascending: true });

      const msgs = (data as unknown as EmailMessage[]) ?? [];
      setMessages(msgs);
      // Expandir automaticamente a última mensagem
      if (msgs.length > 0) {
        setExpandedMsgs(new Set([msgs[msgs.length - 1].id]));
      }
    } finally {
      setIsLoading(false);
    }
  }, [thread.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const toggleMsg = (msgId: string) => {
    setExpandedMsgs(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full">
        {/* Header da thread */}
        <div className="flex items-start justify-between px-6 py-4 border-b shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h1 className="font-semibold text-base truncate">{thread.subject ?? '(sem assunto)'}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {thread.sla_status === 'breached' && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />SLA Violado
                </Badge>
              )}
              {thread.sla_status === 'warning' && (
                <Badge variant="secondary" className="text-xs gap-1 text-warning-foreground bg-warning">
                  <Clock className="h-3 w-3" />Prazo Próximo
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {thread.message_count} mensage{thread.message_count !== 1 ? 'ns' : 'm'}
              </Badge>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onStar?.(thread.id, !thread.is_starred)}
                >
                  <Star className={`h-4 w-4 ${thread.is_starred ? 'text-warning fill-yellow-500' : 'text-muted-foreground'}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{thread.is_starred ? 'Remover favorito' : 'Favoritar'}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onArchive?.(thread.id)}
                >
                  <Archive className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Arquivar</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onAssign?.(thread.id, null)}
                >
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Atribuir a agente</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={loadMessages}
                >
                  <RefreshCw className={`h-4 w-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Atualizar</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Mensagens */}
        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Carregando mensagens...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Nenhuma mensagem nesta thread
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  expanded={expandedMsgs.has(msg.id)}
                  onToggle={() => toggleMsg(msg.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Barra de resposta */}
        <div className="px-6 py-3 border-t shrink-0 flex items-center gap-2">
          <Button
            onClick={() => onReply?.(thread)}
            className="gap-2"
            size="sm"
          >
            <Reply className="h-3.5 w-3.5" />
            Responder
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <ReplyAll className="h-3.5 w-3.5" />
            Resp. todos
          </Button>
          <Button variant="ghost" size="sm" className="gap-2">
            <Forward className="h-3.5 w-3.5" />
            Encaminhar
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default EmailThreadView;
