-- M-3 (2026-07-12): Corrigir fn_purge_processed_webhook_events
--
-- Bug: a função iterava pg_tables WHERE schemaname='public' buscando
-- tabelas 'evolution_webhook_events%', mas TODAS essas tabelas existem no
-- schema 'evo' (não 'public'). O job 54 era portanto um no-op completo
-- — nunca deletava nenhum registro, acumulando dados indefinidamente.
--
-- Correção:
-- - schemaname 'public' → 'evo'
-- - Referências de tabela: public.%I → evo.%I
-- - Retenção default: 30d → 7d (alinhada com política de dedup de 3d)
-- - Guard adicionado: verifica se a partição tem coluna 'processed' antes de deletar

CREATE OR REPLACE FUNCTION public.fn_purge_processed_webhook_events(
  p_retention_days integer DEFAULT 7,
  p_batch_size     integer DEFAULT 5000
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $function$
DECLARE
  v_table  text;
  v_sql    text;
  v_count  bigint;
  v_total  bigint := 0;
  v_result jsonb  := '{}'::jsonb;
BEGIN
  -- [M-3 fix 2026-07-12] schema corrigido: 'public' → 'evo' (tabelas estão em evo)
  FOR v_table IN
    SELECT t.tablename
    FROM   pg_tables t
    JOIN   pg_class  c ON c.relname = t.tablename
                      AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'evo')
    WHERE  t.schemaname = 'evo'
      AND  t.tablename  LIKE 'evolution_webhook_events%'
      AND  c.relkind    = 'r'   -- regular tables (partitions) only, NOT 'p' (partitioned parent)
    ORDER  BY t.tablename
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'evo' AND table_name = v_table AND column_name = 'processed'
    ) THEN
      v_sql := format(
        $q$
          WITH deleted AS (
            DELETE FROM evo.%I
            WHERE processed = true
              AND created_at < NOW() - INTERVAL '1 day' * $1
              AND ctid IN (
                SELECT ctid FROM evo.%I
                WHERE processed = true
                  AND created_at < NOW() - INTERVAL '1 day' * $1
                LIMIT $2
              )
            RETURNING 1
          )
          SELECT count(*) FROM deleted
        $q$,
        v_table, v_table
      );
      EXECUTE v_sql USING p_retention_days, p_batch_size INTO v_count;
      v_total := v_total + v_count;
      IF v_count > 0 THEN
        v_result := v_result || jsonb_build_object(v_table, v_count);
      END IF;
    END IF;
  END LOOP;

  v_result := v_result || jsonb_build_object('_total_deleted', v_total);
  RETURN v_result;
END;
$function$;
