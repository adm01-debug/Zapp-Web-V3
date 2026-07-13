import { useState, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { undoToast } from '@/lib/undoToast';
import { useAuth } from '@/features/auth';
import { Message } from '@/types/chat';
import { toast } from '@/hooks/use-toast';
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';
import { type DialogKey } from './hooks/useChatDialogs';
import { type ActiveTool } from './ChatHeaderToolbar';
import { useInputHandlers } from './useInputHandlers';
import { useProductHandlers } from './useProductHandlers';
import { useAudioVoiceChange } from './useAudioVoiceChange';
import { useMessageReactionHandlers } from './useMessageReactionHandlers';

interface UseChatPanelHandlersOptions {
  conversationId: string;
  contactId: string;
  contactPhone: string;
  instanceName?: string;
  onSendMessage: (content: string, attachments?: File[], onProgress?: (p: number) => void) => void;
  editMessageApi: (
    instance: string,
    params: { number: string; messageId: string; text: string }
  ) => Promise<unknown>;
  applySignature: (text: string) => string;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  openDialog: (key: DialogKey) => void;
  closeDialog: (key: DialogKey) => void;
  handleSetActiveTool: (tool: ActiveTool) => void;
}

export function useChatPanelHandlers(opts: UseChatPanelHandlersOptions) {
  const {
    contactPhone,
    instanceName,
    onSendMessage,
    editMessageApi,
    applySignature,
    handleTypingStart,
    handleTypingStop,
    openDialog,
    closeDialog,
    handleSetActiveTool,
  } = opts;
  const { profile } = useAuth();
  const [inputValue, setInputValue] = useState('');
  const [isWhisper, setIsWhisper] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [lastSendError, setLastSendError] = useState<string | null>(null);
  const [lastSendErrorDetail, setLastSendErrorDetail] = useState<string | null>(null);
  // Guarda content + attachments juntos: um envio só-mídia falho tem
  // messageContent === '' (falsy), então checar `!payload` sozinho fazia
  // retryLastSend virar no-op silencioso para esse caso.
  const lastFailedSendRef = useRef<{ content: string; attachments?: File[] } | null>(null);
  const lastFailedAudioRef = useRef<{
    blob: Blob;
    onSendAudio: (blob: Blob) => Promise<void>;
  } | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [sendProgress, setSendProgress] = useState(0);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const isSendingRef = useRef(isSending);
  isSendingRef.current = isSending;
  const editingMessageRef = useRef(editingMessage);
  editingMessageRef.current = editingMessage;
  const replyToMessageRef = useRef(replyToMessage);
  replyToMessageRef.current = replyToMessage;
  const isWhisperRef = useRef(isWhisper);
  isWhisperRef.current = isWhisper;

  const EDIT_WINDOW_MINUTES = 15;

  const handleEditStart = useCallback((message: Message) => {
    const minutesAgo = (Date.now() - message.timestamp.getTime()) / 60000;
    if (minutesAgo > EDIT_WINDOW_MINUTES) {
      toast({
        title: 'Tempo expirado',
        description: `Voce so pode editar mensagens nos primeiros ${EDIT_WINDOW_MINUTES} minutos.`,
        variant: 'destructive',
      });
      return;
    }
    setEditingMessage(message);
    setInputValue(message.content);
    inputRef.current?.focus();
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
    setInputValue('');
  }, []);

  const handleSend = useCallback(
    async (attachments?: File[]) => {
      const currentInput = inputValueRef.current;
      const currentEditing = editingMessageRef.current;
      const hasAttachments = !!attachments && attachments.length > 0;
      // Legenda é opcional para mídia: applySignature('') retorna texto não-vazio
      // quando assinatura ativa. Bypass só vale para envio novo (não edição nem whisper).
      const bypassEmptyText = hasAttachments && !currentEditing && !isWhisperRef.current;
      if ((!currentInput.trim() && !bypassEmptyText) || isSendingRef.current) return;

      if (currentEditing) {
        const externalId = currentEditing.external_id;
        const contactJid = contactPhone ? `${contactPhone}@s.whatsapp.net` : '';
        setIsSending(true);
        try {
          if (instanceName && externalId && contactJid)
            await editMessageApi(instanceName, {
              number: contactJid,
              messageId: externalId,
              text: currentInput.trim(),
            });
          await dbFrom('messages')
            .update({ content: currentInput.trim(), updated_at: new Date().toISOString() })
            .eq('id', currentEditing.id);
          toast({
            title: 'Mensagem editada',
            description: 'A mensagem foi atualizada com sucesso.',
          });
        } catch (err) {
          log.error('Failed to edit message:', err);
          toast({
            title: 'Erro ao editar',
            description: 'Nao foi possivel editar a mensagem.',
            variant: 'destructive',
          });
        } finally {
          setIsSending(false);
        }
        setEditingMessage(null);
        setInputValue('');
        return;
      }

      // Só aplica assinatura quando há texto real.
      const trimmedInput = currentInput.trim();
      const messageContent = trimmedInput ? applySignature(trimmedInput) : '';
      const wasReply = replyToMessageRef.current;
      setIsSending(true);
      setSendProgress(0);
      setInputValue('');
      setReplyToMessage(null);
      handleTypingStop();
      setLastSendError(null);

      try {
        const { simulateLatency, shouldSimulateFailure } =
          await import('@/features/inbox/utils/simulateChatLatency');
        await simulateLatency();
        if (shouldSimulateFailure())
          throw new Error('Falha simulada no envio via WhatsApp API (Debug Mode)');

        if (isWhisperRef.current) {
          if (attachments && attachments.length > 0)
            toast({
              title: 'Aviso',
              description: 'Arquivos nao sao suportados em modo sussurro no momento.',
              variant: 'destructive',
            });
          if (!profile?.id) throw new Error('Usuario nao autenticado');

          // Guard: whisper_messages.contact_id is uuid. When USE_EXTERNAL_DB=true,
          // opts.contactId may be a WhatsApp JID. Passing a JID causes PostgREST 400.
          if (!isValidUUID(opts.contactId)) {
            toast({
              title: 'Sussurro indisponivel',
              description:
                'Esta conversa usa ID externo (JID WhatsApp). Sussurros requerem contato interno com UUID.',
              variant: 'destructive',
            });
            setIsSending(false);
            return;
          }

          const { error } = await supabase.from('whisper_messages').insert({
            contact_id: opts.contactId,
            sender_id: profile.id,
            content: messageContent,
            target_agent_id: profile.id,
          });
          if (error) throw error;
          toast({ title: 'Sussurro enviado', description: 'Nota interna registrada com sucesso.' });
          setIsWhisper(false);
        } else {
          await Promise.resolve(
            onSendMessage(messageContent, attachments, (p) => setSendProgress(p))
          );
          setSendProgress(100);
        }
        lastFailedSendRef.current = null;
        undoToast({
          message: 'Mensagem enviada',
          icon: 'ok',
          delay: 3000,
          onUndo: () => {
            setInputValue(messageContent);
            if (wasReply) setReplyToMessage(wasReply);
            toast({
              title: 'Mensagem restaurada',
              description: 'O texto foi restaurado no campo de entrada.',
            });
          },
        });
      } catch (err: unknown) {
        // ignore-audit
        log.error('Failed to send message:', err);
        const msg = err instanceof Error ? err.message : 'Falha ao invocar a funcao de envio.';
        const detail =
          typeof (err as { detail?: string }).detail === 'string'
            ? (err as { detail?: string }).detail!
            : null;
        lastFailedSendRef.current = { content: messageContent, attachments };
        setLastSendError(msg);
        setLastSendErrorDetail(detail);
        setInputValue(messageContent);
        if (wasReply) setReplyToMessage(wasReply);
        toast({ title: 'Erro ao enviar', description: msg, variant: 'destructive' });
      } finally {
        setIsSending(false);
      }
    },
    [contactPhone, instanceName, editMessageApi, applySignature, onSendMessage, handleTypingStop]
  );

  const retryLastSend = useCallback(async () => {
    if (isSendingRef.current) return;
    const audioPending = lastFailedAudioRef.current;
    if (audioPending) {
      setIsSending(true);
      setLastSendError(null);
      setLastSendErrorDetail(null);
      try {
        await audioPending.onSendAudio(audioPending.blob);
        lastFailedAudioRef.current = null;
        toast({ title: 'Audio reenviado', description: 'O audio foi reenviado com sucesso.' });
      } catch (err: unknown) {
        // ignore-audit
        log.error('Audio retry failed:', err);
        const msg = err instanceof Error ? err.message : 'Falha ao reenviar audio.';
        const detail =
          typeof (err as { detail?: string }).detail === 'string'
            ? (err as { detail?: string }).detail!
            : null;
        setLastSendError(msg);
        setLastSendErrorDetail(detail);
        toast({ title: 'Erro ao reenviar audio', description: msg, variant: 'destructive' });
      } finally {
        setIsSending(false);
      }
      return;
    }
    const failedSend = lastFailedSendRef.current;
    if (!failedSend) return;
    setIsSending(true);
    setLastSendError(null);
    setLastSendErrorDetail(null);
    try {
      await Promise.resolve(onSendMessage(failedSend.content, failedSend.attachments));
      lastFailedSendRef.current = null;
      toast({ title: 'Reenviado', description: 'A mensagem foi enviada com sucesso.' });
    } catch (err: unknown) {
      // ignore-audit
      log.error('Retry failed:', err);
      const msg = err instanceof Error ? err.message : 'Falha ao reenviar.';
      const detail =
        typeof (err as { detail?: string }).detail === 'string'
          ? (err as { detail?: string }).detail!
          : null;
      setLastSendError(msg);
      setLastSendErrorDetail(detail);
      toast({ title: 'Erro ao reenviar', description: msg, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [onSendMessage]);

  const dismissSendError = useCallback(() => {
    setLastSendError(null);
    setLastSendErrorDetail(null);
    lastFailedSendRef.current = null;
    lastFailedAudioRef.current = null;
  }, []);

  const handleAudioSend = useCallback(
    async (audioBlob: Blob, onSendAudio?: (blob: Blob) => Promise<void>) => {
      if (!onSendAudio) {
        toast({
          title: 'Erro',
          description: 'Envio de audio nao configurado.',
          variant: 'destructive',
        });
        setIsRecordingAudio(false);
        return;
      }
      try {
        await onSendAudio(audioBlob);
        lastFailedAudioRef.current = null;
      } catch (err: unknown) {
        // ignore-audit
        log.error('Error sending audio:', err);
        const msg = err instanceof Error ? err.message : 'Falha ao enviar audio.';
        const detail =
          typeof (err as { detail?: string }).detail === 'string'
            ? (err as { detail?: string }).detail!
            : null;
        lastFailedAudioRef.current = { blob: audioBlob, onSendAudio };
        lastFailedSendRef.current = null;
        setLastSendError(msg);
        setLastSendErrorDetail(detail);
        toast({
          title: 'Erro ao enviar audio',
          description: 'Clique em Reenviar para tentar novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsRecordingAudio(false);
      }
    },
    []
  );

  const { handleReplyToMessage, handleCopyMessage, handleForwardMessage, handleForwardToTargets } =
    useMessageReactionHandlers({
      inputRef,
      forwardMessage,
      setReplyToMessage,
      setForwardMessage,
      openDialog,
    });

  const { handleInputChange, handleKeyDown, handleSlashCommand } = useInputHandlers({
    setInputValue,
    setIsWhisper,
    openDialog,
    closeDialog,
    handleTypingStart,
    handleTypingStop,
    handleSend,
    handleSetActiveTool,
  });

  const {
    handleSendProduct,
    handleSendInteractiveMessage,
    handleInteractiveButtonClick,
    handleSendLocation,
  } = useProductHandlers({ onSendMessage });

  const { handleAudioVoiceChange } = useAudioVoiceChange();

  return {
    inputValue,
    setInputValue,
    isSending,
    sendProgress,
    isRecordingAudio,
    setIsRecordingAudio,
    replyToMessage,
    setReplyToMessage,
    forwardMessage,
    editingMessage,
    inputRef,
    handleEditStart,
    handleCancelEdit,
    handleSend,
    handleReplyToMessage,
    handleCopyMessage,
    handleForwardMessage,
    handleForwardToTargets,
    handleInputChange,
    handleKeyDown,
    handleSlashCommand,
    handleSendProduct,
    handleSendInteractiveMessage,
    handleInteractiveButtonClick,
    handleSendLocation,
    handleAudioSend,
    handleAudioVoiceChange,
    lastSendError,
    lastSendErrorDetail,
    retryLastSend,
    dismissSendError,
    isWhisper,
    setIsWhisper,
  };
}
