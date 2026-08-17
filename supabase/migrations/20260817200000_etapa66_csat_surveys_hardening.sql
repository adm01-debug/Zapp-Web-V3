-- ============================================================================
-- Etapa 66-CSAT — Hardening do pipeline CSAT (SIM-CSAT E1/E2/E5)
-- 2026-08-17 | DB-as-source: aplicado via MCP (supabase_apply_migration /
-- role postgres); este arquivo é o espelho versionado. Idempotente
-- (IF NOT EXISTS / DROP IF EXISTS / DO $$ guard).
--
-- Objetivos (findings-06 + SIM-CSAT):
--   1. csat_surveys: + conversation_id / send_at / status / responded_at /
--      whatsapp_connection_id / message_text / attempts / last_error / updated_at;
--      UNIQUE parcial por conversa (dedup 1 pesquisa/conversa — G3/F6);
--      índice parcial (status, send_at) p/ dispatch (E2-6);
--      alinhar rating/agent_id ao desenho do repo: live (Lovable) tinha
--      rating numeric NOT NULL + agent_id NOT NULL (CHECKs auto-gerados
--      "830377_544832_*_not_null") — bloqueava criar survey antes da resposta
--      (G5/G8). 0 rows live → conversão trivial.
--   2. csat_responses: versionar tabela (espelho live: 9 colunas) +
--      message_id text (sentinel de dedup da captura — E3/F11).
--   3. RLS endurecida VERSIONADA (espelho das políticas live auth_secure_53/
--      54/55): substitui USING(true)/WITH CHECK(true) da migration 05/08
--      (F5/F7) e DROP da policy aberta csat_insert (qualquer authenticated
--      forja response — F7).
--   4. get_csat_stats: versionada (prosrc = espelho do live) — desfaz bomba
--      PGRST202/404 em recriação de DB (F3).
--   5. rpc_claim_csat_due: claim atômico (FOR UPDATE SKIP LOCKED) consumido
--      pela edge csat-dispatch (E2-6) + reabertura de surveys presos em
--      'sending' >10min (F9).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS zapp.rpc_claim_csat_due(integer);
--   DROP FUNCTION IF EXISTS zapp.get_csat_stats(text, integer);
--   DROP TABLE IF EXISTS zapp.csat_responses;
--   ALTER TABLE zapp.csat_surveys
--     DROP COLUMN IF EXISTS conversation_id, DROP COLUMN IF EXISTS whatsapp_connection_id,
--     DROP COLUMN IF EXISTS send_at, DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS responded_at, DROP COLUMN IF EXISTS message_text,
--     DROP COLUMN IF EXISTS attempts, DROP COLUMN IF EXISTS last_error,
--     DROP COLUMN IF EXISTS updated_at;
--   DROP INDEX IF EXISTS zapp.uq_csat_surveys_conversation;
--   DROP INDEX IF EXISTS zapp.idx_csat_surveys_dispatch;
--   DROP INDEX IF EXISTS zapp.idx_csat_surveys_contact_created;
--   DROP INDEX IF EXISTS zapp.idx_csat_surveys_open_by_contact;
--   (as políticas abertas da 05/08 NÃO são restauradas — reverter RLS exige
--    decisão explícita; ver SIM-CSAT E5.)
-- ============================================================================

BEGIN;

-- ── 1. csat_surveys: novas colunas do pipeline ──────────────────────────────
ALTER TABLE zapp.csat_surveys
  ADD COLUMN IF NOT EXISTS conversation_id        uuid        NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid        NULL
    REFERENCES zapp.whatsapp_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_at                timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status                 text        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sending','sent','failed','cancelled')),
  ADD COLUMN IF NOT EXISTS responded_at           timestamptz NULL,
  ADD COLUMN IF NOT EXISTS message_text           text        NULL,
  ADD COLUMN IF NOT EXISTS attempts               integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error             text        NULL,
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN zapp.csat_surveys.conversation_id IS
  'Conversa que originou a pesquisa (dedup 1 pesquisa/conversa via UNIQUE parcial).';
COMMENT ON COLUMN zapp.csat_surveys.whatsapp_connection_id IS
  'Conexão escolhida na config CSAT — usada pelo dispatch para resolver instance_name.';
