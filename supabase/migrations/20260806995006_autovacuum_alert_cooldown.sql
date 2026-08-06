-- ============================================================================
-- CREATE TABLE ops.alert_cooldown
-- ============================================================================
-- Tipo: DDL
--
-- CONTEXTO:
--   Tabela de cooldown de alertas por host e tier. Evita spam de alertas:
--   antes de despachar um alerta, o sistema verifica se last_dispatched
--   para esse (host, tier) foi há menos de N minutos. Se sim, suprime.
--
--   PK composta (host, tier) — cada combinação host+tier tem exatamente
--   um registro; o upsert atualiza last_dispatched em vez de inserir.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ops.alert_cooldown (
  host              text         NOT NULL,
  tier              text         NOT NULL,
  last_dispatched   timestamptz  NOT NULL,

  CONSTRAINT alert_cooldown_pkey PRIMARY KEY (host, tier)
);

REVOKE ALL ON TABLE ops.alert_cooldown FROM PUBLIC, anon;
GRANT SELECT ON TABLE ops.alert_cooldown TO authenticated;
GRANT ALL ON TABLE ops.alert_cooldown TO service_role, postgres;
