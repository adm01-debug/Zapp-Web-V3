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
  -- Stub: RAISE so callers receive a proper error instead of a null auth_url.
  -- The calling code checks `if (err) throw err`, so only a RAISE propagates.
  -- Replace with real Google OAuth initiation when credentials are configured.
  RAISE EXCEPTION 'Gmail OAuth not yet implemented'
    USING ERRCODE = 'P0001',
          DETAIL  = 'Configure Google OAuth credentials and implement initiate_gmail_oauth.';
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
  -- Stub: RAISE so the caller does NOT reach setIsAuthenticated(true) on line 72
  -- of useIntegrationManagement.ts. Returning {success:false} would be silently
  -- ignored because the caller does `if (err) throw err; setIsAuthenticated(true)`.
  RAISE EXCEPTION 'Gmail OAuth not yet implemented'
    USING ERRCODE = 'P0001',
          DETAIL  = 'Configure Google OAuth credentials and implement complete_gmail_oauth.';
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
  -- Stub: raise an explicit error so callers know this is not yet implemented.
  -- Replace body with real CRM integration; remove the RAISE when done.
  RAISE EXCEPTION 'sync_to_crm not yet implemented'
    USING ERRCODE = 'P0001',
          DETAIL  = 'CRM sync integration is pending. entity_id=' || entity_id::text;
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

  IF export_format NOT IN ('json') THEN
    RAISE EXCEPTION 'Unsupported export format: %', export_format
      USING ERRCODE = 'P0001',
            DETAIL  = 'Supported formats: json';
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
  -- Stub: raise an explicit error so callers know this is not yet implemented.
  -- Full import should be an Edge Function with transaction safety.
  RAISE EXCEPTION 'import_user_data not yet implemented'
    USING ERRCODE = 'P0001',
          DETAIL  = 'Data import requires an Edge Function for transaction safety.';
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.import_user_data(jsonb) TO authenticated;

-- ─── GAP-5: Contact enrichment ───────────────────────────────────────────────
-- SECURITY INVOKER so that RLS on zapp.contacts applies: callers can only
-- enrich contacts they already have SELECT permission on. No SECURITY DEFINER
-- needed because this stub doesn't require elevated privileges.

CREATE OR REPLACE FUNCTION zapp.enrich_contact(contact_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
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
-- SECURITY INVOKER so that RLS on zapp.contact_intelligence applies: each
-- caller only sees intelligence rows they are authorised to read.

CREATE OR REPLACE FUNCTION zapp.get_latest_analysis(hours integer DEFAULT 24)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
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
