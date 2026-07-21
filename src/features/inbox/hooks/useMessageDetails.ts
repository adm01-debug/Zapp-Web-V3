// @ts-nocheck
/**
 * useMessageDetails — on-demand hydration of a single full message row
 * from FATOR X (`rpc_get_message_details`).
 *
 * The list view uses `EvolutionMessageLite` (no payload/raw_data) for
 * performance. When the user opens the "Detalhes do envio" dialog we fetch
 * the full row here. Cache lives 5 minutes since payload is immutable
 * after write.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { timedRpc } from '@/lib/instrumentedExternal';
import type { EvolutionMessage } from '@/types/evolutionExternal';

/** Options bag for `useMessageDetails`. */
export interface UseMessageDetailsOptions {
  enabled?: boolean;
}

/** Fetches the full `EvolutionMessage` row (including payload/raw_data) on demand from `rpc_get_message_details`; cached for 5 minutes since payloads are immutable after write. */
export function useMessageDetails(
  messageId: string | null,
  opts: UseMessageDetailsOptions = {},
) {
  const enabled = !!messageId && opts.enabled !== false;

  return useQuery<EvolutionMessage | null, Error>({
    queryKey: queryKeys.messageDetails.detail(messageId),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      if (!messageId) return null;
      const { data, error } = await timedRpc<EvolutionMessage>(
        'rpc_get_message_details',
        { p_message_id: messageId },
      );
      if (error) {
        const msg = (error as { message?: string })?.message ?? 'Failed to load message details';
        throw new Error(msg);
      }
      return data ?? null;
    },
  });
}
