-- 20260820194000 — f008_comments_evo_staging_e_meta (fechamento F-008 + higiene de registro)
-- =============================================================================
-- 1) Comments nas 3 tabelas de staging criadas em evo durante a execucao do plano
--    (unicas sem comment no evo — volta a 100% de cobertura de tabelas).
COMMENT ON TABLE evo._unknown_media_backfill_20260820 IS 'Staging da auditoria/backfill de midia 2026-08-20 (15.958 refs de midia sem download mapeadas durante o plano de correcao). RLS deny-all; acesso apenas service_role. Candidata a DROP apos conclusao do backfill de midia (registrar em GATE futuro).';
COMMENT ON TABLE evo._dead_idx_usage_audit_20260820 IS 'Snapshot de pg_stat_user_indexes capturado na auditoria 2026-08-20 (base para F-007 drop de indices duplicados). RLS deny-all; somente leitura historica. Candidata a DROP apos 2026-09-20.';
COMMENT ON TABLE evo._dead_migration_watermark_20260820 IS 'Backup do estado de evo.migration_watermark capturado na auditoria 2026-08-20 antes do saneamento de migrations (F-003/F-004). RLS deny-all. Candidata a DROP apos 2026-09-20.';

-- 2) Normalizacao de registro: a versao da onda recon veio com o nome embutido.
UPDATE supabase_migrations.schema_migrations
   SET version = '20260820093000'
 WHERE version = '20260820093000_recon_coverage_daily'
   AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260820093000');

-- 3) Comments de funcoes rpc_* (etapa 57 do plano): boundary 100% + cabecalhos do fonte.
--    * evo.rpc_boundary_* / zapp.rpc_boundary_*: comment padrao do contrato de
--      desacoplamento (SECDEF, caminho unico cross-schema) com assinatura.
--    * demais rpc_*: primeira linha de comentario "--" do proprio fonte, quando existe.
--    Resultado: evo 29/29 (100%); zapp 59/218 (as 159 restantes nao tem cabecalho
--    no fonte — sem comment inventado; skip honesto).
DO $do$
DECLARE r RECORD; v_cmt text; v_qtd int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname AS sch, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosrc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('zapp','evo') AND p.proname LIKE 'rpc\_%'
      AND obj_description(p.oid, 'pg_proc') IS NULL
  LOOP
    IF r.proname LIKE 'rpc_boundary_%' THEN
      v_cmt := format('Boundary do contrato evo<->zapp (desacoplamento, lado %s): %s. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (%s).',
                      r.sch, replace(replace(r.proname, 'rpc_boundary_', ''), '_', ' '), r.args);
    ELSE
      v_cmt := nullif(btrim(substring(r.prosrc from '--[ ]*([^\n]{10,200})')), '');
      IF v_cmt IS NOT NULL THEN
        v_cmt := format('%s (extraido do cabecalho do fonte). Args: (%s).', v_cmt, r.args);
      END IF;
    END IF;
    IF v_cmt IS NOT NULL THEN
      EXECUTE format('COMMENT ON FUNCTION %I.%I(%s) IS %L', r.sch, r.proname, r.args, v_cmt);
      v_qtd := v_qtd + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'fn comments: %', v_qtd;
END $do$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260820194000', 'f008_comments_evo_staging_e_meta')
ON CONFLICT DO NOTHING;
