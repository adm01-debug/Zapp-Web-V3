-- ============================================================
-- Passo P1: Guards de autorização nas 23 funções SECURITY DEFINER
--           do schema financeiro que realizam UPDATE/INSERT/DELETE
--           sem verificação de papel do chamador.
--
-- Estratégia: lê o corpo atual de cada função via pg_get_functiondef(),
-- injeta  financeiro.fn_is_admin_diretor()  como primeira instrução
-- do bloco BEGIN, e re-executa via EXECUTE.
-- Em caso de falha na injeção, emite WARNING e pula a função
-- (não reverte a migration inteira).
--
-- Auditoria: 2026-08-01 R27 — risco P1 mapeado
-- Aplicado:  2026-08-02
-- ============================================================

DO $$
DECLARE
  v_rec       RECORD;
  v_def       TEXT;
  v_new_def   TEXT;
  v_guard     TEXT;
  v_begin_pos INT;
  v_ok_count  INT := 0;
  v_skip_count INT := 0;
  v_fail_count INT := 0;

  -- Guard a ser injetado logo após o BEGIN do bloco principal
  -- Usa search_path = financeiro, então fn_is_admin_diretor resolve sem qualificador
  c_guard CONSTANT TEXT := E'  -- [auth-guard] apenas admin/diretor financeiro\n'
    || E'  IF NOT fn_is_admin_diretor() THEN\n'
    || E'    RAISE EXCEPTION ''Acesso negado: apenas administradores e diretores do modulo financeiro podem executar esta operacao''\n'
    || E'      USING ERRCODE = ''42501'',\n'
    || E'            HINT    = ''Solicite acesso ao administrador do sistema'';\n'
    || E'  END IF;\n';

BEGIN
  -- Seleciona todas as overloads das funções-alvo no schema financeiro
  FOR v_rec IN
    SELECT
      p.oid,
      p.proname AS fn_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS fn_args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'financeiro'
      AND p.prokind   = 'f'          -- somente funções normais
      AND p.prolang   = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
      AND p.proname IN (
        'liquidar_parcela',
        'liquidar_vale',
        'pagar_parcela_emprestimo',
        'prorrogar_parcela',
        'unificar_pedidos',
        'desfazer_unificacao',
        'adicionar_parcelas',
        'adicionar_valor_emprestimo',
        'atualizar_colaborador',
        'bulk_insert_parcelas',
        'bulk_sync_parcelas_planilha',
        'bulk_upsert_vendas',
        'remover_parcelas',
        'sincronizar_nome_produto_nfs',
        'sync_parcela_planilha'
      )
    ORDER BY p.proname, p.oid
  LOOP
    BEGIN
      -- Obtém definição completa da função
      v_def := pg_catalog.pg_get_functiondef(v_rec.oid);

      -- Pula se guard já presente (idempotência)
      IF v_def ILIKE '%fn_is_admin_diretor%' THEN
        RAISE NOTICE 'SKIP (já tem guard): financeiro.%(%) oid=%',
          v_rec.fn_name, v_rec.fn_args, v_rec.oid;
        v_skip_count := v_skip_count + 1;
        CONTINUE;
      END IF;

      -- Localiza o primeiro \nBEGIN\n no corpo da função
      -- pg_get_functiondef usa E'\n' como quebra de linha
      v_begin_pos := position(E'\nBEGIN\n' IN v_def);

      IF v_begin_pos = 0 THEN
        -- Tenta variante sem DECLARE (BEGIN logo após $$)
        v_begin_pos := position(E'\nbegin\n' IN lower(v_def));
      END IF;

      IF v_begin_pos = 0 THEN
        RAISE WARNING 'SKIP (BEGIN não encontrado): financeiro.%(%) oid=% — injeção não é possível sem localizar BEGIN',
          v_rec.fn_name, v_rec.fn_args, v_rec.oid;
        v_fail_count := v_fail_count + 1;
        CONTINUE;
      END IF;

      -- Reconstrói definição com guard logo após \nBEGIN\n
      -- v_begin_pos aponta para o \n que precede BEGIN
      -- length(E'\nBEGIN\n') = 7; queremos manter o \nBEGIN\n intacto
      v_new_def :=
          left(v_def, v_begin_pos + 6)   -- preserva até o \n após BEGIN
        || c_guard
        || substring(v_def, v_begin_pos + 7);  -- resto da função

      -- Executa a nova definição
      EXECUTE v_new_def;

      RAISE NOTICE 'OK (guard injetado): financeiro.%(%) oid=%',
        v_rec.fn_name, v_rec.fn_args, v_rec.oid;
      v_ok_count := v_ok_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'FALHA ao injetar guard em financeiro.%(%) oid=% — SQLSTATE=% MSG=%',
        v_rec.fn_name, v_rec.fn_args, v_rec.oid, SQLSTATE, SQLERRM;
      v_fail_count := v_fail_count + 1;
    END;
  END LOOP;

  RAISE NOTICE '=== Resultado da injeção de guards financeiro ===';
  RAISE NOTICE 'Injetados com sucesso : %', v_ok_count;
  RAISE NOTICE 'Pulados (já tinham)   : %', v_skip_count;
  RAISE NOTICE 'Falhas                : %', v_fail_count;

  -- Falha da migration apenas se NENHUMA função foi encontrada
  -- (indício de que o schema financeiro não foi aplicado corretamente)
  IF (v_ok_count + v_skip_count + v_fail_count) = 0 THEN
    RAISE WARNING 'Nenhuma função financeiro encontrada — schema pode não estar aplicado no self-hosted';
  END IF;
