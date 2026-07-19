import { useCallback } from 'react';
import { toast } from 'sonner';
import type { VoiceAgentAction } from '@/features/inbox/hooks/voice/types';

/** Hook: use Voice Action Handler. */
export function useVoiceActionHandler(onViewChange?: (viewId: string) => void) {
  return useCallback(
    (action: VoiceAgentAction) => {
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
          break;
        default:
          break;
      }
    },
    [onViewChange]
  );
}
