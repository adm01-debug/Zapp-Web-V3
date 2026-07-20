import { useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  ChevronDown,
  MoreHorizontal,
  Reply,
  Forward,
  Trash2,
  Star,
  StarOff,
  Mail,
  MailOpen,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion } from '@/components/ui/motion';
import { type EmailMessage } from '@/hooks/gmail/gmailTypes';
import { EmailAttachmentPreview } from './EmailAttachmentPreview';
import { EmailSLABadge } from './EmailSLABadge';
import { type SLAStatus } from '@/hooks/useEmailSLA';
import { emailMarkRead, emailTrashMessage, emailModifyLabels } from '@/hooks/gmail/gmailApi';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getInitialsFromNameOrEmail } from '@/lib/formatters';

interface EmailChatBubbleProps {
  message: EmailMessage;
  accountId: string;
  slaStatus?: SLAStatus | null;
  onReply?: () => void;
  onForward?: () => void;
  isFirst?: boolean;
  className?: string;
}

function sanitizeHtml(html: string): string {
  // Força target="_blank" + rel="noopener noreferrer nofollow" em todos os <a>
  // (clientes de email enviam links sem esses attrs; sem isso o link navega in-tab e
  // pode permitir window.opener leak via tabnabbing).
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  try {
    return DOMPurify.sanitize(html, {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      ADD_ATTR: ['target', 'rel'],
      FORCE_BODY: true,
    });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

function getAvatarColor(email: string | null): string {
  const colors = [
    'bg-primary shadow-[0_0_10px_-2px_rgba(var(--primary),0.4)]',
    'bg-primary/90 shadow-[0_0_10px_-2px_rgba(var(--primary),0.3)]',
    'bg-secondary shadow-[0_0_10px_-2px_rgba(var(--secondary),0.4)]',
    'bg-accent shadow-[0_0_10px_-2px_rgba(var(--accent),0.4)]',
    'bg-destructive shadow-[0_0_10px_-2px_rgba(var(--destructive),0.4)]',
    'bg-muted shadow-[0_0_10px_-2px_rgba(var(--muted),0.4)]',
  ];
  const code = (email ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[code % colors.length];
}

export function EmailChatBubble({
  message,
  accountId,
  slaStatus,
  onReply,
  onForward,
  isFirst = false,
  className,
}: EmailChatBubbleProps) {
  const [expanded, setExpanded] = useState(isFirst);
  const [showFullHtml, setShowFullHtml] = useState(false);
  const [isStarred, setIsStarred] = useState(message.label_ids.includes('STARRED'));
  const [isRead, setIsRead] = useState(message.is_read);
  const contentRef = useRef<HTMLDivElement>(null);

  const sentAt = message.internal_date ? new Date(message.internal_date) : null;

  const hasHtml = !!message.body_html;
  const hasQuote =
    message.body_html?.includes('email_quote') || message.body_html?.includes('blockquote');

  const displayHtml = hasHtml
    ? sanitizeHtml(
        showFullHtml
          ? (message.body_html ?? '')
          : (message.body_html ?? '')
              .replace(/<div class="email_quote"[\s\S]*/i, '')
              .replace(/<blockquote[\s\S]*<\/blockquote>/i, '')
      )
    : (message.body_plain ?? message.snippet ?? '');

  const handleToggleStar = async () => {
    const wasStarred = isStarred;
    setIsStarred(!wasStarred);
    try {
      await emailModifyLabels({
        accountId,
        messageId: message.message_id,
        addLabelIds: wasStarred ? [] : ['STARRED'],
        removeLabelIds: wasStarred ? ['STARRED'] : [],
      });
    } catch {
      setIsStarred(wasStarred);
    }
  };

  const handleToggleRead = async () => {
    const wasRead = isRead;
    setIsRead(!wasRead);
    try {
      await emailMarkRead({ accountId, messageIds: [message.message_id], read: !wasRead });
    } catch {
      setIsRead(wasRead);
    }
  };

  const handleTrash = async () => {
    try {
      await emailTrashMessage({ accountId, messageId: message.message_id });
      toast.success('Mensagem movida para lixeira');
    } catch {
      toast.error('Erro ao mover para lixeira');
    }
  };

  return (
    <div
      className={cn(
        'group relative duration-700 ease-out animate-in fade-in slide-in-from-bottom-2',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'group/header mx-2 my-1 flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 transition-all duration-300 hover:bg-muted/30',
          expanded && 'border border-border/5 bg-muted/15 shadow-sm'
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar com Animação */}
        <motion.div whileHover={{ scale: 1.1 }} className="relative shrink-0">
          <Avatar className="h-[38px] w-[44px] border border-border shadow-lg ring-2 ring-background">
            <AvatarFallback
              className={cn(
                'text-[11px] font-bold uppercase tracking-wider text-primary-foreground',
                getAvatarColor(message.from_email)
              )}
            >
              {getInitialsFromNameOrEmail(message.from_name, message.from_email)}
            </AvatarFallback>
          </Avatar>
        </motion.div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'truncate text-[16px] tracking-tight transition-colors',
                  !isRead
                    ? 'font-bold text-foreground'
                    : 'font-semibold text-muted-foreground group-hover/header:text-foreground/80'
                )}
              >
                {message.from_name || message.from_email || '?'}
              </span>
              {!isRead && (
                <Badge className="h-4.5 border-0 bg-primary px-2 text-[9px] font-bold uppercase tracking-widest text-primary-foreground shadow-sm">
                  Novo
                </Badge>
              )}
              {isStarred && <Star className="h-3.5 w-3.5 fill-amber-400 text-warning-foreground" />}
              {slaStatus && <EmailSLABadge status={slaStatus} compact />}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {sentAt && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] font-bold uppercase tabular-nums tracking-tighter text-muted-foreground/60">
                      {formatDistanceToNow(sentAt, { locale: ptBR, addSuffix: true })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {format(sentAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </TooltipContent>
                </Tooltip>
              )}
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/20 text-muted-foreground/40 transition-transform duration-300"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {!expanded && (
            <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground/70">
              {message.snippet}
            </p>
          )}

          {expanded && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
              <span className="text-primary/60">Para:</span>
              <span className="max-w-[300px] truncate">{message.to_emails.join(', ')}</span>
              {message.cc_emails.length > 0 && (
                <>
                  <span className="mx-1 opacity-30">|</span>
                  <span className="text-primary/60">Cc:</span>
                  <span className="max-w-[200px] truncate">{message.cc_emails.join(', ')}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div
          className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/header:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {onReply && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onReply}>
                  <Reply className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Responder</TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {onForward && (
                <DropdownMenuItem onClick={onForward}>
                  <Forward className="mr-2 h-4 w-4" />
                  Encaminhar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleToggleStar}>
                {isStarred ? (
                  <StarOff className="mr-2 h-4 w-4" />
                ) : (
                  <Star className="mr-2 h-4 w-4" />
                )}
                {isStarred ? 'Remover estrela' : 'Adicionar estrela'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleRead}>
                {isRead ? <Mail className="mr-2 h-4 w-4" /> : <MailOpen className="mr-2 h-4 w-4" />}
                Marcar como {isRead ? 'não lido' : 'lido'}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleTrash}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Mover para lixeira
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="pl-15 px-4 pb-4 duration-300 animate-in slide-in-from-top-2">
          <div className="pl-11">
            <div className="relative rounded-2xl border border-border/50 bg-card/60 p-5 shadow-xl backdrop-blur-xl">
              {hasHtml ? (
                <div
                  ref={contentRef}
                  className="prose prose-sm dark:prose-invert max-w-none overflow-hidden text-[14px] leading-relaxed text-foreground/90 selection:bg-primary/20"
                  style={{ maxHeight: showFullHtml ? 'none' : '500px' }}
                  dangerouslySetInnerHTML={{ __html: displayHtml }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90 selection:bg-primary/20">
                  {displayHtml}
                </p>
              )}

              {/* Mostrar citação */}
              {hasQuote && !showFullHtml && (
                <button
                  className="mt-3 flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFullHtml(true);
                  }}
                >
                  <span className="text-sm leading-none">···</span>
                  <span>Conteúdo citado</span>
                </button>
              )}
            </div>

            {/* Attachments */}
            {message.has_attachments && (
              <EmailAttachmentPreview attachments={[]} className="mt-3" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
