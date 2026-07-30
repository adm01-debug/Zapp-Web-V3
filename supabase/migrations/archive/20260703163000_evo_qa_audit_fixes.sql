-- =============================================================================
-- Migration: evo QA Audit Fixes — 2026-07-03
-- Scope: schema evo.*  (aplicada via supabase_db_query em produção 2026-07-03)
-- Autor: Senior QA / Claude — análise exaustiva de 175 tabelas, 398 triggers
-- PR: fix/evo-qa-audit-p0-p2-2026-07-03
-- Itens corrigidos:
--   P1-01: DROP trigger duplicado fn_auto_task_on_deal_trigger
--   P1-02: DROP trigger updated_at redundante trg_deals_updated
--   P1-03: DROP trigger stub vazio trg_deal_audit
--   P1-04: Equalizar RLS evolution_webhook_events_wpp2
--   EXEC5: Adicionar trg_update_connection_status em wpp_pink_test
--          + corrigir fn_auto_update_connection_status (chave instância-específica)
--          + migrar chave connection_status → connection_status_wpp2
--   EXEC7: fn_link_orphan_messages INVOKER → DEFINER + SET search_path
--   EXEC8: Recriar idx_alert_open com resolved=false + novo idx_alerts_unresolved
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- P1-01: Remove trigger duplicado em evolution_deals
-- Bug: fn_auto_task_on_deal_trigger e trg_auto_task_deal chamavam a MESMA
--      função fn_auto_task_on_deal() em AFTER UPDATE, criando tasks duplas.
--      Confirmado: 4 tasks duplicadas em produção pré-fix.
-- Manter: trg_auto_task_deal (nome semântico padronizado)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS fn_auto_task_on_deal_trigger ON evo.evolution_deals;


-- ---------------------------------------------------------------------------
-- P1-02: Remove trigger updated_at redundante em evolution_deals
-- Bug: trg_deals_updated (fn_deals_updated_at) e trg_evolution_deals_updated_at
--      (fn_set_updated_at) ambos fazem NEW.updated_at = NOW() em BEFORE UPDATE.
--      O segundo sobrescreve o primeiro — execução dupla sem efeito adicional.
-- Manter: trg_evolution_deals_updated_at (padrão fn_set_updated_at do schema)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_deals_updated ON evo.evolution_deals;


-- ---------------------------------------------------------------------------
-- P1-03: Remove trigger de auditoria stub vazio em evolution_deals
-- Bug: trg_deal_audit chamava trg_audit_deal_changes() que contém apenas
--      BEGIN RETURN NEW; END — sem nenhuma lógica de auditoria.
--      A auditoria real é feita por audit_evolution_deals → fn_audit_trigger.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_deal_audit ON evo.evolution_deals;


-- ---------------------------------------------------------------------------
-- Checkpoint: evolution_deals deve ter exatamente 5 triggers após os drops
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgrelid = 'evo.evolution_deals'::regclass;
  IF v_count != 5 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: esperava 5 triggers em evolution_deals, encontrou %', v_count;
  END IF;
  RAISE NOTICE 'OK: evolution_deals tem % triggers (8 → 5 após remoção dos redundantes)', v_count;
END $$;


-- ---------------------------------------------------------------------------
-- P1-04: Equalizar RLS evolution_webhook_events_wpp2
-- Bug: Tabela tinha apenas 1 policy (SELECT-only para authenticated).
--      evolution_webhook_events_wpp_pink_test tem auth_full_access + service_full_access.
--      Assimetria causava gap de acesso para service_role e INSERT/UPDATE/DELETE
--      via authenticated em wpp2.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS authenticated_read_webhook_events ON evo.evolution_webhook_events_wpp2;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='evo'
      AND tablename='evolution_webhook_events_wpp2'
      AND policyname='auth_full_access'
  ) THEN
    EXECUTE 'CREATE POLICY auth_full_access ON evo.evolution_webhook_events_wpp2
      AS PERMISSIVE FOR ALL TO authenticated
      USING (true) WITH CHECK (true)';
    RAISE NOTICE 'OK: criada policy auth_full_access em evolution_webhook_events_wpp2';
  ELSE
    RAISE NOTICE 'SKIP: auth_full_access já existe';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='evo'
      AND tablename='evolution_webhook_events_wpp2'
      AND policyname='service_full_access'
  ) THEN
    EXECUTE 'CREATE POLICY service_full_access ON evo.evolution_webhook_events_wpp2
      AS PERMISSIVE FOR ALL TO service_role
      USING (true) WITH CHECK (true)';
    RAISE NOTICE 'OK: criada policy service_full_access em evolution_webhook_events_wpp2';
  ELSE
    RAISE NOTICE 'SKIP: service_full_access já existe';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- EXEC5a: Migrar chave connection_status → connection_status_wpp2
