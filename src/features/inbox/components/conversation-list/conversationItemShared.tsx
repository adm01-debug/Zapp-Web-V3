import {
  MessageCircle,
  Instagram,
  Mail,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Interfaces ────────────────────────────────────────────────────────────────

/** Conversation Contact Data component for the conversation list section. */
export interface ConversationContactData {
  id?: string;
  name?: string | null;
  pushName?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  avatar?: string | null;
  avatar_url?: string | null;
  company_name?: string | null;
  company?: string | null;
  organization?: string | null;
  updated_at?: string | null;
  ai_sentiment?: string | null;
  job_title?: string | null;
  jobTitle?: string | null;
  role?: string | null;
  contact_type?: string | null;
}

/** Conversation Item Data component for the conversation list section. */
export interface ConversationItemData {
  id: string;
  contact?: ConversationContactData | null;
  status?: string | null;
  unreadCount?: number;
  lastMessage?: {
    id?: string;
    content?: string | null;
    created_at?: string | null;
    sender?: 'contact' | 'agent' | string;
    status?: string | null;
    retry_attempt?: number | null;
    retry_total?: number | null;
  } | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
  sentiment?: string | null;
  sentimentScore?: number;
  pinnedAt?: string | null;
  assignedTo?: string | { id: string; name?: string; avatar?: string | null } | null;
  queue?: { id: string; name?: string } | null;
  tags?: string[] | null;
  connection_type?: string | null;
  priority?: string | null;
}

/** Conversation Item Props component for the conversation list section. */
export interface ConversationItemProps {
  conversation: ConversationItemData;
  isSelected: boolean;
  onSelect: (conversation: ConversationItemData) => void;
  compact?: boolean;
  selectionMode?: boolean;
  isMultiSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  isPinned?: boolean;
}

// ─── Status maps ───────────────────────────────────────────────────────────────

/** status Icons component for the conversation list section. */
export const statusIcons = {
  open: AlertCircle,
  pending: Clock,
  resolved: CheckCircle2,
  waiting: Loader2,
};

/** status Colors component for the conversation list section. */
export const statusColors = {
  open: 'bg-status-open',
  pending: 'bg-status-pending',
  resolved: 'bg-status-resolved',
  waiting: 'bg-status-waiting',
};

// ─── ChannelBadge ──────────────────────────────────────────────────────────────

/** Channel Badge component for the conversation list section. */
export function ChannelBadge({ type }: { type?: string | null }) {
  const iconClass = 'w-2.5 h-2.5 text-primary-foreground';
  let Icon = MessageCircle;
  let bgColor = 'bg-[hsl(142,70%,45%)]';
  if (type === 'instagram') {
    Icon = Instagram;
    bgColor = 'bg-[hsl(330,80%,55%)]';
  } else if (type === 'email') {
    Icon = Mail;
    bgColor = 'bg-[hsl(220,70%,55%)]';
  } else if (type === 'phone' || type === 'call') {
    Icon = Phone;
    bgColor = 'bg-[hsl(200,70%,50%)]';
  }
  return (
    <span
      className={cn(
        'absolute -left-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-sidebar',
        bgColor
      )}
    >
      <Icon className={iconClass} />
    </span>
  );
}

// ─── Display helpers ───────────────────────────────────────────────────────────

/** build Primary Label component for the conversation list section. */
export function buildPrimaryLabel(conversation: ConversationItemData): string {
  const name = (
    conversation.contact?.name ||
    conversation.contact?.pushName ||
    conversation.contact?.phone ||
    ''
  ).trim();
  const safeName = (name === 'Você' ? '' : name) || 'Contato';
  const parts = safeName.split(' ').filter((p) => p.length > 0);
  if (parts.length > 1) {
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
  return safeName;
}

/** build Secondary Label component for the conversation list section. */
export function buildSecondaryLabel(conversation: ConversationItemData): string | null {
  const jobTitle =
    conversation.contact?.job_title?.trim() ||
    conversation.contact?.jobTitle?.trim() ||
    conversation.contact?.role?.trim();
  return jobTitle || 'Cargo não informado';
}

/** short Relative Time component for the conversation list section. */
export function shortRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}sem`;
  const mo = Math.floor(d / 30);
  return `${mo}mês`;
}
