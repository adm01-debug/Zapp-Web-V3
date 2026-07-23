// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useGoalsDashboardManagement } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';
/** Re-exported module members. */
export type { Goal } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';

/** P E R I O D_ O P T I O N S constant. */
export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta Semana' },
  { value: 'month', label: 'Este Mês' },
];

/** Maps progress percentage to Tailwind text color class. */
export function getProgressColor(percentage: number): string {
  if (percentage >= 100) return 'text-success';
  if (percentage >= 75) return 'text-primary';
  if (percentage >= 50) return 'text-warning';
  return 'text-destructive';
}

/** Maps progress percentage to Tailwind background color class. */
export function getProgressBgColor(percentage: number): string {
  if (percentage >= 100) return 'bg-success';
  if (percentage >= 75) return 'bg-primary';
  if (percentage >= 50) return 'bg-warning';
  return 'bg-destructive';
}

/** Retrieves goals dashboard data with configurable period targets. */
export function useGoalsDashboard() {
  return useGoalsDashboardManagement();
}