-- Razão: fn_auto_update_connection_status usava chave fixa 'connection_status'.
--        Com dois instances (wpp2 + wpp_pink_test), o último evento sobrescreveria
--        o status do outro. Chaves tornam-se instância-específicas.
-- ---------------------------------------------------------------------------
UPDATE evo.evolution_settings
SET key = 'connection_status_wpp2'
WHERE key = 'connection_status'
  AND NOT EXISTS (
    SELECT 1 FROM evo.evolution_settings WHERE key = 'connection_status_wpp2'
  );


-- ---------------------------------------------------------------------------
-- EXEC5b: Atualizar fn_auto_update_connection_status para chaves instância-específicas
-- Bug: Usava chave hardcoded 'connection_status' para qualquer instância.
--      Com wpp_pink_test agora tendo o trigger, ambas escreveriam na mesma chave.
-- Fix: Usa 'connection_status_' || instance_name como chave
-- Também: adicionado SECURITY DEFINER + SET search_path (consistência com evo.*)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_update_connection_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $$
DECLARE
  v_instance TEXT;
  v_key      TEXT;
BEGIN
  IF NEW.event_type = 'connection.update' THEN
    v_instance := COALESCE(NEW.instance_name, 'wpp2');
    v_key      := 'connection_status_' || v_instance;

    INSERT INTO evo.evolution_settings
      (id, key, value, description, category, is_secret, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      v_key,
      jsonb_build_object(
        'event',      NEW.event_type,
        'state',      NEW.payload->>'state',
        'instance',   v_instance,
        'updated_at', now()::text
      ),
      'Status de conexão da instância ' || v_instance || ' — atualizado automaticamente',
      'general',
      false,
      now(),
      now()
    )
    ON CONFLICT (key) DO UPDATE
      SET value      = EXCLUDED.value,
          updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- EXEC5c: Adicionar trg_update_connection_status em evolution_webhook_events_wpp_pink_test
-- Bug: Trigger existia apenas em wpp2, causando assimetria — wpp_pink_test não
--      atualizava evolution_settings ao conectar/desconectar.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'evo.evolution_webhook_events_wpp_pink_test'::regclass
      AND tgname = 'trg_update_connection_status'
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_update_connection_status
        AFTER INSERT ON evo.evolution_webhook_events_wpp_pink_test
        FOR EACH ROW
        WHEN (NEW.event_type = ''connection.update'')
        EXECUTE FUNCTION public.fn_auto_update_connection_status()
    ';
    RAISE NOTICE 'OK: trg_update_connection_status criado em evolution_webhook_events_wpp_pink_test';
  ELSE
    RAISE NOTICE 'SKIP: trigger já existe em wpp_pink_test';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- EXEC7: fn_link_orphan_messages SECURITY INVOKER → SECURITY DEFINER
