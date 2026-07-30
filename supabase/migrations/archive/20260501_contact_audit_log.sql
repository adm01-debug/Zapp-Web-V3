-- ============================================================
-- Migration: Contact Audit Log
-- Purpose: LGPD Art. 37 compliance - complete audit trail of
--          all contact data changes (who changed what and when)
-- ============================================================

-- 1. Audit log table
CREATE TABLE IF NOT EXISTS public.contact_audit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid        NOT NULL,
  action        text        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'RESTORE')),
  changed_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now(),

  -- Snapshot of changed fields only (JSONB diff)
  old_values    jsonb,          -- NULL on INSERT
  new_values    jsonb,          -- NULL on DELETE

  -- Context
  ip_address    inet,
  user_agent    text,
  session_id    text,

  -- Optional reason (for manual LGPD erasure requests etc.)
  reason        text
);

-- Indexes for fast audit queries
CREATE INDEX IF NOT EXISTS idx_contact_audit_contact_id
  ON public.contact_audit_log (contact_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_audit_changed_by
  ON public.contact_audit_log (changed_by, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_audit_action
  ON public.contact_audit_log (action, changed_at DESC);

-- 2. RLS: only authenticated users can read audit logs; nobody can write directly
ALTER TABLE public.contact_audit_log ENABLE ROW LEVEL SECURITY;

-- Managers and above can read all audit logs
CREATE POLICY "managers_read_audit_log"
  ON public.contact_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'supervisor', 'manager', 'agente_especial')
    )
  );

-- Agents can only read audit logs for their own changes
CREATE POLICY "agents_read_own_audit_log"
  ON public.contact_audit_log FOR SELECT
  TO authenticated
  USING (changed_by = auth.uid());

-- Only the trigger function (via SECURITY DEFINER) can insert
CREATE POLICY "trigger_insert_audit_log"
  ON public.contact_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (false); -- blocked for direct inserts; only trigger can write

-- 3. Audit trigger function
CREATE OR REPLACE FUNCTION public.fn_contact_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action        text;
  v_old_values    jsonb := NULL;
  v_new_values    jsonb := NULL;
  v_changed_by    uuid;
  v_sensitive_fields text[] := ARRAY['phone', 'email', 'cpf', 'cnpj', 'name', 'notes',
                                      'address', 'company', 'custom_fields', 'tags',
                                      'lgpd_consent_at', 'lgpd_opt_out_at', 'is_blocked'];
BEGIN
  -- Determine action
  v_action := TG_OP;

  -- Attempt to get the current authenticated user
  v_changed_by := auth.uid();

  -- For UPDATE: only log fields that actually changed
  IF TG_OP = 'UPDATE' THEN
    v_old_values := jsonb_object_agg(key, value)
      FROM jsonb_each(to_jsonb(OLD))
      WHERE key = ANY(v_sensitive_fields)
        AND to_jsonb(OLD)->>key IS DISTINCT FROM to_jsonb(NEW)->>key;

    v_new_values := jsonb_object_agg(key, value)
      FROM jsonb_each(to_jsonb(NEW))
      WHERE key = ANY(v_sensitive_fields)
        AND to_jsonb(OLD)->>key IS DISTINCT FROM to_jsonb(NEW)->>key;

    -- Skip log if nothing sensitive changed
    IF v_old_values IS NULL AND v_new_values IS NULL THEN
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    v_new_values := to_jsonb(NEW) - 'updated_at' - 'created_at';

  ELSIF TG_OP = 'DELETE' THEN
    v_old_values := to_jsonb(OLD);

  END IF;

  INSERT INTO public.contact_audit_log (
    contact_id,
    action,
    changed_by,
    changed_at,
    old_values,
    new_values
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    v_action,
    v_changed_by,
    now(),
    v_old_values,
    v_new_values
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Attach trigger to contacts table
DROP TRIGGER IF EXISTS trg_contact_audit ON public.contacts;
CREATE TRIGGER trg_contact_audit
  AFTER INSERT OR UPDATE OR DELETE
  ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_contact_audit_trigger();

-- 5. Helper view: last 30-day audit summary per contact
CREATE OR REPLACE VIEW public.v_contact_audit_summary AS
SELECT
  cal.contact_id,
  c.name                                    AS contact_name,
  COUNT(*)                                  AS total_changes,
  COUNT(*) FILTER (WHERE cal.action = 'UPDATE') AS updates,
  COUNT(*) FILTER (WHERE cal.action = 'DELETE') AS deletes,
  MAX(cal.changed_at)                       AS last_changed_at,
  array_agg(DISTINCT p.full_name ORDER BY p.full_name) AS changed_by_names
FROM public.contact_audit_log cal
LEFT JOIN public.contacts      c ON c.id = cal.contact_id
LEFT JOIN public.profiles      p ON p.id = cal.changed_by
WHERE cal.changed_at >= now() - interval '30 days'
GROUP BY cal.contact_id, c.name;
