-- GAP: check_download_permission RPC was called in useMediaManagement.ts but never defined.
-- Without it, useDownloadPermissionManagement fails silently — the fail-open catches 42883/PGRST202,
-- so the UI works, but every call hits the DB expecting a function that doesn't exist.
-- This stub returns TRUE for authenticated users (real implementation would check ACLs per resource).

CREATE OR REPLACE FUNCTION zapp.check_download_permission(
  p_resource_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'zapp'
AS $$
BEGIN
  -- Guard: must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Stub: grants download permission to all authenticated users.
  -- Replace with real ACL logic when resource-level permissions are implemented.
  RETURN true;
END;
$$;

COMMENT ON FUNCTION zapp.check_download_permission(uuid) IS
'Stub: returns TRUE for all authenticated users. Caller (useMediaManagement.ts)
already fails-open on PGRST202/42883, but this removes the missing-function error
from logs and makes the permission check explicit. Replace with real ACL logic.';

-- Expose via PostgREST as public RPC (schema: zapp is the default DB schema)
GRANT EXECUTE ON FUNCTION zapp.check_download_permission(uuid) TO authenticated;
