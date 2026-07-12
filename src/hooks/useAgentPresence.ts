/**
 * useAgentPresence.ts
 * Real-time agent online/busy/away status tracking.
 * 
 * Features:
 * - Tracks current agent status (online, busy, away, offline)
 * - Shows which agents are available for transfers
 * - Updates via Supabase Realtime presence channel
 * - Auto-sets away after inactivity timeout
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/hooks/useAuth';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type AgentPresenceStatus = 'online' | 'busy' | 'away' | 'offline';

interface AgentPresence {
  agent_id: string;
  agent_name: string;
  status: AgentPresenceStatus;
  current_conversations: number;
  last_activity_at: string;
  avatar_url: string | null;
}

interface UseAgentPresenceOptions {
  workspaceId: string;
  autoAwayMs?: number; // Auto-set away after N ms of inactivity
  enabled?: boolean;
}

export function useAgentPresence({
  workspaceId,
  autoAwayMs = 5 * 60 * 1000, // 5 min default
  enabled = true,
}: UseAgentPresenceOptions) {
  const [agents, setAgents] = useState<AgentPresence[]>([]);
  const [myStatus, setMyStatus] = useState<AgentPresenceStatus>('online');
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myStatusRef = useRef<AgentPresenceStatus>('online');
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => { myStatusRef.current = myStatus; }, [myStatus]);

  // Track user activity for auto-away — reads status via ref to stay stable
  const resetActivityTimer = useCallback(() => {
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    if (myStatusRef.current === 'away') {
      setMyStatus('online');
    }
    activityTimerRef.current = setTimeout(() => {
      setMyStatus('away');
    }, autoAwayMs);
  }, [autoAwayMs]);

  // Update my status in the database
  const updateStatus = useCallback(async (status: AgentPresenceStatus) => {
    if (!user) return;
    if (mountedRef.current) setMyStatus(status);
    await safeClient.from('agent_presence', (q) =>
      q.upsert({
        agent_id: user.id,
        workspace_id: workspaceId,
        status,
        agent_name: user.user_metadata?.full_name ?? user.email ?? 'Agent',
        avatar_url: user.user_metadata?.avatar_url ?? null,
        last_activity_at: new Date().toISOString(),
      }, { onConflict: 'agent_id,workspace_id' })
    );
  }, [user, workspaceId]);

  // Load all agents' presence
  const loadPresence = useCallback(async () => {
    const { data, error } = await safeClient.from<AgentPresence>(
      'agent_presence',
      (q) => q.select('*').eq('workspace_id', workspaceId).neq('status', 'offline').order('status', { ascending: true }),
    );

    if (!error && mountedRef.current) setAgents(data);
  }, [workspaceId]);

  useEffect(() => {
    if (!enabled || !user) return;

    // Set online on mount
    void updateStatus('online');
    void loadPresence();

    // Listen for activity events
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetActivityTimer, { passive: true }));

    // Subscribe to presence changes
    const channel = supabase
      .channel(`agent-presence-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'agent_presence',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => { void loadPresence(); }
      )
      .subscribe();

    channelRef.current = channel;

    // Cleanup: set offline on unmount
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetActivityTimer));
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      void updateStatus('offline');
      void channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [enabled, user, workspaceId]);

  // Available agents for transfer (online/busy, not away)
  const availableAgents = agents.filter(
    (a) => a.status === 'online' && a.agent_id !== user?.id
  );

  const busyAgents = agents.filter((a) => a.status === 'busy');
  const awayAgents = agents.filter((a) => a.status === 'away');

  return {
    agents,
    availableAgents,
    busyAgents,
    awayAgents,
    myStatus,
    updateStatus,
    loadPresence,
  };
}
