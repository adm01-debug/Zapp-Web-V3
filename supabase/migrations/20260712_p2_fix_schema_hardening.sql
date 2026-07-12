-- P2 Medium Priority: Schema validation and hardening improvements
-- Addresses tag name length pre-validation and additional safeguards

-- 1. Ensure ai_conversation_tags table has proper constraints
alter table if exists ai_conversation_tags
  alter column tag_name set not null;

-- Add check constraint to prevent invalid tag names
alter table if exists ai_conversation_tags
  add constraint tag_name_length_check check (char_length(tag_name) > 0 and char_length(tag_name) <= 100);

-- Add check constraint to prevent invalid confidence values
alter table if exists ai_conversation_tags
  add constraint confidence_range_check check (confidence >= 0.0 and confidence <= 1.0);

-- 2. Create comprehensive metrics table for P2 observability
create table if not exists ai_function_metrics (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  action text,
  duration_ms integer not null,
  status text not null check (status in ('success', 'error', 'timeout', 'circuit_open')),
  user_id uuid,
  error_message text,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Index for querying metrics by function and time
create index if not exists idx_ai_metrics_function_time
  on ai_function_metrics(function_name, created_at desc);

-- Index for aggregating statistics
create index if not exists idx_ai_metrics_status_time
  on ai_function_metrics(status, created_at desc);

-- 3. Create RPC for recording metrics
create or replace function record_ai_metrics(
  p_function_name text,
  p_action text,
  p_duration_ms integer,
  p_status text,
  p_user_id uuid,
  p_error_message text,
  p_metadata jsonb
)
returns void
language plpgsql
as $$
begin
  insert into ai_function_metrics (
    function_name, action, duration_ms, status, user_id, error_message, metadata
  )
  values (
    p_function_name, p_action, p_duration_ms, p_status, p_user_id, p_error_message, p_metadata
  );
end;
$$;

-- 4. Create function for aggregating metrics (useful for monitoring)
create or replace function get_ai_metrics_summary(
  p_hours integer default 24,
  p_function_name text default null
)
returns table (
  function_name text,
  total_calls bigint,
  success_count bigint,
  error_count bigint,
  timeout_count bigint,
  avg_duration_ms numeric,
  max_duration_ms integer,
  min_duration_ms integer,
  success_rate numeric
)
language plpgsql
as $$
begin
  return query
  select
    m.function_name,
    count(*)::bigint as total_calls,
    count(*) filter (where m.status = 'success')::bigint as success_count,
    count(*) filter (where m.status = 'error')::bigint as error_count,
    count(*) filter (where m.status = 'timeout')::bigint as timeout_count,
    round(avg(m.duration_ms)::numeric, 2) as avg_duration_ms,
    max(m.duration_ms)::integer as max_duration_ms,
    min(m.duration_ms)::integer as min_duration_ms,
    round(
      (count(*) filter (where m.status = 'success')::numeric / count(*)::numeric * 100),
      2
    ) as success_rate
  from ai_function_metrics m
  where m.created_at > now() - (p_hours || ' hours')::interval
    and (p_function_name is null or m.function_name = p_function_name)
  group by m.function_name
  order by m.function_name;
end;
$$;

-- 5. Grant permissions for metrics functions
grant execute on function record_ai_metrics(text, text, integer, text, uuid, text, jsonb) to authenticated;
grant execute on function get_ai_metrics_summary(integer, text) to authenticated;

-- 6. Create cleanup function for old metrics (keep last 30 days)
create or replace function cleanup_old_metrics()
returns integer
language plpgsql
as $$
declare
  v_deleted_count integer;
begin
  delete from ai_function_metrics
  where created_at < now() - interval '30 days';

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

grant execute on function cleanup_old_metrics() to authenticated;

-- Add helpful comments
comment on table ai_function_metrics is
  'Tracks AI function execution metrics for observability.
   Records: function name, duration, status, error messages.
   Used for performance monitoring, error analysis, and SLA tracking.
   Automatically cleaned up after 30 days via cleanup_old_metrics().';

comment on function record_ai_metrics is
  'Record execution metrics for an AI function call.
   Called after function completes (success or error).
   Enables performance monitoring and debugging.';

comment on function get_ai_metrics_summary is
  'Aggregate metrics summary for AI functions over time window.
   Returns: call counts, success rate, duration statistics, error counts.
   Useful for dashboards and SLA reporting.';

comment on function cleanup_old_metrics is
  'Remove metrics older than 30 days to manage table size.
   Call via pg_cron for automatic cleanup.
   Returns number of deleted records.';
