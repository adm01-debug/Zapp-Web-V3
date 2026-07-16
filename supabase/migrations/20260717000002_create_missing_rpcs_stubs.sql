-- GAP-2: initiate_gmail_oauth, complete_gmail_oauth (useIntegrationManagement.ts:54,69)
-- GAP-3: sync_to_crm (useIntegrationManagement.ts:156)
-- GAP-4: export_user_data, import_user_data (useMediaManagement.ts:95,130)
-- GAP-5: enrich_contact (useCRMManagement.ts:148)
-- GAP-6: get_latest_analysis (useAnalyticsManagement.ts:170)
--
-- These stubs return safe empty/null values so the UI degrades gracefully instead
-- of throwing 42883 (function does not exist). Replace with real implementations
-- when the corresponding backend features are built.

-- ─── GAP-2: Gmail OAuth ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.initiate_gmail_oauth()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp, public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'auth_url', null,
    'error', 'Gmail OAuth not yet implemented'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.initiate_gmail_oauth() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.complete_gmail_oauth(auth_code text, p_state text DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp, public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Gmail OAuth not yet implemented'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.complete_gmail_oauth(auth_code text, p_state text) TO authenticated;

-- ─── GAP-3: CRM Sync ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.sync_to_crm(
  entity_id   uuid,
  entity_data jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp, public
AS $$
BEGIN
  -- Stub: log the intent so calls are auditable, but do nothing.
  -- Replace with real CRM integration when implemented.
  -- Record the sync attempt for observability (uses only columns present in all
  -- audit_logs schema variants: action + details).
  INSERT INTO zapp.audit_logs (action, details)
  VALUES (
    'sync_to_crm',
    jsonb_build_object('entity_id', entity_id, 'entity_data', entity_data)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.sync_to_crm(uuid, jsonb) TO authenticated;

-- ─── GAP-4: Export / Import user data ────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.export_user_data(export_format text DEFAULT 'json')
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_profile
  FROM zapp.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  -- Return basic profile data as a safe initial export shape.
  -- Full data export (messages, contacts, etc.) should be implemented
  -- as an Edge Function for large datasets.
  RETURN jsonb_build_object(
    'format',       export_format,
    'exported_at',  now(),
    'profile',      row_to_json(v_profile)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.export_user_data(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.import_user_data(data jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp, public
AS $$
BEGIN
  -- Stub: accept the call without side-effects until the real importer is built.
  -- Full import should be an Edge Function with transaction safety.
  RAISE NOTICE 'import_user_data stub called — no data was imported';
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.import_user_data(jsonb) TO authenticated;

-- ─── GAP-5: Contact enrichment ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.enrich_contact(contact_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp, public
AS $$
DECLARE
  v_contact record;
BEGIN
  SELECT * INTO v_contact
  FROM zapp.contacts
  WHERE id = contact_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Stub: return basic contact data. Replace with real enrichment API call
  -- (Clearbit, Apollo, etc.) when the integration is wired up.
  RETURN jsonb_build_object(
    'contact_id', contact_id,
    'enriched',   false,
    'source',     'stub',
    'data',       row_to_json(v_contact)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.enrich_contact(uuid) TO authenticated;

-- ─── GAP-6: Latest sentiment analysis ────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.get_latest_analysis(hours integer DEFAULT 24)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp, public
AS $$
DECLARE
  v_cutoff timestamptz := now() - (hours || ' hours')::interval;
  v_result jsonb;
BEGIN
  -- Return aggregate engagement summary from contact_intelligence.
  -- Uses engagement_score column (sentiment TEXT column isn't numeric, skipped here).
  SELECT jsonb_build_object(
    'id',        gen_random_uuid(),
    'metric',    'engagement_avg',
    'value',     COALESCE(AVG(ci.engagement_score), 0),
    'trend',     'stable',
    'timestamp', now()
  )
  INTO v_result
  FROM zapp.contact_intelligence ci
  WHERE ci.created_at >= v_cutoff;

  RETURN COALESCE(v_result, jsonb_build_object(
    'id',        gen_random_uuid(),
    'metric',    'sentiment_avg',
    'value',     0,
    'trend',     'stable',
    'timestamp', now()
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.get_latest_analysis(integer) TO authenticated;
