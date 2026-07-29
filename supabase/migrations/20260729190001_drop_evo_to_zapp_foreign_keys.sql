-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260729190001_drop_evo_to_zapp_foreign_keys.sql
-- Purpose  : Remove 3 FKs que violam a fronteira arquitetural evo → zapp
--
-- Contexto (AGENTS.md / ADR-DB-002):
--   A regra canônica é "evo NUNCA depende de zapp (a Evolution nunca importa o app)".
--   Porém 3 FKs em evo referenciam tabelas em zapp:
--     1. evo.evolution_contacts.queue_id            → zapp.queues.id  (ON DELETE SET NULL)
--     2. evo.evolution_health_logs.connection_id     → zapp.whatsapp_connections.id  (ON DELETE CASCADE)
--     3. evo.evolution_instance_credentials.connection_id → zapp.whatsapp_connections.id  (ON DELETE CASCADE)
--
-- Pré-verificação (audit 2026-07-29):
--   - evolution_contacts: 20.854 rows, todas com queue_id=NULL (coluna não usada)
--   - evolution_health_logs: 1 row, connection_id=NULL
--   - evolution_instance_credentials: 1 row, connection_id=NULL
--   - 0 órfãos em todas → DROP é seguro
--
-- Justificativa:
--   Essas FKs acoplam o schema de integração (evo) ao schema de app (zapp),
--   dificultando dumps/restores isolados e violando a direção de dependência.
--   A integridade referencial dessas relações (quando populadas) deve ser
--   garantida pela camada de aplicação (Edge Functions / RPCs), não por FK
--   cross-schema.
--
-- Idempotente: DROP CONSTRAINT IF EXISTS.
-- Rollback: recriar as FKs via ALTER TABLE ... ADD CONSTRAINT (ver histórico git).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. evolution_contacts.queue_id → zapp.queues.id ─────────────────────────
ALTER TABLE evo.evolution_contacts
  DROP CONSTRAINT IF EXISTS evolution_contacts_queue_id_fkey;

-- ── 2. evolution_health_logs.connection_id → zapp.whatsapp_connections.id ──
ALTER TABLE evo.evolution_health_logs
  DROP CONSTRAINT IF EXISTS evolution_health_logs_connection_id_fkey;

-- ── 3. evolution_instance_credentials.connection_id → zapp.whatsapp_connections.id ──
ALTER TABLE evo.evolution_instance_credentials
  DROP CONSTRAINT IF EXISTS evolution_instance_credentials_connection_id_fkey;

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE c.contype = 'f'
    AND n.nspname = 'evo'
    AND EXISTS (
      SELECT 1 FROM pg_class pc
      JOIN pg_namespace pn ON pn.oid = pc.relnamespace
      WHERE pc.oid = c.confrelid AND pn.nspname = 'zapp'
    );

  IF v_count > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: ainda existem % FK(s) evo → zapp', v_count;
  END IF;

  RAISE NOTICE 'OK: 0 FKs evo → zapp restantes (fronteira arquitetural restaurada)';
END $$;
