-- Fix pos-9348e7ab4: as 11 views de contrato zapp.evolution_* com
-- security_invoker=true exigem grant de authenticated nas TABELAS evo.*
-- (senao: permission denied — front cego, ocorrido 2x em 2026-08-16).
-- Arquitetura final correta:
--   view (invoker=true) -> grant na base -> RLS ativa filtra por auth.uid().
-- Validado com JWT real: usuario ve 11 contatos (policies filtrando),
-- role puro sem JWT ve 0 (deny), anon negado.
-- I5 redefinido: conta grants de authenticated apenas em relations evo SEM RLS
-- (com RLS, grant e pre-requisito do padrao, nao vazamento).

GRANT SELECT, INSERT, UPDATE, DELETE ON
  evo.evolution_contacts,
  evo.evolution_messages, evo.evolution_messages_wpp2, evo.evolution_messages_default,
  evo.evolution_conversations, evo.evolution_conversations_wpp2, evo.evolution_conversations_default,
  evo.evolution_conversations_financeiro, evo.evolution_conversations_compras,
  evo.evolution_conversations_logistica, evo.evolution_conversations_marketing
TO authenticated;

-- I5 na fn_boundary_audit: adicionar "AND NOT c.relrowsecurity"
-- (aplicado em prod via CREATE OR REPLACE em 2026-08-16 10:36 -03; ver fn no banco)
