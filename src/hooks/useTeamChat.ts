// Re-export all team chat hooks and types from modular files
export type {
  TeamConversation,
  TeamMember,
  TeamMessage,
} from '@/features/inbox/hooks/team-chat/teamChatTypes';

/** Hook for fetching and managing team conversations. */
export { useTeamConversations } from '@/features/inbox/hooks/team-chat/useTeamConversations';

/** Hook for fetching and managing team messages within conversations. */
export { useTeamMessages } from '@/features/inbox/hooks/team-chat/useTeamMessages';

/** Mutation hooks for team chat operations including sending, editing, deleting messages and managing conversations. */
export {
  useSendTeamMessage,
  useDeleteTeamMessage,
  useEditTeamMessage,
  useCreateTeamConversation,
  useToggleMuteConversation,
  useTransferTeamConversation,
  useUpdateTeamMessageStatus,
} from '@/features/inbox/hooks/team-chat/useTeamChatMutations';
