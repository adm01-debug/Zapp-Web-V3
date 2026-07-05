-- Ensure upsert(onConflict:'contact_id,tag_name') in ai-auto-tag has a backing unique index.
-- Without this constraint the edge function's upsert call throws a 42P10 "no unique constraint" error.
ALTER TABLE public.ai_conversation_tags
  ADD CONSTRAINT uq_ai_conversation_tags_contact_tag
  UNIQUE (contact_id, tag_name);
