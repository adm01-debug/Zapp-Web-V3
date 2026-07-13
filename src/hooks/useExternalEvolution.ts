/**
 * useExternalEvolution — barrel re-export for backward compatibility.
 * Logic is split into focused sub-modules:
 *   - evolutionReconcile.ts   — optimistic reconciliation
 *   - evolutionFetchers.ts    — raw fetch helpers + constants
 *   - evolutionContactCache.ts — contact enrichment cache
 *   - useExternalConversations.ts — sidebar conversations hook
 *   - useExternalMessages.ts  — per-conversation messages hook
 */
export type { ReconcileResult } from './evolutionReconcile';
export { reconcileOptimistic, applyReconciliation } from './evolutionReconcile';
export { useExternalConversations } from './useExternalConversations';
export { useExternalMessages } from './useExternalMessages';
