-- ============================================================================
-- wt-g12 — TESTE SQL DAS POLICIES RLS TEAM-CHAT (schema zapp)
-- ============================================================================
-- Contrato sob teste (gaps da auditoria, onda G):
--   T1: INSERT em zapp.team_messages SEM membership na conversa      → BLOQUEADO
--   T2: INSERT em zapp.team_messages COM membership                  → PERMITIDO (controle positivo)
--   T3: DELETE em zapp.team_conversations por NÃO-admin              → BLOQUEADO
--   T4: DELETE em zapp.team_conversations por admin/supervisor       → PERMITIDO
--   T5: (INFO) self-join em zapp.team_conversation_members           → observação, não é contrato
--
-- Estado esperado (matriz RED/GREEN da campanha):
--   T1 RED   — prod tem team_messages_insert com TAUTOLOGIA viva
--              (tcm.conversation_id = tcm.conversation_id no WITH CHECK) +
--              auth_secure_118 (ALL permissiva, with_check só sender) → qualquer
--              authenticated com profile insere em qualquer conversa.
--   T2 GREEN  — caminho legítimo de membro (sanity do método).
--   T3 GREEN  — prod NÃO tem DELETE policy em team_conversations → 0 rows.
--   T4 RED    — sem DELETE policy, admin/supervisor também não deleta.
--   T5 INFO   — auth_secure_116 (ALL) com with_check = próprio profile permite
--              self-join (gap extra documentado, fora do escopo g12).
--
-- Resultado da execução live (prod, 2026-08-17, via MCP supabase_db_query):
--   T1 RED  (INSERT sem membership FOI PERMITIDO — gap confirmado)
--   T2 GREEN (controle ok)
--   T3 GREEN (DELETE não-admin bloqueado)
--   T4 RED  (DELETE admin bloqueado — sem DELETE policy)
--   T5 INFO-GAP (self-join permitido)
--   Resíduo pós-testes: 0 msgs / 0 convs / 0 memberships (rollback ok)
-- NOTA ao implementador (wt-g12): p/ T1 ficar GREEN não basta corrigir a
-- tautologia de team_messages_insert — a policy PERMISSIVE auth_secure_118
-- (ALL, with_check só sender_id = próprio profile) também permite o INSERT
-- de não-membro; e team_messages_update tem a MESMA tautologia no WITH CHECK.
--
-- Como rodar (psql, zero resíduo — tudo em 1 transação com ROLLBACK):
--   psql --single-transaction -v ON_ERROR_STOP=1 -f supabase/tests/team_chat_rls_policies_test.sql
--   Ou via MCP supabase_db_query (o script inteiro; FAIL aborta com a mensagem
--   do teste, e o ROLLBACK automático da transação abortada remove fixtures).
--
-- Metodologia (house pattern): SET LOCAL ROLE authenticated + claims via
-- set_config('request.jwt.claims', ..., true) (= SET LOCAL; auth.uid() lê
-- claims->>'sub'); fixtures 100% herméticas (conversa criada aqui dentro,
-- perfis REAIS de prod só leitura); qualquer DML permitido é desfeito pelo
-- ROLLBACK final. NOTA: SET LOCAL request.jwt.claims = (SELECT ...) é inválido
-- no PostgreSQL (SET não aceita subquery) — usar set_config().
-- ============================================================================

BEGIN;

-- ============================ FIXTURES (postgres) ============================
CREATE TEMP TABLE _g12_fx (
  conv_id      uuid,
  mem_profile  uuid,
  mem_user     uuid,
  non_profile  uuid,
  non_user     uuid,
  admin_user   uuid
);
GRANT ALL ON _g12_fx TO authenticated;

CREATE TEMP TABLE _g12_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);
GRANT ALL ON _g12_results TO authenticated;

DO $$
DECLARE
  v_conv uuid; v_mem uuid; v_mem_u uuid;
  v_non uuid; v_non_u uuid; v_adm uuid;
