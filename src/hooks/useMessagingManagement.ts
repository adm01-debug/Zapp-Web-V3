// Consolidated Messaging Management Module (ETAPA 44)
// Consolidates: useScheduledMessages, useMessageReactions, useForwardMessage, useChatbotFlows, useTeamChatDraft, useEmailDraft
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { log } from '@/lib/logger';

interface ScheduledMessage {
  id: string;
  content: string;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'failed';
}

/** Hook: use Scheduled Messages Management. */
export function useScheduledMessagesManagement() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchScheduledMessages = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('scheduled_for');

      if (err) throw err;
      if (mountedRef.current) setMessages(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching scheduled messages:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchScheduledMessages();
  }, [user, fetchScheduledMessages]);

  return { messages, loading, refetch: fetchScheduledMessages };
}

/** Hook: use Message Reactions Management. */
export function useMessageReactionsManagement(messageId?: string) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchReactions = useCallback(async () => {
    if (!user || !messageId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('message_id', messageId);

      if (err) throw err;
      if (mountedRef.current) setReactions(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching reactions:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, messageId]);

  useEffect(() => {
    if (user && messageId) fetchReactions();
  }, [user, messageId, fetchReactions]);

  return { reactions, loading, refetch: fetchReactions };
}

/** Hook: use Forward Message Management. */
export function useForwardMessageManagement(messageId?: string) {
  const [forwarding, setForwarding] = useState(false);

  const forwardMessage = useCallback(async (targetId: string) => {
    if (!messageId) return;

    try {
      setForwarding(true);
      const { error } = await supabase
        .from('forwarded_messages')
        .insert({ source_message_id: messageId, target_id: targetId });

      if (error) throw error;
    } catch (err) {
      log.error('Error forwarding message:', err);
    } finally {
      setForwarding(false);
    }
  }, [messageId]);

  return { forwardMessage, forwarding };
}

/** Hook: use Chatbot Flows Management. */
export function useChatbotFlowsManagement() {
  const { user } = useAuth();
  const [flows, setFlows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchFlows = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('chatbot_flows')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      if (mountedRef.current) setFlows(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching chatbot flows:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchFlows();
  }, [user, fetchFlows]);

  return { flows, loading, refetch: fetchFlows };
}

/** Hook: use Team Chat Draft Management. */
export function useTeamChatDraftManagement(chatId?: string) {
  const [draft, setDraft] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveDraft = useCallback((content: string) => {
    setDraft(content);
    setLastSaved(new Date());
  }, []);

  const clearDraft = useCallback(() => {
    setDraft('');
    setLastSaved(null);
  }, []);

  return { draft, lastSaved, saveDraft, clearDraft };
}

/** Hook: use Email Draft Management. */
export function useEmailDraftManagement() {
  const [draft, setDraft] = useState<{ subject: string; body: string; recipients: string[] }>({
    subject: '',
    body: '',
    recipients: [],
  });

  const updateDraft = useCallback((updates: Partial<{ subject: string; body: string; recipients: string[] }>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  }, []);

  const clearDraft = useCallback(() => {
    setDraft({ subject: '', body: '', recipients: [] });
  }, []);

  return { draft, updateDraft, clearDraft };
}

/** Re-exported module members. */
export type { ScheduledMessage };