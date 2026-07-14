-- Migration: 20260711_autovacuum_round5
-- Autor: Claude (quinta rodada validação exaustiva 2026-07-11)
-- Contexto: W4 detectou evolution_realtime_events com 10.93% dead e last_autovacuum=null;
--           evolution_alerts com 10.61% dead e autovacuum 13h atrás.
--           Ambas são pequenas (391/278 rows) — threshold padrão 50 nunca é atingido.
--           Crons purge_realtime_events e burnin_monitor produzem dead tuples continuamente.

ALTER TABLE evo.evolution_realtime_events
  SET (
    autovacuum_vacuum_scale_factor  = 0,
    autovacuum_vacuum_threshold     = 5,
    autovacuum_analyze_scale_factor = 0,
    autovacuum_analyze_threshold    = 5
  );

ALTER TABLE evo.evolution_alerts
  SET (
    autovacuum_vacuum_scale_factor  = 0,
    autovacuum_vacuum_threshold     = 10,
    autovacuum_analyze_scale_factor = 0,
    autovacuum_analyze_threshold    = 10
  );

-- VACUUM manual executado em produção em 2026-07-11T17:03 UTC:
-- evolution_realtime_events: dead_pct 10.93% → 0.00%
-- evolution_alerts:          dead_pct 10.61% → 0.00%

-- Tabelas com autovacuum agressivo após todas as rodadas:
-- evo.evolution_instance_credentials : scale=0, threshold=2
-- evo.evolution_burnin_tracker        : scale=0, threshold=2
-- evo.evolution_realtime_events       : scale=0, threshold=5  ← NOVO
-- evo.evolution_alerts                : scale=0, threshold=10 ← NOVO
-- (evolution_realtime_events e evolution_alerts já tinham cost_delay=2 de sessão anterior)
