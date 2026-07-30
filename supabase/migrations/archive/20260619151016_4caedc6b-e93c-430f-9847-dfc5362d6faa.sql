-- Drop the duplicate UNIQUE constraint (which owns contacts_phone_unique index)
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_phone_unique;

-- Drop duplicate plain index on contact_type
DROP INDEX IF EXISTS public.idx_contacts_type;

-- Partial index for the hottest inbox query: messages by contact, newest first, not deleted
CREATE INDEX IF NOT EXISTS idx_messages_contact_created_active
  ON public.messages (contact_id, created_at DESC)
  WHERE is_deleted = false;