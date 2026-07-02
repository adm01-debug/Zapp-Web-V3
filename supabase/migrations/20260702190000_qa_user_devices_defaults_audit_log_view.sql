-- QA 2026-07-02 - correcoes descobertas em validacao exaustiva (ja aplicadas em prod; migration idempotente)
-- 1) detect-new-device 500: user_devices/user_sessions tinham NOT NULL sem default
ALTER TABLE public.user_devices  ALTER COLUMN first_seen_at    SET DEFAULT now();
ALTER TABLE public.user_devices  ALTER COLUMN last_seen_at     SET DEFAULT now();
ALTER TABLE public.user_sessions ALTER COLUMN started_at       SET DEFAULT now();
ALTER TABLE public.user_sessions ALTER COLUMN last_activity_at SET DEFAULT now();

-- 2) dbFrom('audit_log') 404: ContactAuditLogPanel espera public.audit_log com shape
--    (changed_at/changed_by/old_values/new_values/reason/contact_id) que nunca existiu.
CREATE OR REPLACE VIEW public.audit_log AS
SELECT id,
       action,
       created_at   AS changed_at,
       performed_by AS changed_by,
       old_values,
       new_values,
       NULL::text   AS reason,
       entity_id    AS contact_id
FROM evo.evolution_audit_log
WHERE entity_type IN ('contact','contacts','evolution_contacts');

REVOKE ALL ON public.audit_log FROM PUBLIC, anon;
GRANT SELECT ON public.audit_log TO authenticated, service_role;
COMMENT ON VIEW public.audit_log IS
  'Repoint p/ ContactAuditLogPanel. Fonte: evo.evolution_audit_log. Criada 2026-07-02 (fix dbFrom(audit_log) 404).';

-- Obs.: em self-hosted atras de supavisor (transaction mode), NOTIFY pgrst nao chega ao
-- PostgREST - recarregar o schema cache reiniciando o container supabase_rest.
NOTIFY pgrst, 'reload schema';
