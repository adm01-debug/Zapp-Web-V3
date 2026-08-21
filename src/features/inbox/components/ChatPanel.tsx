import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatScheduleMessage } from './chat/hooks/useChatScheduleMessage';
import { Conversation, Message } from '@/types/chat';
import { FileUploaderRef } from './FileUploader';
import { useTypingPresence } from '@/hooks/useTypingPresence';
import { useContactTyping } from '@/hooks/useContactTyping';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useQuickReplies } from '@/features/inbox';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useUserSettings } from '@/hooks/useUserSettings';
import { toast } from '@/hooks/use-toast';

import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { useMessageSignature } from '@/features/inbox';
import { useChatMediaSending } from '../hooks/useChatMediaSending';
import { resolveContactRef, isUuidRef } from '../utils/contactRef';
import { CRMAutoSync } from './CRMAutoSync';
import { ChatToolPanels } from './chat/ChatToolPanels';
import { ChatDialogs } from './chat/ChatDialogs';
import { ChatPanelHeader } from './chat/ChatPanelHeader';

import { ChatAssignedBar } from './chat/ChatAssignedBar';
import { TicketActionsBar } from './chat/TicketActionsBar';
import { TicketHistorySheet } from './TicketHistorySheet';
import { ChatMessagesArea, ChatMessagesAreaRef } from './chat/ChatMessagesArea';
import type { LoadOlderProps } from './chat/loadOlderTypes';
import { ChatInputArea } from './chat/ChatInputArea';
import { AutomationSuggestionsBar } from './chat/AutomationSuggestionsBar';
import { useAutomations } from '@/hooks/useAutomations';
import { SendErrorBanner } from './chat/SendErrorBanner';
import { ChatDragOverlay } from './chat/ChatDragOverlay';
import { ChatSearchBar } from './chat/ChatSearchBar';
import { useChatPanelHandlers } from './chat/useChatPanelHandlers';
import { snoozeDurationToDate, type SnoozeToolbarDuration } from './chat/snoozeDurations';
import { deriveContactJid } from '../utils/contactJid';
import type { SearchResult } from './useGlobalSearchData';
import type { ActiveTool } from './chat/ChatHeaderToolbar';
import { FailureFilterBar } from './chat/FailureFilterBar';
import { useChatFilters } from './chat/hooks/useChatFilters';
import { useSLADelivery } from './chat/hooks/useSLADelivery';
import { useChatSearchState } from './chat/hooks/useChatSearchState';
import { useChatDialogs } from './chat/hooks/useChatDialogs';
import { useAuth } from '@/features/auth';
import { useInitialHighlight } from './chat/hooks/useInitialHighlight';
import { useChatDragAndDrop } from './chat/hooks/useChatDragAndDrop';
import { ChatTemplatesOverlay } from './chat/ChatTemplatesOverlay';
import { ChatMonitoringDialog } from './chat/ChatMonitoringDialog';
import { ChatPanelOverlays } from './chat/ChatPanelOverlays';
import { useChatAutoScroll } from '../hooks/useChatAutoScroll';
import { useTransferConversation } from '../hooks/useTransferConversation';
import { useFavoriteMessage } from '@/hooks/useFavoriteMessage';
import { usePinMessage } from '@/hooks/usePinMessage';
import { useReportMessage } from '@/hooks/useReportMessage';
import { useInboxShortcuts } from '../hooks/useInboxShortcuts';
import { useArchiveConversationActions } from '../hooks/useArchiveConversationActions';
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';
import type { MessageQueueController } from '../hooks/useMessageQueue';
import { useUserRole } from '@/features/auth';
import { getLogger } from '@/lib/logger';

const log = getLogger('ChatPanel');

// Etapa 86: default estável para onToggleDetails — `|| (() => {})` inline
// criava uma arrow nova por render e quebrava memo de quem a recebia.
const noop = () => {};

if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  (window as Window).requestIdleCallback(() => {
    // Etapa 77: prefetch é otimização — sem o catch, chunk rotacionado
    // pós-deploy (hash antigo 404) virava unhandled rejection global.
    import('./TransferDialog').catch(() => {});
    import('./AIConversationAssistant').catch(() => {});
    import('./CloseConversationDialog').catch(() => {});
  });
}

