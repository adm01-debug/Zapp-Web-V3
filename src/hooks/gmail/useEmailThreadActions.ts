import { useCallback } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';
import type { EmailThread } from '@/types/gmail';
import { isMockId } from './emailUtils';

const log = getLogger('useEmailThreadActions');

interface UseEmailThreadActionsParams {
  setThreads: React.Dispatch<React.SetStateAction<EmailThread[]>>;
}

export function useEmailThreadActions({ setThreads }: UseEmailThreadActionsParams) {
  const markAsRead = useCallback(
    async (threadId: string, read = true) => {
      if (isMockId(threadId)) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId ? { ...t, unread_count: read ? 0 : t.unread_count || 1 } : t
          )
        );
        return;
      }
      const { error: rpcErr } = await safeClient.rpc('rpc_email_mark_thread_read', {
        p_thread_id: threadId,
        p_read: read,
        p_message_ids: null,
      });

      if (!rpcErr) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId ? { ...t, unread_count: read ? 0 : t.unread_count || 1 } : t
          )
        );
      }
    },
    [setThreads]
  );

  const starThread = useCallback(
    async (threadId: string, starred = true) => {
      if (isMockId(threadId)) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, is_starred: starred } : t))
        );
        return;
      }
      const { error: rpcErr } = await safeClient.rpc('rpc_email_star_thread', {
        p_thread_id: threadId,
        p_starred: starred,
      });

      if (!rpcErr) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, is_starred: starred } : t))
        );
      }
    },
    [setThreads]
  );

  const archiveThread = useCallback(
    async (threadId: string) => {
      if (isMockId(threadId)) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
        return;
      }
      const { error: rpcErr } = await safeClient.rpc('rpc_email_archive_thread', {
        p_thread_id: threadId,
        p_archived: true,
      });

      if (!rpcErr) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
      }
    },
    [setThreads]
  );

  const assignThread = useCallback(
    async (threadId: string, agentId: string | null) => {
      if (isMockId(threadId)) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, assigned_to: agentId } : t))
        );
        return;
      }
      const { error: rpcErr } = await safeClient.rpc('rpc_email_assign_thread', {
        p_thread_id: threadId,
        p_agent_id: agentId,
      });

      if (!rpcErr) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, assigned_to: agentId } : t))
        );
      } else {
        log.warn('Email thread assign error', rpcErr.message);
      }
    },
    [setThreads]
  );

  return { markAsRead, starThread, archiveThread, assignThread };
}
