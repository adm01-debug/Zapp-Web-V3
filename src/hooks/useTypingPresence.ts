import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

interface TypingUser {
  oderId: string;
  name: string;
  isTyping: boolean;
  lastTyped: string;
}

interface PresenceState {
  oderId?: string;
  name?: string;
  isTyping?: boolean;
  lastTyped?: string;
}

interface UseTypingPresenceProps {
  conversationId: string;
  currentUserId?: string;
  currentUserName?: string;
  /**
   * Opcional. Quando presente, sobrescreve `conversationId` na chave do canal
   * (`typing:${remoteJid}`). Permite sincronizar com o broadcast emitido pelo
   * webhook (que usa `remote_jid` como chave estável).
   */
  remoteJid?: string;
}

export function useTypingPresence({
  conversationId,
  currentUserId = 'agent',
  currentUserName = 'Agente',
  remoteJid,
}: UseTypingPresenceProps) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contactTypingRef = useRef(false);
  const contactTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track current user typing
  const setTyping = useCallback(
    async (isTyping: boolean) => {
      if (!channelRef.current) return;

      try {
        await channelRef.current.track({
          oderId: currentUserId,
          name: currentUserName,
          isTyping,
          lastTyped: new Date().toISOString(),
        });
      } catch (error) {
        log.error('Error tracking typing status:', error);
      }
    },
    [currentUserId, currentUserName]
  );

  // Debounced typing indicator - call when user is typing
  const handleTypingStart = useCallback(() => {
    setTyping(true);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 3000);
  }, [setTyping]);

  // Stop typing immediately
  const handleTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setTyping(false);
  }, [setTyping]);

  useEffect(() => {
    if (!conversationId) return;

    // Chave do canal: prefere `remoteJid` quando fornecido (sincroniza com webhook).
    const channelKey = remoteJid ?? conversationId;

    // IMPORTANTE: usar topic dedicado para presence de agentes para NÃO colidir
    // com `typing:${remoteJid}` consumido por `useContactTyping` em listas.
    // Supabase Realtime deduplica canais por topic; reutilizar um canal já
    // subscrito impede registrar novos callbacks (`presence`/`broadcast`) e
    // crashava o ChatPanel ("cannot add `presence` callbacks ... after `subscribe()`").
    const presenceTopic = `typing-agents:${channelKey}`;

    // Create presence channel for this conversation
    const channel = supabase.channel(presenceTopic, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    channelRef.current = channel;

    // Handle presence sync (agent-to-agent typing)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users: TypingUser[] = [];

      Object.entries(state).forEach(([key, presences]) => {
        if (key !== currentUserId && Array.isArray(presences)) {
          presences.forEach((presence) => {
            const p = presence as unknown as PresenceState;
            if (p.isTyping) {
              users.push({
                oderId: p.oderId || key,
                name: p.name || 'Contato',
                isTyping: p.isTyping,
                lastTyped: p.lastTyped || new Date().toISOString(),
              });
            }
          });
        }
      });

      setTypingUsers(users);
      // Only update from presence if no contact typing is active
      if (!contactTypingRef.current) {
        setIsContactTyping(users.length > 0);
      }
    });

    // Handle join event
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      log.debug('User joined typing channel:', key, newPresences);
    });

    // Handle leave event
    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      log.debug('User left typing channel:', key, leftPresences);
    });

    // Subscribe to presence channel.
    // OBS: o broadcast `contact_typing` é consumido por `useContactTyping`
    // (topic compartilhado `typing:${jid}` — não pode coexistir aqui).
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        log.debug('Subscribed to typing presence for conversation:', conversationId);
      }
    });

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (contactTypingTimeoutRef.current) {
        clearTimeout(contactTypingTimeoutRef.current);
      }
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, remoteJid]);

  return {
    isContactTyping,
    typingUsers,
    handleTypingStart,
    handleTypingStop,
  };
}
