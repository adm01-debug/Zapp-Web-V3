-- 20260817240000 — Etapa 65 (CAMPANHAS-09): RLS real em zapp.scheduled_messages
-- =============================================================================
-- Problema verificado (2026-08-04/17): a tabela só tinha policy SELECT
-- (`scheduled_messages_select`). INSERT (useScheduledMessages.scheduleMutation)
-- e UPDATE (cancelMutation → status='cancelled') falhavam com 403 silencioso
-- ("new row violates row-level security policy"), e a UI mostrava sucesso antes
-- do insert resolver. Além disso não havia GRANT explícito nem índices para o
-- dispatcher de envio (Etapa 65, migration 20260817250000).
--
-- Padrão: favorite_contacts (squash 10340-10348) / favorite_messages
-- (etapa44) — tenant-based. Para scheduled_messages o "dono" é o profile que
-- criou (created_by). Incluímos também a visibilidade de contato
-- (zapp.is_contact_visible_to_user) porque o frontend envia created_by NULL
-- quando o profile ainda não existe — exigir created_by = profile.id
-- reintroduziria o 403 (mesmo bug que esta migration corrige).
--
-- Rollback: DROP POLICY scheduled_messages_insert/update;
--           DROP INDEX idx_scheduled_messages_due/contact_id/created_by;
--           (GRANTs são inócuos de reverter)

BEGIN;

-- ── RLS ativa (idempotente) ────────────────────────────────────────────────
ALTER TABLE zapp.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- ── Policies tenant-based (padrão favorite_contacts) ──────────────────────
-- SELECT já existia (canonical 10491-10495); recriamos idempotente por
-- clareza e para garantir o estado final mesmo com drift DB×repo.
DROP POLICY IF EXISTS scheduled_messages_select ON zapp.scheduled_messages;
CREATE POLICY scheduled_messages_select ON zapp.scheduled_messages
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
    OR zapp.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- INSERT: dono (created_by) OU admin/supervisor OU contato visível ao usuário.
DROP POLICY IF EXISTS scheduled_messages_insert ON zapp.scheduled_messages;
CREATE POLICY scheduled_messages_insert ON zapp.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
    OR zapp.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- UPDATE: usado pelo cancelMutation (status → 'cancelled') e pelo dispatcher
-- somente via SECDEF (owner). Mesmo predicado tenant-based em USING e WITH
-- CHECK — nunca permitir trocar o dono/contato de outra pessoa.
DROP POLICY IF EXISTS scheduled_messages_update ON zapp.scheduled_messages;
CREATE POLICY scheduled_messages_update ON zapp.scheduled_messages
  FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
    OR zapp.is_contact_visible_to_user(contact_id, auth.uid())
  )
  WITH CHECK (
    created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
    OR zapp.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- ── GRANTs (lição incidente PR #668: policy sem GRANT = 403) ───────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.scheduled_messages TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.is_admin_or_supervisor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.is_contact_visible_to_user(uuid, uuid) TO authenticated;

-- ── Índices ─────────────────────────────────────────────────────────────────
-- Dispatcher (fn_dispatch_scheduled_messages): filtra status='pending' +
-- scheduled_at <= now() — índice parcial cobre exatamente essa query.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON zapp.scheduled_messages (scheduled_at)
  WHERE status = 'pending';

-- Cancelamento/edição por id e filtros de calendário por agente.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_contact_id
  ON zapp.scheduled_messages (contact_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_created_by
  ON zapp.scheduled_messages (created_by);

-- ── Canário RLS (SET ROLE authenticated + JWT fake, padrão etapa44) ────────
-- [FIX 2026-08-18] set_config no lugar de SET LOCAL com expressão (sintaxe
-- inválida); usuários canário criados em auth.users (FK real de profiles);
-- setup movido p/ antes do SET ROLE; ON CONFLICT removido do INSERT na view
-- zapp.contacts (não suportado em view); cleanup total no final.
DO $$
DECLARE
  v_owner uuid := '00000000-0000-0000-0000-00000000c001';
  v_other uuid := '00000000-0000-0000-0000-00000000c002';
  v_profile uuid;
  v_contact uuid;
  v_inserted uuid;
BEGIN
  -- Setup como owner da migração (bypassa RLS): FK real em auth.users.
  INSERT INTO auth.users (id, aud, role, email)
  VALUES
    (v_owner, 'authenticated', 'authenticated', 'canario-c001@invalid.local'),
    (v_other, 'authenticated', 'authenticated', 'canario-c002@invalid.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO zapp.profiles (id, user_id) VALUES (gen_random_uuid(), v_owner)
    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id INTO v_profile;
  INSERT INTO zapp.contacts (id, name, phone)
    VALUES (gen_random_uuid(), 'Canario RLS', '5511999999999')
    RETURNING id INTO v_contact;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- INSERT como dono (created_by = profile) deve passar.
  INSERT INTO zapp.scheduled_messages (contact_id, content, scheduled_at, created_by)
    VALUES (v_contact, 'canario insert', now() + interval '1 hour', v_profile)
    RETURNING id INTO v_inserted;

  -- UPDATE (cancel) do próprio dono deve passar.
  UPDATE zapp.scheduled_messages SET status = 'cancelled' WHERE id = v_inserted;
  -- Volta para pending para o canário de UPDATE com dados coerentes.
  UPDATE zapp.scheduled_messages SET status = 'pending' WHERE id = v_inserted;

  -- SELECT do dono deve enxergar a row.
  PERFORM 1 FROM zapp.scheduled_messages WHERE id = v_inserted;

  -- UPDATE de OUTRO usuário deve afetar 0 rows (RLS filtra).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  UPDATE zapp.scheduled_messages SET status = 'cancelled' WHERE id = v_inserted;
  IF FOUND THEN
    RAISE EXCEPTION 'canario RLS falhou: UPDATE cross-tenant afetou row';
  END IF;

  -- INSERT sem created_by (NULL) com contato visível ao dono deve passar.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  INSERT INTO zapp.scheduled_messages (contact_id, content, scheduled_at, created_by)
    VALUES (v_contact, 'canario insert null owner', now() + interval '2 hours', NULL);

  RESET ROLE;

  -- Cleanup: nenhum dado canário persiste.
  DELETE FROM zapp.scheduled_messages WHERE contact_id = v_contact;
  DELETE FROM zapp.contacts WHERE id = v_contact;
  DELETE FROM zapp.profiles WHERE user_id IN (v_owner, v_other);
  DELETE FROM auth.users WHERE id IN (v_owner, v_other);
  RAISE NOTICE '[etapa65] canário RLS scheduled_messages OK (insert/update/select tenant-based)';
END $$;

COMMIT;
