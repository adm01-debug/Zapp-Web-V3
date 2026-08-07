-- ============================================================================
-- Cron: retenção 7 dias para logs Cloudflare/Deno, 30 dias para demais (item 90)
-- ============================================================================
-- Tipo: pg_cron
--
-- CONTEXTO (item 90 do checklist de auditoria):
--   As tabelas de log do Logflare/Supabase Analytics acumulam dados
--   rapidamente. A política de retenção definida:
--     - Cloudflare (edge): 7 dias
--     - Deno (edge functions): 7 dias
--     - Outros logs: 30 dias
--
--   O cron job consolidado executa às 3:09 diariamente usando um bloco DO
--   para garantir tratamento de erro por tabela (um falho não cancela o restante).
-- ============================================================================

SELECT cron.schedule(
  'logflare-cloudflare-cleanup',
  '9 3 * * *',
  $$
  DO $$cleanup$$
  BEGIN
    -- Retenção 7 dias: logs de edge/cloudflare/deno
    BEGIN
      DELETE FROM _analytics.cloudflare_logs
      WHERE timestamp < now() - interval '7 days';
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM _analytics.edge_logs
      WHERE timestamp < now() - interval '7 days';
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM _analytics.function_logs
      WHERE timestamp < now() - interval '7 days';
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- Retenção 30 dias: logs gerais
    BEGIN
      DELETE FROM _analytics.postgres_logs
      WHERE timestamp < now() - interval '30 days';
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM _analytics.realtime_logs
      WHERE timestamp < now() - interval '30 days';
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM _analytics.storage_logs
      WHERE timestamp < now() - interval '30 days';
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM _analytics.auth_logs
      WHERE timestamp < now() - interval '30 days';
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

  END;
  $$cleanup$$
  $$
) ON CONFLICT (jobname) DO NOTHING;
