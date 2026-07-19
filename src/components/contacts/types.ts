import type { ContactRow } from '@/integrations/supabase/schema';

export type Contact = Pick<
  NonNullable<ContactRow>,
  | 'id'
  | 'name'
  | 'surname'
  | 'nickname'
  | 'phone'
  | 'email'
  | 'avatar_url'
  | 'company'
  | 'job_title'
  | 'tags'
  | 'contact_type'
  | 'created_at'
>;

export interface ContactItemProps {
  contact: Contact;
  isSelected: boolean;
  onToggleSelect: (id: string, selected: boolean) => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  index: number;
  companyLogo?: string | null;
  companyName?: string | null;
  searchQuery?: string;
}
