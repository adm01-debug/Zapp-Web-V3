// Re-export all team chat hooks and types from modular files
export type { TeamConversation, TeamMember, TeamMessage } from '@/features/inbox/hooks/team-chat/teamChatTypes';
export { useTeamConversations } from '@/features/inbox/hooks/team-chat/useTeamConversations';
export { useTeamMessages } from '@/features/inbox/hooks/team-chat/useTeamMessages';
/** Hook: use Team Chat. */
export {
  useSendTeamMessage,
  useDeleteTeamMessage,
  useEditTeamMessage,
  useCreateTeamConversation,
  useToggleMuteConversation,
  useTransferTeamConversation,
  useUpdateTeamMessageStatus,
} from '@/features/inbox/hooks/team-chat/useTeamChatMutations';
