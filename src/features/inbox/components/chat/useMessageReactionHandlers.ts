import { useCallback } from 'react';
import { log } from '@/lib/logger';
import { toast } from '@/hooks/use-toast';
import { Message } from '@/types/chat';
import { type DialogKey } from './hooks/useChatDialogs';

interface UseMessageReactionHandlersOptions {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  forwardMessage: Message | null;
  setReplyToMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  setForwardMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  openDialog: (key: DialogKey) => void;
}

export function useMessageReactionHandlers({
  inputRef,
  forwardMessage,
  setReplyToMessage,
  setForwardMessage,
  openDialog,
}: UseMessageReactionHandlersOptions) {
  const handleReplyToMessage = useCallback(
    (message: Message) => {
      setReplyToMessage(message);
      inputRef.current?.focus();
    },
    [setReplyToMessage, inputRef]
  );

  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: 'Copiado!', description: 'Mensagem copiada para a area de transferencia.' });
  }, []);

  const handleForwardMessage = useCallback(
    (message: Message) => {
      setForwardMessage(message);
      openDialog('forwardDialog');
    },
    [setForwardMessage, openDialog]
  );

  const handleForwardToTargets = useCallback(
    (targetIds: string[], targetType: 'contact' | 'group') => {
      log.debug('Forwarding to:', { targetIds, targetType, message: forwardMessage });
    },
    [forwardMessage]
  );

  return { handleReplyToMessage, handleCopyMessage, handleForwardMessage, handleForwardToTargets };
}
