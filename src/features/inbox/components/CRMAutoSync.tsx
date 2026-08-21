// CRMAutoSync — tipado sobre o contrato real de useSyncToCRM.
/**
 * CRMAutoSync
 *
 * Invisible component that auto-syncs conversation data to the CRM
 * when a conversation status changes to 'resolved'. Also provides
 * a manual sync button for the contact details panel.
 *
 * Enhanced: auto-detect sentiment from messages, build richer summary.
 */
import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSyncToCRM } from '@/hooks/useSyncToCRM';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('CRMAutoSync');
import type { Conversation, Message } from '@/types/chat';

interface CRMAutoSyncProps {
  conversation: Conversation;
  messageCount?: number;
  agentName?: string;
  messages?: Message[];
}

// Simple sentiment heuristic from message content
function detectSentiment(messages: Message[] | undefined): string {
  if (!messages || messages.length === 0) return 'neutral';

  const lastMessages = messages.slice(-10);
  const text = lastMessages.map((m) => m.content?.toLowerCase() || '').join(' ');

  const positiveWords = [
    'obrigad',
    'perfeito',
    'ótimo',
    'excelente',
    'maravilh',
    'amei',
    'adorei',
    'top',
    'parabéns',
    'show',
    '👍',
    '😊',
    '❤',
    '🙏',
    'fechado',
    'aprovado',
  ];
  const negativeWords = [
    'reclam',
    'péssim',
    'horrível',
    'absurd',
    'descaso',
    'nunca mais',
    'cancelar',
    'devolver',
    'insatisf',
    'raiva',
    '😡',
    '😤',
    'atraso',
    'demora',
  ];

  const posScore = positiveWords.filter((w) => text.includes(w)).length;
  const negScore = negativeWords.filter((w) => text.includes(w)).length;

  if (negScore >= 2) return 'negative';
  if (negScore > posScore) return 'negative';
  if (posScore >= 2) return 'positive';
  if (posScore > negScore) return 'positive';
  return 'neutral';
}

// Build a summary from the conversation
function buildSummary(conversation: Conversation, messages: Message[] | undefined): string {
  const parts: string[] = [];

  // Contact info
  parts.push(`Conversa com ${conversation.contact.name}`);

  // Duration estimate
  if (messages && messages.length > 1) {
    const first = messages[0]?.timestamp;
    const last = messages[messages.length - 1]?.timestamp;
    if (first && last) {
      const diffMin = Math.round((last.getTime() - first.getTime()) / 60000);
      if (diffMin > 0) parts.push(`(${diffMin} min)`);
    }
  }

  // Message count
  if (messages) {
    const agentMsgs = messages.filter((m) => m.sender === 'agent').length;
    const contactMsgs = messages.filter((m) => m.sender === 'contact').length;
    parts.push(`${contactMsgs} msgs cliente, ${agentMsgs} msgs agente`);
  }

  // Last messages as context
  if (messages && messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.content) {
      parts.push('Última: ' + lastMsg.content.slice(0, 200));
    }
  }

  return parts.join('. ');
}

/**
 * Auto-sync: watches conversation status and syncs to CRM when resolved.
 */
export function CRMAutoSync({ conversation, messageCount, agentName, messages }: CRMAutoSyncProps) {
  const { syncConversation, isConfigured } = useSyncToCRM();
  const lastSyncedStatus = useRef<string>('');
  const lastSyncedId = useRef<string>('');

  // Estabilizar referências: extrair primitivas para evitar re-render em cascata
  const convId = conversation.id;
  const convStatus = conversation.status;
  const convPhone = conversation.contact.phone;
  const convName = conversation.contact.name;

  // Etapa 62: os OBJETOS são lidos por ref apenas no momento do sync — mantê-los
  // (e o sentiment derivado) nas deps re-executava o efeito e o scan de
  // sentimento a cada mensagem nova, quando o gatilho real é só a transição
  // de status para 'resolved'.
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    // F1 — estado honesto: se a config diz que NÃO há CRM, loga o skip em vez
    // de sumir silenciosamente; null = ainda verificando (sem ruído).
    if (isConfigured === false) {
      log.info('CRM sync skipped: not configured');
      return;
    }
    if (isConfigured === null) return;
    if (!convPhone) return;

    const shouldSync =
      convStatus === 'resolved' &&
      (lastSyncedStatus.current !== 'resolved' || lastSyncedId.current !== convId);

    if (shouldSync) {
      lastSyncedStatus.current = convStatus;
      lastSyncedId.current = convId;

      const msgs = messagesRef.current;
      const summary = buildSummary(conversationRef.current, msgs);
      const sentiment = detectSentiment(msgs);

      syncConversation({
        phone: convPhone,
        channel: 'whatsapp',
        direction: 'inbound',
        assunto: `Conversa WhatsApp — ${convName}`,
        resumo: summary,
        sentiment,
        messageCount: messageCount || (msgs?.length ?? 0),
        agentName: agentName || undefined,
        zappConversationId: convId,
      });

      log.info('CRM auto-sync triggered:', { id: convId, sentiment });
    }
    // Nota: lastSyncedStatus só deve ser atualizado DENTRO do shouldSync
    // (linha 157 do original fora do if quebrava o guard)
  }, [convId, convStatus, convPhone, convName, isConfigured, syncConversation, messageCount, agentName]);

  return null; // Invisible component
}

