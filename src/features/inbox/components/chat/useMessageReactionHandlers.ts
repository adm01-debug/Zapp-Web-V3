import { useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { Message } from '@/types/chat';
import { type DialogKey } from './hooks/useChatDialogs';
import { sendMessageToContact } from '../../hooks/realtime/messageSender';
import { getLogger } from '@/lib/logger';

const log2 = getLogger('useMessageReactionHandlers');

interface UseMessageReactionHandlersOptions {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  forwardMessage: Message | null;
  setReplyToMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  setForwardMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  openDialog: (key: DialogKey) => void;
}

/** use Message Reaction Handlers component for the chat section. */
export function useMessageReactionHandlers({
  inputRef,
  forwardMessage,
  setReplyToMessage,
  setForwardMessage,
  openDialog,
}: UseMessageReactionHandlersOptions) {
  const forwardMessageRef = useRef(forwardMessage);
  forwardMessageRef.current = forwardMessage;
  const handleReplyToMessage = useCallback(
    (message: Message) => {
      setReplyToMessage(message);
      inputRef.current?.focus();
    },
    [setReplyToMessage, inputRef]
  );

  const handleCopyMessage = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: 'Copiado!', description: 'Mensagem copiada para a area de transferencia.' });
    } catch {
      toast({ title: 'Falha ao copiar: permissao negada', variant: 'destructive' });
    }
  }, []);

  const handleForwardMessage = useCallback(
    (message: Message) => {
      setForwardMessage(message);
      openDialog('forwardDialog');
    },
    [setForwardMessage, openDialog]
  );

  const handleForwardToTargets = useCallback(
    async (targetIds: string[], targetType: 'contact' | 'group') => {
      const msg = forwardMessageRef.current;
      if (!msg) {
        toast({
          title: 'Nada para encaminhar',
          description: 'Selecione uma mensagem primeiro.',
          variant: 'destructive',
        });
        return;
      }
      log2.debug('Forwarding to:', { targetIds, targetType, message: msg });

      const results: string[] = [];
      for (const targetId of targetIds) {
        try {
          const isTextMsg = msg.type === 'text';
          const content = isTextMsg
            ? `➡️ *Encaminhada:*\n\n${msg.content}`
            : (msg.content ?? '');
          const result = await sendMessageToContact(targetId, content, msg.type || 'text', msg.mediaUrl);
          log2.debug('Forwarded to', targetId, result);
          results.push(targetId);
        } catch (err) {
          log2.error('Failed to forward to', targetId, err);
          toast({
            title: 'Erro ao encaminhar',
            description: `Falha ao encaminhar para ${targetId}: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
            variant: 'destructive',
          });
        }
      }
      if (results.length > 0) {
        toast({
          title: 'Mensagem encaminhada!',
          description: `Encaminhada para ${results.length} ${results.length === 1 ? 'destinatário' : 'destinatários'}.`,
        });
      }
    },
    [] // usa forwardMessageRef, não depende de forwardMessage state diretamente
  );

  return { handleReplyToMessage, handleCopyMessage, handleForwardMessage, handleForwardToTargets };
}
