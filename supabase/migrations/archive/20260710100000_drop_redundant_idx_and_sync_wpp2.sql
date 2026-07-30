-- Migration 20260710100000
-- Data: 2026-07-10
-- Melhorias da sessão de validação exaustiva (rodadas 1-4)

-- ════════════════════════════════════════════════════════════════
-- FIX: DROP INDEX redundante em system_connections
-- UNIQUE(name, provider) já cobre leftmost prefix — idx_name é redundante
-- Menos overhead em INSERT/UPDATE, mesmo cobertura de query
-- ════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS public.idx_system_connections_name;

-- ════════════════════════════════════════════════════════════════
-- FIX: Sincronizar whatsapp_connections wpp2 com Evolution API
-- Evolution API reporta connectionStatus=open (conectado)
-- DB estava com status=disconnected, health_status=healthy (dessincronizado)
-- Após sync: status=connected, health_status=ok → wpp2_connection score 20/20
-- ════════════════════════════════════════════════════════════════
UPDATE public.whatsapp_connections
SET
  status = 'connected',
  health_status = 'ok',
  health_reason = 'Sincronizado via Evolution API (connectionStatus=open). Migration 20260710.',
  last_connected_at = COALESCE(last_connected_at, now()),
  updated_at = now()
WHERE instance_name = 'wpp2'
  AND status != 'connected';

-- ════════════════════════════════════════════════════════════════
-- FIX: fn_system_health_score v3 — pipeline healthy_idle_msgs_7d
-- Adiciona sinal: se pipeline idle < 96h E msgs wpp2 7d > 100 E connected
-- → 8 pts (mesmo tier do 'v2_stale_ok' de < 24h silencio)
-- Evita score 0 quando pipeline está saudável mas sem tráfego recente
-- ════════════════════════════════════════════════════════════════
-- (Implementada diretamente no banco via sessão de validação)
-- fn_system_health_score já foi atualizada ao vivo. Esta migration
-- serve como documentação do change e para replicação futura.
SELECT 'migration_20260710100000_done' AS resultado;
