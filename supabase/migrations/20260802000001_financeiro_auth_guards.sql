-- ============================================================
-- Passo P1: Guards de autorização nas funções SECURITY DEFINER
--           do schema financeiro que realizam UPDATE/INSERT/DELETE
--           sem verificação de papel do chamador.
--
-- Estratégia: descobre dinamicamente TODAS as funções PL/pgSQL
-- com SECURITY DEFINER no schema financeiro (via p.prosecdef=true),
-- injeta  financeiro.fn_is_admin_diretor()  como primeira instrução
-- do bloco BEGIN via pg_get_functiondef() + EXECUTE.
--
-- Idempotência: verifica presença estrutural do guard
--   (IF NOT financeiro.fn_is_admin_diretor()) para evitar falsos
--   positivos em funções que apenas mencionam o nome.
--
-- Fail-closed: qualquer falha de injeção aborta a migration inteira
--   via RAISE EXCEPTION — hardening parcial é pior do que nenhum.
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
  -- Usa qualificador completo financeiro.fn_is_admin_diretor() para evitar
  -- falha de resolução em funções cujo SET search_path não inclui financeiro.
  c_guard CONSTANT TEXT := E'  -- [auth-guard] apenas admin/diretor financeiro\n'
    || E'  IF NOT financeiro.fn_is_admin_diretor() THEN\n'
    || E'    RAISE EXCEPTION ''Acesso negado: apenas administradores e diretores do modulo financeiro podem executar esta operacao''\n'
    || E'      USING ERRCODE = ''42501'',\n'
    || E'            HINT    = ''Solicite acesso ao administrador do sistema'';\n'
    || E'  END IF;\n';

BEGIN
  -- Seleciona TODAS as funções PL/pgSQL SECURITY DEFINER no schema financeiro.
  -- p.prosecdef = true garante que não alvejamos overloads SECURITY INVOKER.
  -- A lista não é hardcoded para cobrir funções presentes e futuras.
  FOR v_rec IN
    SELECT
      p.oid,
      p.proname AS fn_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS fn_args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname  = 'financeiro'
      AND p.prokind  = 'f'          -- somente funções normais (não aggregates/window)
      AND p.prolang  = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
      AND p.prosecdef = true        -- prosecdef=true; exclui overloads INVOKER
      -- Exclui funções de guarda/predicate (causariam recursão infinita)
      -- e funções de trigger/automação (executam em contexto DML, não HTTP)
      AND p.proname NOT LIKE 'fn_is_%'
      AND p.proname NOT LIKE 'fn_trg_%'
      AND p.proname NOT LIKE 'fn_set_%'
      AND p.proname NOT LIKE 'fn_auto_%'
    ORDER BY p.proname, p.oid
  LOOP
    BEGIN
      -- Obtém definição completa da função
      v_def := pg_catalog.pg_get_functiondef(v_rec.oid);

      -- Pula se guard ESTRUTURAL já presente (idempotência robusta).
      -- Usa 'IF NOT financeiro.fn_is_admin_diretor()' em vez de apenas
      -- 'fn_is_admin_diretor' para evitar falso-skip em funções que apenas
      -- referenciam o nome em comentários ou chamadas indiretas.
      IF v_def ILIKE '%IF NOT financeiro.fn_is_admin_diretor()%' THEN
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
      v_fail_count := v_fail_count + 1;
      RAISE WARNING 'FALHA ao injetar guard em financeiro.%(%) oid=% — SQLSTATE=% MSG=%',
        v_rec.fn_name, v_rec.fn_args, v_rec.oid, SQLSTATE, SQLERRM;
    END;
  END LOOP;

  -- ============================================================
  -- Fail-closed: aborta a migration se qualquer injeção falhou.
  -- Hardening parcial é pior do que nenhum: dá falsa impressão
  -- de segurança. Re-aplicar após corrigir as causas raiz.
  -- ============================================================
  IF v_fail_count > 0 THEN
    RAISE EXCEPTION
      'Abortando migration: % função(ões) financeiro com falha na injeção de guard — revisar WARNINGs acima e re-aplicar',
      v_fail_count
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '=== Resultado da injeção de guards financeiro ===';
  RAISE NOTICE 'Injetados com sucesso : %', v_ok_count;
  RAISE NOTICE 'Pulados (já tinham)   : %', v_skip_count;
  RAISE NOTICE 'Falhas                : %', v_fail_count;

  -- Avisa se schema financeiro não tem funções elegíveis (sem falhar)
  IF (v_ok_count + v_skip_count) = 0 THEN
    RAISE NOTICE 'Aviso: nenhuma função financeiro com prosecdef=true encontrada — schema pode não estar aplicado neste ambiente';
  END IF;
END;
$$;

-- ============================================================
-- Verificação pós-injeção: lista funções que ainda não têm guard
-- (somente como informativo — injeção acima já é fail-closed)
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
    WHERE n.nspname  = 'financeiro'
      AND p.prokind  = 'f'
      AND p.prolang  = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
      AND p.prosecdef = true
    ORDER BY p.proname
  LOOP
    v_def := pg_catalog.pg_get_functiondef(v_rec.oid);
    -- Verifica presença estrutural do guard (mesmo critério da injeção)
    IF v_def NOT ILIKE '%IF NOT financeiro.fn_is_admin_diretor()%' THEN
      RAISE WARNING 'SEM GUARD: financeiro.%(%) — injeção pode ter falhado silenciosamente',
        v_rec.proname, v_rec.fn_args;
      v_missing := v_missing + 1;
    END IF;
  END LOOP;

  IF v_missing = 0 THEN
    RAISE NOTICE 'Verificação OK: todas as funções financeiro com prosecdef=true possuem auth guard';
  ELSE
    RAISE EXCEPTION '% função(ões) financeiro sem guard após injeção — corrija antes de aplicar', v_missing;
  END IF;
END;
$$;

-- ============================================================
-- Documenta o risco residual remanescente após aplicação
-- (condicional: só executa se schema financeiro existir)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'financeiro') THEN
    EXECUTE $sql$
      COMMENT ON SCHEMA financeiro IS
        E'Schema do módulo financeiro (16 tabelas, 23+ funções com execução privilegiada).\n'
        'Guards fn_is_admin_diretor() adicionados via migration 20260802000001 em 2026-08-02.\n'
        'Risco residual P1 mapeado em R27 (2026-08-01): UUIDs nao adivinhaveis como mitigacao parcial.\n'
        'Para auditoria completa ver: supabase/migrations/20260801200000_r27_deep_audit_p0_gaps_rt33.sql'
    $sql$;
  ELSE
    RAISE NOTICE 'Schema financeiro nao encontrado — COMMENT ON SCHEMA pulado';
  END IF;
END;
$$;
