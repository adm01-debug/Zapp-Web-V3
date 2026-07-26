-- =============================================================================
-- QA Round 2 + Round 3 - VERSAO CORRIGIDA E CONSOLIDADA
-- Aplicada em producao: 2026-07-26 (version 20260727120000)
--
-- Substitui integralmente:
--   20260726000099_qa_round_2_final.sql
--   20260727000099_qa_round_3_critical_fixes.sql
--
-- Motivo: ambos abortavam. Erros confirmados contra o banco:
--   R2 #1b : zapp.contact_intelligence nao possui coluna "phone"
--            (phone existe apenas na VIEW public.contact_intelligence)
--   R2 #7  : contact_id e uuid -> "operator does not exist: uuid ~* unknown"
--   R3 A   : relation "zapp.feature_flags" does not exist
--   R3 G   : fn_refresh_role_permissions_mv() retorna void ->
--            "must return type trigger"
--
-- Itens descartados por serem redundantes (indice equivalente ja existia):
--   R2 #1a : contact_intelligence_contact_id_key (UNIQUE) ja cobre contact_id
--   R2 #2  : idx_messages_contact_created_active ja lidera por contact_id
--   R3 D   : contact_audit_log.contact_id ja e NOT NULL
--   R3 E   : idx_role_permissions_role ja existe sobre (role)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. fn_evolution_status_unknown  (R2 #3) - SEM grant para anon
--    O original concedia EXECUTE a anon numa funcao SECURITY DEFINER que faz
--    UPDATE em whatsapp_connections: qualquer anonimo poderia derrubar o status
--    de qualquer instancia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_evolution_status_unknown(p_instance_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $fn$
DECLARE
  v_status text := 'unknown';
BEGIN
  BEGIN
    UPDATE zapp.whatsapp_connections
       SET status = 'unknown', updated_at = now()
     WHERE instance_name = p_instance_name;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao atualizar status de %: %', p_instance_name, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status', v_status,
    'state', null,
    'instance', p_instance_name,
    'message', format('Evolution API status unknown for instance %s', p_instance_name),
    'timestamp', extract(epoch from now())
  );
END;
$fn$;

REVOKE ALL ON FUNCTION zapp.fn_evolution_status_unknown(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.fn_evolution_status_unknown(text) FROM anon;
GRANT EXECUTE ON FUNCTION zapp.fn_evolution_status_unknown(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. fn_normalize_phone  (R2 #5)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_digits text;
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF length(v_digits) < 10 OR length(v_digits) > 13 THEN
    RETURN NULL;
  END IF;
  IF length(v_digits) IN (10, 11) THEN
    v_digits := '55' || v_digits;
  END IF;
  RETURN v_digits;
END;
$fn$;

REVOKE ALL ON FUNCTION zapp.fn_normalize_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_normalize_phone(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. MV mv_role_permissions_full  (R2 #4) - SEM grant para anon
--    role_permissions e permissions tem RLS ativo; uma MV nao respeita RLS,
--    entao liberar para anon exporia a matriz inteira de permissoes.
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS zapp.mv_role_permissions_full AS
SELECT rp.role,
       rp.permission_id,
       p.name AS permission_name,
       p.category,
       p.description
  FROM zapp.role_permissions rp
  JOIN zapp.permissions p ON p.id = rp.permission_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_role_permissions_full
  ON zapp.mv_role_permissions_full (role, permission_id);

REVOKE ALL ON zapp.mv_role_permissions_full FROM PUBLIC;
REVOKE ALL ON zapp.mv_role_permissions_full FROM anon;
REVOKE ALL ON zapp.mv_role_permissions_full FROM authenticated;
GRANT SELECT ON zapp.mv_role_permissions_full TO authenticated, service_role;

-- Funcao chamavel manualmente / por cron (retorna void)
CREATE OR REPLACE FUNCTION zapp.fn_refresh_role_permissions_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $fn$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY zapp.mv_role_permissions_full;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'refresh mv_role_permissions_full falhou: %', SQLERRM;
END;
$fn$;

REVOKE ALL ON FUNCTION zapp.fn_refresh_role_permissions_mv() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_refresh_role_permissions_mv() TO service_role;

-- Wrapper de TRIGGER (retorna trigger). Era exatamente isto que faltava no R3 G.
CREATE OR REPLACE FUNCTION zapp.trg_fn_refresh_role_permissions_mv()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $fn$
BEGIN
  PERFORM zapp.fn_refresh_role_permissions_mv();
  RETURN NULL;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 4. Gatilho generico de updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

-- Alias mantido para compatibilidade com codigo que referencia o nome antigo
CREATE OR REPLACE FUNCTION zapp.fn_touch_role_permissions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 5. role_permissions.updated_at  (R2 #6)
--    O original era guardado por "IF coluna updated_at EXISTS". A coluna nao
--    existia, entao o improvement era um no-op silencioso. Aqui a coluna e
--    criada de fato.
-- -----------------------------------------------------------------------------
ALTER TABLE zapp.role_permissions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON zapp.role_permissions;
CREATE TRIGGER trg_role_permissions_updated_at
  BEFORE UPDATE ON zapp.role_permissions
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Indice para AuditLogPanel  (R3 FIX B) - contact_id ja e NOT NULL,
--    entao o WHERE parcial do original era desnecessario.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_zapp_contact_audit_log_contact_id_changed_at
  ON zapp.contact_audit_log (contact_id, changed_at DESC);

-- -----------------------------------------------------------------------------
-- 7. CHECK em contact_audit_log.action  (R3 FIX C)
--    Validado: zapp.fn_contact_audit_trigger grava apenas TG_OP
--    (INSERT/UPDATE/DELETE), portanto nenhuma linha existente viola.
-- -----------------------------------------------------------------------------
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'zapp.contact_audit_log'::regclass
       AND conname  = 'zapp_contact_audit_log_action_check'
  ) THEN
    ALTER TABLE zapp.contact_audit_log
      ADD CONSTRAINT zapp_contact_audit_log_action_check
      CHECK (action IN ('INSERT','UPDATE','DELETE','RESTORE','MERGE'));
  END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 8. R3 FIX F descartado: zapp.contact_audit_log ja possui o trigger
--    set_updated_at -> handle_updated_at(). Criar outro seria duplicidade.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 9. Auto-refresh da MV  (R3 FIX G corrigido)
--    A excecao dentro de fn_refresh_role_permissions_mv garante que uma falha
--    de refresh nunca derrube uma escrita legitima em permissions/role_permissions.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_refresh_role_permissions_mv ON zapp.permissions;
CREATE TRIGGER trg_refresh_role_permissions_mv
  AFTER INSERT OR UPDATE OR DELETE ON zapp.permissions
  FOR EACH STATEMENT EXECUTE FUNCTION zapp.trg_fn_refresh_role_permissions_mv();

DROP TRIGGER IF EXISTS trg_refresh_role_permissions_mv_rp ON zapp.role_permissions;
CREATE TRIGGER trg_refresh_role_permissions_mv_rp
  AFTER INSERT OR UPDATE OR DELETE ON zapp.role_permissions
  FOR EACH STATEMENT EXECUTE FUNCTION zapp.trg_fn_refresh_role_permissions_mv();