/**
 * Manual sync button — drop into ContactDetails or ExternalContact360Panel.
 */
export function CRMSyncButton({
  conversation,
  messageCount,
}: {
  conversation: Conversation;
  messageCount?: number;
}) {
  const { syncConversationAsync, isSyncing, isConfigured, lastResult } = useSyncToCRM();
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [contactNotFound, setContactNotFound] = useState(false);

  // F1 — nunca sumir silenciosamente: estado honesto em vez de `return null`.
  if (isConfigured === false) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="CRM não configurado"
            variant="outline"
            size="icon"
            disabled
            className="h-9 w-9 border-border/30 opacity-50"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">CRM não configurado</TooltipContent>
      </Tooltip>
    );
  }

  if (isConfigured === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Verificando configuração do CRM"
            variant="outline"
            size="icon"
            disabled
            className="h-9 w-9 border-border/30 opacity-50"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Verificando configuração do CRM...</TooltipContent>
      </Tooltip>
    );
  }

  const handleSync = async () => {
    try {
      const result = await syncConversationAsync({
        phone: conversation.contact.phone ?? '',
        channel: 'whatsapp',
        direction: 'inbound',
        assunto: `Conversa WhatsApp — ${conversation.contact.name}`,
        resumo: conversation.lastMessage?.content?.slice(0, 500) || undefined,
        sentiment: 'neutral',
        messageCount: messageCount || 0,
        zappConversationId: conversation.id,
      });

      if (result?.synced) {
        setLastSyncTime(new Date());
        setContactNotFound(false);
        toast.success('Sincronizado com o CRM!', {
          description: result.new_relationship_score
            ? `Score atualizado: ${result.new_relationship_score}`
            : undefined,
        });
      } else if (result?.reason === 'duplicate') {
        setLastSyncTime(new Date());
        toast.info('Já sincronizado', { description: 'Esta conversa já foi enviada ao CRM.' });
      } else if (result?.reason === 'contact_not_found') {
        setContactNotFound(true);
        toast.warning('Contato não encontrado no CRM');
      }
    } catch {
      toast.error('Erro ao sincronizar com CRM');
    }
  };

  if (contactNotFound) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Sincronizar CRM"
            variant="outline"
            size="icon"
            disabled
            className="h-9 w-9 border-border/30 opacity-50"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Contato não encontrado no CRM</TooltipContent>
      </Tooltip>
    );
  }

  const tooltipText = isSyncing
    ? 'Sincronizando...'
    : lastResult?.synced
      ? `Sincronizado ${lastSyncTime ? formatDistanceToNow(lastSyncTime, { addSuffix: true, locale: ptBR }) : ''}`
      : lastResult?.reason === 'provider_not_configured'
        ? 'CRM configurado, mas faltam credenciais do provider (env)'
        : lastResult?.reason === 'not_implemented'
          ? 'Provider configurado, mas ainda não implementado'
          : 'Sincronizar com CRM externo';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={handleSync}
          disabled={isSyncing}
          className="h-9 w-9 border-border/30 hover:border-primary/50 hover:bg-primary/10"
          aria-label={tooltipText}
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : lastResult?.synced ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
