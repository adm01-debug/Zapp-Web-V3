/**
 * @file src/components/ui/empty-states/index.ts
 * @description Public barrel for the empty-states directory.
 *
 * This is the canonical import path for the contextual empty-state system.
 * The three files in this directory form a cohesive module:
 *   contextConfigs.tsx  — data: icons, titles, descriptions per context
 *   ContextualEmptyState.tsx — component: renders from contextConfigs
 *   ConvenienceExports.tsx   — DX: pre-wired single-purpose components
 *
 * Recommended usage for new code:
 * ```ts
 * // Import the generic contextual component
 * import { ContextualEmptyState } from '@/components/ui/empty-states';
 *
 * // Or import a pre-wired convenience component
 * import { InboxEmptyState, SearchEmptyState } from '@/components/ui/empty-states';
 *
 * // Or access config types for advanced use
 * import type { EmptyStateConfig } from '@/components/ui/empty-states';
 * ```
 *
 * For the VARIANT-based system (inbox/contacts/campaigns/chatbot/pipeline/etc.),
 * use EmptyState from @/components/ui/EmptyState instead.
 *
 * @see src/components/ui/EmptyState.tsx — variant-based, optional props
 * @see src/components/ui/empty-state.tsx — explicit-props + illustration + size variants
 * @see src/components/ui/GenericEmptyState.tsx — explicit-props + animated badge
 * @see docs/SIMULATION_REPORT.md — full analysis of all empty-state implementations
 */


// ─── Legacy generic component (explicit props + illustration + size variants) ─────
export { EmptyState } from '../empty-state';
// ─── Types ───────────────────────────────────────────────────────────────────────
export type { EmptyStateConfig } from './contextConfigs';

// ─── Configuration ────────────────────────────────────────────────────────────
/** Re-exported module members. */
export { contextConfigs } from './contextConfigs';

// ─── Primary component ─────────────────────────────────────────────────────────
/** Re-exported module members. */
export { ContextualEmptyState } from './ContextualEmptyState';

// ─── Convenience components (pre-wired for each module) ──────────────────────
/** Re-exported module members. */
export {
  InboxEmptyState,
  ContactsEmptyState,
  QueuesEmptyState,
  AgentsEmptyState,
  TagsEmptyState,
  SearchEmptyState,
  DashboardEmptyState,
  NotificationsEmptyState,
  TranscriptionsEmptyState,
} from './ConvenienceExports';
