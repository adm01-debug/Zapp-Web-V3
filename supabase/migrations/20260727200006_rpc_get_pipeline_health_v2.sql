-- Migration: rpc_get_pipeline_health_v2
--
-- Extends the pipeline health RPC with two additional signals:
--
--  1. message_freshness: whether the most recent message arrived within the
--     last 24 h. A silent pipeline (no new messages for 24+ h) scores -15.
--     This surfaces "is the webhook/queue working?" independently of data
--     quality metrics.
--
--  2. dedup_hash_coverage_pct: percentage of active contacts that already
--     have a dedup_hash. Exposed as a top-level number so dashboards can
--     show a progress bar for the LGPD backfill without computing it client-side.
--
--  3. actions: array of suggested quick-repair calls with their RPC name and
--     relevant parameters — lets the dashboard present one-click repair buttons.
--
-- The function is replaced in-place (same signature); no grants need updating.

CREATE OR REPLACE FUNCTION zapp.rpc_get_pipeline_health(
  p_instance_name text DEFAULT 'wpp2'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo
AS $$
DECLARE
  v_msg_total           bigint;
  v_msg_no_contact      bigint;
  v_msg_deleted         bigint;
  v_msg_latest_at       timestamptz;
  v_contact_total       bigint;
  v_contact_no_hash     bigint;
  v_contact_lgpd_pending bigint;
  v_contact_anonymized  bigint;
  v_conv_total          bigint;
  v_conv_no_contact     bigint;
  v_conv_open           bigint;
  v_conv_pending        bigint;
  v_score               int;
  v_penalties           jsonb := '[]'::jsonb;
  v_actions             jsonb := '[]'::jsonb;
  v_hash_coverage_pct   numeric;
BEGIN
  -- Role guard: only admins/supervisors
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Messages ─────────────────────────────────────────────────────────────
  SELECT
    COUNT(*)                                                      AS total,
    COUNT(*) FILTER (
      WHERE contact_id IS NULL
        AND remote_jid NOT LIKE '%@g.us'
        AND remote_jid NOT LIKE '%@broadcast'
        AND remote_jid NOT IN ('unknown@s.whatsapp.net', 'unknown@deleted')
        AND split_part(remote_jid, '@', 1) NOT LIKE 'smoke%'
    )                                                             AS no_contact,
    COUNT(*) FILTER (WHERE status = 'deleted')                    AS deleted_count,
    MAX(created_at)                                               AS latest_at
  INTO v_msg_total, v_msg_no_contact, v_msg_deleted, v_msg_latest_at
  FROM evo.evolution_messages
  WHERE instance_name = p_instance_name;

  -- ── Contacts ─────────────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE deleted_at IS NULL)                          AS total,
    COUNT(*) FILTER (WHERE deleted_at IS NULL AND dedup_hash IS NULL)   AS no_hash,
    COUNT(*) FILTER (WHERE lgpd_deletion_requested_at IS NOT NULL
                      AND pii_masked_at IS NULL)                         AS lgpd_pending,
    COUNT(*) FILTER (WHERE pii_masked_at IS NOT NULL)                   AS anonymized
  INTO v_contact_total, v_contact_no_hash, v_contact_lgpd_pending, v_contact_anonymized
  FROM evo.evolution_contacts
  WHERE instance_name = p_instance_name;

  -- ── Conversations ─────────────────────────────────────────────────────────
  SELECT
    COUNT(*)                                              AS total,
    COUNT(*) FILTER (WHERE contact_id IS NULL)            AS no_contact,
    COUNT(*) FILTER (WHERE status = 'open')               AS open_count,
    COUNT(*) FILTER (WHERE status = 'pending')            AS pending_count
  INTO v_conv_total, v_conv_no_contact, v_conv_open, v_conv_pending
  FROM evo.evolution_conversations
  WHERE instance_name = p_instance_name;

  -- ── Derived metrics ──────────────────────────────────────────────────────
  v_hash_coverage_pct := CASE
    WHEN v_contact_total > 0
    THEN round(100.0 * (v_contact_total - v_contact_no_hash) / v_contact_total, 1)
    ELSE 100.0
  END;

  -- ── Health score (0–100) ──────────────────────────────────────────────────
  v_score := 100;

  -- Penalty: messages without contact_id > 0.5% of total
  IF v_msg_total > 0
     AND v_msg_no_contact::float / v_msg_total > 0.005
  THEN
    v_score   := v_score - 20;
    v_penalties := v_penalties || jsonb_build_object(
      'code',   'messages_no_contact',
      'detail', format('%s messages (%s%%) lack contact_id',
                  v_msg_no_contact,
                  round(100.0 * v_msg_no_contact / v_msg_total, 1)),
      'points', -20
    );
    v_actions := v_actions || jsonb_build_object(
      'label', 'Backfill contact_id',
      'rpc',   'backfill_messages_contact_id',
      'args',  jsonb_build_object('instance_name', p_instance_name)
    );
  END IF;

  -- Penalty: conversations without contact_id
  IF v_conv_no_contact > 0 THEN
    v_score   := v_score - 10;
    v_penalties := v_penalties || jsonb_build_object(
      'code',   'conversations_no_contact',
      'detail', format('%s conversations lack contact_id', v_conv_no_contact),
      'points', -10
    );
  END IF;

  -- Penalty: >50% contacts missing dedup_hash
  IF v_contact_total > 0
     AND v_contact_no_hash::float / v_contact_total > 0.5
  THEN
    v_score   := v_score - 10;
    v_penalties := v_penalties || jsonb_build_object(
      'code',   'contacts_no_dedup_hash',
      'detail', format('%s/%s contacts missing dedup_hash (LGPD job pending)',
                  v_contact_no_hash, v_contact_total),
      'points', -10
    );
    v_actions := v_actions || jsonb_build_object(
      'label', 'Repair dedup hashes',
      'rpc',   'rpc_bulk_repair_dedup_hashes',
      'args',  jsonb_build_object('p_instance_name', p_instance_name, 'p_dry_run', false)
    );
  END IF;

  -- Penalty: LGPD deletion backlog > 0
  IF v_contact_lgpd_pending > 0 THEN
    v_score   := v_score - 5;
    v_penalties := v_penalties || jsonb_build_object(
      'code',   'lgpd_pending_deletion',
      'detail', format('%s contacts pending LGPD anonymization', v_contact_lgpd_pending),
      'points', -5
    );
    v_actions := v_actions || jsonb_build_object(
      'label', 'Run LGPD anonymization',
      'edge_function', 'lgpd-scheduled-jobs',
      'body',  jsonb_build_object('job', 'anonymize_pending')
    );
  END IF;

  -- Penalty (NEW): message freshness — no new messages in last 24 h
  IF v_msg_latest_at IS NULL
     OR v_msg_latest_at < NOW() - INTERVAL '24 hours'
  THEN
    v_score   := v_score - 15;
    v_penalties := v_penalties || jsonb_build_object(
      'code',   'pipeline_silent',
      'detail', CASE
                  WHEN v_msg_latest_at IS NULL
                  THEN 'No messages received yet for this instance'
                  ELSE format('Last message received %s ago — pipeline may be stalled',
                         to_char(NOW() - v_msg_latest_at, 'HH24:MI:SS'))
                END,
      'points', -15
    );
  END IF;

  v_score := GREATEST(0, v_score);

  RETURN jsonb_build_object(
    'instance_name',           p_instance_name,
    'checked_at',              NOW(),
    'health_score',            v_score,
    'health_label',            CASE
                                 WHEN v_score >= 90 THEN 'healthy'
                                 WHEN v_score >= 70 THEN 'degraded'
                                 ELSE 'critical'
                               END,
    'penalties',               v_penalties,
    'actions',                 v_actions,
    'messages',                jsonb_build_object(
      'total',        v_msg_total,
      'no_contact',   v_msg_no_contact,
      'deleted',      v_msg_deleted,
      'latest_at',    v_msg_latest_at,
      'fresh',        v_msg_latest_at IS NOT NULL
                        AND v_msg_latest_at >= NOW() - INTERVAL '24 hours'
    ),
    'contacts',                jsonb_build_object(
      'total',               v_contact_total,
      'no_dedup_hash',       v_contact_no_hash,
      'dedup_hash_coverage', v_hash_coverage_pct,
      'lgpd_pending',        v_contact_lgpd_pending,
      'anonymized',          v_contact_anonymized
    ),
    'conversations',           jsonb_build_object(
      'total',     v_conv_total,
      'no_contact', v_conv_no_contact,
      'open',       v_conv_open,
      'pending',    v_conv_pending
    )
  );
END;
$$;

-- Grants unchanged (REPLACE keeps them, but be explicit for idempotency)
REVOKE EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health(text) FROM anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health(text) TO authenticated;

COMMENT ON FUNCTION zapp.rpc_get_pipeline_health(text) IS
  'Returns a JSONB health report for the given Evolution instance pipeline. '
  'Covers message/contact/conversation data quality, message freshness (24h signal), '
  'dedup_hash coverage %, weighted health score 0-100, and suggested repair actions. '
  'Requires admin or supervisor role. Default instance: wpp2. (v2)';
