-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260818230000_etapa62_engine_ab_variantes
-- Etapa     : E62 (PLANO-100-ETAPAS, fase 7) — subetapas 62.5/62.6/62.7
-- Purpose   : Engine A/B real:
--             * zapp.campaigns            : colunas variant (uuid — variante
--               ativa/vencedora) e variant_weight (peso default da campanha).
--             * zapp.campaign_ab_variants : coluna variant_weight (peso POR
--               variante, default 1) — base da seleção ponderada.
--             * RPC zapp.rpc_campaign_assign_variant: atribui UMA variante por
--               destinatário de forma ATÔMICA e IDEMPOTENTE (ON CONFLICT DO
--               UPDATE ... WHERE variant IS NULL) — mesmo contato nunca recebe
--               2 variantes, mesmo sob concorrência.
-- ADR (62.3): o contrato real de disparo NÃO é uma edge "campanha-send"
-- nova — o motor de envio em massa existente é talkx-send/talkx-scheduler
-- (hardcoded para talkx_campaigns/talkx_recipients, NOTA CAMPANHAS-01) e o
-- dispatcher de campanha clássica (zapp.campaigns/campaign_contacts) é
-- dependência da E61/maestro. Esta etapa entrega a engine de SELEÇÃO +
-- persistência de variante; a agregação de resultados (entregues/respondidas
-- por variante) usa as colunas send_count/delivered_count/read_count/
-- response_count de campaign_ab_variants, já consumidas pelo front
-- (useCampaignABTesting).
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION + guards.
-- Rollback  : ALTER TABLE zapp.campaigns DROP COLUMN IF EXISTS variant,
--             DROP COLUMN IF EXISTS variant_weight;
--             ALTER TABLE zapp.campaign_ab_variants DROP COLUMN IF EXISTS
--             variant_weight;
--             DROP FUNCTION IF EXISTS
--             zapp.rpc_campaign_assign_variant(uuid, uuid, uuid);
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colunas A/B em zapp.campaigns (variante ativa + peso default)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE zapp.campaigns ADD COLUMN IF NOT EXISTS variant uuid;
ALTER TABLE zapp.campaigns ADD COLUMN IF NOT EXISTS variant_weight numeric;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Peso por variante em zapp.campaign_ab_variants
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE zapp.campaign_ab_variants ADD COLUMN IF NOT EXISTS variant_weight numeric NOT NULL DEFAULT 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC de atribuição de variante (engine A/B — seleção + persistência)
--    SECURITY DEFINER com search_path fixo; fail-closed: dono ou
--    admin/supervisor; idempotente por destinatário.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_campaign_assign_variant(p_campaign_id uuid, p_contact_id uuid, p_variant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_campaign_owner uuid;
  v_profile_id     uuid;
  v_variant_name   text;
  v_assigned       uuid;
BEGIN
  -- 1. campanha precisa existir
  SELECT c.created_by INTO v_campaign_owner
    FROM zapp.campaigns c
   WHERE c.id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign % not found', p_campaign_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 2. permissão (fail-closed): admin/supervisor OU dono da campanha
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    SELECT p.id INTO v_profile_id
      FROM zapp.profiles p
     WHERE p.user_id = auth.uid();
    IF v_campaign_owner IS DISTINCT FROM v_profile_id THEN
      RAISE EXCEPTION 'permission denied: campaign owner or admin/supervisor required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 3. variante precisa pertencer à campanha
  IF p_variant_id IS NOT NULL THEN
    SELECT variant_name INTO v_variant_name
      FROM zapp.campaign_ab_variants
     WHERE id = p_variant_id
       AND campaign_id = p_campaign_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'variant % not found in campaign %', p_variant_id, p_campaign_id
        USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- 4. persistência atômica e idempotente: a UNIQUE (campaign_id, contact_id)
  --    garante 1 linha por contato; o DO UPDATE ... WHERE variant IS NULL
  --    garante que uma variante já atribuída NUNCA é sobrescrita (mesmo sob
  --    concorrência). RETURNING devolve a linha final (a existente se o
  --    conflito não atualizou).
  INSERT INTO zapp.campaign_contacts (campaign_id, contact_id, status, variant)
  VALUES (p_campaign_id, p_contact_id, 'pending', p_variant_id)
  ON CONFLICT (campaign_id, contact_id)
  DO UPDATE SET variant = EXCLUDED.variant
   WHERE zapp.campaign_contacts.variant IS NULL
  RETURNING variant INTO v_assigned;

  IF v_assigned IS NULL THEN
    RETURN jsonb_build_object('variant_id', NULL, 'variant_name', NULL, 'assigned', false);
  END IF;

  RETURN jsonb_build_object(
    'variant_id', v_assigned,
    'variant_name', (SELECT variant_name FROM zapp.campaign_ab_variants WHERE id = v_assigned),
    'assigned', true
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Exposição via PostgREST (authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION zapp.rpc_campaign_assign_variant(uuid, uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — falha se colunas/RPC esperadas faltarem
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'campaigns' AND column_name = 'variant'
  ) THEN
    v_missing := v_missing || 'campaigns.variant; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'campaigns' AND column_name = 'variant_weight'
  ) THEN
    v_missing := v_missing || 'campaigns.variant_weight; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'campaign_ab_variants' AND column_name = 'variant_weight'
  ) THEN
    v_missing := v_missing || 'campaign_ab_variants.variant_weight; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'rpc_campaign_assign_variant'
  ) THEN
    v_missing := v_missing || 'rpc_campaign_assign_variant; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'zapp' AND routine_name = 'rpc_campaign_assign_variant'
      AND grantee = 'authenticated'
  ) THEN
    v_missing := v_missing || 'GRANT authenticated rpc_campaign_assign_variant; ';
  END IF;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'MISSING after 20260818230000: %', v_missing;
  END IF;
END $$;

COMMIT;
