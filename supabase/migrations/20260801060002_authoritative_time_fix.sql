-- 20260801060002 — Fix: _authoritative_time stale (validacao exaustiva 2026-08-01)
-- Achado: zapp.get_server_time() retornava 2026-07-12 (20 dias atrasado) — a tabela
-- _authoritative_time nao era atualizada. Qualquer logica que use get_server_time()
-- como relogio confiavel estaria 20 dias no passado.
-- Fix aplicado em producao: UPDATE manual + esta migration versionada (idempotente).
-- Rollback: nao aplicavel (correcao de dado de tempo; a proxima chamada a
-- get_server_time() atualiza automaticamente).

BEGIN;

UPDATE zapp._authoritative_time
SET server_time = NOW()
WHERE id = 1;

COMMIT;
