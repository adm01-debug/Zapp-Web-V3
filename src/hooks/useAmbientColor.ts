// Re-export from consolidated useUIManagement module (ETAPA 31 consolidation)
import { useAmbientColorManagement, type AmbientColors } from '@/hooks/useUIManagement';

type Sentiment = 'positive' | 'neutral' | 'negative' | string | null | undefined;

export type { AmbientColors };

export function useAmbientColor(sentiment: Sentiment): AmbientColors {
  return useAmbientColorManagement(sentiment);
}
