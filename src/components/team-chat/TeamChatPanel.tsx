// @ts-nocheck
import { useEffect, useMemo, useState, useRef, memo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { getLogger } from '@/lib/logger';
import { List, useDynamicRowHeight } from 'react-window';
import { useAuth } from '@/features/auth';
import { TeamConversation } from '@/hooks/useTeamChat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowDown,
  Pencil,
  Trash2,
  X,
  Check,
  Reply,
  Image as ImageIcon,
  Music,
  FileText,
  Video,
  Copy,
  Volume2,
  VolumeX,
  Loader2,
  Search,
  Lock,
  Shield,
  Link2,
  SmilePlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MarkdownPreview } from '@/features/inbox';
import { AnimatePresence, motion } from 'framer-motion';
import { AddMembersDialog } from './AddMembersDialog';
import { TeamChatHeader } from './TeamChatHeader';
import { ParticipantStatsGraph } from './ParticipantStatsGraph';
import { TeamPerformancePanel } from './TeamPerformancePanel';
import { TeamChatInputArea } from './TeamChatInputArea';
import { useTeamChatPanel } from './useTeamChatPanel';
import { useTeamMessageReactions } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';
import { MessageReactions, QUICK_EMOJIS, TeamQuickReactionBar } from './MessageReactions';
import { TeamMessage } from '@/hooks/useTeamChat';
import { isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageStatus } from '@/features/inbox/components/MessageStatus';

function formatTime(dateStr: string) {
  return format(new Date(dateStr), 'HH:mm');
}
function formatDateSep(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

const MediaContent = memo(function MediaContent({ msg }: { msg: TeamMessage }) {
  if (!msg.media_url) return null;
  switch (msg.media_type) {
    case 'image':
    case 'sticker':
    case 'emoji':
      return (
        <img
          src={msg.media_url}
          alt="media"
          className={cn(
            'max-h-48 cursor-pointer rounded-lg object-contain',
            msg.media_type === 'sticker' || msg.media_type === 'emoji' ? 'h-24 w-24' : 'max-w-full'
          )}
          onClick={() => { if (msg.media_url) window.open(msg.media_url, '_blank', 'noopener,noreferrer'); }}
        />
      );
    case 'video':
      return <video src={msg.media_url} controls className="max-h-48 max-w-full rounded-lg" />;
    case 'audio':
    case 'audio_meme':
      return <audio src={msg.media_url} controls className="max-w-full" />;
    case 'document':
      return (
        <a
          href={msg.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-muted/30 p-2 transition-colors hover:bg-muted/50"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm text-foreground underline">
            {msg.content || 'Documento'}
          </span>
        </a>
      );
    default:
      return null;
  }
});

const MediaTypeIcon = memo(function MediaTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case 'image':
      return <ImageIcon className="h-3 w-3" />;
    case 'video':
      return <Video className="h-3 w-3" />;
    case 'audio':
    case 'audio_meme':
      return <Music className="h-3 w-3" />;
    case 'document':
      return <FileText className="h-3 w-3" />;
    default:
      return null;
  }
});

interface Props {
  conversation: TeamConversation;
  onBack: () => void;
  onToggleDetails?: () => void;
  showDetails?: boolean;
}

const log = getLogger('TeamChatPanel');

export function TeamChatPanel(props: Props) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-4 text-center text-destructive">
          Erro ao carregar o chat. Por favor, tente recarregar.
        </div>
      }
      onError={(error) => log.error('TeamChatPanel error:', error)}
    >
      <TeamChatPanelContent {...props} />
    </ErrorBoundary>
  );
}