-- Bug: Única função no schema evo com SECURITY INVOKER. Ao ser chamada por um
--      role sem acesso direto às tabelas evo.*, falharia silenciosamente com
--      permission denied.
-- Fix: SECURITY DEFINER + SET search_path (padrão estabelecido no hardening #102)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evo.fn_link_orphan_messages(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public
AS $$
DECLARE v_convs int; v_linked int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM evo.evolution_messages WHERE conversation_id IS NULL LIMIT 1
  ) THEN
    RETURN jsonb_build_object(
      'conversas_criadas', 0,
      'mensagens_ligadas', 0,
      'early_exit', true
    );
  END IF;

  INSERT INTO evo.evolution_conversations
    (remote_jid, instance_name, first_message_at, last_message_at,
     message_count, created_at, updated_at)
  SELECT
    remote_jid, instance_name,
    min(created_at), max(created_at), count(*),
    min(created_at), now()
  FROM evo.evolution_messages
  WHERE conversation_id IS NULL
    AND remote_jid IS NOT NULL
    AND instance_name IS NOT NULL
  GROUP BY remote_jid, instance_name
  ON CONFLICT (remote_jid, instance_name) DO NOTHING;
  GET DIAGNOSTICS v_convs = ROW_COUNT;

  UPDATE evo.evolution_messages m
  SET conversation_id = c.id
  FROM evo.evolution_conversations c
  WHERE c.remote_jid = m.remote_jid
    AND c.instance_name = m.instance_name
    AND m.conversation_id IS NULL
    AND m.id IN (
      SELECT id FROM evo.evolution_messages
      WHERE conversation_id IS NULL
      LIMIT p_limit
    );
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  RETURN jsonb_build_object(
    'conversas_criadas', v_convs,
    'mensagens_ligadas', v_linked,
    'early_exit', false
  );
END $$;


-- ---------------------------------------------------------------------------
-- EXEC8: Recriar idx_alert_open com filtro resolved=false
-- Bug: idx_alert_open filtrava apenas WHERE acknowledged=false, retornando
--      2.064 alertas com resolved=true como "abertos" (false positivos).
--      Dashboard mostrava 2.067 alertas ao invés de 3 genuinamente abertos.
-- Fix: Adicionar AND resolved=false ao predicado do índice parcial.
--      Novo índice idx_alerts_unresolved para queries por resolved.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS evo.idx_alert_open;

CREATE INDEX idx_alert_open
  ON evo.evolution_alerts USING btree (acknowledged, severity, created_at DESC)
  WHERE acknowledged = false AND resolved = false;

CREATE INDEX IF NOT EXISTS idx_alerts_unresolved
  ON evo.evolution_alerts USING btree (resolved, created_at DESC)
  WHERE resolved = false;


-- ---------------------------------------------------------------------------
-- Verificação final: assert dos índices criados
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='evo'
      AND tablename='evolution_alerts'
      AND indexname='idx_alert_open'
      AND indexdef LIKE '%resolved = false%'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: idx_alert_open não tem predicado resolved=false';
  END IF;
  RAISE NOTICE 'OK: idx_alert_open corretamente criado com acknowledged=false AND resolved=false';

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='evo'
      AND tablename='evolution_alerts'
      AND indexname='idx_alerts_unresolved'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: idx_alerts_unresolved não foi criado';
  END IF;
  RAISE NOTICE 'OK: idx_alerts_unresolved criado';
END $$;


-- ---------------------------------------------------------------------------
-- Registro da migração
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='evo' AND table_name='migration_watermark'
  ) THEN
    INSERT INTO evo.migration_watermark (id, applied_at)
    VALUES ('20260703163000_evo_qa_audit_fixes', now())
    ON CONFLICT (id) DO UPDATE SET applied_at = now();
    RAISE NOTICE 'OK: watermark registrado';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- NOTA: Changes aplicadas em produção ANTES desta migration (2026-07-03 ~16:30)
-- Esta migration é idempotente — pode ser re-executada sem efeitos colaterais.
-- Portainer: evolution_evolution restartado (ForceUpdate 470→471) para matar
--            listener RabbitMQ pendurado (msgId 8223.36386-X flood).
-- WhatsApp P0-01 PENDENTE: Requer scan manual de QR Code para wpp2 e
--            wpp_pink_test (401 DEVICE_REMOVED — automação impossível).
-- =============================================================================
