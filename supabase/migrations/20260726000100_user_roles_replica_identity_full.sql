-- Fix: DELETE events on zapp.user_roles did not include user_id in the CDC payload
-- because the default replica identity only exposes the primary key (id column).
-- Realtime filters on user_id=eq.<uuid> would never match DELETE events, so a
-- connected user would keep stale roles after an admin revoked them until a hard
-- refresh. REPLICA IDENTITY FULL makes all column values available in the old row
-- of every change event, allowing the filter to work for INSERT/UPDATE/DELETE.
ALTER TABLE zapp.user_roles REPLICA IDENTITY FULL;
