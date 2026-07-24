-- Fix insecure search_path on SECURITY DEFINER trigger handler functions.
--
-- All four functions previously had search_path=public, evo, zapp — placing
-- public first creates a privilege-escalation vector: any object created in
-- public (table, function, type) with the same name as a zapp/evo object
-- would shadow the legitimate one under the elevated SECURITY DEFINER context.
--
-- All references inside these function bodies are fully-qualified (e.g.
-- evo.evolution_contacts, zapp.whatsapp_connections) so removing public from
-- the path is a no-op for object resolution but closes the attack surface.
-- pg_catalog is always implicitly appended by PostgreSQL regardless of
-- search_path, so gen_random_uuid() and other builtins continue to work.
--
-- Applied to live DB on 2026-07-24 via direct SQL.

ALTER FUNCTION zapp.fn_contacts_view_insert_handler() SET search_path = zapp, evo;
ALTER FUNCTION zapp.fn_contacts_view_update_handler() SET search_path = zapp, evo;
ALTER FUNCTION zapp.fn_contacts_view_delete_handler() SET search_path = zapp, evo;
ALTER FUNCTION zapp.fn_messages_view_insert_handler() SET search_path = zapp, evo;
