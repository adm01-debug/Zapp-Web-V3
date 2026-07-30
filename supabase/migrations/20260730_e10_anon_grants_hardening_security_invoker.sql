-- E10: Anon grants hardening + security_invoker normalization
--
-- (1) REVOKE SELECT de `anon` em public.contacts, public.contact_intelligence
-- (2) feature_flags: mantém sem anon SELECT (login screen usa RPCs autenticadas)
-- (3) Normalizar security_invoker = true em views de ponte

BEGIN;

-- (1) REVOKE SELECT from anon (idempotente — no-op se já revogado)
REVOKE SELECT ON TABLE public.contacts FROM anon;
REVOKE SELECT ON TABLE public.contact_intelligence FROM anon;

-- (2) feature_flags: decidido — mantém sem anon SELECT
-- Decisão: login screen lê feature_flags via RPCs autenticadas, não via anon direto.
-- security_invoker=true já protege o acesso.

-- (3) Normalizar security_invoker = true nas views de ponte (idempotente)
ALTER VIEW public.contacts SET (security_invoker = true);
ALTER VIEW public.contact_intelligence SET (security_invoker = true);
ALTER VIEW public.feature_flags SET (security_invoker = true);
ALTER VIEW public.messages SET (security_invoker = true);
ALTER VIEW public.whisper_messages SET (security_invoker = true);

-- (4) Verificação: anon com SELECT fora allowlist = 0
DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM information_schema.table_privileges tp
    WHERE tp.grantee = 'anon'
      AND tp.privilege_type = 'SELECT'
      AND tp.table_schema = 'public';

    IF v_count > 0 THEN
        RAISE EXCEPTION 'FALHA: anon possui % SELECT grants em public — verificar', v_count;
    ELSE
        RAISE NOTICE 'OK: anon possui 0 SELECT grants em public';
    END IF;
END;
$$;

COMMIT;
