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

-- Lock against concurrent writers so no new duplicate can sneak in between
-- the DELETE and the ADD CONSTRAINT (same pattern as campaign_contacts migration).
LOCK TABLE public.conversation_snoozes IN SHARE ROW EXCLUSIVE MODE;

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

-- Add UPDATE policy so the upsert ON CONFLICT path can write through RLS.
--
-- Without this, an upsert that hits the unique constraint triggers the UPDATE
-- branch internally, but RLS has no matching UPDATE policy — the write is
-- silently blocked and the caller gets back an empty result set instead of an
-- error, making re-snooze appear to succeed but actually do nothing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'conversation_snoozes'
      AND policyname = 'Users can update their own snoozes'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Users can update their own snoozes"
        ON public.conversation_snoozes
        FOR UPDATE
        USING  (snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
        WITH CHECK (snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
    $p$;
  END IF;
END;
$$;