function TeamChatPanelContent({ conversation, onBack, onToggleDetails, showDetails }: Props) {
  const [showStats, setShowStats] = useState<'participants' | 'performance' | null>(null);
  const s = useTeamChatPanel(conversation);
  const { profile: liveProfile } = useAuth();
  const {
    aggregate,
    toggle: toggleReaction,
    isToggling,
  } = useTeamMessageReactions(conversation.id);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 100, key: conversation.id });
  const itemHeights = useRef<Record<number, number>>({});

  // Keyboard shortcuts for chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD/CTRL + K to focus search inside chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        s.setShowSearch((prev) => !prev);
      }

      // ESC to close search or go back
      if (e.key === 'Escape') {
        if (s.showSearch) {
          s.setShowSearch(false);
          s.setSearchQuery('');
        } else if (onBack) {
          onBack();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [s.showSearch, onBack, s.setShowSearch, s.setSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDeptMember = useMemo(() => {
    if (conversation.type !== 'department') return true;
    if (liveProfile?.role === 'admin') return true;
    return liveProfile?.department_id === conversation.department_id;
  }, [conversation, liveProfile]);

  useEffect(() => {
    if (s.isNearBottomRef.current && s.scrollRef.current)
      s.scrollRef.current.scrollTop = s.scrollRef.current.scrollHeight;

    // Mark unread messages as read
    const unreadIds = s.filteredMessages
      .filter((m) => m.sender_id !== s.profile?.id && m.status !== 'read')
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      unreadIds.forEach((id) => {
        s.updateStatusMutation.mutate({
          messageId: id,
          status: 'read',
          conversationId: conversation.id,
        });
      });
    }
    // reset cache if needed (handled by dynamicRowHeight key mostly)
    itemHeights.current = {};
  }, [s.filteredMessages.length, conversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // If we are at the bottom, stay at the bottom
    if (s.isNearBottomRef.current && s.listRef.current) {
      const lastIndex = s.filteredMessages.length - 1;
      if (lastIndex >= 0) {
        s.listRef.current.scrollToRow({ index: lastIndex, align: 'end' });
      }
    }
  }, [s.filteredMessages.length, conversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle incoming messages while reading old ones
  useEffect(() => {
    if (!s.filteredMessages.length) return;

    const lastMsg = s.filteredMessages[s.filteredMessages.length - 1];
    const isNewMessageFromOthers = lastMsg.sender_id !== s.profile?.id;

    if (isNewMessageFromOthers && !s.isNearBottomRef.current && s.scrollRef.current) {
      // Don't auto-scroll, just keep position.
      // The scroll container naturally stays where it is if content is added at the end,
      // unless we are using a virtualized list that might shift things.
    }
  }, [s.filteredMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s.showSearch) s.searchInputRef.current?.focus();
  }, [s.showSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const dateFirstIndexes = useMemo(() => {
    const seen = new Set<string>();
    const result = new Set<number>();
    s.filteredMessages.forEach((msg, idx) => {
      const k = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (!seen.has(k)) {
        seen.add(k);
        result.add(idx);
      }
    });
    return result;
  }, [s.filteredMessages]);

  return (
    <div className="relative flex h-full w-full flex-col">
      <TeamChatHeader
        conversation={conversation}
        showDetails={showDetails}
        voiceId={s.tts.voiceId}
        speed={s.tts.speed}
        showSearch={s.showSearch}
        isMuted={s.isMuted}
        onBack={onBack}
        onToggleDetails={onToggleDetails}
        onToggleSearch={() => {
          s.setShowSearch(!s.showSearch);
          if (s.showSearch) s.setSearchQuery('');
        }}
        onAddMembers={() => s.setShowAddMembers(true)}
        onVoiceChange={s.tts.setVoiceId}
        onSpeedChange={s.tts.setSpeed}
        onToggleMute={() =>
          s.muteMutation.mutate({ conversationId: conversation.id, muted: !s.isMuted })
        }
        onToggleStats={() => setShowStats(showStats === 'participants' ? null : 'participants')}
        onTogglePerformance={() => setShowStats(showStats === 'performance' ? null : 'performance')}
        showStats={!!showStats}
      />

      <AnimatePresence>
        {s.showSearch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-border bg-card px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                ref={s.searchInputRef}
                value={s.searchQuery}
                onChange={(e) => s.syncSearchWithCache(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    s.setShowSearch(false);
                    s.setSearchQuery('');
                  }
                }}
                placeholder="Buscar nas mensagens..."
                className="h-8 text-sm"
              />
              {s.searchQuery && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {s.filteredMessages.length} resultado{s.filteredMessages.length !== 1 ? 's' : ''}
                </span>
              )}
              <Button aria-label="Fechar busca"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  s.setShowSearch(false);
                  s.setSearchQuery('');
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border bg-muted/30"
          >
            <div className="p-4">
              {showStats === 'participants' ? (
                <ParticipantStatsGraph conversationId={conversation.id} />
              ) : (
                <TeamPerformancePanel conversationId={conversation.id} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative min-h-0 flex-1 bg-background">
        <div
          ref={s.scrollRef}
          className="scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40 absolute inset-0 overflow-auto"
          onScroll={(e) => {
            s.checkNearBottom();
            const el = e.target as HTMLDivElement;

            // Infinite scroll UP
            if (el.scrollTop < 100 && s.hasNextPage && !s.isFetchingNextPage) {
              s.fetchNextPage();
            }

            s.lastScrollTopRef.current = el.scrollTop;
          }}
          role="log"
          aria-label="Mensagens da conversa"
          aria-live="polite"
        >
          {!isDeptMember ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-bold">Conteúdo Protegido</h3>
              <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                As mensagens deste departamento são privadas e restritas aos seus membros.
              </p>
              <div className="flex w-full max-w-[280px] flex-col gap-3">
                <div className="rounded-xl border border-border/50 bg-card p-3 text-left shadow-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                    <Shield className="h-3 w-3 text-primary" /> Solicitar Acesso
                  </p>
                  <p className="text-[11px] leading-normal text-muted-foreground">
                    Contate o administrador do sistema para que ele associe seu perfil a este
                    departamento.
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card p-3 text-left shadow-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                    <Link2 className="h-3 w-3 text-primary" /> Entrar via Código
                  </p>
                  <p className="text-[11px] leading-normal text-muted-foreground">
                    Se você recebeu um código de convite, utilize-o para entrar automaticamente
                    através do link oficial.
                  </p>
                </div>
              </div>
            </div>
          ) : s.isLoading && !s.filteredMessages.length ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                  <Skeleton className="h-10 rounded-2xl" style={{ width: 120 + (i % 3) * 60 }} />
                </div>
              ))}
            </div>
          ) : s.filteredMessages.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {s.searchQuery ? 'Nenhuma mensagem encontrada' : 'Envie a primeira mensagem!'}
            </div>
          ) : (
            <div className="relative flex h-full w-full flex-col">
              <AnimatePresence>
                {s.hasNewMessagesUnseen && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
                  >
                    <Button aria-label="Rolar para o final"
                      size="sm"
                      className="gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
                      onClick={s.scrollToBottom}
                    >
                      <ArrowDown className="h-4 w-4 animate-bounce" />
                      Pular para mensagens novas
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {s.isFetchingNextPage && (
                <div className="animate-pulse p-2 text-center text-xs text-muted-foreground">
                  Carregando mensagens anteriores...
                </div>
              )}
              <div className="relative flex-1">
                <List
                  listRef={s.listRef}
                  rowCount={s.filteredMessages.length}
                  rowHeight={dynamicRowHeight}
                  rowProps={{}}
                  className="scrollbar-none absolute inset-0"
                  overscanCount={10}
                  rowComponent={({ index, style, ariaAttributes }) => {
                    const msg = s.filteredMessages[index];
                    const showDate = dateFirstIndexes.has(index);
                    const isMine = msg.sender_id === s.profile?.id;
                    const isEditing = s.editingId === msg.id;
                    const hasMedia = !!msg.media_url;
                    const repliedMsg = msg.reply_to_id
                      ? s.messages.find((m) => m.id === msg.reply_to_id)
                      : null;
                    const isThisTtsPlaying = s.tts.isPlaying && s.tts.currentMessageId === msg.id;
                    const isThisTtsLoading = s.tts.isLoading && s.tts.currentMessageId === msg.id;
                    const cleanText = msg.content
                      ?.replace(/\[.*?\]/g, '')
                      .replace(/https?:\/\/\S+/g, '')
                      .trim();

                    return (
                      <div
                        style={style}
                        {...ariaAttributes}
                        ref={(el) => {
                          if (el && !itemHeights.current[index]) {
                            const h = el.getBoundingClientRect().height;
                            if (h > 0) {
                              itemHeights.current[index] = h;
                              dynamicRowHeight.setRowHeight(index, h);
                            }
                          }
                        }}
                      >
                        <ContextMenu key={msg.id}>
                          <ContextMenuTrigger asChild>
                            <div
                              data-testid={`message-container-${msg.id}`}
                              className="group/msg relative px-4"
                            >
                              {showDate && (
                                <div className="flex justify-center py-2">
                                  <span className="rounded-full border border-border/10 bg-muted/20 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                                    {formatDateSep(msg.created_at)}
                                  </span>
                                </div>
                              )}
                              <div
                                className={cn(
                                  'relative flex gap-2 py-0.5',
                                  isMine ? 'justify-end' : 'justify-start'
                                )}
                              >
                                {!isMine && (
                                  <Avatar className="mt-1 h-7 w-7 shrink-0">
                                    <AvatarImage src={msg.sender?.avatar_url || undefined} />
                                    <AvatarFallback className="bg-muted text-[10px]">
                                      {msg.sender?.name?.charAt(0) || '?'}
                                    </AvatarFallback>
                                  </Avatar>
                                )}

                                <div className={cn('relative max-w-[70%] space-y-1')}>
                                  <TeamQuickReactionBar
                                    messageId={msg.id}
                                    isMine={isMine}
                                    onToggle={(emoji) =>
                                      toggleReaction({ messageId: msg.id, emoji })
                                    }
                                    reactions={aggregate(msg.id)}
                                  />

                                  <div
                                    className={cn(
                                      'relative rounded-2xl px-3.5 py-2 shadow-none',
                                      isMine
                                        ? 'rounded-br-md bg-primary text-primary-foreground'
                                        : 'rounded-bl-md border border-border/20 bg-muted/30 text-foreground'
                                    )}
                                  >
                                    {!isMine && conversation.type === 'group' && (
                                      <p className="mb-1 text-[11px] font-bold text-primary opacity-90">
                                        {msg.sender?.name}
                                      </p>
                                    )}
                                    {repliedMsg && (
                                      <div
                                        className={cn(
                                          'mb-1.5 rounded border-l-2 px-2 py-1 text-[10px]',
                                          isMine
                                            ? 'border-primary-foreground/30 bg-primary-foreground/10'
                                            : 'border-muted-foreground/30 bg-muted/50'
                                        )}
                                      >
                                        <span className="font-medium">
                                          {repliedMsg.sender?.name}
                                        </span>
                                        <p className="flex items-center gap-1 truncate opacity-80">
                                          {repliedMsg.media_type && (
                                            <MediaTypeIcon type={repliedMsg.media_type} />
                                          )}
                                          {repliedMsg.content || 'Mídia'}
                                        </p>
                                      </div>
                                    )}
                                    {isEditing ? (
                                      <div className="space-y-1.5">
                                        <Input
                                          value={s.editText}
                                          onChange={(e) => s.setEditText(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') s.handleSaveEdit();
                                            if (e.key === 'Escape') s.handleCancelEdit();
                                          }}
                                          className="h-7 bg-background text-sm text-foreground"
                                          autoFocus
                                        />
                                        <div className="flex justify-end gap-1">
                                          <Button aria-label="Cancelar edição"
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5"
                                            onClick={s.handleCancelEdit}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                          <Button aria-label="Salvar edição"
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5"
                                            onClick={s.handleSaveEdit}
                                          >
                                            <Check className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {hasMedia && <MediaContent msg={msg} />}
                                        {msg.content &&
                                          (!hasMedia || msg.media_type === 'document') && (
                                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                              <MarkdownPreview
                                                text={msg.content}
                                                className="inline"
                                              />
                                            </p>
                                          )}
                                        {msg.content &&
                                          hasMedia &&
                                          msg.media_type !== 'document' &&
                                          ![
                                            '🎨 Figurinha',
                                            '🎵 Áudio meme',
                                            '😀 Emoji',
                                            '🎤 Mensagem de áudio',
                                          ].includes(msg.content) && (
                                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                                              {msg.content}
                                            </p>
                                          )}
                                        <div
                                          className={cn(
                                            'mt-0.5 flex items-center gap-1',
                                            isMine ? 'justify-end' : 'justify-between'
                                          )}
                                        >
                                          {cleanText && (
                                            <button
                                              onClick={() =>
                                                isThisTtsPlaying
                                                  ? s.tts.stop()
                                                  : s.tts.speak(msg.content, msg.id)
                                              }
                                              className={cn(
                                                'rounded-full p-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100',
                                                isMine
                                                  ? 'text-primary-foreground/60 hover:text-primary-foreground'
                                                  : 'text-muted-foreground hover:text-foreground'
                                              )}
                                            >
                                              {isThisTtsLoading ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : isThisTtsPlaying ? (
                                                <VolumeX className="h-3 w-3" />
                                              ) : (
                                                <Volume2 className="h-3 w-3" />
                                              )}
                                            </button>
                                          )}
                                          <div className="flex items-center gap-1">
                                            <span
                                              className={cn(
                                                'text-[10px]',
                                                isMine
                                                  ? 'text-primary-foreground/60'
                                                  : 'text-muted-foreground'
                                              )}
                                            >
                                              {formatTime(msg.created_at)}
                                              {msg.is_edited && ' · editado'}
                                            </span>
                                            {isMine && (
                                              <MessageStatus
                                                status={msg.status || 'sent'}
                                                className={cn(
                                                  'origin-right scale-75',
                                                  msg.status === 'read'
                                                    ? 'text-info'
                                                    : 'text-primary-foreground/60'
                                                )}
                                              />
                                            )}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <MessageReactions
                                messageId={msg.id}
                                reactions={aggregate(msg.id)}
                                isMine={isMine}
                                isToggling={isToggling}
                                onToggle={(emoji) => toggleReaction({ messageId: msg.id, emoji })}
                              />
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuSub>
                              <ContextMenuSubTrigger className="gap-2">
                                <SmilePlus className="h-3.5 w-3.5" /> Reagir
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                <div className="grid grid-cols-4 gap-1 p-1">
                                  {QUICK_EMOJIS.map((e) => (
                                    <Button
                                      key={e}
                                      size="icon"
                                      variant="ghost"
                                      onClick={() =>
                                        toggleReaction({ messageId: msg.id, emoji: e })
                                      }
                                      className="h-9 w-9 text-xl transition-all hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary"
                                      aria-label={`Reagir com ${e}`}
                                    >
                                      {e}
                                    </Button>
                                  ))}
                                </div>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                            <ContextMenuItem onClick={() => s.setReplyTo(msg)} className="gap-2">
                              <Reply className="h-3.5 w-3.5" /> Responder
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => s.handleCopyMessage(msg.content || '')}
                              className="gap-2"
                            >
                              <Copy className="h-3.5 w-3.5" /> Copiar Texto
                            </ContextMenuItem>
                            {isMine && (
                              <>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onClick={() => s.handleStartEdit(msg)}
                                  className="gap-2"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Editar
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => s.handleDelete(msg.id)}
                                  className="gap-2 text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                                </ContextMenuItem>
                              </>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      </div>
                    );
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {s.showScrollDown && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2"
          >
            {s.hasNewMessagesUnseen && (
              <div className="animate-bounce rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-md">
                Novas mensagens
              </div>
            )}
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full border border-primary/20 shadow-lg"
              onClick={s.scrollToBottom}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {isDeptMember ? (
        <TeamChatInputArea
          conversationId={conversation.id}
          text={s.text}
          setText={s.setText}
          replyTo={s.replyTo}
          isRecordingAudio={s.isRecordingAudio}
          isPending={s.sendMutation.isPending}
          onSend={s.handleSend}
          onCancelReply={() => s.setReplyTo(null)}
          onRecordToggle={() => s.setIsRecordingAudio(!s.isRecordingAudio)}
          onAudioSend={s.handleAudioSend}
          onSendSticker={s.handleSendSticker}
          onSendAudioMeme={s.handleSendAudioMeme}
          onSendCustomEmoji={s.handleSendCustomEmoji}
          onFileSent={s.handleFileSent}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 border-t border-border bg-muted/30 p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <Lock className="h-5 w-5 text-destructive" />
          </div>
          <p className="text-sm font-semibold text-foreground">Acesso Restrito ao Departamento</p>
          <p className="mb-4 max-w-xs text-xs text-muted-foreground">
            Você não faz parte deste departamento e não tem permissão para visualizar ou enviar
            mensagens.
          </p>
          <div className="max-w-xs rounded-xl border border-primary/10 bg-primary/5 p-4">
            <p className="mb-1 text-xs font-medium text-primary">Como obter acesso?</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Solicite ao administrador da sua conta ou ao gestor do departamento que inclua você
              via painel de membros ou enviando um código de convite.
            </p>
          </div>
        </div>
      )}

      <AddMembersDialog
        open={s.showAddMembers}
        onOpenChange={s.setShowAddMembers}
        conversation={conversation}
      />
    </div>
  );
}