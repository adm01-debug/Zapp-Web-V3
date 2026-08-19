-- FIX 2026-08-10: FDW postgres_fdw para consumer stats reais do Evolution Postgres
-- Problema: v_evolution_pipeline_health mostrava ok_count=0 porque consumer escreve em
-- postgres:5432/evolution (outra instancia) e a view lia da Supabase DB (vazia).
-- Solucao: foreign table via postgres_fdw aponta para postgres:5432 e a view usa ela.
-- consumer_lag_s: segundos desde ultimo ciclo de stats (esperado <60s em operacao normal).

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS evolution_postgres
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '10.0.1.118', port '5432', dbname 'evolution');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
  SERVER evolution_postgres
  OPTIONS (user 'postgres', password 'REDACTED');

CREATE FOREIGN TABLE IF NOT EXISTS evo.evolution_rabbit_consumer_stats_fdw (
  id         bigint,
  collected_at timestamptz,
  instance   text,
  replica    text,
  ok         bigint,
  shadow     bigint,
  retry      bigint,
  drop       bigint,
  err        bigint,
  pg_log_ok  bigint,
  pg_log_err bigint,
  sentry_sent bigint,
  resub      bigint,
  drop_by    jsonb,
  retry_by   jsonb
) SERVER evolution_postgres
  OPTIONS (schema_name 'evo', table_name 'evolution_rabbit_consumer_stats');

-- NOTA: password acima deve ser substituida pela senha real do postgres em evolution_postgres.
-- Ver secret postgres_superadmin_password_v1 na VPS.