BEGIN
  -- Conversa de teste (nova, nunca existiu — nada real é tocado)
  INSERT INTO zapp.team_conversations (type, name, metadata, created_at, updated_at)
  VALUES ('group', 'audit-g12-' || replace(clock_timestamp()::text, ' ', '_'), '{}'::jsonb, now(), now())
  RETURNING id INTO v_conv;

  -- Membro real (perfil com user_id)
  SELECT p.id, p.user_id INTO v_mem, v_mem_u
  FROM zapp.profiles p
  WHERE p.user_id IS NOT NULL
  ORDER BY p.created_at DESC
  LIMIT 1;

  -- Não-membro real: perfil com user_id, que NÃO é admin/supervisor (garante semântica "não-admin")
  SELECT p.id, p.user_id INTO v_non, v_non_u
  FROM zapp.profiles p
  WHERE p.user_id IS NOT NULL
    AND p.id <> v_mem
    AND NOT EXISTS (SELECT 1 FROM zapp.user_roles r
                    WHERE r.user_id = p.user_id
                      AND r.role::text IN ('dev','admin','manager','supervisor'))
    AND NOT EXISTS (SELECT 1 FROM zapp.workspace_members wm
                    WHERE wm.user_id = p.user_id
                      AND wm.role IN ('admin','supervisor','owner'))
  LIMIT 1;

  -- Admin/supervisor real (via user_roles ou workspace_members)
  SELECT p.user_id INTO v_adm
  FROM zapp.profiles p
  WHERE EXISTS (SELECT 1 FROM zapp.user_roles r
                WHERE r.user_id = p.user_id
                  AND r.role::text IN ('dev','admin','manager','supervisor'))
     OR EXISTS (SELECT 1 FROM zapp.workspace_members wm
                WHERE wm.user_id = p.user_id
                  AND wm.role IN ('admin','supervisor','owner'))
  LIMIT 1;

  IF v_conv IS NULL THEN RAISE EXCEPTION 'FATAL: falha ao criar conversa fixture'; END IF;
  IF v_mem_u IS NULL THEN RAISE EXCEPTION 'FATAL: nenhum perfil real com user_id'; END IF;
  IF v_non_u IS NULL THEN RAISE EXCEPTION 'FATAL: nenhum perfil não-admin real'; END IF;
  IF v_adm   IS NULL THEN RAISE EXCEPTION 'FATAL: nenhum admin/supervisor real'; END IF;

  -- Membership real do membro na conversa fixture
  INSERT INTO zapp.team_conversation_members (conversation_id, profile_id, joined_at)
  VALUES (v_conv, v_mem, now());

  INSERT INTO _g12_fx VALUES (v_conv, v_mem, v_mem_u, v_non, v_non_u, v_adm);
END $$;

-- ============================ SIMULAÇÃO authenticated ============================
SET LOCAL ROLE authenticated;

-- ── T1: INSERT team_messages SEM membership → deve ser BLOQUEADO ────────────
DO $$
DECLARE v_conv uuid; v_non uuid; v_allowed boolean := false;
BEGIN
  -- auth.uid() lê request.jwt.claims->>'sub'; set_config(...,true) = SET LOCAL
  PERFORM set_config('request.jwt.claims',
    (SELECT json_build_object('sub', non_user::text, 'role', 'authenticated')::text FROM _g12_fx), true);
  SELECT conv_id, non_profile INTO v_conv, v_non FROM _g12_fx;
  BEGIN
    INSERT INTO zapp.team_messages (conversation_id, sender_id, content)
    VALUES (v_conv, v_non, 'g12-t1-insert-sem-membership');
    v_allowed := true;                       -- sem 42501 = RLS deixou passar
  EXCEPTION WHEN insufficient_privilege THEN
    v_allowed := false;                      -- bloqueado (esperado)
  END;
  IF v_allowed THEN
    RAISE EXCEPTION 'FAIL T1: INSERT em team_messages SEM membership foi PERMITIDO (gap presente)';
  END IF;
  INSERT INTO _g12_results VALUES ('T1','PASS','INSERT sem membership bloqueado (42501)');