interface ChatPanelProps extends LoadOlderProps {
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (
    content: string,
    attachments?: File[],
    onProgress?: (p: number) => void
  ) => void | Promise<void>;
  onSendAudio?: (blob: Blob) => Promise<void>;
  showDetails?: boolean;
  onToggleDetails?: () => void;
  onBack?: () => void;
  hideHeader?: boolean;
  initialHighlightMessageId?: string | null;
  onHighlightConsumed?: () => void;
  whisperCount?: number;
  isLoading?: boolean;
  messageQueue?: MessageQueueController;
  /** WhatsApp instance name for this conversation (enables edit, stickers, automations).
   *  Propagated from inbox source via RealtimeInboxView. */
  instanceName?: string;
}

export function ChatPanel({
  conversation,
  messages,
  onSendMessage,
  onSendAudio,
  showDetails = false,
  onToggleDetails = noop,
  onBack,
  hideHeader = false,
  onLoadOlder,
  onCancelLoadOlder,
  loadingOlder = false,
  hasMoreOlder = false,
  initialHighlightMessageId,
  onHighlightConsumed,
  whisperCount = 0,
  isLoading = false,
  messageQueue,
  instanceName: instanceNameProp,
}: ChatPanelProps) {
  // Ferramentas de desenvolvimento (Checklist 10/10) só para devs reais em ambiente allowlisted (E51).
  const { isDev: isDevExact } = useUserRole();
  const { dialogs, openDialog, closeDialog, resetAllDialogs } = useChatDialogs();
  const { profile } = useAuth();
  // Ações reais de arquivar/desarquivar (soft-delete do contato — PR PR 773).
  const { archive: archiveConversation } = useArchiveConversationActions();
  // Arquivar REAL da conversa ativa — mesma ação usada pelo slash /archive,
  // pelo menu do header (onArchiveConversation) e pelo atalho Mod+E.
  // Toasts de sucesso/erro vêm da mutation (useContactsMutations), padrão
  // ContactDetails: chamada direta + catch(() => undefined) p/ evitar
  // unhandled rejection (sem toast duplicado do wrapper do slash).
  const handleArchiveConversation = useCallback(() => {
    const id = conversation.contact.id;
    if (!id || !isValidUUID(id)) {
      // Etapa 14: o menu do header já desabilita o item p/ contato externo;
      // este toast cobre o Mod+E, que antes falhava em silêncio (paridade de
      // feedback com o slash /archive, que lança erro visível).
      toast({
        title: 'Não é possível arquivar',
        description: 'Contato externo (JID WhatsApp) sem cadastro interno.',
        variant: 'destructive',
      });
      return;
    }
    void archiveConversation(id).catch(() => undefined);
  }, [archiveConversation, conversation.contact.id]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const handleSetActiveTool = useCallback((tool: ActiveTool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }, []);

  useEffect(() => {
    // Etapa 85: comparações diretas — 'chatSearch'/'aiAssistant' pertencem ao
    // union ActiveTool; os casts `as string` eram ruído herdado.
    const isSearch = activeTool === 'chatSearch';
    const isAssistant = activeTool === 'aiAssistant';

    if (isSearch) openDialog('chatSearch');
    else closeDialog('chatSearch');

    if (isAssistant) openDialog('aiAssistant');
    else closeDialog('aiAssistant');
  }, [activeTool, openDialog, closeDialog]);

  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound'>('outbound');

  const chatSearch = useChatSearchState();
  const {
    highlightedMessageIds,
    activeHighlightId,
    searchQuery,
    setSearchQuery,
    resetSearch,
    handleHighlightChange,
    setHighlightedMessageIds,
    setActiveHighlightId,
  } = chatSearch;

  const filters = useChatFilters(messages);
  const {
    failuresOnly,
    failureCategory,
    setFailuresOnly,
    setFailureCategory,
    failedMessages,
    categoryCounts,
    categoryFilteredMessages,
    visibleMessages,
  } = filters;

  const fileUploaderRef = useRef<FileUploaderRef>(null);
  const messagesAreaRef = useRef<ChatMessagesAreaRef>(null);
  const { isDraggingOver, dragHandlers } = useChatDragAndDrop(fileUploaderRef);

  // Regra extraída para deriveContactJid (etapa 92) — testada em
  // utils/__tests__/contactJid.test.ts.
  const contactJid = useMemo(
    () => deriveContactJid(conversation.contact.remote_jid, conversation.contact.phone),
    [conversation.contact.remote_jid, conversation.contact.phone]
  );

  const { typingUsers, handleTypingStart, handleTypingStop } = useTypingPresence({
    conversationId: conversation.id,
    currentUserId: profile?.id || 'agent',
    currentUserName: profile?.name || 'Agente',
  });
  // `isContactTyping` vem do canal compartilhado `typing:${jid}` (broadcast do webhook).
  // Mantido em hook dedicado para evitar colisão de canais Realtime no client.
  const isContactTyping = useContactTyping(contactJid, {
    allowGroups: contactJid.endsWith('@g.us'),
  });
  const { quickReplies: dbQuickReplies, incrementUseCount } = useQuickReplies();
  const { settings, updateSettings, saveSettings } = useUserSettings();
  const { editMessage } = useEvolutionApi();
  const { scheduleMessage } = useScheduledMessages(conversation.contact.id ?? undefined);
  const { signatureEnabled, agentName, toggleSignature, applySignature } = useMessageSignature();
  const {
    instanceName,
    whatsappConnectionId,
    initResolve,
    handleSendSticker,
    handleSendCustomEmoji,
    handleSendAudioMeme,
  } = useChatMediaSending(
    conversation.contact.id ?? '',
    conversation.contact.phone ?? '',
    instanceNameProp
  );

  const saveSettingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSettingsRef = useRef(saveSettings);
  saveSettingsRef.current = saveSettings;
  const debouncedSave = useCallback(() => {
    if (saveSettingsTimerRef.current !== null) clearTimeout(saveSettingsTimerRef.current);
    saveSettingsTimerRef.current = setTimeout(() => {
      saveSettingsTimerRef.current = null;
      void saveSettings();
      // Etapa 35: 100ms gerava rajada de PATCH com o slider de velocidade.
    }, 500);
  }, [saveSettings]);
  useEffect(
    () => () => {
      // Etapa 34: FLUSH no unmount — só cancelar descartava mudança feita
      // <500ms antes de sair do painel (voz/velocidade nunca persistidas).
      if (saveSettingsTimerRef.current !== null) {
        clearTimeout(saveSettingsTimerRef.current);
        saveSettingsTimerRef.current = null;
        void saveSettingsRef.current();
      }
    },
    []
  );

  const handleVoiceChange = (v: string) => {
    updateSettings({ tts_voice_id: v });
    debouncedSave();
  };
  const handleSpeedChange = (s: number) => {
    updateSettings({ tts_speed: s });
    debouncedSave();
  };
  const {
    speak,
    stop,
    isLoading: ttsLoading,
    isPlaying: ttsPlaying,
    currentMessageId: ttsMessageId,
    voiceId,
    setVoiceId,
    speed,
    setSpeed,
  } = useTextToSpeech({
    initialVoiceId: settings.tts_voice_id,
    initialSpeed: settings.tts_speed,
    onVoiceChange: handleVoiceChange,
    onSpeedChange: handleSpeedChange,
  });

  const handlers = useChatPanelHandlers({
    conversationId: conversation.id ?? '',
    contactId: conversation.contact.id ?? '',
    contactPhone: conversation.contact.phone ?? '',
    instanceName,
    whatsappConnectionId,
    onSendMessage,
    editMessageApi: editMessage,
    applySignature,
    handleTypingStart,
    handleTypingStop,
    openDialog,
    closeDialog,
    handleSetActiveTool,
    // /archive real: soft-delete do contato (a sidebar refetcha via realtime;
    // sem onDone aqui pois ChatPanel não recebe refetch da lista).
    onArchive: handleArchiveConversation,
  });

  // Etapa 17: resolver do header unificado com o contrato do slash /resolve —
  // handlers.onResolveConversation LANÇA em contato/perfil inválido; chamado
  // cru pelo menu virava unhandled rejection sem nenhum feedback. Paridade com
  // o run() do useInputHandlers: sucesso só após a ação resolver de verdade.
  const { onResolveConversation } = handlers;
  const handleResolveFromHeader = useCallback(() => {
    void (async () => {
      try {
        await onResolveConversation();
        toast({
          title: 'Conversa Resolvida',
          description: 'A conversa foi marcada como resolvida.',
        });
      } catch (err) {
        toast({
          title: 'Erro',
          description: err instanceof Error ? err.message : 'Nao foi possivel concluir a acao.',
          variant: 'destructive',
        });
      }
    })();
  }, [onResolveConversation]);

  useEffect(() => {
    initResolve();
    // Etapa 36: `instanceNameProp` explícito nas deps — quando a prop chega
    // tarde (inbox resolve a instância async), o useChatMediaSending reseta o
    // resolvedRef e este effect precisa re-disparar sem depender da cascata de
    // identidade de initResolve. Limitação conhecida: com hint fornecido,
    // resolveInstance retorna cedo e whatsappConnectionId pode ficar null
    // (rastreado pelo log do eco local — etapa 21).
  }, [conversation.contact.id, instanceNameProp, initResolve]);

  // Avalia regras de automação para a conversa ativa
  useAutomations({
    remoteJid: conversation.contact.id,
    instanceName,
    assignedTo: conversation.assignedTo?.id ?? null,
  });

  // Monitora atraso na entrega (SLA Delivery)
  useSLADelivery({ contactId: conversation.contact.id ?? '', messages });

  const { bindScrollListener } = useChatAutoScroll({ messages, isContactTyping, messagesAreaRef });
  useEffect(() => {
    const el = messagesAreaRef.current?.getScrollContainer();
    return el ? bindScrollListener(el) : undefined;
    // Etapa 82: re-bind também na transição de loading — se o container do
    // scroll remontar no swap spinner→lista, o listener antigo morre com o
    // nó e o auto-scroll ficava sem rastreio até a próxima troca de conversa.
  }, [bindScrollListener, conversation.id, isLoading]);

  useInboxShortcuts({
    onSearchFocus: () => {
      if (activeTool === 'chatSearch') {
        // Already open, try to focus input via DOM if possible or just no-op
      } else {
        handleSetActiveTool('chatSearch');
      }
    },
    onNextConversation: () => {}, // Handled in Sidebar
    onPrevConversation: () => {}, // Handled in Sidebar
    // Mod+E arquiva a conversa ABERTA. Dono único do atalho com painel
    // montado: a Sidebar cede via enableArchive=!selectedContactId
    // (ConversationListSidebar) — sem duplo disparo (etapas 12–13, PR #1350).
    onArchive: handleArchiveConversation,
    onTransfer: () => handlers.handleSlashCommand({ id: 'transfer' }),
    onRefresh: () => {}, // Handled in Sidebar
    onSearchFocusChat: () => handleSetActiveTool('chatSearch'),
  });

  useEffect(() => {
    setActiveTool(null);
    resetSearch();
    setFailuresOnly(false);
    resetAllDialogs();
    setHistoryOpen(false);
    // Etapa 39: direção de chamada residual da conversa anterior não deve
    // pré-selecionar o dialog de chamada da próxima.
    setCallDirection('outbound');
  }, [conversation.id, resetSearch, setFailuresOnly, resetAllDialogs]);

  // Deep-link "Ver no chat": encontra a mensagem alvo, faz scroll e aplica destaque temporário.
  useInitialHighlight({
    initialHighlightMessageId,
    messages,
    messagesAreaRef,
    setHighlightedMessageIds,
    setActiveHighlightId,
    onHighlightConsumed,
  });

  // Bloco 6 (etapas 57–61): callbacks estáveis para os filhos memoizados.
  // O controle de respostas rápidas + popover DESCERAM para o ChatInputArea
  // (etapa 59) — este componente não lê mais o valor do input por tecla.
  const openQuickReplies = useCallback(() => openDialog('quickReplies'), [openDialog]);
  const closeQuickReplies = useCallback(() => closeDialog('quickReplies'), [closeDialog]);
  const closeSlashCommands = useCallback(() => closeDialog('slashCommands'), [closeDialog]);
  const openInteractiveBuilder = useCallback(() => openDialog('interactiveBuilder'), [openDialog]);
  const openScheduleDialog = useCallback(() => openDialog('scheduleDialog'), [openDialog]);
  const openLocationPicker = useCallback(() => openDialog('locationPicker'), [openDialog]);
  const openCatalogDirect = useCallback(() => openDialog('catalogDirect'), [openDialog]);
  const openTransferDialog = useCallback(() => openDialog('transferDialog'), [openDialog]);
  const openCloseDialog = useCallback(() => openDialog('closeDialog'), [openDialog]);
  const openValidationDialog = useCallback(() => openDialog('visualValidation'), [openDialog]);
  const openTeamFiles = useCallback(() => handleSetActiveTool('teamFiles'), [handleSetActiveTool]);
  const openChatSearchTool = useCallback(
    () => handleSetActiveTool('chatSearch'),
    [handleSetActiveTool]
  );
  const openAIAssistantTool = useCallback(
    () => handleSetActiveTool('aiAssistant'),
    [handleSetActiveTool]
  );
  const { setIsWhisper, setReplyToMessage, setIsRecordingAudio, handleAudioSend } = handlers;
  const toggleWhisper = useCallback(() => setIsWhisper((v) => !v), [setIsWhisper]);
  const cancelReply = useCallback(() => setReplyToMessage(null), [setReplyToMessage]);
  const toggleRecording = useCallback(() => setIsRecordingAudio((v) => !v), [setIsRecordingAudio]);
  const cancelRecording = useCallback(() => setIsRecordingAudio(false), [setIsRecordingAudio]);
  const handleAudioSendWithProp = useCallback(
    (blob: Blob) => handleAudioSend(blob, onSendAudio),
    [handleAudioSend, onSendAudio]
  );
  const startOutboundCall = useCallback(() => {
    setCallDirection('outbound');
    openDialog('callDialog');
  }, [openDialog]);
  const toggleFailuresOnly = useCallback(() => setFailuresOnly((v) => !v), [setFailuresOnly]);

  // Stable refs for ChatMessagesArea to prevent re-renders on input change
  const contactAvatar = conversation.contact.avatar || undefined;

  // Etapa 81: setTimeouts de focus com cleanup centralizado — ids soltos
  // vazavam depois do unmount (focus em ref de painel desmontado).
  const focusTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const { inputRef } = handlers;
  const focusInputSoon = useCallback(
    (delayMs: number) => {
      const id = setTimeout(() => {
        focusTimersRef.current.delete(id);
        inputRef.current?.focus();
      }, delayMs);
      focusTimersRef.current.add(id);
    },
    [inputRef]
  );
  useEffect(
    () => () => {
      const timers = focusTimersRef.current;
      timers.forEach(clearTimeout);
      timers.clear();
    },
    []
  );

  // Etapa 48: navegação para mensagem respeitando o filtro de falhas — o
  // scrollToMessage retornava false (hit fora de visibleMessages) e virava
  // no-op SILENCIOSO. Agora: com filtro ativo, desliga o filtro, avisa e
  // re-tenta; fora da janela carregada, avisa em vez de silenciar.
  const failuresOnlyRef = useRef(failuresOnly);
  failuresOnlyRef.current = failuresOnly;
  const handleScrollToMessage = useCallback(
    (id: string) => {
      const found = messagesAreaRef.current?.scrollToMessage(id) ?? false;
      if (found) return;
      if (failuresOnlyRef.current) {
        setFailuresOnly(false);
        toast({
          title: 'Filtro de falhas desativado',
          description: 'A mensagem estava oculta pelo filtro.',
        });
        const retryId = setTimeout(() => {
          focusTimersRef.current.delete(retryId);
          messagesAreaRef.current?.scrollToMessage(id);
        }, 50);
        focusTimersRef.current.add(retryId);
        return;
      }
      toast({
        title: 'Mensagem fora da janela carregada',
        description: 'Carregue mensagens mais antigas para visualizá-la.',
      });
    },
    [setFailuresOnly]
  );

  // Etapa 47: fechar a busca é EXPLÍCITO — o toggle antigo
  // (handleSetActiveTool('chatSearch')) REABRIRIA a barra caso o estado já
  // tivesse divergido (ex.: resetado pela troca de conversa).
  const closeChatSearch = useCallback(() => {
    setActiveTool((prev) => (prev === 'chatSearch' ? null : prev));
    focusInputSoon(150);
  }, [focusInputSoon]);

  const handleSelectSearchResult = useCallback(
    (result: SearchResult) => {
      // Etapa 51 (BUG-24 residual): mensagem navega direto; resultado com
      // `action` própria executa-a; contato/CRM não têm API de navegação de
      // conversa DENTRO do painel (a seleção vive no RealtimeInboxView) —
      // feedback honesto com instrução em vez de toast morto.
      if (result.type === 'message' && result.id) {
        handleScrollToMessage(result.id);
        return;
      }
      if (result.action) {
        result.action();
        return;
      }
      toast({
        title: result.type === 'contact' ? 'Contato encontrado' : 'Resultado',
        description:
          result.type === 'contact'
            ? `Abra "${result.title}" pela lista de conversas.`
            : result.title,
      });
    },
    [handleScrollToMessage]
  );

  // Etapa 41: "Responder depois" da toolbar de mensagem — converte a duração
  // em data e delega ao snooze real da conversa (useChatPanelHandlers.onSnooze).
  const { onSnooze } = handlers;
  const handleSnoozeFromToolbar = useCallback(
    (duration: SnoozeToolbarDuration) => {
      // Durações extraídas p/ snoozeDurationToDate (etapa 93) — testadas com
      // relógio fake em __tests__/snoozeDurations.test.ts.
      const until = snoozeDurationToDate(duration);
      // Etapa 73: origem real ('toolbar') em vez do 'slash' herdado do default.
      void onSnooze(until.toISOString(), 'toolbar').catch(() => {
        log.warn('[ChatPanel] Falha ao adiar conversa pela toolbar');
      });
    },
    [onSnooze]
  );

  // Etapa 44: ações de mensagem com backend real — instanciadas UMA vez por
  // conversa (não por mensagem) e passadas até a toolbar via messageActions.
  const favoriteMsg = useFavoriteMessage();
  const pinMsg = usePinMessage();
  const reportMsg = useReportMessage();
  const messageActions = useMemo(
    () => ({
      toggleFavorite: favoriteMsg.toggleFavorite,
      isFavorite: favoriteMsg.isFavorite,
      togglePin: pinMsg.togglePin,
      isPinned: pinMsg.isPinned,
      report: reportMsg.report,
      hasReported: reportMsg.hasReported,
    }),
    [
      favoriteMsg.toggleFavorite,
      favoriteMsg.isFavorite,
      pinMsg.togglePin,
      pinMsg.isPinned,
      reportMsg.report,
      reportMsg.hasReported,
    ]
  );

  const { transferConversation: handleTransfer } = useTransferConversation({
    contactId: conversation.contact.id ?? '',
    whatsappConnectionId: whatsappConnectionId ?? undefined,
  });

  const handleScheduleMessage = useChatScheduleMessage({
    contactId: conversation.contact.id ?? '',
    scheduleMessage,
    onDone: () => closeDialog('scheduleDialog'),
  });

  // Etapas 19–22: eco local de enquete/cartão de contato — helper ÚNICO (antes
  // duplicado inline no JSX e recriado a cada render). O callback dispara
  // APÓS o envio real resolver no AdvancedMessageMenu (`await sendPoll...`),
  // por isso `status: 'sent'` é honesto aqui (etapa 20). Em modo externo
  // (JID) não insere: o webhook da Evolution já persiste a mensagem.
  // Etapa 84 (verificado no DB 2026-08-21): zapp.messages é VIEW com triggers
  // INSTEAD OF (fn_messages_view_insert_handler) roteando para a MESMA base
  // física do editMessage (evo.evolution_messages) — caminhos consistentes.
  const echoContactId = conversation.contact.id;
  const insertLocalEcho = useCallback(
    async (content: string) => {
      if (!isValidUUID(echoContactId)) return;
      try {
        const ref = resolveContactRef(echoContactId);
        if (!isUuidRef(ref)) return;
        if (!whatsappConnectionId) {
          // Etapa 21: conexão ainda não resolvida — o eco entra sem vínculo
          // (histórico vale mais que o vínculo), mas fica rastreável no log.
          log.warn('[ChatPanel] eco local sem whatsapp_connection_id', { contactId: ref.uuid });
        }
        await dbFrom('messages').insert({
          contact_id: ref.uuid,
          whatsapp_connection_id: whatsappConnectionId,
          content,
          message_type: 'text',
          sender: 'agent',
          status: 'sent',
        });
      } catch (err) {
        log.error('[ChatPanel] falha ao inserir eco local', err);
      }
    },
    [echoContactId, whatsappConnectionId]
  );
  const handlePollSent = useCallback(
    (poll: { name: string; options: string[]; selectableCount: number }) =>
      void insertLocalEcho(
        `📊 *Enquete:* ${poll.name}\n${poll.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
      ),
    [insertLocalEcho]
  );
  const handleContactSent = useCallback(
    (contactName: string) => void insertLocalEcho(`📇 Cartão de contato: ${contactName}`),
    [insertLocalEcho]
  );

  return (
    <div
      data-testid="chat-window"
      // Etapa 96 (E2E follow-up): expõe o JID resolvido para o teste de
      // broadcast de digitação simular o canal `typing:${jid}` correto sem
      // depender de um contato fixo no fixture de E2E.
      data-contact-jid={contactJid}
      className={`relative flex h-full min-h-0 min-w-0 overflow-hidden bg-muted/20 antialiased`}
      {...dragHandlers}
    >
      <ChatDragOverlay isDraggingOver={isDraggingOver} />
      {/* Etapa 62: messageCount removido — era messages.length duplicado. */}
      <CRMAutoSync conversation={conversation} messages={messages} />

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--background))]">
        {!hideHeader && (
          <ChatPanelHeader
            conversation={conversation}
            isContactTyping={isContactTyping}
            showAIAssistant={activeTool === 'aiAssistant'}
            showDetails={showDetails}
            voiceId={voiceId}
            speed={speed}
            onToggleAIAssistant={openAIAssistantTool}
            onToggleDetails={onToggleDetails}
            onStartCall={startOutboundCall}
            onOpenSearch={openChatSearchTool}
            onOpenValidation={isDevExact ? openValidationDialog : undefined}
            onResolveConversation={handleResolveFromHeader}
            onArchiveConversation={handleArchiveConversation}
            onOpenTransfer={openTransferDialog}
            onOpenSchedule={openScheduleDialog}
            onVoiceChange={setVoiceId}
            onSpeedChange={setSpeed}
            onBack={onBack}
            onGenerateSummary={openAIAssistantTool}
            onCloseConversation={openCloseDialog}
            failuresOnly={failuresOnly}
            failuresCount={failedMessages.length}
            onToggleFailuresOnly={toggleFailuresOnly}
            activeTool={activeTool}
            whisperCount={whisperCount}
            onSetActiveTool={handleSetActiveTool}
          />
        )}

        {activeTool === 'templates' && (
          <ChatTemplatesOverlay
            contactName={conversation.contact.name ?? undefined}
            contactCompany={conversation.contact.company ?? undefined}
            onClose={() => setActiveTool(null)}
            onUseTemplate={(content) => {
              handlers.setInputValue(content);
              setActiveTool(null);
              focusInputSoon(10);
            }}
          />
        )}

        <ChatSearchBar
          messages={messages}
          isOpen={activeTool === 'chatSearch'}
          onClose={closeChatSearch}
          onNavigateToMessage={handleScrollToMessage}
          onHighlightChange={handleHighlightChange}
          onSearchQueryChange={setSearchQuery}
        />

        {/* Etapa 83: ticket overlay indexa por contact_id — em modo externo
            (JID/'' ) montaria com chave inválida e sujaria o storage local. */}
        {isValidUUID(conversation.contact.id) && (
          <>
            <TicketActionsBar
              contactId={conversation.contact.id}
              onOpenHistory={() => setHistoryOpen(true)}
            />
            <TicketHistorySheet
              contactId={conversation.contact.id}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
            />
          </>
        )}
        <ChatAssignedBar conversation={conversation} onOpenTransfer={openTransferDialog} />

        <FailureFilterBar
          failuresOnly={failuresOnly}
          failureCategory={failureCategory}
          categoryFilteredMessages={categoryFilteredMessages}
          failedMessagesCount={failedMessages.length}
          categoryCounts={categoryCounts}
          hasMoreOlder={hasMoreOlder}
          setFailureCategory={setFailureCategory}
          setFailuresOnly={setFailuresOnly}
        />

        <ChatPanelOverlays
          contactId={conversation.contact.id ?? ''}
          contactName={conversation.contact.name ?? ''}
          showVisualValidation={dialogs.visualValidation}
          onCloseVisualValidation={() => closeDialog('visualValidation')}
          showWhisper={dialogs.whisper}
        />

        <ChatMessagesArea
          ref={messagesAreaRef}
          messages={visibleMessages}
          isContactTyping={isContactTyping}
          // Etapa 31: indicadores separados — o do contato usa o NOME DO
          // CONTATO (antes um agente digitando ao mesmo tempo sobrescrevia o
          // nome); o de agente tem fallback honesto 'Agente'.
          typingUserName={conversation.contact.name ?? ''}
          agentTypingName={typingUsers.length > 0 ? typingUsers[0].name || 'Agente' : null}
          ttsLoading={ttsLoading}
          ttsPlaying={ttsPlaying}
          ttsMessageId={ttsMessageId}
          instanceName={instanceName}
          contactJid={contactJid}
          contactAvatar={contactAvatar}
          onSpeak={speak}
          onStop={stop}
          onReply={handlers.handleReplyToMessage}
          onForward={handlers.handleForwardMessage}
          onCopy={handlers.handleCopyMessage}
          onScrollToMessage={handleScrollToMessage}
          onInteractiveButtonClick={handlers.handleInteractiveButtonClick}
          onEditStart={handlers.handleEditStart}
          onSnoozeConversation={handleSnoozeFromToolbar}
          messageActions={messageActions}
          highlightedMessageIds={highlightedMessageIds}
          activeHighlightId={activeHighlightId}
          searchQuery={searchQuery}
          onLoadOlder={failuresOnly ? undefined : onLoadOlder}
          onCancelLoadOlder={failuresOnly ? undefined : onCancelLoadOlder}
          loadingOlder={failuresOnly ? false : loadingOlder}
          hasMoreOlder={failuresOnly ? false : hasMoreOlder}
          isLoading={isLoading}
          onAudioVoiceChange={handlers.handleAudioVoiceChange}
        />

        <SendErrorBanner
          error={handlers.lastSendError}
          detail={handlers.lastSendErrorDetail}
          isRetrying={handlers.isSending}
          onRetry={handlers.retryLastSend}
          onDismiss={handlers.dismissSendError}
        />

        <AutomationSuggestionsBar
          contactId={conversation.contact.id}
          onUseSuggestion={handlers.setInputValue}
        />

        <ChatInputArea
          inputStore={handlers.inputStore}
          replyToMessage={handlers.replyToMessage}
          editingMessage={handlers.editingMessage}
          isRecordingAudio={handlers.isRecordingAudio}
          showSlashCommands={dialogs.slashCommands}
          quickRepliesOpen={dialogs.quickReplies}
          onOpenQuickReplies={openQuickReplies}
          onCloseQuickReplies={closeQuickReplies}
          incrementQuickReplyUse={incrementUseCount}
          contactId={conversation.contact.id ?? ''}
          contactPhone={conversation.contact.phone ?? ''}
          contactName={conversation.contact.name ?? ''}
          instanceName={instanceName}
          messages={messages}
          quickReplies={dbQuickReplies}
          isSending={handlers.isSending}
          sendProgress={handlers.sendProgress}
          isWhisper={handlers.isWhisper}
          onToggleWhisper={toggleWhisper}
          onInputChange={handlers.handleInputChange}
          onKeyDown={handlers.handleKeyDown}
          onBlur={handleTypingStop}
          onSend={handlers.handleSend}
          onCancelReply={cancelReply}
          onCancelEdit={handlers.handleCancelEdit}
          onEditStart={handlers.handleEditStart}
          onSlashCommand={handlers.handleSlashCommand}
          onCloseSlashCommands={closeSlashCommands}
          onRecordToggle={toggleRecording}
          onAudioSend={handleAudioSendWithProp}
          onAudioCancel={cancelRecording}
          onOpenInteractiveBuilder={openInteractiveBuilder}
          onOpenSchedule={openScheduleDialog}
          onOpenLocationPicker={openLocationPicker}
          onSendProduct={handlers.handleSendProduct}
          onSendSticker={handleSendSticker}
          onSendAudioMeme={handleSendAudioMeme}
          onSendCustomEmoji={handleSendCustomEmoji}
          signatureEnabled={signatureEnabled}
          signatureName={agentName}
          onToggleSignature={toggleSignature}
          onPollSent={handlePollSent}
          onContactSent={handleContactSent}
          onOpenCatalog={openCatalogDirect}
          onSelectSuggestion={handlers.setInputValue}
          onSelectTemplate={handlers.setInputValue}
          onOpenTeamFiles={openTeamFiles}
          fileUploaderRef={fileUploaderRef}
          inputRef={handlers.inputRef}
          queue={messageQueue?.queue}
          onRetry={messageQueue?.retryMessage}
          onRemoveFromQueue={messageQueue?.removeFromQueue}
        />

        <ChatDialogs
          dialogs={dialogs}
          openDialog={openDialog}
          closeDialog={closeDialog}
          conversation={conversation}
          forwardMessage={handlers.forwardMessage}
          callDirection={callDirection}
          contactId={conversation.contact.id ?? ''}
          onTransfer={handleTransfer}
          onScheduleMessage={handleScheduleMessage}
          onSendInteractiveMessage={handlers.handleSendInteractiveMessage}
          onForwardToTargets={handlers.handleForwardToTargets}
          onSendLocation={handlers.handleSendLocation}
          onSendProduct={handlers.handleSendProduct}
          onSetInputValue={handlers.setInputValue}
          onSelectSearchResult={handleSelectSearchResult}
        />
      </div>

      <ChatToolPanels
        activeTool={activeTool}
        onSetActiveTool={handleSetActiveTool}
        messages={messages}
        contactId={conversation.contact.id ?? ''}
        contactName={conversation.contact.name ?? ''}
        onSelectSuggestion={handlers.setInputValue}
      />
      <ChatMonitoringDialog
        open={activeTool === 'monitoring'}
        onOpenChange={(open) => !open && handleSetActiveTool(null)}
        metrics={activeTool === 'monitoring' ? messageQueue?.getMetrics() : undefined}
      />
    </div>
  );
}
