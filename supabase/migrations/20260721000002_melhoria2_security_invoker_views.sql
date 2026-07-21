-- MELHORIA #2: security_invoker=on nas 9 views zapp sem essa propriedade
-- Garante que queries via PostgREST executem com privilégios do usuário chamador
-- e não do owner da view (previne bypass de RLS)
ALTER VIEW zapp.channel_connections_safe    SET (security_invoker=on);
ALTER VIEW zapp.cookies_health_dashboard    SET (security_invoker=on);
ALTER VIEW zapp.evolution_instances         SET (security_invoker=on);
ALTER VIEW zapp.v_all_consent_audit         SET (security_invoker=on);
ALTER VIEW zapp.v_cookie_health             SET (security_invoker=on);
ALTER VIEW zapp.v_security_invoker_audit    SET (security_invoker=on);
ALTER VIEW zapp.v_security_posture          SET (security_invoker=on);
ALTER VIEW zapp.v_storage_policy_audit      SET (security_invoker=on);
ALTER VIEW zapp.v_webhook_health            SET (security_invoker=on);