COMMENT ON COLUMN zapp.csat_surveys.send_at IS
  'Momento em que o dispatch deve enviar (now() + delay_minutes da config).';
COMMENT ON COLUMN zapp.csat_surveys.status IS
  'scheduled → sending (claim do dispatch) → sent | failed | cancelled.';
COMMENT ON COLUMN zapp.csat_surveys.message_text IS
  'Template renderizado na criação (persistido p/ o dispatch não re-renderizar).';
COMMENT ON COLUMN zapp.csat_surveys.attempts IS
  'Número de tentativas de envio do dispatch.';
COMMENT ON COLUMN zapp.csat_surveys.last_error IS
  'Último erro de envio (dispatch) — observabilidade F9.';

-- ── 2. Alinhamento do shape live (Lovable) ao desenho do repo ───────────────
-- rating: live numeric NOT NULL → integer NULL + CHECK 1-5 (survey nasce SEM
-- rating; a captura preenche). 0 rows live → conversão direta sem CAST de dados.
ALTER TABLE zapp.csat_surveys
  ALTER COLUMN rating DROP NOT NULL,
  ALTER COLUMN rating TYPE integer USING CASE WHEN rating IS NULL THEN NULL ELSE rating::integer END;

-- CHECKs auto-gerados pela plataforma Lovable no live (não existem em repo
-- recriado a partir das migrations — DROP IF EXISTS é no-op nesse caso).
ALTER TABLE zapp.csat_surveys DROP CONSTRAINT IF EXISTS "830377_544832_1_not_null"; -- agent_id IS NOT NULL
ALTER TABLE zapp.csat_surveys DROP CONSTRAINT IF EXISTS "830377_544832_7_not_null"; -- rating  IS NOT NULL
ALTER TABLE zapp.csat_surveys ALTER COLUMN agent_id DROP NOT NULL;

-- CHECK de rating nomeado (idempotente entre DB recriado × live)
ALTER TABLE zapp.csat_surveys DROP CONSTRAINT IF EXISTS csat_surveys_rating_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'csat_surveys_rating_check'
      AND conrelid = 'zapp.csat_surveys'::regclass
  ) THEN
    ALTER TABLE zapp.csat_surveys
      ADD CONSTRAINT csat_surveys_rating_check CHECK (rating >= 1 AND rating <= 5);
  END IF;
END $$;

