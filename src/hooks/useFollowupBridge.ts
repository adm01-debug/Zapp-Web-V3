/**
 * useFollowupBridge — AUTOMACOES-09
 *
 * Frontend hook that triggers a zapp.followup_sequence for a WhatsApp contact
 * by calling the `followup-bridge` edge function.
 *
 * The edge function:
 *  1. Reads zapp.followup_sequences + zapp.followup_steps
 *  2. Looks up the contact in evolution_contacts by remote_jid
 *  3. Inserts pending rows in evo.evolution_followups (via zapp view)
 *  4. The existing `evolution-followup` cron processor then sends the messages
 *
 * Usage:
 *   const { triggerSequence, isPending } = useFollowupBridge();
 *   await triggerSequence({ sequence_id, contact_jid, instance_name });
 */
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TriggerSequenceParams {
  /** UUID of the followup_sequence to trigger. Must be is_active=true. */
  sequence_id: string;
  /** WhatsApp JID of the contact (e.g. "5511999999999@s.whatsapp.net"). */
  contact_jid: string;
  /** Evolution API instance name (e.g. "wpp2"). */
  instance_name: string;
  /** Optional override for the trigger event label stored in metadata. */
  trigger_event?: string;
}

export interface TriggerSequenceResult {
  success: boolean;
  steps_queued: number;
  sequence_name: string;
  /** true if the contact was found in evolution_contacts by JID. */
  contact_resolved?: boolean;
  message?: string;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

/**
 * Trigger a followup sequence for a contact via the followup-bridge edge function.
 *
 * @example
 * const { triggerSequence, isPending } = useFollowupBridge();
 *
 * // In a conversation-closed handler:
 * await triggerSequence({
 *   sequence_id: '...',
 *   contact_jid: '5511999999999@s.whatsapp.net',
 *   instance_name: 'wpp2',
 *   trigger_event: 'conversation_closed',
 * });
 */
export function useFollowupBridge() {
  const mutation = useMutation<TriggerSequenceResult, Error, TriggerSequenceParams>({
    mutationFn: async (params: TriggerSequenceParams): Promise<TriggerSequenceResult> => {
      const { data, error } = await supabase.functions.invoke<TriggerSequenceResult>(
        'followup-bridge',
        { body: params },
      );

      if (error) {
        // supabase.functions.invoke wraps HTTP errors in FunctionsHttpError
        // The error.message will contain the JSON body from the edge function
        throw new Error(error.message ?? 'followup-bridge call failed');
      }
      if (!data) {
        throw new Error('followup-bridge returned no data');
      }
      return data;
    },

    onSuccess: (result) => {
      if (result.steps_queued === 0) {
        toast.info(
          `Sequência "${result.sequence_name}" não tem etapas ativas`,
        );
      } else {
        toast.success(
          `Sequência "${result.sequence_name}" iniciada — ` +
          `${result.steps_queued} etapa${result.steps_queued !== 1 ? 's' : ''} agendada${result.steps_queued !== 1 ? 's' : ''}`,
        );
      }
    },

    onError: (error: Error) => {
      console.error('[useFollowupBridge] error:', error);
      toast.error(`Erro ao iniciar sequência de follow-up: ${error.message}`);
    },
  });

  return {
    /**
     * Trigger a followup sequence for a contact.
     * Returns a Promise — use `.mutateAsync` under the hood.
     */
    triggerSequence: (params: TriggerSequenceParams) => mutation.mutateAsync(params),

    /** True while the request is in flight. */
    isPending: mutation.isPending,

    /** True after a successful trigger. */
    isSuccess: mutation.isSuccess,

    /** True after a failed trigger. */
    isError: mutation.isError,

    /** The last error, if any. */
    error: mutation.error,

    /** The last successful result, if any. */
    data: mutation.data,

    /** Raw mutation object for advanced use. */
    mutation,
  };
}
