import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { logVoiceCommand } from '@/features/inbox/hooks/voice/logVoiceCommand';
import type { VoiceAgentAction } from '@/features/inbox/hooks/voice/types';

/**
 * Invoca a edge voice-copilot-action (contrato @v1: { action, params } → { result })
 * com a ação reconhecida. Fire-and-forget — nunca bloqueia a UI.
 */
async function invokeVoiceCopilot(
  action: string,
  params: Record<string, unknown>
): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('voice-copilot-action', {
      body: { action, params },
    });
    if (error) throw error;
    const result = (data as { result?: unknown } | null)?.result;
    log.info('Voice copilot action executed', { action, result });
  } catch (err) {
    log.error('Voice copilot action failed:', err);
  }
}

/** Hook: use Voice Action Handler. */
export function useVoiceActionHandler(onViewChange?: (viewId: string) => void) {
  return useCallback(
    (action: VoiceAgentAction, transcript?: string) => {
      switch (action.action) {
        case 'navigate':
          if (action.data?.route) {
            onViewChange?.(action.data.route);
            toast.success(`Navegando para ${action.data.route}`);
          }
          break;
        case 'search':
          if (action.data?.query) {
            onViewChange?.('contacts');
            toast.info(`Buscando: ${action.data.query}`);
            void invokeVoiceCopilot('search_contacts', { query: action.data.query });
          }
          break;
        case 'filter':
          if (action.data?.filters) {
            onViewChange?.('inbox');
            toast.info('Filtro aplicado');
          }
          break;
        case 'sort':
          if (action.data?.sortBy) {
            toast.info(`Ordenando por ${action.data.sortBy}`);
          }
          break;
        case 'clear':
          toast.info('Filtros limpos');
          break;
        case 'answer':
        default:
          break;
      }

      // Registra todo comando de voz reconhecido (voice_command_logs)
      logVoiceCommand({
        transcript: transcript ?? '',
        action: action.action,
        response: action.response,
        data: action.data,
        success: true,
      });
    },
    [onViewChange]
  );
}
