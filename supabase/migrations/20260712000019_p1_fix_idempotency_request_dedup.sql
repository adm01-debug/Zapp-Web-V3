-- P1 High Priority Fix: Request idempotency via request_id deduplication
-- Addresses F-008: Duplicate requests processed twice creating tag/notification duplicates
--
-- Problem: Retried requests (network timeout, client retry) create duplicate tags/notifications
-- Solution: Track processed request_ids and return cached result on retry within time window

-- Table: Track processed requests for idempotency
-- Stores request_id + action to detect duplicates within 5 minute window
create table if not exists processed_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  action text not null,
  user_id uuid not null,
  contact_id uuid,
  result_status integer not null default 200,
  result_payload jsonb,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '5 minutes')
);

-- Index for fast lookup by request_id + action
create unique index if not exists idx_processed_requests_request_id_action
  on processed_requests(request_id, action);

-- Index for cleanup query (find expired records)
create index if not exists idx_processed_requests_expires_at
  on processed_requests(expires_at)
  where expires_at < now();

-- Index for user + contact context queries
create index if not exists idx_processed_requests_user_contact
  on processed_requests(user_id, contact_id)
  where expires_at > now();

-- RPC function: Check if request is duplicate
create or replace function check_duplicate_request(
  p_request_id text,
  p_action text,
  p_user_id uuid
)
returns table (
  is_duplicate boolean,
  status_code integer,
  cached_result jsonb
)
language plpgsql
as $$
declare
  v_record processed_requests%rowtype;
begin
  -- Look for existing processed request
  select * into v_record
  from processed_requests
  where request_id = p_request_id
    and action = p_action
    and user_id = p_user_id
    and expires_at > now()
  limit 1;

  if found then
    -- Duplicate detected - return cached result
    return query select
      true,
      v_record.result_status,
      v_record.result_payload;
  else
    -- New request - return indicator to proceed
    return query select
      false,
      null::integer,
      null::jsonb;
  end if;
end;
$$;

-- RPC function: Record processed request for future deduplication
create or replace function record_processed_request(
  p_request_id text,
  p_action text,
  p_user_id uuid,
  p_contact_id uuid,
  p_status_code integer,
  p_result_payload jsonb
)
returns void
language plpgsql
as $$
begin
  insert into processed_requests (
    request_id, action, user_id, contact_id,
    result_status, result_payload, expires_at
  )
  values (
    p_request_id, p_action, p_user_id, p_contact_id,
    p_status_code, p_result_payload, now() + interval '5 minutes'
  )
  on conflict (request_id, action) do nothing;
end;
$$;

-- Cleanup function: Remove expired request records (run periodically via cron)
create or replace function cleanup_expired_requests()
returns integer
language plpgsql
as $$
declare
  v_deleted_count integer;
begin
  delete from processed_requests
  where expires_at < now();

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

-- Grant permissions
grant execute on function check_duplicate_request(text, text, uuid) to authenticated;
grant execute on function record_processed_request(text, text, uuid, uuid, integer, jsonb) to authenticated;
grant execute on function cleanup_expired_requests() to authenticated;

-- Add helpful comments
comment on table processed_requests is
  'Tracks processed request IDs for 5-minute idempotency window.
   Prevents duplicate tag creation/notification sending on client retries.
   Automatically expires records after 5 minutes.';

comment on function check_duplicate_request is
  'Check if a request has already been processed within the idempotency window.
   Returns: (is_duplicate, status_code, cached_result)
   If is_duplicate=true, return the cached result to client.';

comment on function record_processed_request is
  'Record a newly processed request for future deduplication.
   Called after successful AI action processing to cache the result.';

comment on function cleanup_expired_requests is
  'Remove expired request records (age > 5 minutes).
   Call via pg_cron for automatic cleanup every 1 minute.
   Returns number of deleted records.';
