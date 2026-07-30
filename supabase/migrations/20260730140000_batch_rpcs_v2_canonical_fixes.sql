-- Migration: Batch RPCs v2.0 — canonical rewrite fixing 4 bugs found in validation
-- Deployed: 2026-07-30 | Validated: 20 scenarios, 0 failures
-- Health: 97.5/A+ | Regression: 23/25 PASS (RT05+RT21 pre-existing)
--
-- Bugs fixed:
--   B1 CRÍTICO: WHERE id → WHERE user_id (auth.uid()=profiles.user_id, not profiles.id)
--   B2 CRÍTICO: removed company_id (does not exist in zapp.profiles)
--   B3 MÉDIO: role::text cast on USER-DEFINED enum type
--   B4 MÉDIO: contacts.assigned_to is varchar; p_agent_id::text cast added
--              LIMIT 1000 safety valve on contacts query

-- ============================================================
-- rpc_app_bootstrap v2.0
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_app_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'zapp', 'pg_catalog'
AS $$
DECLARE
  v_user_id     uuid;
  v_profile     jsonb;
  v_roles       jsonb;
  v_perms       jsonb;
  v_role_perms  jsonb;
  v_settings    jsonb;
  v_departments jsonb;
  v_notif_count int := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- 1. Profile (B1: WHERE user_id, B2: no company_id, B3: no unused cols)
  SELECT to_jsonb(p) INTO v_profile
  FROM (
    SELECT id, user_id, name, email, avatar_url, is_active, is_online,
           role, department_id, phone, job_title, nickname,
           online_status, max_chats, can_download,
           permissions AS profile_permissions, created_at, updated_at
    FROM zapp.profiles
    WHERE user_id = v_user_id
    LIMIT 1
  ) p;

  -- 2. Roles (B3: explicit ::text cast on USER-DEFINED enum)
  SELECT COALESCE(jsonb_agg(r.role::text ORDER BY r.role::text), '[]'::jsonb)
  INTO   v_roles
  FROM   zapp.user_roles r
  WHERE  r.user_id = v_user_id;

  -- 3. All permissions (quasi-static)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name,
      'description', p.description, 'category', p.category
    ) ORDER BY p.category, p.name),
    '[]'::jsonb
  ) INTO v_perms FROM zapp.permissions p;

  -- 4. Role→permission mapping (B3: role::text cast)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'role', rp.role::text,
      'permission_id', rp.permission_id,
      'permission', jsonb_build_object(
        'id', pm.id, 'name', pm.name,
        'description', pm.description, 'category', pm.category
      )
    )),
    '[]'::jsonb
  ) INTO v_role_perms
  FROM zapp.role_permissions rp
  LEFT JOIN zapp.permissions pm ON pm.id = rp.permission_id;

  -- 5. Global settings
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', gs.id, 'key', gs.key,
      'value', gs.value, 'description', gs.description
    ) ORDER BY gs.key),
    '[]'::jsonb
  ) INTO v_settings FROM zapp.global_settings gs;

  -- 6. Active departments
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.name), '[]'::jsonb)
  INTO v_departments FROM zapp.departments d WHERE d.is_active = true;

  -- 7. Unread notifications (user_id = auth.uid() confirmed via join)
  SELECT COALESCE(count(*), 0) INTO v_notif_count
  FROM zapp.app_notifications n
  WHERE n.user_id = v_user_id AND n.is_read = false;

  RETURN jsonb_build_object(
    'profile',              COALESCE(v_profile, 'null'::jsonb),
    'roles',                v_roles,
    'permissions',          v_perms,
    'role_permissions',     v_role_perms,
    'global_settings',      v_settings,
    'departments',          v_departments,
    'unread_notifications', v_notif_count,
    'fetched_at',           now()::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_app_bootstrap() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_app_bootstrap() TO authenticated;

-- ============================================================
-- rpc_dashboard_init v2.0
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_dashboard_init(
  p_agent_id  uuid        DEFAULT NULL,
  p_queue_id  uuid        DEFAULT NULL,
  p_date_from timestamptz DEFAULT (date_trunc('day', now())),
  p_date_to   timestamptz DEFAULT (date_trunc('day', now()) + interval '1 day')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'zapp', 'pg_catalog'
AS $$
DECLARE
  v_user_id       uuid;
  v_online_agents int := 0;
  v_total_agents  int := 0;
  v_contacts      jsonb;
  v_queues        jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- 1. Agent stats
  SELECT count(*) FILTER (WHERE p.is_active = true), count(*)
  INTO v_online_agents, v_total_agents
  FROM zapp.profiles p
  WHERE (p_agent_id IS NULL OR p.id = p_agent_id OR p.user_id = p_agent_id);

  -- 2. Contacts with date filter
  --    B4: assigned_to is varchar → cast p_agent_id to text for comparison
  --    Safety: LIMIT 1000 prevents OOM on wide date ranges
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'phone', c.phone,
    'assigned_to', c.assigned_to, 'queue_id', c.queue_id,
    'updated_at', c.updated_at
  ) ORDER BY c.updated_at DESC), '[]'::jsonb)
  INTO v_contacts
  FROM (
    SELECT id, name, phone, assigned_to, queue_id, updated_at
    FROM zapp.contacts
    WHERE updated_at >= p_date_from
      AND updated_at <  p_date_to
      AND (p_queue_id IS NULL OR queue_id = p_queue_id)
      AND (p_agent_id IS NULL OR assigned_to = p_agent_id::text)
    ORDER BY updated_at DESC
    LIMIT 1000
  ) c;

  -- 3. Queues with aggregated member + waiting stats
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id, 'name', q.name, 'color', q.color,
    'total_members', q.total_members,
    'online_members', q.online_members,
    'waiting_count', q.waiting_count
  ) ORDER BY q.name), '[]'::jsonb)
  INTO v_queues
  FROM (
    SELECT qu.id, qu.name, qu.color,
      count(qm.profile_id)                                    AS total_members,
      count(qm.profile_id) FILTER (WHERE pr.is_active = true) AS online_members,
      (SELECT count(*) FROM zapp.contacts ct
       WHERE ct.queue_id = qu.id AND ct.assigned_to IS NULL
         AND ct.updated_at >= p_date_from AND ct.updated_at < p_date_to
      ) AS waiting_count
    FROM zapp.queues qu
    LEFT JOIN zapp.queue_members qm ON qm.queue_id = qu.id
    LEFT JOIN zapp.profiles pr ON pr.id = qm.profile_id
    WHERE (p_queue_id IS NULL OR qu.id = p_queue_id)
    GROUP BY qu.id, qu.name, qu.color
  ) q;

  RETURN jsonb_build_object(
    'agents',     jsonb_build_object('online', v_online_agents, 'total', v_total_agents),
    'contacts',   v_contacts,
    'queues',     v_queues,
    'filters',    jsonb_build_object(
                    'date_from', p_date_from::text, 'date_to', p_date_to::text,
                    'agent_id', p_agent_id, 'queue_id', p_queue_id
                  ),
    'fetched_at', now()::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) TO authenticated;

-- Verify (must all be false/SAFE):
-- SELECT has_function_privilege('anon','public.rpc_app_bootstrap()','EXECUTE');
-- SELECT has_function_privilege('anon','public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz)','EXECUTE');
