import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TypingUser {
  userId: string;
  userName: string;
}

interface UseTypingPresenceParams {
  conversationId: string;
  currentUserId?: string;
  currentUserName?: string;
}

/** Hook: use Typing Presence. */
export function useTypingPresence({
  conversationId,
  currentUserId = '',
  currentUserName = '',
}: UseTypingPresenceParams) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channel = supabase.channel(`typing-presence-${conversationId}`);
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = (channel as unknown as { presenceState: () => Record<string, unknown[]> }) // ignore-audit — RealtimeChannel type omits presenceState(); runtime method exists; bridge exposes it safely
          .presenceState?.();
        if (!state) return;
        const users: TypingUser[] = [];
        Object.values(state).forEach((presences) => {
          (presences as Array<{ userId?: string; userName?: string; isTyping?: boolean }>).forEach(
            (p) => {
              if (p.isTyping && p.userId && p.userId !== currentUserId) {
                users.push({ userId: p.userId, userName: p.userName || '' });
              }
            }
          );
        });
        setTypingUsers(users);
      })
      .subscribe();

    return () => {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  const handleTypingStop = useCallback(() => {
    if (!channelRef.current) return;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    void channelRef.current
      .track({ userId: currentUserId, userName: currentUserName, isTyping: false })
      .catch(() => {});
  }, [currentUserId, currentUserName]);

  const handleTypingStart = useCallback(() => {
    if (!channelRef.current) return;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    void channelRef.current
      .track({ userId: currentUserId, userName: currentUserName, isTyping: true })
      .catch(() => {});
    stopTimerRef.current = setTimeout(() => {
      handleTypingStop();
    }, 3000);
  }, [currentUserId, currentUserName, handleTypingStop]);

  const isContactTyping = typingUsers.length > 0;

  return { typingUsers, handleTypingStart, handleTypingStop, isContactTyping };
}
