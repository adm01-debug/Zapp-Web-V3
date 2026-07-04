/**
 * ContactConversationHistory.tsx
 * Past conversations list for a contact, with clickable links.
 * Solves Gap #7: No links to previous conversations in the activity feed.
 */
import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { getLogger } from '@/lib/logger';

import { MessageCircle, ExternalLink, Loader2 } from 'lucide-react';
import { sanitizeText } from '@/lib/sanitize';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { dbFrom } from '@/integrations/datasource/db';

const log = getLogger('ContactConversationHistory');

interface ConversationSummary {
  id: string;
  channel: string;
  status: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  message_count: number;
  assigned_agent_name: string | null;
}

interface ContactConversationHistoryProps {
  contactId: string;
  workspaceId: string;
  maxItems?: number;
  onOpenConversation?: (conversationId: string) => void;
}

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: '\uD83D\uDCAC', instagram: '\uD83D\uDCF8', telegram: '\u2708\uFE0F',
  messenger: '\uD83D\uDC99', email: '\uD83D\uDCE7', webchat: '\uD83C\uDF10',
};

export const ContactConversationHistory: React.FC<ContactConversationHistoryProps> = ({
  contactId, workspaceId, maxItems = 10, onOpenConversation,
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await dbFrom('conversations')
          .select('id, channel, status, last_message_preview, last_message_at, message_count, assigned_agent_name')
          .eq('contact_id', contactId)
          .eq('workspace_id', workspaceId)
          .order('last_message_at', { ascending: false })
          .limit(maxItems);

        if (error) throw error;
        setConversations((data as ConversationSummary[]) ?? []);
      } catch (err) {
        log.error('Failed to load conversation history', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [contactId, workspaceId, maxItems]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando conversas...
      </div>
    );
  }

  if (conversations.length === 0) {
    return <p className="text-xs text-muted-foreground italic py-1">Nenhuma conversa anterior.</p>;
  }

  return (
    <div className="space-y-1" role="list" aria-label="Hist\u00f3rico de conversas">
      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-1">
        <MessageCircle className="h-3 w-3" /> Conversas Anteriores ({conversations.length})
      </p>
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onOpenConversation?.(conv.id)}
          className="w-full text-left bg-muted/20 hover:bg-muted/40 rounded p-2 text-xs transition-colors group"
          role="listitem"
          aria-label={`Conversa via ${conv.channel}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span>{CHANNEL_ICONS[conv.channel] ?? '\uD83D\uDCAC'}</span>
              <span className="truncate font-medium">
                {conv.last_message_preview
                  ? sanitizeText(conv.last_message_preview.slice(0, 60))
                  : 'Sem mensagens'}
              </span>
            </div>
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 shrink-0 transition-opacity" />
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px] px-1 py-0">{conv.status}</Badge>
            {conv.assigned_agent_name && <span>{conv.assigned_agent_name}</span>}
            {conv.last_message_at && (
              <span className="ml-auto">
                {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })}
              </span>
            )}
            <span>{conv.message_count} msgs</span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default ContactConversationHistory;
