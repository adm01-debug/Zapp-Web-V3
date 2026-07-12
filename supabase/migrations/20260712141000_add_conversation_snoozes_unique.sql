-- Add UNIQUE (contact_id, snoozed_by) to conversation_snoozes
--
-- Required by the atomic upsert in useConversationActions.ts:
--   .upsert({ contact_id, snoozed_by, snooze_until },
--            { onConflict: 'contact_id,snoozed_by' })
--
-- Without this constraint the upsert degrades to a plain INSERT and silently
-- creates duplicate snooze rows per contact per user, making the read-back
-- unpredictable and the "cancel snooze" path fragile.
--
-- P1 finding from cubic security review: constraint missing, upsert fails at runtime.

-- De-duplicate any pre-existing rows, keeping the most-recent snooze_until.
DELETE FROM public.conversation_snoozes
WHERE ctid NOT IN (
  SELECT DISTINCT ON (contact_id, snoozed_by) ctid
  FROM   public.conversation_snoozes
  ORDER  BY contact_id, snoozed_by, snooze_until DESC
);

-- Add the constraint idempotently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.conversation_snoozes'::regclass
      AND contype   = 'u'
      AND conname   = 'uq_conversation_snoozes_contact_user'
  ) THEN
    ALTER TABLE public.conversation_snoozes
      ADD CONSTRAINT uq_conversation_snoozes_contact_user
      UNIQUE (contact_id, snoozed_by);
  END IF;
END;
$$;
