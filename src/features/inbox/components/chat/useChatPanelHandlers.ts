import { useState, useRef, useCallback, useEffect } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useChatPanelHandlers');
import { undoToast } from '@/lib/undoToast';
import { insertWhisperMessage } from '../../hooks/useWhisperMessagesMutation';
import { useAuth } from '@/features/auth';
import { Message } from '@/types/chat';
import { toast } from '@/hooks/use-toast';
import { dbFrom } from '@/integrations/datasource/db';
import { resolveContactRef, isUuidRef, isJidRef } from '../../utils/contactRef';
import { type DialogKey } from './hooks/useChatDialogs';
import { type ActiveTool } from './ChatHeaderToolbar';
import { useInputHandlers } from './useInputHandlers';
import { useProductHandlers } from './useProductHandlers';
import { useAudioVoiceChange } from './useAudioVoiceChange';
import { useMessageReactionHandlers } from './useMessageReactionHandlers';
import { ticketStore } from '@/lib/inbox/ticketStore';
import { isValidUUID } from '@/utils/uuid';

const EDIT_WINDOW_MINUTES = 15;

interface UseChatPanelHandlersOptions {
  conversationId: string;
  contactId: string;
  contactPhone: string;
  instanceName?: string;
  onSendMessage: (
    content: string,
    attachments?: File[],
    onProgress?: (p: number) => void
  ) => void | Promise<void>;
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
  /** Ação real de arquivar a conversa ativa (PR PR 773) — chamada pelo /archive. */
  onArchive?: () => void | Promise<void>;
}

