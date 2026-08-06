-- ============================================================================
-- FIX P1 — Referência incorreta a zapp.cotacoes/public.cotacoes
-- ============================================================================
-- Tipo: FIX DE BUG (tabela referenciada inexistente)
--
-- PROBLEMA:
--   3 objetos referenciam schemas incorretos para a tabela 'cotacoes':
--
--   1. zapp.apagar_nota_fiscal   → DELETE FROM zapp.cotacoes   (não existe)
--   2. financeiro.apagar_nota_fiscal → DELETE FROM public.cotacoes (não existe)
--   3. zapp.fn_vacuum_critical_tables → array inclui 'zapp.cotacoes' (não existe)
--
--   A tabela real é logistica.cotacoes (confirmado — tem colunas id uuid e
--   pedido_pai_origem text, exatamente as usadas nas queries).
--
--   Impacto:
--   - apagar_nota_fiscal com tipo_nota='SIMPLES_REMESSA' falha no DELETE de
--     cotações → cotacoes ficam órfãs após exclusão da NF
--     (para zapp: ERROR 42P01 relation "zapp.cotacoes" does not exist)
--     (para financeiro: ERROR 42P01 relation "public.cotacoes" does not exist)
--   - fn_vacuum_critical_tables: EXCEPTION handler captura o erro silenciosamente
--     mas a tabela real (logistica.cotacoes) nunca é vaciada pelo cron
--
-- CORREÇÃO:
--   - Recriar zapp.apagar_nota_fiscal e financeiro.apagar_nota_fiscal com
--     referência corrigida para logistica.cotacoes + logistica no search_path
--   - Recriar zapp.fn_vacuum_critical_tables com array corrigido
--
-- Detectado em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

