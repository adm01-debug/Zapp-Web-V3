-- =============================================================================
-- 20260702210000_team_chat_department_metadata_status.sql
--
-- BUG (400 em POST/GET /rest/v1/team_conversations):
--   O frontend (useTeamChatMutations.useCreateTeamConversation e
--   useTransferTeamConversation) insere/filtra department_id e metadata em
--   team_conversations, e useUpdateTeamMessageStatus atualiza status em
--   team_messages — mas essas colunas nunca existiram no banco. O PostgREST
--   devolve 400 (PGRST204/42703) para TODA criação de conversa (inclusive
--   diretas, pois o insert envia department_id: null explicitamente).
--
-- Esta migração é idempotente. Aplicada em produção em 2026-07-02.
--
-- NOTA OPERACIONAL (self-hosted): NOTIFY pgrst, 'reload schema' NÃO atravessa
-- o Supavisor em transaction pooling. Após aplicar, reinicie as réplicas do
-- serviço supabase_rest (sequencialmente) para recarregar o schema cache.
-- =============================================================================

BEGIN;

-- 1. Limpeza pontual de 2 conversas órfãs de prod (inserts parciais de 2026-06-13;
--    sem membros e sem mensagens). No-op em outros ambientes.
DELETE FROM zapp.team_conversations c
WHERE c.id IN ('6fd6f44a-921b-4193-8690-43f287b8138c','c4faafdb-41d8-4d2c-9874-943b8325ae87')
  AND NOT EXISTS (SELECT 1 FROM zapp.team_conversation_members m WHERE m.conversation_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.team_messages t WHERE t.conversation_id = c.id);

-- 2. created_by: text -> uuid (exige derrubar a view dependente; recriada no passo 6)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='zapp' AND table_name='team_conversations'
               AND column_name='created_by' AND data_type='text') THEN
    DROP VIEW IF EXISTS public.team_conversations;
    ALTER TABLE zapp.team_conversations ALTER COLUMN created_by TYPE uuid USING created_by::uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversations_created_by_fkey') THEN
    ALTER TABLE zapp.team_conversations
      ADD CONSTRAINT team_conversations_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Colunas que o frontend sempre esperou
ALTER TABLE zapp.team_conversations ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE zapp.team_conversations ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversations_department_id_fkey') THEN
    ALTER TABLE zapp.team_conversations
      ADD CONSTRAINT team_conversations_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversations_type_check') THEN
    ALTER TABLE zapp.team_conversations
      ADD CONSTRAINT team_conversations_type_check CHECK (type IN ('direct','group','department'));
  END IF;
END $$;

-- Uma única conversa por departamento (o frontend usa maybeSingle na checagem)
CREATE UNIQUE INDEX IF NOT EXISTS team_conversations_department_id_uniq
  ON zapp.team_conversations(department_id) WHERE department_id IS NOT NULL;

-- 4. Integridade de team_conversation_members (faltavam FK de conversation_id e UNIQUE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversation_members_conversation_id_fkey') THEN
    ALTER TABLE zapp.team_conversation_members
      ADD CONSTRAINT team_conversation_members_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES zapp.team_conversations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversation_members_conv_profile_uniq') THEN
    ALTER TABLE zapp.team_conversation_members
      ADD CONSTRAINT team_conversation_members_conv_profile_uniq UNIQUE (conversation_id, profile_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_conversation_members_profile
  ON zapp.team_conversation_members(profile_id);

-- 5. team_messages: status (usado por useUpdateTeamMessageStatus) + FKs + índice de paginação
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_messages_status_check') THEN
    ALTER TABLE public.team_messages
      ADD CONSTRAINT team_messages_status_check CHECK (status IN ('sent','delivered','read'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_messages_conversation_id_fkey') THEN
    ALTER TABLE public.team_messages
      ADD CONSTRAINT team_messages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES zapp.team_conversations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_messages_reply_to_id_fkey') THEN
    ALTER TABLE public.team_messages
      ADD CONSTRAINT team_messages_reply_to_id_fkey
      FOREIGN KEY (reply_to_id) REFERENCES public.team_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_messages_conv_created
  ON public.team_messages(conversation_id, created_at DESC);

-- 6. Recria a view com as novas colunas (ordem original preservada + colunas anexadas),
--    mantendo security_invoker e os grants originais.
CREATE OR REPLACE VIEW public.team_conversations WITH (security_invoker=true) AS
SELECT avatar_url, created_at, created_by, id, name, type, updated_at, department_id, metadata
FROM zapp.team_conversations;

GRANT SELECT ON public.team_conversations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.team_conversations TO service_role;

COMMIT;
