-- 20260801050001 — Governanca: blindar triggers de auth.users (auditoria etapa 41)
-- Aplicado em producao: 2026-08-01
-- As funcoes artes.handle_new_auth_user e artes.garantir_auth_tokens_nao_null agora
-- capturam erros (EXCEPTION WHEN OTHERS) e registram em ops.trigger_error_log — um erro
-- na aplicacao artes NAO pode mais abortar o signup do ZAPP.
-- Rollback: restaurar as definicoes originais (sem EXCEPTION) — ver git history / backup em docs.

BEGIN;

CREATE TABLE IF NOT EXISTS ops.trigger_error_log (
  id bigserial PRIMARY KEY,
  fn text NOT NULL,
  err_code text,
  err_msg text,
  ctx jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION artes.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'artes'
AS $function$
DECLARE
  v_role TEXT;
  v_apps JSONB;
  v_pertence_artes BOOLEAN;
BEGIN
  BEGIN
    v_role := NEW.raw_user_meta_data->>'role';
    v_apps := COALESCE(NEW.raw_user_meta_data->'apps', '{}'::jsonb);
    v_pertence_artes := (
      COALESCE(v_role, '') IN ('admin','fechamento')
      OR (v_apps->>'artes')::boolean IS TRUE
      OR (v_apps->>'fechamento')::boolean IS TRUE
      OR (v_apps->>'atendimento')::boolean IS TRUE
    );
    IF NOT v_pertence_artes THEN
      RETURN NEW;
    END IF;
    IF v_role IS NULL OR v_role NOT IN ('admin','fechamento') THEN
      v_role := 'fechamento';
    END IF;
    INSERT INTO artes.usuarios (user_id, email, nome, role, ativo)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)), v_role, TRUE)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ops.trigger_error_log (fn, err_code, err_msg, ctx)
    VALUES ('artes.handle_new_auth_user', SQLSTATE, SQLERRM, jsonb_build_object('user_id', NEW.id, 'email', NEW.email));
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION artes.garantir_auth_tokens_nao_null()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'artes', 'auth', 'extensions'
AS $function$
BEGIN
  BEGIN
    NEW.confirmation_token := COALESCE(NEW.confirmation_token, '');
    NEW.recovery_token := COALESCE(NEW.recovery_token, '');
    NEW.email_change_token_new := COALESCE(NEW.email_change_token_new, '');
    NEW.email_change_token_current := COALESCE(NEW.email_change_token_current, '');
    NEW.email_change := COALESCE(NEW.email_change, '');
    NEW.phone_change := COALESCE(NEW.phone_change, '');
    NEW.phone_change_token := COALESCE(NEW.phone_change_token, '');
    NEW.reauthentication_token := COALESCE(NEW.reauthentication_token, '');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ops.trigger_error_log (fn, err_code, err_msg, ctx)
    VALUES ('artes.garantir_auth_tokens_nao_null', SQLSTATE, SQLERRM, jsonb_build_object('user_id', NEW.id));
  END;
  RETURN NEW;
END;
$function$;

COMMIT;
