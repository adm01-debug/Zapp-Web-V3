-- Bugfix (06/08/2026): quatro bugs encontrados na auditoria de retention/observabilidade
-- ===========================================================================
-- BUG-3 (P2 — Médio): Job cron 'purge-webhook-audit-log-90d' com retenção 30d
--   A migration 20260806171500_rb2_c10_retention_jobs.sql registrou que o
--   comando do job foi "ajustado para 30 dias", mas o NOME do job permaneceu
--   'purge-webhook-audit-log-90d'. Isso cria confusão operacional:
--   - Um DBA que lê o nome esperaria 90 dias de retenção
--   - O job realmente deleta dados com 30 dias
--   Fix: unschedule o job com nome errado e re-cria com nome correto.
--   O pg_cron faz upsert por jobname, então a deleção explícita é necessária.
--
-- BUG-4 (P2 — Médio): ops.fn_expire_stale_backups — v_skipped nunca incrementado
--   A função declara e usa v_skipped := 0, mas a lógica de metadata_cleanup
--   (quando to_regclass retorna NULL) faz DELETE + log mas NÃO faz
--   v_skipped := v_skipped + 1. O retorno sempre tem 'metadata_cleanup': 0
--   independente de quantos registros órfãos foram limpos.
--   Fix: incrementar v_skipped na branch de metadata_cleanup.
--
-- BUG-5 (P1 — CI Blocker): 20260806171500 linha 25 cria índice em ops.ddl_audit
--   sem guard de existência da tabela. ops.ddl_audit foi criada manualmente em
--   produção e NÃO consta em nenhuma migration do repositório. Em CI / ambiente
--   limpo, o CREATE INDEX aborta toda a migration (inclusive os cron.schedule()
--   anteriores). Fix: DO block com to_regclass() para criar o índice somente
--   se a tabela existir.
--
-- BUG-6 (P3 — Melhoria): _backups.backup_metadata sem índice em retention_until
--   A coluna retention_until é o predicado principal do loop de expiração em
--   fn_expire_stale_backups. Sem índice, cada invocação faz seq-scan em toda a
--   tabela. Fix: CREATE INDEX IF NOT EXISTS com guard de existência da tabela.
--
-- Idempotência de todos os fixes:
--   BUG-3: DO block com guard EXISTS antes de unschedule; cron.schedule faz upsert.
--   BUG-4: CREATE OR REPLACE FUNCTION — re-aplicação com corpo idêntico = no-op.
--   BUG-5: DO block + to_regclass + IF NOT EXISTS — seguro em qualquer ambiente.
--   BUG-6: CREATE INDEX IF NOT EXISTS com guard to_regclass — seguro.
-- ===========================================================================

-- BUG-3: Renomear job cron de purge-webhook-audit-log-90d → purge-webhook-audit-log-30d
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-webhook-audit-log-90d') THEN
    PERFORM cron.unschedule('purge-webhook-audit-log-90d');
  END IF;
END
$$;

-- Re-cria com nome correto (mesmo schedule e command do job original)
SELECT cron.schedule(
  'purge-webhook-audit-log-30d',
  '46 3 * * *',
  $$DELETE FROM zapp.webhook_audit_log WHERE created_at < now() - interval '30 days';$$
);

-- BUG-4: Corrige fn_expire_stale_backups — v_skipped sempre era 0
CREATE OR REPLACE FUNCTION ops.fn_expire_stale_backups(p_max_age_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dropped int := 0;
  v_skipped int := 0;
  v_rec record;
  v_tbl text;
  v_cutoff timestamptz := now() - make_interval(days := p_max_age_days);
  v_log jsonb := '[]';
BEGIN
  FOR v_rec IN
    SELECT table_name, backup_date, retention_until
    FROM _backups.backup_metadata
    WHERE (retention_until IS NOT NULL AND retention_until < now())
       OR (retention_until IS NULL AND backup_date < v_cutoff::date)
    ORDER BY backup_date
  LOOP
    v_tbl := '_backups.' || quote_ident(v_rec.table_name);
    IF to_regclass(v_tbl) IS NULL THEN
      -- tabela ja nao existe: limpa metadata orfao
      DELETE FROM _backups.backup_metadata WHERE table_name = v_rec.table_name;
      v_skipped := v_skipped + 1;  -- BUG-4 fix: era omitido, v_skipped ficava 0
      v_log := v_log || jsonb_build_object('table', v_rec.table_name, 'action', 'metadata_cleanup');
    ELSE
      EXECUTE format('DROP TABLE %s', v_tbl);
      DELETE FROM _backups.backup_metadata WHERE table_name = v_rec.table_name;
      v_dropped := v_dropped + 1;
      v_log := v_log || jsonb_build_object('table', v_rec.table_name, 'action', 'dropped', 'backup_date', v_rec.backup_date);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('dropped', v_dropped, 'metadata_cleanup', v_skipped, 'checked_at', now(), 'log', v_log);
END $function$;

-- BUG-5: Cria índice em ops.ddl_audit somente se a tabela existir
-- (ops.ddl_audit foi criada manualmente em produção, não consta em migrations)
DO $$
BEGIN
  IF to_regclass('ops.ddl_audit') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ddl_audit_at ON ops.ddl_audit USING btree (at)';
  END IF;
END
$$;

-- BUG-6: Índice em _backups.backup_metadata(retention_until) para o loop de expiração
DO $$
BEGIN
  IF to_regclass('_backups.backup_metadata') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_backup_metadata_retention ON _backups.backup_metadata (retention_until) WHERE retention_until IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_backup_metadata_backup_date ON _backups.backup_metadata (backup_date) WHERE retention_until IS NULL';
  END IF;
END
$$;
