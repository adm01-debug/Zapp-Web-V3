-- Defesa em profundidade (auditoria sessão 6, 2026-07-05) para a classe de bug do
-- incidente S5-1 ("instância fantasma"): em 2026-07-04 o front-end enviou o UUID interno
-- da instância (`whatsapp_connections.instance_id`) no lugar do `instance_name` legível
-- ao chamar a Evolution API, que respondeu 404 e a edge function `evolution-api`
-- auto-criou uma instância NOVA cujo nome era literalmente o UUID
-- `d8e07e44-1aac-45a2-a1d9-bebe1deeb355` — essa instância ficou fora de todo o pipeline
-- (RabbitMQ, webhook, registry, espelho `evo.*`), invisível ao dashboard.
--
-- O PR daquela sessão corrigiu isso na camada de aplicação (helper
-- `src/lib/evolutionInstance.ts` + guard server-side em
-- `supabase/functions/evolution-api/index.ts` que rejeita `create-instance`/`connect`
-- quando o nome tem formato UUID). A revisão de código desta sessão (workflow
-- adversarial, ver docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6.md §7) encontrou
-- indícios de que o mesmo padrão de bug (UUID usado onde deveria ser o nome) ainda
-- aparece em outros pontos do código (ex.: `qrcode.updated` no webhook, ações
-- connect/status/disconnect no proxy REST) — a guarda de aplicação sozinha não é
-- suficiente para garantir que NENHUM caminho, presente ou futuro, volte a criar uma
-- instância fantasma.
--
-- Este CHECK constraint torna a regra "instance_name nunca pode ter formato UUID"
-- garantida pelo banco, independente de qual camada de aplicação (ou bug futuro) tente
-- inserir/atualizar a linha. Verificado sem violações nos dados existentes antes de
-- aplicar; testado ao vivo com o UUID real do incidente S5-1
-- (`d8e07e44-1aac-45a2-a1d9-bebe1deeb355`) — o INSERT é corretamente rejeitado.

ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_instance_name_not_uuid
  CHECK (instance_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  NOT VALID;

ALTER TABLE public.whatsapp_connections
  VALIDATE CONSTRAINT whatsapp_connections_instance_name_not_uuid;