-- ─── 1: Corrigir zapp.apagar_nota_fiscal ─────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.apagar_nota_fiscal(p_nf_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'monitoring', 'logistica'
AS $$
DECLARE
  v_nf          RECORD;
  v_item        jsonb;
  v_cod_produto text;
  v_cor         text;
  v_qtd         numeric;
  v_rows        int;
  v_total_oc    int := 0;
  v_total_cot   int := 0;
BEGIN
  SELECT * INTO v_nf FROM financeiro.notas_fiscais WHERE id = p_nf_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NF não encontrada');
  END IF;

  IF v_nf.tipo_nota = 'SIMPLES_REMESSA' THEN
    IF v_nf.itens_faturados IS NOT NULL THEN
      FOR v_item IN
        SELECT value FROM jsonb_array_elements(v_nf.itens_faturados) AS t(value)
      LOOP
        v_cod_produto := v_item->>'cod_produto';
        v_cor         := v_item->>'cor';
        v_qtd         := (v_item->>'qtd_faturada')::numeric;
        CONTINUE WHEN v_qtd IS NULL OR v_qtd <= 0;
        CONTINUE WHEN v_cod_produto IS NULL;
        IF v_cor IS NOT NULL AND v_cor <> '' THEN
          UPDATE vendas.ordens_compra
          SET qtd_enviada = GREATEST(0, COALESCE(qtd_enviada, 0) - v_qtd)
          WHERE (pedido = v_nf.pedido_pai OR pedido LIKE v_nf.pedido_pai || '-%')
            AND cod_produto = v_cod_produto AND cor = v_cor AND excluido_em IS NULL;
        ELSE
          UPDATE vendas.ordens_compra
          SET qtd_enviada = GREATEST(0, COALESCE(qtd_enviada, 0) - v_qtd)
          WHERE (pedido = v_nf.pedido_pai OR pedido LIKE v_nf.pedido_pai || '-%')
            AND cod_produto = v_cod_produto AND (cor IS NULL OR cor = '') AND excluido_em IS NULL;
        END IF;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_total_oc := v_total_oc + v_rows;
      END LOOP;
    END IF;

    -- FIX: era DELETE FROM zapp.cotacoes (inexistente) → logistica.cotacoes
    DELETE FROM logistica.cotacoes
    WHERE pedido_pai_origem = v_nf.pedido_pai
       OR (v_nf.pedido_pai LIKE 'COT-%'
           AND LEFT(id::text, 8) = LOWER(REPLACE(v_nf.pedido_pai, 'COT-', '')));
    GET DIAGNOSTICS v_total_cot = ROW_COUNT;
  END IF;

  DELETE FROM financeiro.notas_fiscais WHERE id = p_nf_id;
  RETURN jsonb_build_object(
    'ok', true, 'tipo', v_nf.tipo_nota, 'pedido', v_nf.pedido_pai,
    'ordens_atualizadas', v_total_oc, 'cotacoes_apagadas', v_total_cot
  );
END;
$$;

COMMENT ON FUNCTION zapp.apagar_nota_fiscal(uuid) IS
'FIX P1 (2026-08-06): corrigido schema de cotacoes — era zapp.cotacoes (inexistente), '
'agora logistica.cotacoes. Impacto: NFs SIMPLES_REMESSA não deixam mais cotacoes órfãs. '
'search_path atualizado para incluir logistica.';

-- ─── 2: Corrigir financeiro.apagar_nota_fiscal ────────────────────────────────
CREATE OR REPLACE FUNCTION financeiro.apagar_nota_fiscal(p_nf_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'financeiro', 'vendas', 'logistica'
AS $$
DECLARE
  v_nf          RECORD;
  v_item        jsonb;
  v_cod_produto text;
  v_cor         text;
  v_qtd         numeric;
  v_rows        int;
  v_total_oc    int := 0;
  v_total_cot   int := 0;
BEGIN
  SELECT * INTO v_nf FROM financeiro.notas_fiscais WHERE id = p_nf_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NF não encontrada');
  END IF;

  IF v_nf.tipo_nota = 'SIMPLES_REMESSA' THEN

    -- 1. Reverte qtd_enviada em ordens_compra (só executa se houver itens)
    IF v_nf.itens_faturados IS NOT NULL THEN
      FOR v_item IN
        SELECT value FROM jsonb_array_elements(v_nf.itens_faturados) AS t(value)
      LOOP
        v_cod_produto := v_item->>'cod_produto';
        v_cor         := v_item->>'cor';
        v_qtd         := (v_item->>'qtd_faturada')::numeric;

        CONTINUE WHEN v_qtd IS NULL OR v_qtd <= 0;
        CONTINUE WHEN v_cod_produto IS NULL;

        IF v_cor IS NOT NULL AND v_cor <> '' THEN
          UPDATE vendas.ordens_compra
          SET qtd_enviada = GREATEST(0, COALESCE(qtd_enviada, 0) - v_qtd)
          WHERE (pedido = v_nf.pedido_pai OR pedido LIKE v_nf.pedido_pai || '-%')
            AND cod_produto = v_cod_produto
            AND cor = v_cor
            AND excluido_em IS NULL;
        ELSE
          UPDATE vendas.ordens_compra
          SET qtd_enviada = GREATEST(0, COALESCE(qtd_enviada, 0) - v_qtd)
          WHERE (pedido = v_nf.pedido_pai OR pedido LIKE v_nf.pedido_pai || '-%')
            AND cod_produto = v_cod_produto
            AND (cor IS NULL OR cor = '')
            AND excluido_em IS NULL;
        END IF;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_total_oc := v_total_oc + v_rows;
      END LOOP;
    END IF;

    -- 2. Apaga cotação vinculada — FIX: era public.cotacoes (inexistente) → logistica.cotacoes
    DELETE FROM logistica.cotacoes
    WHERE pedido_pai_origem = v_nf.pedido_pai
       OR (
         v_nf.pedido_pai LIKE 'COT-%'
         AND LEFT(id::text, 8) = LOWER(REPLACE(v_nf.pedido_pai, 'COT-', ''))
       );

    GET DIAGNOSTICS v_total_cot = ROW_COUNT;
  END IF;

  -- 3. Apaga a NF
  DELETE FROM financeiro.notas_fiscais WHERE id = p_nf_id;

  RETURN jsonb_build_object(
    'ok',                 true,
    'tipo',               v_nf.tipo_nota,
    'pedido',             v_nf.pedido_pai,
    'ordens_atualizadas', v_total_oc,
    'cotacoes_apagadas',  v_total_cot
  );
END;
$$;

COMMENT ON FUNCTION financeiro.apagar_nota_fiscal(uuid) IS
'FIX P1 (2026-08-06): corrigido schema de cotacoes — era public.cotacoes (inexistente), '
'agora logistica.cotacoes. search_path atualizado para incluir logistica.';

-- ─── 3: Corrigir fn_vacuum_critical_tables ────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_vacuum_critical_tables()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'zapp', 'evo'
AS $$
DECLARE
  v_tables text[] := ARRAY[
    'zapp.webhook_events_processed','zapp.webhook_audit_log','zapp.app_notifications',
    'zapp.webhook_rate_limits','zapp.instance_registry','zapp.profiles',
    'zapp.empresas','logistica.cotacoes','evo.evolution_alerts'
  ];
  v_tbl text;
  v_vacuumed int := 0;
  v_errors text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    BEGIN
      PERFORM dblink_exec(
        'host=localhost port=5432 user=postgres dbname=postgres',
        'VACUUM ANALYZE '||v_tbl,
        true
      );
      v_vacuumed := v_vacuumed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || (v_tbl||': '||SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object(
    'vacuumed', v_vacuumed,
    'total', array_length(v_tables,1),
    'errors', to_jsonb(v_errors),
    'executed_at', now()
  );
END;
$$;

COMMENT ON FUNCTION zapp.fn_vacuum_critical_tables() IS
'FIX P1 (2026-08-06): substituído zapp.cotacoes (inexistente) por logistica.cotacoes '
'no array de tabelas a serem vacuadas. A função tem EXCEPTION handler, então a tabela '
'errada causava falha silenciosa sem vacuum real.';
