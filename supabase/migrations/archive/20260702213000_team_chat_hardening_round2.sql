-- 20260702213000_team_chat_hardening_round2.sql
-- Gaps da validacao exaustiva pos-PR#112 (2026-07-02). Idempotente. Ja aplicado em producao.
--   G1: zapp.team_conversation_members.joined_at era NOT NULL SEM default ->
--       insert do frontend ({conversation_id, profile_id}) falharia com 23502.
--   G2: public.team_messages.message_type era NOT NULL SEM default (schema drift:
--       migration original 20260402130912 definia DEFAULT 'text') ->
--       useSendTeamMessage falharia com 23502.
--   G4: public.team_conversations e uma VIEW; views nao emitem eventos realtime.
--       Tabelas base zapp.* adicionadas a publication supabase_realtime.

BEGIN;

ALTER TABLE zapp.team_conversation_members ALTER COLUMN joined_at SET DEFAULT now();

ALTER TABLE public.team_messages ALTER COLUMN message_type SET DEFAULT 'text';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='zapp' AND tablename='team_conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.team_conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='zapp' AND tablename='team_conversation_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.team_conversation_members;
  END IF;
END $$;

COMMIT;
