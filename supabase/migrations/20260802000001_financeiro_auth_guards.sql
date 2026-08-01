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
--
-- ============================================================
-- ROLLBACK: para reverter esta migration:
--   1. Recuperar definições originais:
--      SELECT fn_def FROM financeiro._backup_fn_guards_20260802 ORDER BY fn_name;
--   2. Executar cada fn_def para restaurar as funções sem guard.
--   3. DROP TABLE financeiro._backup_fn_guards_20260802;
-- ============================================================

-- ============================================================
-- Backup: salva pg_get_functiondef() de todas as funções
-- elegíveis ANTES da injeção para permitir rollback preciso.
-- Idempotente: ignora se a tabela já existir com dados.
-- ============================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'financeiro') THEN
    RAISE NOTICE 'Schema financeiro nao encontrado — backup pulado';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS financeiro._backup_fn_guards_20260802 (
    fn_oid       OID         NOT NULL,
    fn_schema    TEXT        NOT NULL DEFAULT 'financeiro',
    fn_name      TEXT        NOT NULL,
    fn_args      TEXT        NOT NULL,
    fn_def       TEXT        NOT NULL,
    backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Idempotência: popula apenas se a tabela estiver vazia
  IF NOT EXISTS (SELECT 1 FROM financeiro._backup_fn_guards_20260802 LIMIT 1) THEN
    INSERT INTO financeiro._backup_fn_guards_20260802 (fn_oid, fn_name, fn_args, fn_def)
    SELECT
      p.oid,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid),
      pg_catalog.pg_get_functiondef(p.oid)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname   = 'financeiro'
      AND p.prokind   = 'f'
      AND p.prolang   = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
      AND p.prosecdef = true
      AND p.proname NOT LIKE 'fn_is_%'
      AND p.proname NOT LIKE 'fn_trg_%'
      AND p.proname NOT LIKE 'fn_set_%'
      AND p.proname NOT LIKE 'fn_auto_%'
      AND p.proname NOT LIKE 'fn_atualizar_%'
      AND p.proname NOT LIKE 'fn_sync_%'
      AND p.proname <> 'fn_app_role';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backup: % definicoes salvas em financeiro._backup_fn_guards_20260802', v_count;
  ELSE
    RAISE NOTICE 'Backup ja existente — pulando (idempotente)';
  END IF;
END;
$$;

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
  v_as_pos    INT;    -- posição de '\nAS $' em v_def (marca início do corpo)
  v_body_off  INT;    -- offset até fim do delimitador de abertura dollar-quote
  v_body_text TEXT;   -- corpo da função extraído após o delimiter dollar-quote
  v_begin_cnt INT;    -- contagem de '\nBEGIN\n' sem indentação no corpo

  -- Guard a ser injetado logo após o BEGIN do bloco principal
  -- Usa qualificador completo financeiro.fn_is_admin_diretor() para evitar
  -- falha de resolução em funções cujo SET search_path não inclui financeiro.
  c_guard CONSTANT TEXT := E'  -- [auth-guard] apenas admin/diretor financeiro\n'
    || E'  IF NOT COALESCE(financeiro.fn_is_admin_diretor(), false) THEN\n'
    || E'    RAISE EXCEPTION ''Acesso negado: apenas administradores e diretores do modulo financeiro podem executar esta operacao''\n'
    || E'      USING ERRCODE = ''42501'',\n'
    || E'            HINT    = ''Solicite acesso ao administrador do sistema'';\n'
    || E'  END IF;\n';

