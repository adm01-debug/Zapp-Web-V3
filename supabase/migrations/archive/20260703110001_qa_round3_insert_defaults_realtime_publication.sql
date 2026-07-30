-- QA Round 3 (2026-07-03) - minas de INSERT + cobertura realtime (ja aplicado em prod; idempotente)
-- Metodologia: cruzamento de TODOS os 110 INSERTs do codigo (src + edge functions) contra
-- colunas NOT NULL sem default no banco. 8 minas reais confirmadas por simulacao (INSERT exato
-- do codigo em transacao rollback ANTES e DEPOIS do fix).

-- 1) Fluxos que QUEBRAVAM em producao (NOT NULL violation):
ALTER TABLE zapp.calls                  ALTER COLUMN started_at    SET DEFAULT now();      -- useCalls.ts (iniciar chamada)
ALTER TABLE zapp.connection_health_logs ALTER COLUMN checked_at    SET DEFAULT now();      -- edge connection-health-check
ALTER TABLE zapp.scheduled_messages     ALTER COLUMN status        SET DEFAULT 'pending';  -- useScheduledMessages (agendar msg)
ALTER TABLE zapp.conversation_tasks     ALTER COLUMN status        SET DEFAULT 'pending';  -- ConversationTasksPanel (criar tarefa); UI alterna pending<->completed
ALTER TABLE public.blocked_ips          ALTER COLUMN blocked_at    SET DEFAULT now();      -- BlockedIPDialogs (bloquear IP)

-- 2) Mesma classe, callers parcialmente cobertos (defaults semanticos seguros):
ALTER TABLE zapp.audio_memes            ALTER COLUMN use_count     SET DEFAULT 0;
ALTER TABLE zapp.automations            ALTER COLUMN trigger_count SET DEFAULT 0;
ALTER TABLE zapp.agent_achievements     ALTER COLUMN earned_at     SET DEFAULT now();

-- 3) Realtime: 9 tabelas REAIS de public.* assinadas pelo frontend via postgres_changes
--    mas ausentes da publication supabase_realtime (eventos nunca chegavam).
--    Guard idempotente: ALTER PUBLICATION ADD TABLE falha se ja presente.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs','contact_audit_log','hmac_selftest_audit',
    'password_reset_requests','rate_limit_logs','security_alerts','security_audit_logs',
    'user_roles','warroom_alerts']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- NOTAS DE AUDITORIA (verificado, sem acao):
-- * public.cookies_config e public.email_health_logs: RLS habilitado sem policies (deny-all).
--   Zero consumidores no app => comportamento conservador correto; policies especulativas evitadas.
-- * ~24 assinaturas realtime do frontend apontam para VIEWS public.* (views nao emitem
--   postgres_changes). Fix estrutural e' reapontar assinaturas para o schema base
--   (em andamento no branch fix/queues-realtime-base-schema).
-- * Colunas contact_id em zapp.* sem FK para evo.evolution_contacts: intencional
--   (producer externo Evolution API); auditoria de orfaos executada: 1 orfao (dado de
--   teste de 2026-05-04) removido; demais tabelas 100% integras.