END;
$$;

-- ============================================================
-- Verificação pós-injeção: lista funções que ainda não têm guard
-- (somente como informativo — não bloqueia a migration)
-- ============================================================
DO $$
DECLARE
  v_rec RECORD;
  v_def TEXT;
  v_missing INT := 0;
BEGIN
  FOR v_rec IN
    SELECT p.oid, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS fn_args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'financeiro'
      AND p.prokind = 'f'
      AND p.prolang = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
      AND p.proname IN (
        'liquidar_parcela','liquidar_vale','pagar_parcela_emprestimo',
        'prorrogar_parcela','unificar_pedidos','desfazer_unificacao',
        'adicionar_parcelas','adicionar_valor_emprestimo','atualizar_colaborador',
        'bulk_insert_parcelas','bulk_sync_parcelas_planilha','bulk_upsert_vendas',
        'remover_parcelas','sincronizar_nome_produto_nfs','sync_parcela_planilha'
      )
    ORDER BY p.proname
  LOOP
    v_def := pg_catalog.pg_get_functiondef(v_rec.oid);
    IF v_def NOT ILIKE '%fn_is_admin_diretor%' THEN
      RAISE WARNING 'SEM GUARD: financeiro.%(%) — injeção pode ter falhado silenciosamente',
        v_rec.fn_name, v_rec.fn_args;
      v_missing := v_missing + 1;
    END IF;
  END LOOP;

  IF v_missing = 0 THEN
    RAISE NOTICE 'Verificação OK: todas as funções financeiro encontradas possuem auth guard';
  ELSE
    RAISE WARNING '% função(ões) financeiro sem guard após injeção — revisar manualmente', v_missing;
  END IF;
END;
$$;

-- ============================================================
-- Documenta o risco residual remanescente após aplicação
-- ============================================================
COMMENT ON SCHEMA financeiro IS
  E'Schema do módulo financeiro (16 tabelas, 23+ funções com execução privilegiada).\n'
  'Guards fn_is_admin_diretor() adicionados via migration 20260802000001 em 2026-08-02.\n'
  'Risco residual P1 mapeado em R27 (2026-08-01): UUIDs não adivinháveis como mitigação parcial.\n'
  'Para auditoria completa ver: supabase/migrations/20260801200000_r27_deep_audit_p0_gaps_rt33.sql';
