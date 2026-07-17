-- Migracao: politica de cleanup para login_attempts
-- Data: 2026-07-16
--
-- Contexto: a tabela zapp.login_attempts nao tem mecanismo de limpeza.
-- Rows com locked_until expirado e last_attempt_at antigo acumulam
-- indefinidamente. Estimativa: ~200 ataques/mes = ~3MB/ano — controlavel,
-- mas requer manutencao periodica para manter performance estavel.
--
-- OPCAO A: Executar manualmente (ou via pg_cron se disponivel):
--
--   DELETE FROM zapp.login_attempts
--   WHERE last_attempt_at < now() - interval '30 days'
--     AND (locked_until IS NULL OR locked_until < now());
--
-- OPCAO B: pg_cron (requer extensao pg_cron instalada):
--
--   SELECT cron.schedule(
--     'cleanup-login-attempts',
--     '0 3 * * 0',  -- domingo as 3h
--     $$
--       DELETE FROM zapp.login_attempts
--       WHERE last_attempt_at < now() - interval '30 days'
--         AND (locked_until IS NULL OR locked_until < now());
--     $$
--   );
--
-- Logica de retencao:
--   - 30 dias = janela de atividade esperada de um atacante
--   - rows COM locked_until futuro sao preservados (lock ativo)
--   - rows COM locked_until nulo (sem lockout) e antigos sao removidos
--   - rows COM locked_until expirado e antigos sao removidos
--
-- Execucao manual inicial (cleanup de dados de teste residuais):
DELETE FROM zapp.login_attempts
WHERE last_attempt_at < now() - interval '30 days'
  AND (locked_until IS NULL OR locked_until < now());

-- Verificacao pos-cleanup:
SELECT count(*) AS rows_remaining FROM zapp.login_attempts;
