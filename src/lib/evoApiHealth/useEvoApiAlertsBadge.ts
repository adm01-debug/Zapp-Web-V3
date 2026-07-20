import { useMemo } from 'react';
import { useActiveAlerts } from './hooks';
import type { ActiveAlert } from './types';

/** Evo Api Alerts Badge interface definition. */
export interface EvoApiAlertsBadge {
  critical: number;
  warning: number;
  info: number;
  total: number;
  /** Highest severity present (drives badge color). */
  topSeverity: 'critical' | 'warning' | 'info' | null;
}

/**
 * Aggregates active `evo_api` alerts into counts per severity for sidebar
 * badges. Reuses the polling query (`useActiveAlerts` — 15s refetch) so the
 * badge updates without opening the panel.
 *
 * Safe to call from any authenticated context: when the user lacks proxy
 * access the underlying query simply returns no data and the badge stays at
 * zero.
 */
export function useEvoApiAlertsBadge(): EvoApiAlertsBadge {
  const { data } = useActiveAlerts();

  return useMemo(() => {
    const list = (data?.data ?? []) as ActiveAlert[];
    const counts = list.reduce(
      (acc, a) => {
        if (a.severity === 'critical') acc.critical++;
        else if (a.severity === 'warning') acc.warning++;
        else if (a.severity === 'info') acc.info++;
        return acc;
      },
      { critical: 0, warning: 0, info: 0 }
    );

    const topSeverity =
      counts.critical > 0 ? 'critical' : counts.warning > 0 ? 'warning' : counts.info > 0 ? 'info' : null;

    return { ...counts, total: list.length, topSeverity };
  }, [data?.data]);
}
