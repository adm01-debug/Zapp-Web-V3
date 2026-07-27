-- Migration: rpc_get_pipeline_health — consolidated pipeline health dashboard
--
-- Returns a JSONB snapshot of key pipeline health metrics for a given Evolution
-- instance: message coverage (contact_id gaps), contact dedup hash coverage,
-- conversation integrity, and a weighted health score (0-100).
--
-- Called by the admin monitoring dashboard to replace scattered individual queries.
-- Requires admin or supervisor role.

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
    COUNT(*) FILTER (WHERE deleted_at IS NULL)                        AS total,
    COUNT(*) FILTER (WHERE deleted_at IS NULL AND dedup_hash IS NULL) AS no_hash,
    COUNT(*) FILTER (WHERE lgpd_deletion_requested_at IS NOT NULL AND pii_masked_at IS NULL) AS lgpd_pending,
    COUNT(*) FILTER (WHERE pii_masked_at IS NOT NULL)                 AS anonymized
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

  -- ── Health score (0–100) ──────────────────────────────────────────────────
  -- Start at 100, deduct points for data quality issues
  v_score := 100;

  -- Penalty: messages without contact_id > 0.5% of non-system messages
  IF v_msg_total > 0
     AND v_msg_no_contact::float / v_msg_total > 0.005
  THEN
    v_score := v_score - 20;
    v_penalties := v_penalties || jsonb_build_object(
      'code', 'messages_no_contact',
      'detail', format('%s messages (%s%%) lack contact_id', v_msg_no_contact, round(100.0 * v_msg_no_contact / v_msg_total, 1)),
      'points', -20
    );
  END IF;

  -- Penalty: conversations without contact_id
  IF v_conv_no_contact > 0 THEN
    v_score := v_score - 10;
    v_penalties := v_penalties || jsonb_build_object(
      'code', 'conversations_no_contact',
      'detail', format('%s conversations lack contact_id', v_conv_no_contact),
      'points', -10
    );
  END IF;

  -- Penalty: >50% contacts missing dedup_hash (LGPD job hasn't run)
  IF v_contact_total > 0
     AND v_contact_no_hash::float / v_contact_total > 0.5
  THEN
    v_score := v_score - 10;
    v_penalties := v_penalties || jsonb_build_object(
      'code', 'contacts_no_dedup_hash',
      'detail', format('%s/%s contacts missing dedup_hash (LGPD job pending)', v_contact_no_hash, v_contact_total),
      'points', -10
    );
  END IF;

  -- Penalty: LGPD deletion backlog > 0
  IF v_contact_lgpd_pending > 0 THEN
    v_score := v_score - 5;
    v_penalties := v_penalties || jsonb_build_object(
      'code', 'lgpd_pending_deletion',
      'detail', format('%s contacts pending LGPD anonymization', v_contact_lgpd_pending),
      'points', -5
    );
  END IF;

  v_score := GREATEST(0, v_score);

  RETURN jsonb_build_object(
    'instance_name',  p_instance_name,
    'checked_at',     NOW(),
    'health_score',   v_score,
    'health_label',   CASE
                        WHEN v_score >= 90 THEN 'healthy'
                        WHEN v_score >= 70 THEN 'degraded'
                        ELSE 'critical'
                      END,
    'penalties',      v_penalties,
    'messages',       jsonb_build_object(
      'total',        v_msg_total,
      'no_contact',   v_msg_no_contact,
      'deleted',      v_msg_deleted,
      'latest_at',    v_msg_latest_at
    ),
    'contacts',       jsonb_build_object(
      'total',              v_contact_total,
      'no_dedup_hash',      v_contact_no_hash,
      'lgpd_pending',       v_contact_lgpd_pending,
      'anonymized',         v_contact_anonymized
    ),
    'conversations',  jsonb_build_object(
      'total',        v_conv_total,
      'no_contact',   v_conv_no_contact,
      'open',         v_conv_open,
      'pending',      v_conv_pending
    )
  );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health(text) FROM anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health(text) TO authenticated;

COMMENT ON FUNCTION zapp.rpc_get_pipeline_health(text) IS
  'Returns a JSONB health report for the given Evolution instance pipeline '
  '(message/contact/conversation integrity + weighted health score 0-100). '
  'Requires admin or supervisor role. Default instance: wpp2.';
