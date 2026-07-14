/**
 * Admin monitoring hooks barrel.
 *
 * Operational hooks for DLQ management, retry metrics,
 * failed message inspection, and transfer monitoring.
 *
 * Usage:
 *   import { useFailedMessages, useRetryMetrics } from '@/features/admin/hooks/monitoring';
 *   import type { FailedMessageRow, FailedMessagesFilters } from '@/features/admin/hooks/monitoring';
 */

// ─── Types & Interfaces ───────────────────────────────────────────────────────
export type {
  FailedMessageStatus,
  FailedMessageRow,
  FailedMessagesFilters,
  ErrorCodeAggregate,
  InstanceAggregate,
  RootCauseAggregate,
  FailedMessagesAggregates,
  DlqStats,
} from './failedMessagesTypes';

// ─── Aggregation Utilities ─────────────────────────────────────────────────────
export { computeFailedMessagesAggregates } from './failedMessagesAggregates';

// ─── Hooks ─────────────────────────────────────────────────────────────────────
export * from './useDispatchErrorLogs';
export * from './useDlqAuditLog';
export * from './useFailedMessages';
export * from './useFailedMessagesUI';
export * from './useIdempotencyMissAlerts';
export * from './useRetryMetrics';
export * from './useTransfersPaginated';
