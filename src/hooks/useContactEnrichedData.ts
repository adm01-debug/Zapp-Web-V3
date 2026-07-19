// Re-export canonical implementation from features/contacts.
// The previous consolidated version only returned { enrichedData, loading }
// which broke consumers expecting aiTags and slaInfo (Inbox ContactDetails).
export {
  useContactEnrichedData,
  type EnrichedContactData,
  type AIConversationTag,
  type SLAInfo,
} from '@/features/contacts/hooks/useContactEnrichedData';
