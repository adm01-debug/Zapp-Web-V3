-- Etapa 55 — painel admin de reset de senha com realtime.
--
-- PasswordResetRequestsPanel assina postgres_changes em
-- `zapp.password_reset_requests` (schema 'zapp') para auto-refresh quando
-- chega uma solicitação nova. Verificação em produção (2026-08-18,
-- pg_publication_tables): a tabela NÃO está na publication supabase_realtime
-- (apenas `profiles` casa) — o painel nunca recebia INSERT/UPDATE.
--
-- Esta migration é aditiva e idempotente (no-op quando a tabela já está na
-- publication). A tabela tem RLS ativa (prr_select_own_or_admin) — o realtime
-- respeita RLS por assinante: cada admin só vê o que pode ler.
--
-- Rollback:
--   ALTER PUBLICATION supabase_realtime DROP TABLE zapp.password_reset_requests;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'password_reset_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.password_reset_requests;
  END IF;
END
$$;
