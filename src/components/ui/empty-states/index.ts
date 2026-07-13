/**
 * Empty states barrel export — canonical source for empty-state components.
 *
 * This directory (empty-states/) is the reference implementation.
 * The project has several older empty-state files at the ui/ level:
 *
 *   ui/EmptyState.tsx             ← standalone, no context config
 *   ui/GenericEmptyState.tsx      ← generic, no context config
 *   ui/empty-state.tsx            ← shadcn-style primitive
 *   ui/empty-states.tsx           ← plural, exports multiple variants
 *   ui/contextual-empty-states.tsx← thin wrapper
 *
 * Prefer importing from this barrel when you need a context-aware variant.
 * See REFACTORING.md §3.2 for the consolidation plan.
 *
 * Usage:
 *   import { ContextualEmptyState, EmptyInbox } from '@/components/ui/empty-states';
 */

export { ContextualEmptyState } from './ContextualEmptyState';
export type { ContextualEmptyStateProps } from './ContextualEmptyState';

export {
  EmptyInbox,
  EmptyContacts,
  EmptyChats,
  EmptySearch,
  EmptyQueue,
  EmptyReports,
  EmptyTags,
} from './ConvenienceExports';

export { contextConfigs } from './contextConfigs';
export type { EmptyStateConfig } from './contextConfigs';
