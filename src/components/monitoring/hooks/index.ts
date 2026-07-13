/**
 * Monitoring hooks barrel export.
 *
 * Note on architecture:
 *   These hooks are tightly coupled to the monitoring UI components
 *   in src/components/monitoring/. They expose Evolution API health data
 *   to the monitoring dashboard components.
 *
 *   Admin-level operational hooks (useFailedMessages, useRetryMetrics, etc.)
 *   live in src/features/admin/hooks/monitoring/ — see REFACTORING.md §3.6
 *   for the plan to consolidate these two directories.
 *
 * Usage:
 *   import { useEvolutionMonitoring } from '@/components/monitoring/hooks';
 */

export { useEvolutionMonitoring } from './useEvolutionMonitoring';
export { useMonitoringNotifications } from './useMonitoringNotifications';