END $$;

-- ── T2: INSERT team_messages COM membership → deve ser PERMITIDO (controle) ─
DO $$
DECLARE v_conv uuid; v_mem uuid; v_blocked boolean := false; v_msg uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    (SELECT json_build_object('sub', mem_user::text, 'role', 'authenticated')::text FROM _g12_fx), true);
  SELECT conv_id, mem_profile INTO v_conv, v_mem FROM _g12_fx;
  BEGIN
    INSERT INTO zapp.team_messages (conversation_id, sender_id, content)
    VALUES (v_conv, v_mem, 'g12-t2-insert-com-membership')
    RETURNING id INTO v_msg;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF v_blocked THEN
    RAISE EXCEPTION 'FAIL T2: INSERT em team_messages COM membership foi BLOQUEADO (fix quebrou caminho legítimo)';
  END IF;
  INSERT INTO _g12_results VALUES ('T2','PASS','INSERT com membership permitido (controle ok)');
END $$;

-- ── T3: DELETE team_conversations por NÃO-admin → deve ser BLOQUEADO ─────────
DO $$
DECLARE v_conv uuid; v_deleted uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    (SELECT json_build_object('sub', non_user::text, 'role', 'authenticated')::text FROM _g12_fx), true);
  SELECT conv_id INTO v_conv FROM _g12_fx;
  DELETE FROM zapp.team_conversations WHERE id = v_conv RETURNING id INTO v_deleted;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T3: DELETE em team_conversations por NÃO-admin foi PERMITIDO';
  END IF;
  INSERT INTO _g12_results VALUES ('T3','PASS','DELETE não-admin bloqueado (0 rows)');
END $$;

-- ── T4: DELETE team_conversations por admin/supervisor → deve ser PERMITIDO ─
DO $$
DECLARE v_conv uuid; v_deleted uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    (SELECT json_build_object('sub', admin_user::text, 'role', 'authenticated')::text FROM _g12_fx), true);
  SELECT conv_id INTO v_conv FROM _g12_fx;
  DELETE FROM zapp.team_conversations WHERE id = v_conv RETURNING id INTO v_deleted;
  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'FAIL T4: DELETE em team_conversations por admin/supervisor foi BLOQUEADO (falta DELETE policy admin-only)';
  END IF;
  INSERT INTO _g12_results VALUES ('T4','PASS','DELETE admin permitido');
END $$;

-- ── T5 (INFO): self-join em team_conversation_members — observação, não falha ─
DO $$
DECLARE v_conv uuid; v_non uuid; v_joined boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    (SELECT json_build_object('sub', non_user::text, 'role', 'authenticated')::text FROM _g12_fx), true);
  SELECT conv_id, non_profile INTO v_conv, v_non FROM _g12_fx;
  BEGIN
    INSERT INTO zapp.team_conversation_members (conversation_id, profile_id)
    VALUES (v_conv, v_non);
    v_joined := true;
  EXCEPTION WHEN insufficient_privilege THEN
    v_joined := false;
  END;
  INSERT INTO _g12_results VALUES (
    'T5',
    CASE WHEN v_joined THEN 'INFO-GAP' ELSE 'PASS' END,
    CASE WHEN v_joined
         THEN 'self-join PERMITIDO: user não-admin se adicionou à conversa (auth_secure_116 with_check = próprio profile)'
         ELSE 'self-join bloqueado' END
  );
END $$;

-- ============================ RESULTADO + CLEANUP ============================
SELECT test_id, status, detail FROM _g12_results ORDER BY test_id;

ROLLBACK;
-- ROLLBACK final: remove conversa fixture, memberships e mensagens de teste.
-- Zero resíduo em produção.
