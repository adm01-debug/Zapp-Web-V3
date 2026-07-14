/**
 * Messages Service Index
 */

export { messagesRepository, type Message, type Conversation } from './messagesRepository';
export { messagesService } from './messagesService';
export {
  useMessagesList,
  useMessage,
  useConversationMessages,
  useConversationsList,
  useConversation,
  useUnreadMessagesCount,
  useInvalidateMessages,
} from './useMessagesQueries';
export {
  useCreateMessage,
  useUpdateMessage,
  useDeleteMessage,
  useCreateConversation,
  useUpdateConversation,
  useCloseConversation,
  useAssignConversation,
  useMarkMessagesAsRead,
} from './useMessagesMutations';
