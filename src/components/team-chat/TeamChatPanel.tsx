import { useEffect, useMemo, useState, useRef } from 'react';
import { format } from 'date-fns';
import { ErrorBoundary } from 'react-error-boundary';
import { getLogger } from '@/lib/logger';
import { List, useDynamicRowHeight } from 'react-window';
import { useAuth } from '@/features/auth';
import { TeamConversation } from '@/hooks/useTeamChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence, motion } from 'framer-motion';
import { AddMembersDialog } from './AddMembersDialog';
import { TeamChatHeader } from './TeamChatHeader';
import { ParticipantStatsGraph } from './ParticipantStatsGraph';
import { TeamPerformancePanel } from './TeamPerformancePanel';
import { TeamChatInputArea } from './TeamChatInputArea';
import { useTeamChatPanel } from './useTeamChatPanel';
import { useTeamMessageReactions } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';
import { LockedDeptView, LockedInputFooter } from './teamChatParts';
import { TeamChatMessageRow } from './TeamChatMessageRow';

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        s.setShowSearch((prev) => !prev);
      }

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
  }, [s.showSearch, onBack, s.setShowSearch, s.setSearchQuery]);

  const isDeptMember = useMemo(() => {
    if (conversation.type !== 'department') return true;
    if (liveProfile?.role === 'admin') return true;
    return liveProfile?.department_id === conversation.department_id;
  }, [conversation, liveProfile]);

  useEffect(() => {
    if (s.isNearBottomRef.current && s.scrollRef.current)
      s.scrollRef.current.scrollTop = s.scrollRef.current.scrollHeight;

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
    itemHeights.current = {};
  }, [s.filteredMessages.length, conversation.id]);

  useEffect(() => {
    if (s.isNearBottomRef.current && s.listRef.current) {
      const lastIndex = s.filteredMessages.length - 1;
      if (lastIndex >= 0) {
        s.listRef.current.scrollToRow({ index: lastIndex, align: 'end' });
      }
    }
  }, [s.filteredMessages.length, conversation.id]);

  useEffect(() => {
    if (s.showSearch) s.searchInputRef.current?.focus();
  }, [s.showSearch]);

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
              <Button
                aria-label="Fechar busca"
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
            <LockedDeptView />
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
                    <Button
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
                    const isMine = msg.sender_id === s.profile?.id;
                    const repliedMsg = msg.reply_to_id
                      ? s.messages.find((m) => m.id === msg.reply_to_id)
                      : null;
                    const cleanText = msg.content
                      ?.replace(/\[.*?\]/g, '')
                      .replace(/https?:\/\/\S+/g, '')
                      .trim();
                    return (
                      <TeamChatMessageRow
                        index={index}
                        style={style}
                        ariaAttributes={ariaAttributes}
                        onMeasure={(i, h) => {
                          if (!itemHeights.current[i]) {
                            itemHeights.current[i] = h;
                            dynamicRowHeight.setRowHeight(i, h);
                          }
                        }}
                        msg={msg}
                        showDate={dateFirstIndexes.has(index)}
                        isMine={isMine}
                        isEditing={s.editingId === msg.id}
                        repliedMsg={repliedMsg ?? null}
                        isThisTtsPlaying={s.tts.isPlaying && s.tts.currentMessageId === msg.id}
                        isThisTtsLoading={s.tts.isLoading && s.tts.currentMessageId === msg.id}
                        cleanText={cleanText ?? ''}
                        conversationType={conversation.type}
                        editText={s.editText}
                        onEditTextChange={s.setEditText}
                        onSaveEdit={s.handleSaveEdit}
                        onCancelEdit={s.handleCancelEdit}
                        onDelete={s.handleDelete}
                        onCopy={s.handleCopyMessage}
                        onReply={s.setReplyTo}
                        onStartEdit={s.handleStartEdit}
                        onTtsSpeak={s.tts.speak}
                        onTtsStop={s.tts.stop}
                        reactions={aggregate(msg.id)}
                        isToggling={isToggling}
                        onToggleReaction={toggleReaction}
                      />
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
              aria-label="Rolar para o final"
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
        <LockedInputFooter />
      )}

      <AddMembersDialog
        open={s.showAddMembers}
        onOpenChange={s.setShowAddMembers}
        conversation={conversation}
      />
    </div>
  );
}
