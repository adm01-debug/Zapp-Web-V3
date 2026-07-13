// Re-export from consolidated useAnalyticsMonitoringManagement module (ETAPA 48 consolidation)
import { useDeliveryStatsManagement, ParticipantStats, DeliveryTimelinePoint, DeliveryStatsResult } from '@/hooks/useAnalyticsMonitoringManagement';

export { ParticipantStats, DeliveryTimelinePoint, DeliveryStatsResult };

export function useDeliveryStats(remoteJid: string | undefined, instance = 'wpp2') {
  return useDeliveryStatsManagement(remoteJid, instance);
}
