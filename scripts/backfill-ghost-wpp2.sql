-- ============================================================================
-- BACKFILL da janela cega do incidente "instância fantasma" (wpp2, 2026-07-04)
-- ============================================================================
-- Contexto: entre 2026-07-03 16:40 UTC (queda da wpp2 com 401) e o re-scan do
-- QR (runbook docs/EVOLUTION_API_AUDIT_2026-07-04_sessao5_wpp2.md §4), as
-- mensagens da linha (11) 4637-5517 foram gravadas no banco NATIVO da Evolution
-- (PG14, database `evolution`) sob a instância fantasma
-- (Instance.name = 'd8e07e44-1aac-45a2-a1d9-bebe1deeb355') e NÃO no espelho
-- evo.evolution_messages_wpp2 (PG15/Supabase).
--
-- QUANDO RODAR: logo após o passo 4 do runbook (re-scan concluído).
--
-- ⚠️ ATUALIZAÇÃO 04/07 11:35 UTC: a fantasma foi deletada às 11:27 com CASCADE
-- no PG14 (FASE A retorna 0 linhas — as mensagens da janela existem apenas no
-- aparelho; recuperar via "Sincronizar Histórico" no card da conexão após o
-- re-pareamento). Verificado também: 0 resíduos nas partições _default do
-- espelho. Este script permanece como TEMPLATE para qualquer incidente futuro
-- da mesma classe (instância paralela capturando eventos da linha).
--
-- COMO RODAR (2 fases, cross-database):
--
--   FASE A — exportar do PG14 (container postgres_postgres.1):
--     docker exec -u postgres <postgres14> psql -d evolution -c "\copy (
--       SELECT json_build_object(
--         'message_id',   m.key->>'id',
--         'remote_jid',   m.key->>'remoteJid',
--         'from_me',      (m.key->>'fromMe')::boolean,
--         'message_type', m."messageType",
--         'content',      COALESCE(m.message->>'conversation',
--                                  m.message->'extendedTextMessage'->>'text',
--                                  m.message->'imageMessage'->>'caption',
--                                  m.message->'videoMessage'->>'caption'),
--         'created_at',   to_timestamp(m."messageTimestamp"),
--         'payload',      m.message
--       )
--       FROM \"Message\" m
--       JOIN \"Instance\" i ON i.id = m.\"instanceId\"
--       WHERE i.name = 'd8e07e44-1aac-45a2-a1d9-bebe1deeb355'
--     ) TO '/tmp/ghost_wpp2_msgs.jsonl'"
--     e copiar o arquivo para o container do PG15 (docker cp via host).
--
--   FASE B — importar no PG15 (container supabase_db):
--     psql -d postgres -c "CREATE TEMP TABLE _ghost_stage (doc jsonb);"
--     psql -d postgres -c "\copy _ghost_stage FROM '/tmp/ghost_wpp2_msgs.jsonl'"
--     e então executar o bloco abaixo.
--
-- Idempotente: ON CONFLICT DO NOTHING (re-execução segura).
-- ============================================================================

BEGIN;

INSERT INTO evo.evolution_messages_wpp2 (
  id, message_id, remote_jid, from_me, message_type, content,
  payload, created_at, conversation_id, direction, status, instance_name
)
SELECT
  gen_random_uuid(),
  doc->>'message_id',
  doc->>'remote_jid',
  (doc->>'from_me')::boolean,
  COALESCE(doc->>'message_type', 'conversation'),
  doc->>'content',
  doc->'payload',
  (doc->>'created_at')::timestamptz,
  c.id,                                            -- conversa existente (mesmo remote_jid)
  CASE WHEN (doc->>'from_me')::boolean THEN 'outbound' ELSE 'inbound' END,
  'delivered',
  'wpp2'
FROM _ghost_stage s
LEFT JOIN evo.evolution_conversations_wpp2 c
  ON c.remote_jid = s.doc->>'remote_jid'
WHERE doc->>'message_id' IS NOT NULL
ON CONFLICT DO NOTHING;

-- Eventos capturados pela mitigação (webhook habilitado na fantasma 04/07
-- ~10:51 UTC) caíram nas partições DEFAULT com o nome da fantasma — realocar:
-- (particionamento por LIST(instance_name): UPDATE do instance_name move a
--  linha da partição _default para a partição _wpp2 automaticamente)
UPDATE evo.evolution_messages
   SET instance_name = 'wpp2'
 WHERE instance_name = 'd8e07e44-1aac-45a2-a1d9-bebe1deeb355';

UPDATE evo.evolution_conversations
   SET instance_name = 'wpp2'
 WHERE instance_name = 'd8e07e44-1aac-45a2-a1d9-bebe1deeb355';

UPDATE evo.evolution_webhook_events
   SET instance_name = 'wpp2'
 WHERE instance_name = 'd8e07e44-1aac-45a2-a1d9-bebe1deeb355';

COMMIT;

-- Verificação pós-backfill:
--   SELECT count(*), min(created_at), max(created_at)
--     FROM evo.evolution_messages_wpp2
--    WHERE created_at BETWEEN '2026-07-03 16:40+00' AND now();
--   (comparar com a contagem exportada na FASE A)
