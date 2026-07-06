import { motion } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Star, AlertCircle } from 'lucide-react';
import type { EmailThread } from '@/hooks/useEmail';
import { getInitialsFromNameOrEmail } from '@/lib/formatters';

function formatThreadDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000 && date.getDate() === now.getDate())
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return date.toLocaleDateString('pt-BR', { weekday: 'short' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

interface ThreadListItemProps {
  thread: EmailThread;
  isSelected: boolean;
  onClick: () => void;
}

export function ThreadListItem({ thread, isSelected, onClick }: ThreadListItemProps) {
  const displayName = thread.contact?.name || thread.snippet?.split(' ')[0] || 'Desconhecido';

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onClick}
      className={`flex w-full items-start gap-3 border-b border-secondary/10 p-3 text-left transition-colors ${
        isSelected ? 'border-l-2 border-l-primary bg-primary/5' : 'hover:bg-secondary/5'
      } ${thread.is_unread ? '' : 'opacity-80'}`}
    >
      <Avatar className="mt-0.5 h-9 w-9 shrink-0">
        <AvatarFallback
          className={`text-xs ${thread.is_unread ? 'bg-primary/10 font-bold text-primary' : 'bg-secondary/20'}`}
        >
          {getInitialsFromNameOrEmail(thread.contact?.name, thread.contact?.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-sm ${thread.is_unread ? 'font-semibold' : 'font-normal'}`}
          >
            {displayName}
          </span>
          {thread.message_count > 1 && (
            <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
              {thread.message_count}
            </Badge>
          )}
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {thread.last_message_at && formatThreadDate(thread.last_message_at)}
          </span>
        </div>
        <p
          className={`truncate text-xs ${thread.is_unread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
        >
          {thread.subject || '(Sem assunto)'}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="flex-1 truncate text-[10px] text-muted-foreground">{thread.snippet}</p>
          <div className="flex shrink-0 items-center gap-0.5">
            {thread.is_starred && <Star className="h-3 w-3 fill-warning text-warning" />}
            {thread.is_important && <AlertCircle className="h-3 w-3 text-warning" />}
          </div>
        </div>
        {thread.tags.length > 0 && (
          <div className="mt-1 flex items-center gap-1">
            {thread.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="px-1 py-0 text-[9px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </motion.button>
  );
}
