-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819000000_login_attempts_atomic_counter.sql
-- AGENTE A3 — login-attempts: contador atômico (gap da onda 3, SEGURANCA)
--
-- GAP: a edge login-attempts gravava via SELECT → compute(+1) → upsert em 3
-- passos. Duas falhas simultâneas (race) liam o MESMO attempt_count e
-- gravavam o mesmo valor → 2 falhas contavam como 1, quebrando lockout e a
-- escalação exponencial.
--
-- FIX: RPC atômica zapp.fn_login_attempt_record_failed com
--   INSERT ... ON CONFLICT (email) DO UPDATE
--   SET attempt_count = login_attempts.attempt_count + 1
-- O UPDATE é atômico (lock de linha): CADA chamada conta, mesmo concorrente.
--
-- Regras copiadas EXATAMENTE da edge atual (supabase/functions/login-attempts/
-- index.ts — FIX 2026-07-16 + MAX_ATTEMPTS/MAX_LOCK_EXPONENT):
--   • MAX_ATTEMPTS = 5: locked_until só a partir da 5ª falha.
--   • Escalação 2^(n-5) minutos, teto 2^10 = 1024 min (~17h).
--   • Lock expirado NÃO reseta o contador (incremento sempre; reset só via
--     action='clear', que DELETA a linha).
--   • Fail-closed preservado: erro de RPC/DB → edge responde 500 → front trata
--     como lock_check_failed (bloqueia o login).
--
-- ⚠ ORDEM DE DEPLOY OBRIGATÓRIA (documentar no PR):
--   1) migration PRIMEIRO: aplicar ESTA migration no DB (executor, via MCP,
--      APÓS o merge do PR);
--   2) edge DEPOIS: só então deployar a edge login-attempts (novo index.ts
--      chama a RPC).
--   Se a edge for deployada antes, a RPC não existe → 500 em todo record_failed
--   (a edge nova NÃO tem fallback para o caminho antigo — removido de propósito).
--
-- Rollback: DROP FUNCTION IF EXISTS zapp.fn_login_attempt_record_failed(text,text,text,boolean);

CREATE OR REPLACE FUNCTION zapp.fn_login_attempt_record_failed(
  p_email text,
  p_ip_address text,
  p_user_agent text,
  p_success boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'zapp'
AS $fn$
DECLARE
  v_attempt_count integer;
  v_locked_until timestamptz;
BEGIN
  INSERT INTO zapp.login_attempts (
    email,
    ip_address,
    user_agent,
    success,
    attempt_count,
    last_attempt_at,
    locked_until,
    updated_at
  )
  VALUES (
    p_email,
    NULLIF(p_ip_address, 'unknown'),
    p_user_agent,
    COALESCE(p_success, false),
    1,
    now(),
    NULL,
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    attempt_count    = login_attempts.attempt_count + 1,
    ip_address       = EXCLUDED.ip_address,
    user_agent       = EXCLUDED.user_agent,
    last_attempt_at  = now(),
    locked_until     = CASE
      WHEN login_attempts.attempt_count + 1 >= 5
        THEN now() + (pow(2, LEAST(login_attempts.attempt_count + 1 - 5, 10)) * interval '1 minute')
      ELSE NULL
    END,
    updated_at       = now()
  RETURNING attempt_count, locked_until
  INTO v_attempt_count, v_locked_until;

  RETURN jsonb_build_object(
    'attempt_count',    v_attempt_count,
    'locked_until',     to_jsonb(v_locked_until),
    'last_attempt_at',  to_jsonb(now()),
    'is_locked',        v_locked_until IS NOT NULL
  );
END;
$fn$;

-- Exposição mínima: somente service_role (a edge login-attempts chama via
-- createZappAdminClient/SERVICE_ROLE_KEY — supabase/functions/_shared/db-client.ts).
-- SEM GRANT TO authenticated: o frontend nunca chama esta RPC (grep src/ = 0), e
-- expô-la a qualquer usuário logado criaria vetor de DoS (inflar attempt_count de
-- email arbitrário → lockout de terceiros). ML-008 respeitado por remoção do grant.
REVOKE ALL ON FUNCTION zapp.fn_login_attempt_record_failed(text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.fn_login_attempt_record_failed(text, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION zapp.fn_login_attempt_record_failed(text, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_login_attempt_record_failed(text, text, text, boolean) TO service_role;
