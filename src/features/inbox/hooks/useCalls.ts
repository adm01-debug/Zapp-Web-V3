import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { useMountedRef } from '@/hooks/useMountedRef';


export interface Call {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  whatsapp_connection_id: string | null;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'answered' | 'ended' | 'missed';
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface StartCallParams {
  contactId?: string;
  contactPhone: string;
  contactName: string;
  direction: 'inbound' | 'outbound';
  whatsappConnectionId?: string;
}

export const useCalls = () => {
  const { user } = useAuth();
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useMountedRef();
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  // Cleanup: abort all pending operations on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Get current user's profile id with abort signal support
  const getProfileId = useCallback(async (): Promise<string | null> => {
    if (!user) return null;

    const { data } = await supabase.from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    return data?.id || null;
  }, [user]);

  // Start a new call
  const startCall = useCallback(
    async (params: StartCallParams): Promise<string | null> => {
      setIsLoading(true);
      try {
        const profileId = await getProfileId();

        const { data, error } = await supabase.from('calls')
          .insert({
            contact_id: params.contactId || null,
            agent_id: profileId,
            direction: params.direction,
            status: 'ringing',
            whatsapp_connection_id: params.whatsappConnectionId || null,
          })
          .select()
          .single(); // POST-INSERT: insert retorna exatamente 1 linha

        if (error) throw error;
        if (!data) throw new Error('Call insert retornou null — inesperado'); // guard extra

        setCurrentCallId(data.id);
        void queryClient.invalidateQueries({ queryKey: ['calls-history'] });
        return data.id;
      } catch (error) {
        log.error('Error starting call:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível registrar a chamada',
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [getProfileId, queryClient]
  );

  // Answer the call with abort signal support
  const answerCall = useCallback(async (callId: string): Promise<boolean> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const builder = supabase.from('calls')
        .update({
          status: 'answered',
          answered_at: new Date().toISOString(),
        })
        .eq('id', callId);

      // Pass abort signal to Supabase query builder if supported
      const withSignal = (builder as unknown as {
        abortSignal?: (s: AbortSignal) => typeof builder;
      }).abortSignal?.(controller.signal) ?? builder;

      const { error } = await (withSignal as typeof builder);

      if (controller.signal.aborted) return false;
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['calls-history'] });
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      log.error('Error answering call:', error);
      return false;
    }
  }, [queryClient]);

  // End the call with abort signal support
  const endCall = useCallback(async (callId: string, durationSeconds: number): Promise<boolean> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const builder = supabase.from('calls')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', callId);

      // Pass abort signal to Supabase query builder if supported
      const withSignal = (builder as unknown as {
        abortSignal?: (s: AbortSignal) => typeof builder;
      }).abortSignal?.(controller.signal) ?? builder;

      const { error } = await (withSignal as typeof builder);

      if (controller.signal.aborted) return false;
      if (error) throw error;

      setCurrentCallId(null);
      void queryClient.invalidateQueries({ queryKey: ['calls-history'] });
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      log.error('Error ending call:', error);
      if (mountedRef.current) {
        toast({
          title: 'Erro',
          description: 'Não foi possível finalizar a chamada',
          variant: 'destructive',
        });
      }
      return false;
    }
  }, [mountedRef, queryClient]);

  // Mark call as missed with abort signal support
  const missCall = useCallback(async (callId: string): Promise<boolean> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const builder = supabase.from('calls')
        .update({
          status: 'missed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId);

      // Pass abort signal to Supabase query builder if supported
      const withSignal = (builder as unknown as {
        abortSignal?: (s: AbortSignal) => typeof builder;
      }).abortSignal?.(controller.signal) ?? builder;

      const { error } = await (withSignal as typeof builder);

      if (controller.signal.aborted) return false;
      if (error) throw error;

      setCurrentCallId(null);
      void queryClient.invalidateQueries({ queryKey: ['calls-history'] });
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      log.error('Error marking call as missed:', error);
      return false;
    }
  }, [mountedRef, queryClient]);

  // Add notes to a call with abort signal support
  const addCallNotes = useCallback(async (callId: string, notes: string): Promise<boolean> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const builder = supabase.from('calls').update({ notes }).eq('id', callId);

      // Pass abort signal to Supabase query builder if supported
      const withSignal = (builder as unknown as {
        abortSignal?: (s: AbortSignal) => typeof builder;
      }).abortSignal?.(controller.signal) ?? builder;

      const { error } = await (withSignal as typeof builder);

      if (controller.signal.aborted) return false;
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['calls-history'] });
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      log.error('Error adding call notes:', error);
      return false;
    }
  }, [queryClient]);

  // Get call history for a contact with abort signal support
  const getContactCalls = useCallback(async (contactId: string): Promise<Call[]> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const builder = supabase.from('calls')
        .select('*')
        .eq('contact_id', contactId)
        .order('started_at', { ascending: false });

      // Pass abort signal to Supabase query builder if supported
      const withSignal = (builder as unknown as {
        abortSignal?: (s: AbortSignal) => typeof builder;
      }).abortSignal?.(controller.signal) ?? builder;

      const { data, error } = await (withSignal as typeof builder);

      if (controller.signal.aborted) return [];
      if (error) throw error;
      return (data || []) as Call[];
    } catch (error) {
      if (controller.signal.aborted) return [];
      log.error('Error fetching contact calls:', error);
      return [];
    }
  }, []);

  return {
    currentCallId,
    isLoading,
    startCall,
    answerCall,
    endCall,
    missCall,
    addCallNotes,
    getContactCalls,
  };
};