BEGIN
  -- ============================================================
  -- Preflight: verifica que fn_is_admin_diretor() existe com
  -- exatamente 0 argumentos antes de qualquer injeção.
  -- Sem essa checagem, EXECUTE v_new_def compila sem erros
  -- (PostgreSQL valida refs de função apenas em runtime), e a
  -- falha só aparece em produção no primeiro uso real — derrubando
  -- todas as operações financeiras protegidas simultaneamente.
  -- ============================================================
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'financeiro'
      AND p.proname = 'fn_is_admin_diretor'
      AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION
      'Abortando migration: financeiro.fn_is_admin_diretor() (pronargs=0) nao encontrada — aplique a migration que cria essa funcao antes desta'
      USING ERRCODE = 'P0001';
  END IF;

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
      -- e funções de sincronização internas (chamadas por triggers e service_role)
      AND p.proname NOT LIKE 'fn_is_%'
      AND p.proname NOT LIKE 'fn_trg_%'
      AND p.proname NOT LIKE 'fn_set_%'
      AND p.proname NOT LIKE 'fn_auto_%'
      AND p.proname NOT LIKE 'fn_atualizar_%'
      AND p.proname NOT LIKE 'fn_sync_%'    -- sync triggers (fn_sync_nf_para_vendas, fn_sync_status_ordem*)
      AND p.proname <> 'fn_app_role'        -- helper de auth usado por RLS e service_role
    ORDER BY p.proname, p.oid
  LOOP
    BEGIN
      -- Obtém definição completa da função
      v_def := pg_catalog.pg_get_functiondef(v_rec.oid);

      -- Pula se guard ESTRUTURAL já presente (idempotência robusta).
      -- Verifica a estrutura completa do guard (IF NOT COALESCE(...)) em vez de apenas
      -- o nome da função, para evitar falso-skip em funções que referenciam
      -- fn_is_admin_diretor() em comentários ou chamadas indiretas sem o guard.
      IF v_def ILIKE '%IF NOT COALESCE(financeiro.fn_is_admin_diretor()%' THEN
        RAISE NOTICE 'SKIP (já tem guard): financeiro.%(%) oid=%',
          v_rec.fn_name, v_rec.fn_args, v_rec.oid;
        v_skip_count := v_skip_count + 1;
        CONTINUE;
      END IF;

      -- ----------------------------------------------------------------
      -- Extrai o corpo da função após o delimitador dollar-quote para
      -- evitar falsos positivos com literais de string contendo
      -- E'\nBEGIN\n' que apareçam antes do BEGIN real do bloco principal.
      -- pg_get_functiondef() produz: header + '\nAS $tag$\n' + body + '$tag$\n'
      -- ----------------------------------------------------------------
      v_as_pos := position(E'\nAS $' IN v_def);
      IF v_as_pos > 0 THEN
        -- A partir de v_as_pos+4 (no '$' do tag de abertura), localiza
        -- o '$\n' que fecha o tag (ex: '$function$\n' → offset 10 para 'function')
        v_body_off := position(E'$\n' IN substring(v_def FROM v_as_pos + 4));
        IF v_body_off > 0 THEN
          -- Corpo começa no caractere imediatamente após o '\n' do tag de abertura
          v_body_text := E'\n' || substring(v_def FROM v_as_pos + 4 + v_body_off);
        ELSE
          v_body_text := E'\n' || substring(v_def FROM v_as_pos + 4);
        END IF;
      ELSE
        -- Fallback: usa v_def inteiro (sem separar header do corpo)
        v_body_text := E'\n' || v_def;
      END IF;

      -- Conta '\nBEGIN\n' SEM indentação no corpo extraído.
      -- BEGINs aninhados ficam indentados ('\n  BEGIN\n') e NÃO são contados.
      -- Literais de string com E'\nBEGIN\n' são contados → detecta caso ambíguo.
      -- length('\nbegin\n') = 7 — usado como divisor para a contagem.
      v_begin_cnt := (
        length(lower(v_body_text)) -
        length(replace(lower(v_body_text), E'\nbegin\n', ''))
      ) / 7;

      IF v_begin_cnt = 0 THEN
        RAISE EXCEPTION 'BEGIN nao encontrado no corpo: financeiro.%(%) oid=% — '
          'injecao impossivel sem localizar BEGIN no bloco principal',
          v_rec.fn_name, v_rec.fn_args, v_rec.oid;
      END IF;

      IF v_begin_cnt > 1 THEN
        -- Fail-closed: múltiplos BEGIN sem indentação = ambíguo.
        -- Pode ser literal de string ou BEGIN aninhado não-indentado.
        -- Guard não pode ser injetado com segurança — requer revisão manual.
        RAISE EXCEPTION 'BEGIN ambiguo: financeiro.%(%) oid=% — % ocorrencias de '
          'newline+BEGIN+newline sem indentacao no corpo; '
          'possivel literal de string ou BEGIN aninhado nao-indentado — '
          'guard nao pode ser injetado com seguranca; revisar manualmente',
          v_rec.fn_name, v_rec.fn_args, v_rec.oid, v_begin_cnt;
      END IF;

      -- Exatamente 1 BEGIN de nível superior confirmado no corpo.
      -- Agora é seguro usar position() em v_def — a unicidade garante que
      -- a primeira ocorrência em v_def é o BEGIN correto do bloco principal.
      v_begin_pos := position(E'\nBEGIN\n' IN v_def);
      IF v_begin_pos = 0 THEN
        -- Fallback para BEGIN em minúsculas (preservado pelo pg_get_functiondef)
        v_begin_pos := position(E'\nbegin\n' IN lower(v_def));
      END IF;

      -- Reconstrói definição com guard logo após \nBEGIN\n
      -- v_begin_pos aponta para o \n que precede BEGIN
      -- length(E'\nBEGIN\n') = 7; preserva o \nBEGIN\n intacto
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
    SELECT p.oid, p.proname AS fn_name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS fn_args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname  = 'financeiro'
      AND p.prokind  = 'f'
      AND p.prolang  = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
      AND p.prosecdef = true
      AND p.proname NOT LIKE 'fn_is_%'
      AND p.proname NOT LIKE 'fn_trg_%'
      AND p.proname NOT LIKE 'fn_set_%'
      AND p.proname NOT LIKE 'fn_auto_%'
      AND p.proname NOT LIKE 'fn_atualizar_%'
      AND p.proname NOT LIKE 'fn_sync_%'    -- sync triggers (fn_sync_nf_para_vendas, fn_sync_status_ordem*)
      AND p.proname <> 'fn_app_role'        -- helper de auth usado por RLS e service_role
    ORDER BY p.proname
  LOOP
    v_def := pg_catalog.pg_get_functiondef(v_rec.oid);
    -- Verifica presença estrutural do guard (mesmo critério da injeção)
    IF v_def NOT ILIKE '%IF NOT COALESCE(financeiro.fn_is_admin_diretor()%' THEN
      RAISE WARNING 'SEM GUARD: financeiro.%(%) — injeção pode ter falhado silenciosamente',
        v_rec.fn_name, v_rec.fn_args;
      v_missing := v_missing + 1;
    END IF;
  END LOOP;

  IF v_missing = 0 THEN
    RAISE NOTICE 'Verificação OK: todas as funções financeiro elegíveis possuem auth guard';
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
        E'Guards fn_is_admin_diretor() adicionados via migration 20260802000001 em 2026-08-02.\n'
        E'Risco residual P1 mapeado em R27 (2026-08-01): UUIDs nao adivinhaveis como mitigacao parcial.\n'
        'Para auditoria completa ver: supabase/migrations/20260801200000_r27_deep_audit_p0_gaps_rt33.sql'
    $sql$;
  ELSE
    RAISE NOTICE 'Schema financeiro nao encontrado — COMMENT ON SCHEMA pulado';
  END IF;
END;
$$;