/** use Chat Panel Handlers component for the chat section. */
export function useChatPanelHandlers(opts: UseChatPanelHandlersOptions) {
  const {
    conversationId,
    contactId,
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
  const lastFailedSendRef = useRef<{ content: string; attachments?: File[]; conversationId: string } | null>(null);
  const lastFailedAudioRef = useRef<{
    blob: Blob;
    onSendAudio: (blob: Blob) => Promise<void>;
    conversationId: string;
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

  // Etapas 39-43: limpar todo estado local ao trocar de conversa para evitar
  // vazamento de rascunho, estado de edição, erro residual e referências antigas.
  useEffect(() => {
    setInputValue('');
    setIsWhisper(false);
    setIsSending(false);
    setIsRecordingAudio(false);
    setReplyToMessage(null);
    setEditingMessage(null);
    setForwardMessage(null);
    setLastSendError(null);
    setLastSendErrorDetail(null);
    setSendProgress(0);
    lastFailedSendRef.current = null;
    lastFailedAudioRef.current = null;
  }, [conversationId]);

  const handleEditStart = useCallback((message: Message) => {
    const minutesAgo = (Date.now() - new Date(message.timestamp).getTime()) / 60000;
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
        const ref = resolveContactRef(contactId);
        const targetJid = isJidRef(ref) ? ref.remoteJid : null;
        const externalId = currentEditing.external_id;
        const newText = currentInput.trim();

        // Pré-condições explícitas — falhar visivelmente em vez de falso-sucesso
        if (!instanceName || !externalId || !targetJid) {
          log.warn('[editMessage] pré-condições ausentes', {
            hasInstance: !!instanceName,
            hasExternalId: !!externalId,
            hasJid: !!targetJid,
          });
          toast({
            title: 'Não foi possível editar',
            description: !externalId
              ? 'Esta mensagem ainda não foi confirmada pelo WhatsApp.'
              : 'Instância WhatsApp não resolvida para esta conversa.',
            variant: 'destructive',
          });
          setEditingMessage(null);
          setInputValue('');
          return;
        }

        // Re-validate edit window at send time (TOCTOU: handleEditStart checked at open, not at submit)
        const minutesElapsed = (Date.now() - new Date(currentEditing.timestamp).getTime()) / 60000;
        if (minutesElapsed > EDIT_WINDOW_MINUTES) {
          toast({
            title: 'Tempo expirado',
            description: `Você só pode editar mensagens nos primeiros ${EDIT_WINDOW_MINUTES} minutos.`,
            variant: 'destructive',
          });
          setEditingMessage(null);
          setInputValue('');
          return;
        }

        setIsSending(true);
        try {
          // 1. Fonte da verdade é o WhatsApp. Se falhar aqui, não tocamos no banco local.
          await editMessageApi(instanceName, {
            number: targetJid,
            messageId: externalId,
            text: newText,
          });

          // 2. Espelhar no banco, verificando rowcount de verdade.
          const { data: updated, error: dbError } = await dbFrom('evolution_messages')
            .update({ content: newText, updated_at: new Date().toISOString() })
            .eq('id', currentEditing.id)
            .select('id');

          if (dbError) throw dbError;
          if (!updated || updated.length === 0) {
            log.warn('[editMessage] UPDATE casou 0 linhas', { id: currentEditing.id, instanceName, contactId, contactPhone });
            toast({
              title: 'Editada no WhatsApp',
              description: 'A alteração foi enviada, mas o histórico local não foi atualizado.',
            });
          } else {
            toast({
              title: 'Mensagem editada',
              description: 'A mensagem foi atualizada com sucesso.',
            });
          }
        } catch (err) {
          log.error('[editMessage] falhou', err);
          toast({
            title: 'Erro ao editar',
            description: err instanceof Error ? err.message : 'Não foi possível editar a mensagem.',
            variant: 'destructive',
          });
        } finally {
          setIsSending(false);
        }
        setEditingMessage(null);
        setInputValue('');
        return;
      }

      // Guards de whisper ANTES de alterar qualquer estado — preserva o texto do usuário.
      if (isWhisperRef.current) {
        if (attachments && attachments.length > 0) {
          toast({
            title: 'Aviso',
            description: 'Arquivos nao sao suportados em modo sussurro no momento.',
            variant: 'destructive',
          });
          return;
        }
        // Guard: whisper_messages.contact_id is uuid. If opts.contactId is a
        // WhatsApp JID (external mode), passing it causes PostgREST 400.
        if (!isUuidRef(resolveContactRef(contactId))) {
          toast({
            title: 'Sussurro indisponivel',
            description:
              'Esta conversa usa ID externo (JID WhatsApp). Sussurros requerem contato interno com UUID.',
            variant: 'destructive',
          });
          return;
        }
      }

      // Só aplica assinatura quando há texto real.
      const trimmedInput = currentInput.trim();
      const messageContent = trimmedInput ? applySignature(trimmedInput) : '';
      // Guardar texto BRUTO para reidratar o campo em caso de falha/undo.
      // `messageContent` já contém a assinatura — reenviá-lo duplicaria a assinatura.
      const rawInput = trimmedInput;
      const wasReply = replyToMessageRef.current;
      setIsSending(true);
      setSendProgress(0);
      setInputValue('');
      setReplyToMessage(null);
      handleTypingStop();
      setLastSendError(null);

      try {
        // ⚠️ Debug-only: simulated latency + failure gate — NEVER in production
        if (import.meta.env.DEV) {
          const { simulateLatency, shouldSimulateFailure } =
            await import('@/features/inbox/utils/simulateChatLatency');
          await simulateLatency();
          if (shouldSimulateFailure())
            throw new Error('Falha simulada no envio via WhatsApp API (Debug Mode)');
        }

        if (isWhisperRef.current) {
          if (!profile?.id) throw new Error('Usuario nao autenticado');

          const { error } = await insertWhisperMessage({
            contact_id: contactId,
            sender_id: profile.id,
            content: messageContent,
            target_agent_id: profile.id,
          });
          if (error) throw error;
          toast({ title: 'Sussurro enviado', description: 'Nota interna registrada com sucesso.' });
          setIsWhisper(false);
        } else {
          await onSendMessage(messageContent, attachments, (p) => setSendProgress(p));
        }
        lastFailedSendRef.current = null;
        undoToast({
          message: 'Mensagem enviada',
          icon: 'ok',
          delay: 3000,
          actionLabel: 'Restaurar texto',
          onUndo: () => {
            setInputValue(rawInput);
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
            ? (err as { detail: string }).detail
            : null;
        if (isWhisperRef.current) {
          // Sussurro NÃO passa pelo reenvio via WhatsApp (onSendMessage):
          // gravar lastFailedSendRef faria o retryLastSend vazar a nota
          // interna para o cliente. Apenas restaura o estado e mostra o erro.
          lastFailedSendRef.current = null; // limpa ref de envio normal anterior
          setLastSendError(msg);
          setLastSendErrorDetail(detail);
          setSendProgress(0);
          setInputValue(rawInput);
          if (wasReply) setReplyToMessage(wasReply);
          toast({ title: 'Erro ao enviar sussurro', description: msg, variant: 'destructive' });
        } else {
          lastFailedSendRef.current = { content: messageContent, attachments, conversationId };
          setLastSendError(msg);
          setLastSendErrorDetail(detail);
          // Envio falhou de forma síncrona: zera a barra de progresso.
          setSendProgress(0);
          setInputValue(rawInput);
          if (wasReply) setReplyToMessage(wasReply);
          toast({ title: 'Erro ao enviar', description: msg, variant: 'destructive' });
        }
      } finally {
        setIsSending(false);
      }
    },
    [
      contactId,
      instanceName,
      editMessageApi,
      applySignature,
      onSendMessage,
      handleTypingStop,
      profile,
    ]
  );

  const retryLastSend = useCallback(async () => {
    if (isSendingRef.current) return;
    const audioPending = lastFailedAudioRef.current;
    if (audioPending) {
      // Etapa 44: trava por conversa — evita reenviar áudio de A para B
      if (audioPending.conversationId !== conversationId) {
        toast({
          title: 'Reenvio cancelado',
          description: 'O áudio pendente pertence a outra conversa.',
          variant: 'destructive',
        });
        lastFailedAudioRef.current = null;
        return;
      }
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
            ? (err as { detail: string }).detail
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
    // Etapa 44: trava por conversa — evita reenviar mensagem de A para B
    if (failedSend.conversationId !== conversationId) {
      toast({
        title: 'Reenvio cancelado',
        description: 'A mensagem pendente pertence a outra conversa.',
        variant: 'destructive',
      });
      lastFailedSendRef.current = null;
      return;
    }
    setIsSending(true);
    setLastSendError(null);
    setLastSendErrorDetail(null);
    try {
      await onSendMessage(failedSend.content, failedSend.attachments);
      lastFailedSendRef.current = null;
      toast({ title: 'Reenviado', description: 'A mensagem foi enviada com sucesso.' });
    } catch (err: unknown) {
      // ignore-audit
      log.error('Retry failed:', err);
      const msg = err instanceof Error ? err.message : 'Falha ao reenviar.';
      const detail =
        typeof (err as { detail?: string }).detail === 'string'
          ? (err as { detail: string }).detail
          : null;
      setLastSendError(msg);
      setLastSendErrorDetail(detail);
      toast({ title: 'Erro ao reenviar', description: msg, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [conversationId, onSendMessage]);

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
            ? (err as { detail: string }).detail
            : null;
        lastFailedAudioRef.current = { blob: audioBlob, onSendAudio, conversationId };
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
    // Etapa 45: conversationId deve estar nas deps para que o conversationId
    // capturado em lastFailedAudioRef seja sempre o da conversa ativa.
    [conversationId]
  );

  const { handleReplyToMessage, handleCopyMessage, handleForwardMessage, handleForwardToTargets } =
    useMessageReactionHandlers({
      inputRef,
      forwardMessage,
      setReplyToMessage,
      setForwardMessage,
      openDialog,
    });

  // ── BUG-03: callbacks reais dos slash commands ─────────────────────────────
  // Cada callback valida contato (UUID) e perfil autenticado e lanca erro —
  // o try/catch do useInputHandlers mostra toast de erro e so confirma
  // sucesso apos o INSERT/UPDATE resolver de verdade.

  const onResolveConversation = useCallback(async () => {
    if (!contactId || !isValidUUID(contactId) || !profile?.id) {
      throw new Error('Nao foi possivel resolver: contato ou usuario invalido.');
    }
    ticketStore.setStatus(contactId, 'resolved', profile.id);
  }, [contactId, profile]);

  const onSnooze = useCallback(
    async (until: string) => {
      if (!contactId || !isValidUUID(contactId) || !profile?.id) {
        throw new Error('Nao foi possivel adiar: contato ou usuario invalido.');
      }
      const { error } = await dbFrom('conversation_snoozes').insert({
        contact_id: contactId,
        snooze_until: until,
        snoozed_by: profile.id,
        reason: 'slash',
      });
      if (error) throw error;
    },
    [contactId, profile]
  );

  const onStarToggle = useCallback(async () => {
    if (!contactId || !isValidUUID(contactId) || !profile?.id) {
      throw new Error('Nao foi possivel favoritar: contato ou usuario invalido.');
    }
    // Ja favoritada por este usuario? Remove; senao, insere o pin.
    const { data: existing, error: selectError } = await dbFrom('pinned_conversations')
      .select('contact_id')
      .eq('contact_id', contactId)
      .eq('pinned_by', profile.id)
      .maybeSingle();
    if (selectError) throw selectError;
    if (existing) {
      const { error: deleteError } = await dbFrom('pinned_conversations')
        .delete()
        .eq('contact_id', contactId)
        .eq('pinned_by', profile.id);
      if (deleteError) throw deleteError;
    } else {
      const { error: insertError } = await dbFrom('pinned_conversations').insert({
        contact_id: contactId,
        pinned_by: profile.id,
        position: 0,
      });
      if (insertError) throw insertError;
    }
  }, [contactId, profile]);

  const onRemind = useCallback(
    async (at: string, title?: string) => {
      if (!contactId || !isValidUUID(contactId) || !profile?.id) {
        throw new Error('Nao foi possivel criar lembrete: contato ou usuario invalido.');
      }
      const { error } = await dbFrom('reminders').insert({
        contact_id: contactId,
        profile_id: profile.id,
        title: title ?? 'Lembrete',
        remind_at: at,
      });
      if (error) throw error;
    },
    [contactId, profile]
  );

  const onAddNote = useCallback(
    async (content: string) => {
      if (!contactId || !isValidUUID(contactId) || !profile?.id) {
        throw new Error('Nao foi possivel registrar nota: contato ou usuario invalido.');
      }
      const { error } = await dbFrom('contact_notes').insert({
        contact_id: contactId,
        author_id: profile.id,
        content,
      });
      if (error) throw error;
    },
    [contactId, profile]
  );

  const onAddTag = useCallback(
    async (name: string) => {
      if (!contactId || !isValidUUID(contactId) || !profile?.id) {
        throw new Error('Nao foi possivel adicionar tag: contato ou usuario invalido.');
      }
      // Procura a tag pelo nome (ILIKE) e vincula via contact_tags.
      const { data: tag, error: selectError } = await dbFrom('tags')
        .select('id')
        .ilike('name', `%${name}%`)
        .limit(1)
        .maybeSingle();
      if (selectError) throw selectError;
      if (!tag) {
        toast({ title: 'Tag nao encontrada', description: `Nenhuma tag com nome "${name}".` });
        return;
      }
      const { error: insertError } = await dbFrom('contact_tags').insert({
        contact_id: contactId,
        tag_id: tag.id,
      });
      if (insertError) throw insertError;
    },
    [contactId, profile]
  );

  const onTransferDialog = useCallback(() => {
    openDialog('transferDialog');
  }, [openDialog]);

  // /archive real (PR PR 773): arquiva a conversa atual via soft-delete.
  // O callback vem do ChatPanel (useArchiveConversationActions) e valida o
  // contato — o try/catch do useInputHandlers cuida do toast de erro.
  // Sem silent-fail: se o ChatPanel não fornecer onArchive, o comando FALHA
  // honestamente (throw → toast destructive) em vez de "suceder" sem efeito.
  const onArchiveChat = useCallback(async () => {
    if (!contactId || !isValidUUID(contactId)) {
      throw new Error('Nao foi possivel arquivar: contato invalido.');
    }
    if (!opts.onArchive) {
      throw new Error('Nao foi possivel arquivar: acao nao configurada.');
    }
    await opts.onArchive();
  }, [contactId, opts.onArchive]);

  const { handleInputChange, handleKeyDown, handleSlashCommand } = useInputHandlers({
    setInputValue,
    setIsWhisper,
    openDialog,
    closeDialog,
    handleTypingStart,
    handleTypingStop,
    handleSend,
    handleSetActiveTool,
    onResolveConversation,
    onSnooze,
    onStarToggle,
    onRemind,
    onAddNote,
    onAddTag,
    onTransferDialog,
    onArchive: onArchiveChat,
  });

  const {
    handleSendProduct,
    handleSendInteractiveMessage,
    handleInteractiveButtonClick,
    handleSendLocation,
  } = useProductHandlers({ onSendMessage, contactId, contactPhone, instanceName });

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
    // Etapa 41/42/46: expostos para o ChatPanel (snooze da toolbar, resolver do
    // menu e arquivar) — estavam definidos mas AUSENTES do return (TS2339).
    onResolveConversation,
    onSnooze,
    onArchive: onArchiveChat,
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
