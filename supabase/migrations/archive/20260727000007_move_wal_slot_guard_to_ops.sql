-- ============================================================
-- Migration: 20260727000007_move_wal_slot_guard_to_ops
-- Objetivo: Mover _wal_slot_guard_events de public para ops
-- Status: DOCUMENTAÇÃO — requer superuser em produção
-- ============================================================

-- PASSO 1: Criar tabela em ops (executar primeiro)
-- CREATE TABLE ops.wal_slot_guard_events (
--     id          BIGSERIAL PRIMARY KEY,
--     slot_name   TEXT NOT NULL,
--     caught_up   BOOLEAN DEFAULT false,
--     last_lsn    PG_LSN,
--     created_at  TIMESTAMPTZ DEFAULT now()
-- );
-- COMMENT ON TABLE ops.wal_slot_guard_events IS 'Registro de sincronização de WAL slots — movido de public em 2026-07-27';

-- PASSO 2: Migrar dados
-- INSERT INTO ops.wal_slot_guard_events (slot_name, caught_up, last_lsn, created_at)
-- SELECT slot_name, caught_up, last_lsn, created_at FROM public._wal_slot_guard_events;

-- PASSO 3: Criar view de compatibilidade em public (NÃO criar tabela)
-- CREATE OR REPLACE VIEW public._wal_slot_guard_events AS
-- SELECT * FROM ops.wal_slot_guard_events;

-- PASSO 4: Limpar old table (APÓS validar compatibilidade)
-- DROP TABLE public._wal_slot_guard_events;

-- PASSO 5: Criar grants
-- GRANT SELECT ON ops.wal_slot_guard_events TO authenticated;
-- GRANT ALL ON ops.wal_slot_guard_events TO service_role;

-- Validação (executar após cada passo)
-- SELECT count(*) FROM public._wal_slot_guard_events;  -- deve funcionar
-- SELECT count(*) FROM ops.wal_slot_guard_events;       -- deve mostrar mesmos dados
