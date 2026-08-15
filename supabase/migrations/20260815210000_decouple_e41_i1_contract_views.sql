-- =============================================================================
-- E41 — Views de Contrato zapp → evo (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: criar/reforçar views em zapp.* apontando para evo.* com
-- security_invoker=on, permitindo que funções zapp.* acessem dados evo.*
-- via views (invariante I1 — sem referências diretas ao schema evo em código).
--
-- Views criadas/reforçadas:
--   zapp.evolution_messages         → evo.evolution_messages
--   zapp.evolution_contacts         → evo.evolution_contacts
--   zapp.evolution_conversations    → evo.evolution_conversations
--   zapp.evo_alerts                 → evo.evolution_alerts (alias: zapp.evolution_alerts é tabela física)
--   zapp.evolution_webhook_events_v2→ evo.evolution_webhook_events_v2
--   zapp.evolution_settings         → evo.evolution_settings
--   zapp.evolution_messages_wpp2_archive → evo.evolution_messages_wpp2_archive
--
-- Nota: zapp.evolution_alerts é tabela física — não pode ser substituída por view.
--       Usar zapp.evo_alerts para referenciar evo.evolution_alerts.
-- =============================================================================

-- 1. evolution_messages (raiz particionada — para SELECT/DML)
CREATE OR REPLACE VIEW zapp.evolution_messages
  WITH (security_invoker=on)
AS SELECT * FROM evo.evolution_messages;

COMMENT ON VIEW zapp.evolution_messages IS
  'View de contrato: zapp → evo.evolution_messages (security_invoker=on). '
  'E41 (2026-08-15): criada para isolamento I1 Fase 3. '
  'Acesso restrito: security_invoker=on — RLS da sessão aplicado.';

-- 2. evolution_contacts
CREATE OR REPLACE VIEW zapp.evolution_contacts
  WITH (security_invoker=on)
AS SELECT * FROM evo.evolution_contacts;

COMMENT ON VIEW zapp.evolution_contacts IS
  'View de contrato: zapp → evo.evolution_contacts (security_invoker=on). '
  'E41 (2026-08-15): criada para isolamento I1 Fase 3. '
  'Acesso restrito: security_invoker=on — RLS da sessão aplicado.';

-- 3. evolution_conversations (raiz particionada)
CREATE OR REPLACE VIEW zapp.evolution_conversations
  WITH (security_invoker=on)
AS SELECT * FROM evo.evolution_conversations;

COMMENT ON VIEW zapp.evolution_conversations IS
  'View de contrato: zapp → evo.evolution_conversations (security_invoker=on). '
  'E41 (2026-08-15): criada para isolamento I1 Fase 3. '
  'Acesso restrito: security_invoker=on — RLS da sessão aplicado.';

-- 4. evo_alerts (alias para evo.evolution_alerts — zapp.evolution_alerts é tabela física)
CREATE OR REPLACE VIEW zapp.evo_alerts
  WITH (security_invoker=on)
AS SELECT * FROM evo.evolution_alerts;

COMMENT ON VIEW zapp.evo_alerts IS
  'View de contrato: zapp → evo.evolution_alerts (security_invoker=on). '
  'Nome alias "evo_alerts" pois zapp.evolution_alerts é tabela física de monitoramento. '
  'E41 (2026-08-15): criada para isolamento I1 Fase 3. '
  'Acesso restrito: security_invoker=on — RLS da sessão aplicado.';

-- 5. evolution_webhook_events_v2 (tabela particionada por mês)
CREATE OR REPLACE VIEW zapp.evolution_webhook_events_v2
  WITH (security_invoker=on)
AS SELECT * FROM evo.evolution_webhook_events_v2;

COMMENT ON VIEW zapp.evolution_webhook_events_v2 IS
  'View de contrato: zapp → evo.evolution_webhook_events_v2 (security_invoker=on). '
  'E41 (2026-08-15): criada para isolamento I1 Fase 3. '
  'Acesso restrito: security_invoker=on — RLS da sessão aplicado.';

-- 6. evolution_settings
CREATE OR REPLACE VIEW zapp.evolution_settings
  WITH (security_invoker=on)
AS SELECT * FROM evo.evolution_settings;

COMMENT ON VIEW zapp.evolution_settings IS
  'View de contrato: zapp → evo.evolution_settings (security_invoker=on). '
  'E41 (2026-08-15): criada para isolamento I1 Fase 3. '
  'Acesso restrito: security_invoker=on — RLS da sessão aplicado.';

-- 7. evolution_messages_wpp2_archive (tabela standalone regular em evo)
CREATE OR REPLACE VIEW zapp.evolution_messages_wpp2_archive
  WITH (security_invoker=on)
AS SELECT * FROM evo.evolution_messages_wpp2_archive;

COMMENT ON VIEW zapp.evolution_messages_wpp2_archive IS
  'View de contrato: zapp → evo.evolution_messages_wpp2_archive (security_invoker=on). '
  'E41 (2026-08-15): criada para isolamento I1 Fase 3. '
  'Acesso restrito: security_invoker=on — RLS da sessão aplicado.';
