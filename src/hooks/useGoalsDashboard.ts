// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useGoalsDashboardManagement } from '@/hooks/useDashboardVisualizationManagement';
export type { Goal } from '@/hooks/useDashboardVisualizationManagement';

export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta Semana' },
  { value: 'month', label: 'Este Mês' },
];

export function getProgressColor(percentage: number): string {
  if (percentage >= 100) return 'text-success';
  if (percentage >= 75) return 'text-primary';
  if (percentage >= 50) return 'text-warning';
  return 'text-destructive';
}

export function getProgressBgColor(percentage: number): string {
  if (percentage >= 100) return 'bg-success';
  if (percentage >= 75) return 'bg-primary';
  if (percentage >= 50) return 'bg-warning';
  return 'bg-destructive';
}

export function useGoalsDashboard() {
  return useGoalsDashboardManagement();
}
