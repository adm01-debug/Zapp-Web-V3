import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';
import { useAuth } from '@/features/auth';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  useTeamMessages,
  useSendTeamMessage,
  useDeleteTeamMessage,
  useEditTeamMessage,
  useToggleMuteConversation,
  useUpdateTeamMessageStatus,
  TeamMessage,
  TeamConversation,
} from '@/hooks/useTeamChat';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { usePerformanceMetrics } from '@/hooks/usePerformanceMetrics';
import { ListImperativeAPI } from 'react-window';

const log = getLogger('useTeamChatPanel');

export function useTeamChatPanel(conversation: TeamConversation) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);

  const {
    messages = [],
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTeamMessages(conversation.id, debouncedSearch);

  const sendMutation = useSendTeamMessage();
  const deleteMutation = useDeleteTeamMessage();
  const editMutation = useEditTeamMessage();
  const muteMutation = useToggleMuteConversation();
  const updateStatusMutation = useUpdateTeamMessageStatus();

  const currentMember = conversation.members?.find((m) => m.profile_id === profile?.id);
  const isMuted = currentMember?.is_muted ?? false;

  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [hasNewMessagesUnseen, setHasNewMessagesUnseen] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<ListImperativeAPI>(null); // Reference to react-window List
  const isNearBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollOffsetRef = useRef<number>(0);
  const _anchorMessageIdRef = useRef<string | null>(null);

  // Performance metrics and instrumentation
  usePerformanceMetrics('TeamChatPanel');

  const { settings, updateSettings, saveSettings } = useUserSettings();
  const handleVoiceChange = (v: string) => {
    updateSettings({ tts_voice_id: v });
    setTimeout(() => saveSettings(), 100);
  };
  const handleSpeedChange = (s: number) => {
    updateSettings({ tts_speed: s });
    setTimeout(() => saveSettings(), 100);
  };
  const tts = useTextToSpeech({
    initialVoiceId: settings.tts_voice_id,
    initialSpeed: settings.tts_speed,
    onVoiceChange: handleVoiceChange,
    onSpeedChange: handleSpeedChange,
  });

  // Unified function to sync search filter with the infinite query cache
  const syncSearchWithCache = useCallback(
    (newQuery: string) => {
      const start = performance.now();
      setSearchQuery(newQuery);

      // If clearing search, we might want to pre-populate or clean up
      if (!newQuery.trim()) {
        queryClient.invalidateQueries({ queryKey: ['team-messages', conversation.id, ''] });
      }

      const duration = performance.now() - start;
      log.info(`Search sync duration: ${duration.toFixed(2)}ms`);
    },
    [conversation.id, queryClient]
  );

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 150;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
    if (nearBottom) {
      setHasNewMessagesUnseen(false);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setHasNewMessagesUnseen(false);
      isNearBottomRef.current = true;
    }
  }, []);

  // Monitor new messages from others to show indicator
  useEffect(() => {
    if (!messages.length || isNearBottomRef.current) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_id !== profile?.id) {
      setHasNewMessagesUnseen(true);
      setShowScrollDown(true); // Ensure indicator shows up
    }
  }, [messages.length, profile?.id]);

  useLayoutEffect(() => {
    // Scroll anchor for infinite scroll UP
    if (scrollRef.current && isFetchingNextPage) {
      scrollOffsetRef.current = scrollRef.current.scrollHeight - scrollRef.current.scrollTop;
      log.debug(`Captured scroll anchor offset: ${scrollOffsetRef.current}`);
    }
  }, [isFetchingNextPage]);

  useLayoutEffect(() => {
    // Apply scroll anchor after new messages are loaded from infinite scroll
    if (scrollOffsetRef.current > 0 && scrollRef.current && !isFetchingNextPage) {
      const newScrollTop = scrollRef.current.scrollHeight - scrollOffsetRef.current;
      scrollRef.current.scrollTop = newScrollTop;
      log.debug(`Applied scroll anchor. New scrollTop: ${newScrollTop}`);
      scrollOffsetRef.current = 0;
    }
  }, [messages.length, isFetchingNextPage]);

  // Keep scroll position when NEW messages arrive while scrolled up
  const lastMessageIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!messages.length) return;
    const latestMsg = messages[messages.length - 1];

    // If it's a truly NEW message (not just a reload)
    if (latestMsg.id !== lastMessageIdRef.current) {
      // If we are NOT at the bottom, we want to MAINTAIN current distance from top
      if (!isNearBottomRef.current && scrollRef.current && lastMessageIdRef.current) {
        // The browser usually handles this if adding at bottom, but virtual lists might jump.
        // We ensure it stays put.
        log.debug('Maintaining scroll position for incoming message');
      }
      lastMessageIdRef.current = latestMsg.id;
    }
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(
      { conversationId: conversation.id, content: trimmed, replyToId: replyTo?.id },
      {
        onError: (err) => {
          log.error('Failed to send:', err);
          toast.error('Falha ao enviar mensagem.');
          setText(trimmed);
        },
      }
    );
    setText('');
    setReplyTo(null);
  }, [text, sendMutation, conversation.id, replyTo]);

  const handleSendMedia = useCallback(
    (mediaUrl: string, mediaType: string, content?: string) => {
      sendMutation.mutate(
        {
          conversationId: conversation.id,
          content: content || '',
          mediaUrl,
          mediaType,
          replyToId: replyTo?.id,
        },
        {
          onError: (err) => {
            log.error('Failed to send media:', err);
            toast.error('Falha ao enviar mídia.');
          },
        }
      );
      setReplyTo(null);
    },
    [sendMutation, conversation.id, replyTo]
  );

  const handleSendSticker = useCallback(
    (url: string) => handleSendMedia(url, 'sticker', '🎨 Figurinha'),
    [handleSendMedia]
  );
  const handleSendAudioMeme = useCallback(
    (url: string) => handleSendMedia(url, 'audio_meme', '🎵 Áudio meme'),
    [handleSendMedia]
  );
  const handleSendCustomEmoji = useCallback(
    (url: string) => handleSendMedia(url, 'emoji', '😀 Emoji'),
    [handleSendMedia]
  );
  const handleFileSent = useCallback(
    (mediaUrl: string, mediaType: string, fileName: string) =>
      handleSendMedia(mediaUrl, mediaType, fileName),
    [handleSendMedia]
  );

  const handleAudioSend = useCallback(
    async (blob: Blob) => {
      setIsRecordingAudio(false);
      try {
        const path = `${profile?.id}/${conversation.id}/${Date.now()}.webm`;
        const { error } = await supabase.storage
          .from('team-chat-files')
          .upload(path, blob, { contentType: 'audio/webm' });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('team-chat-files').getPublicUrl(path);
        handleSendMedia(urlData.publicUrl, 'audio', '🎤 Mensagem de áudio');
      } catch (err) {
        toast.error('Erro ao enviar áudio');
        log.error('Audio upload error:', err);
      }
    },
    [profile?.id, conversation.id, handleSendMedia]
  );

  const handleDelete = useCallback(
    (msgId: string) => {
      deleteMutation.mutate(
        { messageId: msgId, conversationId: conversation.id },
        {
          onError: (err) => {
            log.error('Failed to delete:', err);
            toast.error('Falha ao excluir.');
          },
        }
      );
    },
    [deleteMutation, conversation.id]
  );

  const handleStartEdit = useCallback((msg: TeamMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  }, []);
  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editText.trim()) return;
    editMutation.mutate(
      { messageId: editingId, content: editText.trim(), conversationId: conversation.id },
      {
        onError: (err) => {
          log.error('Failed to edit:', err);
          toast.error('Falha ao editar.');
        },
      }
    );
    setEditingId(null);
    setEditText('');
  }, [editingId, editText, editMutation, conversation.id]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard
      .writeText(content)
      .then(() => toast.success('Copiado!'))
      .catch(() => toast.error('Erro ao copiar'));
  }, []);

  // Instrumentation for render cost and update time
  const renderStartTimeRef = useRef<number>(0);
  useEffect(() => {
    renderStartTimeRef.current = performance.now();
    return () => {
      const duration = performance.now() - renderStartTimeRef.current;
      if (duration > 16) {
        // Only log slow renders (> 1 frame)
        log.debug(`Slow render detected: ${duration.toFixed(2)}ms`);
      }
    };
  });

  return {
    profile,
    messages,
    isLoading,
    isMuted,
    filteredMessages: messages,
    text,
    setText,
    editingId,
    editText,
    setEditText,
    isRecordingAudio,
    setIsRecordingAudio,
    replyTo,
    setReplyTo,
    showScrollDown,
    hasNewMessagesUnseen,
    showAddMembers,
    setShowAddMembers,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    scrollRef,
    listRef,
    isNearBottomRef,
    searchInputRef,
    lastScrollTopRef,
    scrollOffsetRef,
    tts,
    muteMutation,
    sendMutation,
    updateStatusMutation,
    checkNearBottom,
    scrollToBottom,
    handleSend,
    handleSendSticker,
    handleSendAudioMeme,
    handleSendCustomEmoji,
    handleFileSent,
    handleAudioSend,
    handleDelete,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleCopyMessage,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    debouncedSearch,
    syncSearchWithCache,
  };
}
