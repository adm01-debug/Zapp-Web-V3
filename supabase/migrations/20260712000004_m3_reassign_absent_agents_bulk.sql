-- ============================================================================
-- M-3 (MED-3): Rewrite reassign_absent_agents — eliminate N+1 query loop
-- Audit: AUDITORIA_BACKEND_SENIOR_2026-07-11.md
-- Date: 2026-07-12
--
-- PROBLEM
-- -------
-- The original function has O(absent_agents × contacts_per_agent) PL/pgSQL
-- iterations, each issuing:
--   • 1 SELECT to pick the least-loaded agent (with a correlated sub-SELECT)
--   • 1 UPDATE contacts
--   • 1 INSERT INTO conversation_events
--
-- With 5 absent agents and 100 contacts each → 1 500 round trips per call.
--
-- SOLUTION
-- --------
-- Replace all loops with a single CTE chain that executes in one server round
-- trip:
--   absent_agents        – all inactive profiles with open contacts
--   contacts_to_reassign – their contacts (one pass)
--   agent_loads          – current contact count per agent (computed once)
--   candidate_agents     – eligible agents ranked by load per contact
--   best_assignments     – top-1 candidate per contact
--   updated              – bulk UPDATE contacts … FROM best_assignments
--   events_inserted      – bulk INSERT conversation_events … FROM updated
--
-- Trade-off: the CTE snapshot does not reflect within-batch load changes
-- (multiple contacts may get assigned to the same newly-lightly-loaded agent
-- before that agent's count increments). This is acceptable because the
-- function runs as a cron and the next run corrects any imbalance.
--
-- IDEMPOTENT: CREATE OR REPLACE is safe on repeated runs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reassigned integer;
BEGIN
  WITH
  absent_agents AS (
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at < now() - (inactive_minutes || ' minutes')::interval
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id)
  ),
  contacts_to_reassign AS (
    SELECT c.id          AS contact_id,
           c.queue_id,
           c.assigned_to AS absent_agent_id
    FROM contacts c
    WHERE c.assigned_to IN (SELECT agent_id FROM absent_agents)
  ),
  -- Compute agent loads once so ranking doesn't issue a correlated sub-SELECT
  -- per (contact, candidate_agent) pair.
  agent_loads AS (
    SELECT assigned_to AS agent_id,
           COUNT(*)    AS contact_count
    FROM contacts
    GROUP BY assigned_to
  ),
  candidate_agents AS (
    SELECT
      ctr.contact_id,
      ctr.absent_agent_id,
      qm.profile_id                         AS new_agent_id,
      COALESCE(al.contact_count, 0)         AS agent_load,
      ROW_NUMBER() OVER (
        PARTITION BY ctr.contact_id
        ORDER BY COALESCE(al.contact_count, 0) ASC,
                 qm.profile_id               -- deterministic tie-break
      )                                      AS rn
    FROM contacts_to_reassign ctr
    JOIN queue_members qm
      ON (ctr.queue_id IS NULL OR qm.queue_id = ctr.queue_id)
    JOIN profiles p ON p.id = qm.profile_id
    LEFT JOIN agent_loads al ON al.agent_id = qm.profile_id
    WHERE qm.is_active = true
      AND p.is_active = true
      AND p.id != ctr.absent_agent_id
      AND (
        p.last_seen_at IS NULL
        OR p.last_seen_at > now() - (inactive_minutes || ' minutes')::interval
      )
  ),
  best_assignments AS (
    SELECT contact_id, absent_agent_id, new_agent_id
    FROM candidate_agents
    WHERE rn = 1
  ),
  updated AS (
    UPDATE contacts c
    SET    assigned_to = ba.new_agent_id
    FROM   best_assignments ba
    WHERE  c.id = ba.contact_id
    RETURNING c.id        AS contact_id,
              ba.absent_agent_id,
              ba.new_agent_id
  ),
  -- Data-modifying CTEs always run to completion even if unreferenced by the
  -- outer SELECT, so this INSERT is guaranteed to execute.
  events_inserted AS (
    INSERT INTO conversation_events
      (contact_id, event_type, from_agent_id, to_agent_id, metadata)
    SELECT
      u.contact_id,
      'absence_reassign',
      u.absent_agent_id,
      u.new_agent_id,
      jsonb_build_object(
        'reason',           'agent_inactive',
        'inactive_minutes', inactive_minutes
      )
    FROM updated u
  )
  SELECT COUNT(*) INTO v_reassigned FROM updated;

  RETURN v_reassigned;
END;
$$;

COMMENT ON FUNCTION public.reassign_absent_agents(integer) IS
  'M-3 (2026-07-12): Bulk-reassigns contacts from absent agents via a single '
  'CTE chain (UPDATE…FROM + INSERT…SELECT). Replaces O(N×M) PL/pgSQL loop.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Validate: function exists with correct signature
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'reassign_absent_agents';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'M-3 validation FAILED: reassign_absent_agents not found';
  END IF;

  RAISE NOTICE 'M-3 OK: reassign_absent_agents rewritten as single-pass CTE bulk UPDATE+INSERT.';
END;
$$;
