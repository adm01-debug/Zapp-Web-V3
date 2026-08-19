-- ============================================================================
-- AG-EX-01 — fix P0 PGRST204: evolution_messages.agent_id
-- Data: 2026-08-05 | Execução em produção autorizada
-- ============================================================================
-- PROBLEMA:
--   supabase/functions/_shared/evolution-webhook-messages.ts (handleOutgoingWhatsAppMessage)
--   enviava `agent_id: contact.assigned_to || null` no upsert de evolution_messages.
--   A coluna agent_id NÃO existe em evo.evolution_messages (nem na view public.evolution_messages),
--   o que fazia o PostgREST rejeitar o upsert com:
--     PGRST204 Could not find the agent_id column of evolution_messages in the schema cache
--   Consequência: mensagens OUTBOUND (fromMe) enviadas pelo operador NÃO persistiam.
--
-- EVIDÊNCIA (pg_catalog, 2026-08-05):
--   evo.evolution_messages: 52 colunas, SEM agent_id (verificado via pg_attribute)
--   public.evolution_messages (view): 12 colunas usadas no insert presentes, SEM agent_id
--   Nenhuma coluna agent_id em nenhuma tabela evolution_messages% de evo/public/zapp
--   (evolution_messages_artes, _comercial_*, _default, _v2, etc. — todas sem agent_id)
--
-- FIX APLICADO (código, não DDL):
--   Campo `agent_id` removido do upsert em evolution-webhook-messages.ts
--   (repo C:\zapp-web-v3 + arquivo deployado /home/deno/functions/_shared/evolution-webhook-messages.ts)
--   sha256 do arquivo corrigido: f32ecde0c576cf9805f2efb678b60a85d687002402a492bda5ed1614fb07b2c8
--   O agente da mensagem continua sendo rastreado em public.messages.agent_id (coluna que EXISTE).
--
-- GUARDA: se a coluna agent_id um dia for adicionada em evo.evolution_messages,
-- esta migration falha propositalmente para forçar revisão do código antes de
-- reenviar o campo (o webhook foi corrigido para NÃO enviar agent_id).
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_messages'
      AND a.attname = 'agent_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'AG-EX-01: coluna evo.evolution_messages.agent_id EXISTE — revisar supabase/functions/_shared/evolution-webhook-messages.ts (upsert foi corrigido para não enviar agent_id)';
  END IF;

  RAISE NOTICE 'AG-EX-01 OK: evo.evolution_messages sem coluna agent_id — webhook corrigido (upsert sem agent_id), mensagens outbound voltam a persistir';
END $$;
