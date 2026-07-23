import type { ContactRow } from '@/integrations/supabase/schema';

/** Contact component for the contacts section. */
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

/** Contact Item Props component for the contacts section. */
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
