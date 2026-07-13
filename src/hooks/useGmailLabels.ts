// Re-export from consolidated useIntegrationAuthenticationManagement module (ETAPA 47 consolidation)
import { useGmailLabelsManagement, SYSTEM_LABELS } from '@/hooks/useIntegrationAuthenticationManagement';

export const { SYSTEM_LABELS: SYSTEM_LABELS_EXPORT } = { SYSTEM_LABELS };

export function useEmailLabels(accountId: string | null) {
  return useGmailLabelsManagement(accountId);
}

export function useGmailLabels(accountId: string | null) {
  const { labels, isLoading, error, loadLabels, syncLabels, getLabelCount } = useGmailLabelsManagement(accountId);

  const systemLabels = SYSTEM_LABELS.map((sl) => ({
    id: `system-${sl.id}`,
    account_id: accountId ?? '',
    email_label_id: sl.id,
    name: sl.name,
    type: 'system' as const,
    color: sl.color,
  }));

  const userLabels = labels.filter((l: any) => l.type === 'user');
  const allLabels = [...systemLabels, ...userLabels];

  return {
    labels,
    userLabels,
    systemLabels,
    allLabels,
    isLoading,
    error,
    loadLabels,
    syncLabels,
    getLabelCount,
    SYSTEM_LABELS,
  };
}
