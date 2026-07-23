/** Database row for an internal team conversation: direct DM, group chat, or department channel, with optional embedded members and last-message preview. */
export interface TeamConversation {
  id: string;
  type: 'direct' | 'group' | 'department';
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  department_id?: string | null;
  members?: TeamMember[];
  last_message?: TeamMessage | null;
  unread_count?: number;
  metadata?: Record<string, unknown> | null;
}

/** Membership record linking a profile to a team conversation, tracking join time, last-read position, and mute preference. */
export interface TeamMember {
  id: string;
  conversation_id: string;
  profile_id: string;
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  profile?: {
    id: string;
    name: string;
    email: string | null;
    avatar_url: string | null;
    is_active: boolean;
  };
}

/** A single message in an internal team conversation, supporting text, media, replies, edits, and delivery status tracking. */
export interface TeamMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  media_type: string | null;
  reply_to_id: string | null;
  is_edited: boolean;
  status?: 'pending' | 'sending' | 'sent' | 'delivered' | 'read';
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  reply_to?: TeamMessage | null;
}