-- ── 3. Índices ──────────────────────────────────────────────────────────────
-- Dedup 1 pesquisa/conversa (G3/F6): conversa só pode ter UMA pesquisa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_csat_surveys_conversation
  ON zapp.csat_surveys (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- Dispatch (E2-6): claim de scheduled + vencidos em ordem de send_at.
CREATE INDEX IF NOT EXISTS idx_csat_surveys_dispatch
  ON zapp.csat_surveys (status, send_at)
  WHERE status = 'scheduled';

-- Cooldown 30d por contato (checagem do csat-auto-send).
CREATE INDEX IF NOT EXISTS idx_csat_surveys_contact_created
  ON zapp.csat_surveys (contact_id, created_at DESC);

-- Captura (E3): surveys abertos por contato (status='sent', sem resposta).
CREATE INDEX IF NOT EXISTS idx_csat_surveys_open_by_contact
  ON zapp.csat_surveys (contact_id)
  WHERE status = 'sent' AND responded_at IS NULL;

-- ── 4. csat_responses: versão da tabela (espelho live) + sentinel ───────────
-- Live (17/08): id, contact_id, conversation_id, agent_id, instance_name,
-- rating, comment, response_time_seconds, created_at — 0 rows, nada escrevia.
CREATE TABLE IF NOT EXISTS zapp.csat_responses (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id             uuid        NULL,
  conversation_id        uuid        NULL,
  agent_id               uuid        NULL,
  instance_name          text        NULL,
  rating                 integer     NULL CHECK (rating >= 1 AND rating <= 5),
  comment                text        NULL,
  response_time_seconds  integer     NULL,
  message_id             text        NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE zapp.csat_responses IS
  'Respostas CSAT capturadas (fn_capture_csat_replies) — alimenta get_csat_stats e o dashboard.';
COMMENT ON COLUMN zapp.csat_responses.message_id IS
  'message_id do evento Evolution — sentinel de dedup da captura (UNIQUE parcial).';

-- Sentinel de idempotência da captura (E3/F11): mesma mensagem nunca gera 2 respostas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_csat_responses_message_id
  ON zapp.csat_responses (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csat_responses_contact ON zapp.csat_responses (contact_id);
CREATE INDEX IF NOT EXISTS idx_csat_responses_created ON zapp.csat_responses (created_at DESC);

-- ── 5. RLS endurecida (espelho live auth_secure_53/54/55) ───────────────────
-- Remove as políticas ABERTAS da migration 05/08 (USING(true)/WITH CHECK(true))
-- e a policy csat_insert do live (auth.uid() IS NOT NULL = qualquer authenticated
-- forja response). F5/F7.
DROP POLICY IF EXISTS csat_auto_config_select ON zapp.csat_auto_config;
DROP POLICY IF EXISTS csat_auto_config_insert ON zapp.csat_auto_config;
DROP POLICY IF EXISTS csat_auto_config_update ON zapp.csat_auto_config;
DROP POLICY IF EXISTS csat_auto_config_delete ON zapp.csat_auto_config;
DROP POLICY IF EXISTS csat_surveys_select ON zapp.csat_surveys;
DROP POLICY IF EXISTS csat_surveys_insert ON zapp.csat_surveys;
DROP POLICY IF EXISTS csat_surveys_update ON zapp.csat_surveys;
DROP POLICY IF EXISTS csat_insert ON zapp.csat_responses;
-- Recreate limpo das policies live (idempotência entre DB recriado × live):
DROP POLICY IF EXISTS auth_secure_53 ON zapp.csat_auto_config;
DROP POLICY IF EXISTS auth_secure_54 ON zapp.csat_responses;
DROP POLICY IF EXISTS auth_secure_55 ON zapp.csat_surveys;
DROP POLICY IF EXISTS csat_service ON zapp.csat_responses;
DROP POLICY IF EXISTS service_full_access ON zapp.csat_responses;
DROP POLICY IF EXISTS service_full_access ON zapp.csat_auto_config;
DROP POLICY IF EXISTS service_full_access ON zapp.csat_surveys;

-- csat_auto_config: somente admin/supervisor (espelho auth_secure_53 — E5).
CREATE POLICY auth_secure_53 ON zapp.csat_auto_config
  FOR ALL TO authenticated
  USING (is_admin_or_supervisor())
  WITH CHECK (is_admin_or_supervisor());

-- csat_surveys: admin/supervisor OU agente dono (espelho auth_secure_55).
-- INSERT com tenant-check (substitui WITH CHECK(true)): agente só cria survey
-- para si; admin/supervisor para qualquer agente. UPDATE idem (só próprios).
CREATE POLICY auth_secure_55 ON zapp.csat_surveys
  FOR ALL TO authenticated
  USING (is_admin_or_supervisor() OR agent_id = get_profile_id_for_user(auth.uid()))
  WITH CHECK (is_admin_or_supervisor() OR agent_id = get_profile_id_for_user(auth.uid()));

-- csat_responses: SELECT = visibilidade de contato (espelho auth_secure_54);
-- INSERT/UPDATE/DELETE NÃO existem p/ authenticated — só a captura
-- (SECURITY DEFINER) e service_role escrevem. F7.
CREATE POLICY auth_secure_54 ON zapp.csat_responses
  FOR SELECT TO authenticated
  USING (is_contact_visible_to_user(contact_id, auth.uid()));

-- service_role: acesso total (edges via createZappAdminClient).
CREATE POLICY csat_service_all ON zapp.csat_auto_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY csat_service_all ON zapp.csat_surveys
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY csat_service_all ON zapp.csat_responses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 6. Grants (idempotentes) ────────────────────────────────────────────────
GRANT ALL ON zapp.csat_auto_config TO service_role;
GRANT ALL ON zapp.csat_surveys      TO service_role;
GRANT ALL ON zapp.csat_responses    TO service_role;

-- authenticated: só o que as políticas permitem (grant não abre RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.csat_auto_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.csat_surveys      TO authenticated;
GRANT SELECT                          ON zapp.csat_responses   TO authenticated;

-- ── 7. get_csat_stats versionada (prosrc = espelho do live 17/08) ───────────
-- Desfaz bomba PGRST202/404 em recriação de DB (F3). Contrato mantido:
-- (p_instance_name text DEFAULT NULL, p_days int DEFAULT 30) → jsonb.
CREATE OR REPLACE FUNCTION zapp.get_csat_stats(p_instance_name text DEFAULT NULL::text, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
WITH base AS (
  SELECT r.rating, r.agent_id
  FROM zapp.csat_responses r
  WHERE r.created_at >= now() - make_interval(days => GREATEST(p_days,1))
    AND (p_instance_name IS NULL OR r.instance_name = p_instance_name)
)
SELECT jsonb_build_object(
  'total_responses', count(*),
  'avg_score', round(avg(rating)::numeric, 2),
  'nps_promoters', count(*) FILTER (WHERE rating = 5),
  'nps_passives', count(*) FILTER (WHERE rating = 4),
  'nps_detractors', count(*) FILTER (WHERE rating <= 3),
  'nps_score', CASE WHEN count(*)=0 THEN 0 ELSE round(100.0*(count(*) FILTER (WHERE rating=5) - count(*) FILTER (WHERE rating<=3))/count(*)) END,
  'score_distribution', COALESCE((SELECT jsonb_object_agg(rating::text, n) FROM (SELECT rating, count(*) n FROM base GROUP BY rating) d), '{}'::jsonb),
  'by_agent', (SELECT jsonb_object_agg(agent_id::text, avg_r) FROM (SELECT agent_id, round(avg(rating)::numeric,2) avg_r FROM base WHERE agent_id IS NOT NULL GROUP BY agent_id) a),
  'period_days', p_days
) FROM base;
$function$;

GRANT EXECUTE ON FUNCTION zapp.get_csat_stats(text, integer) TO authenticated, service_role;

-- ── 8. rpc_claim_csat_due — claim atômico p/ a edge csat-dispatch (E2-6) ────
-- PostgREST não expõe FOR UPDATE SKIP LOCKED; o claim vive aqui:
--   step 1: reabre surveys presos em 'sending' >10min (crash do dispatch — F9);
--   step 2: claim atômico de scheduled + send_at <= now() (LIMIT, sem lock-spin);
--   step 3: devolve os claimed com phone (zapp.contacts) e instance_name
--           (zapp.whatsapp_connections) p/ envio direto evolutionClient.sendText.
CREATE OR REPLACE FUNCTION zapp.rpc_claim_csat_due(p_limit integer DEFAULT 50)
RETURNS TABLE (
  survey_id              uuid,
  contact_id             uuid,
  agent_id               uuid,
  conversation_id        uuid,
  whatsapp_connection_id uuid,
  message_text           text,
  phone                  text,
  instance_name          text,
  send_at                timestamptz
)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
BEGIN
  -- 1) Recuperação de 'sending' órfão (dispatch caiu no meio do batch)
  UPDATE zapp.csat_surveys s
     SET status = 'scheduled', updated_at = now()
   WHERE s.status = 'sending'
     AND s.updated_at < now() - interval '10 minutes';

  -- 2) Claim atômico (attempts++ = cada ciclo de claim conta como tentativa)
  UPDATE zapp.csat_surveys s
     SET status = 'sending', attempts = attempts + 1, updated_at = now()
   WHERE s.id IN (
     SELECT s2.id
       FROM zapp.csat_surveys s2
      WHERE s2.status = 'scheduled' AND s2.send_at <= now()
      ORDER BY s2.send_at
      LIMIT v_limit
        FOR UPDATE OF s2 SKIP LOCKED
   );

  -- 3) Devolve o batch claimado (LEFT JOIN: contato/conexão podem sumir — o
  --    dispatch marca 'failed' com last_error nesses casos)
  RETURN QUERY
  SELECT s.id, s.contact_id, s.agent_id, s.conversation_id,
         s.whatsapp_connection_id, s.message_text,
         c.phone, w.instance_name, s.send_at
    FROM zapp.csat_surveys s
    LEFT JOIN zapp.contacts c ON c.id = s.contact_id
    LEFT JOIN zapp.whatsapp_connections w ON w.id = s.whatsapp_connection_id
   WHERE s.status = 'sending';
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_claim_csat_due(integer) TO service_role;

COMMIT;
