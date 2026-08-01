-- 20260801060002 — Fix: _authoritative_time stale (validacao exaustiva 2026-08-01)
-- Achado: zapp.get_server_time() retornava 2026-07-12 (20 dias atrasado) — a tabela
-- _authoritative_time nao era atualizada. Qualquer logica que use get_server_time()
-- como relogio confiavel estaria 20 dias no passado.
-- Fix aplicado em producao: UPDATE manual + esta migration versionada (idempotente).
-- Rollback: nao aplicavel (correcao de dado de tempo; a proxima chamada a
-- get_server_time() atualiza automaticamente).

BEGIN;

-- UPSERT (nao UPDATE): se a linha id=1 nao existir em algum ambiente,
-- a correcao continua efetiva (INSERT), mantendo a idempotencia real.
INSERT INTO zapp._authoritative_time (id, server_time)
VALUES (1, NOW())
ON CONFLICT (id) DO UPDATE SET server_time = NOW();

COMMIT;
