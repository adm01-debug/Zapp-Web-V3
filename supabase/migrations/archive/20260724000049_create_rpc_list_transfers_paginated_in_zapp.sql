-- Migration: Add zapp.rpc_list_transfers_paginated wrapper
--
-- Problem: rpc_list_transfers_paginated only exists in public schema.
-- useTransfersPaginated.ts calls safeClient.rpc('rpc_list_transfers_paginated', ...)
-- where safeClient inherits the Supabase client configured with db.schema='zapp'.
-- PostgREST sends Content-Profile: zapp → looks for zapp.rpc_list_transfers_paginated
-- → not found → PGRST202 → hook always fails with "Function not found" error.
--
-- Fix: create a zapp wrapper that delegates to the public implementation.

CREATE OR REPLACE FUNCTION zapp.rpc_list_transfers_paginated(
  p_status   TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT NULL,
  p_from     TIMESTAMPTZ DEFAULT NULL,
  p_to       TIMESTAMPTZ DEFAULT NULL,
  p_limit    INTEGER DEFAULT 50,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE(
  id               UUID,
  source_instance  TEXT,
  target_instance  TEXT,
  remote_jid       TEXT,
  contact_name     TEXT,
  status           TEXT,
  priority         INTEGER,
  transfer_type    TEXT,
  category         TEXT,
  reason           TEXT,
  from_agent_id    UUID,
  to_agent_id      UUID,
  sla_deadline     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  accepted_at      TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  total_count      BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = zapp, public
AS $$
  SELECT * FROM public.rpc_list_transfers_paginated(
    p_status, p_priority, p_from, p_to, p_limit, p_offset
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_transfers_paginated(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_list_transfers_paginated(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;
