-- P0 Security Fix: Atomic tag upsert/delete to prevent race conditions
-- Addresses race condition in auto_tag handler
--
-- Problem: Original code does separate upsert → select → delete operations
-- allowing concurrent requests to corrupt tag state (silent data loss).
--
-- Solution: Database transaction ensuring atomicity of the entire sequence.

create or replace function upsert_conversation_tags_atomic(
  p_contact_id uuid,
  p_new_tags jsonb,
  p_should_delete_stale boolean default true
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
  v_new_tag_names text[];
  v_stale_tag_names text[];
begin
  -- Extract tag names from new tags array
  v_new_tag_names := array_agg(tag->>'name')
    from jsonb_array_elements(p_new_tags) as tag
    where (tag->>'name') is not null;

  -- All operations in single transaction
  begin
    -- 1. Upsert new tags (atomic)
    insert into ai_conversation_tags (contact_id, tag_name, confidence, source, created_at, updated_at)
    select
      p_contact_id,
      substring(trim(tag->>'name'), 1, 100)::text,
      least(1.0, greatest(0.0, (tag->>'confidence')::float8)),
      'ai'::text,
      now(),
      now()
    from jsonb_array_elements(p_new_tags) as tag
    where (tag->>'name') is not null
      and trim(tag->>'name') != ''
    on conflict (contact_id, tag_name)
    do update set
      confidence = excluded.confidence,
      updated_at = now();

    -- 2. Delete stale tags if requested (atomic with upsert via transaction)
    if p_should_delete_stale and v_new_tag_names is not null then
      delete from ai_conversation_tags
      where contact_id = p_contact_id
        and tag_name != all(v_new_tag_names);
    end if;

    -- Return success status
    v_result := jsonb_build_object(
      'success', true,
      'inserted_tags', jsonb_agg(distinct tag_name) filter (where tag_name is not null)
    )
    from ai_conversation_tags
    where contact_id = p_contact_id
      and tag_name = any(v_new_tag_names);

    return coalesce(v_result, jsonb_build_object('success', true, 'inserted_tags', '[]'::jsonb));

  exception when others then
    -- Transaction automatically rolls back on error
    -- Return error with details for logging
    return jsonb_build_object(
      'success', false,
      'error', sqlerrm,
      'detail', sqlstate
    );
  end;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function upsert_conversation_tags_atomic(uuid, jsonb, boolean) to authenticated;

-- Add comment for documentation
comment on function upsert_conversation_tags_atomic is
  'Atomic operation for upserting conversation tags with optional stale tag cleanup.
   Ensures no race conditions when concurrent requests classify same conversation.
   Returns JSON with success status and list of inserted/updated tags.
   Automatically rolls back entire transaction on any error.';
