-- Migration: 20260711_v3_gin_indexes_rpc_fix
-- Autor: Claude (auditoria v3 -- 2026-07-11)
-- Scope: Banco Supabase (Evolution PostgreSQL 15.8)

-- ============================================================
-- MELHORIA 1a: Resolver alertas ddl_drop_alert
-- ============================================================
-- 30 alertas resolvidos via portainer_exec_container no banco Supabase
-- UPDATE evo.evolution_alerts SET resolved_at=NOW(), resolved_by='cleanup-20260711: ddl_drop CASCADE planeja...'
-- WHERE alert_type='ddl_drop_alert' AND resolved_at IS NULL;

-- ============================================================
-- MELHORIA 1b: Recriar indices GIN tsvector em evolution_messages
-- ============================================================
-- Causa: DROP INDEX IF EXISTS evo.idx_messages_content_search CASCADE (17:34:12 UTC)
-- dropou 23 indices GIN nas particoes via CASCADE
-- 
-- Solucao: criou-se cada indice individualmente nas 23 particoes com CONCURRENTLY
-- e registrou-se o indice pai via CREATE INDEX ON ONLY + ALTER INDEX ATTACH PARTITION
--
-- Particoes cobertas: artes, comercial_01..15, compras, default,
--   financeiro, gravacao, logistica, marketing, wpp2
--
-- Indice: gin(to_tsvector('portuguese', COALESCE(content, '')))
-- Tamanho total: 1768 kB (23 indices)
--
-- Para recriar em novo ambiente (idempotente):
-- CREATE INDEX IF NOT EXISTS idx_messages_content_search
--   ON ONLY evo.evolution_messages USING gin(to_tsvector('portuguese', COALESCE(content, '')));
-- Para cada particao <tbl>:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS <tbl>_to_tsvector_idx
--     ON evo.<tbl> USING gin(to_tsvector('portuguese', COALESCE(content, '')));
--   ALTER INDEX evo.idx_messages_content_search ATTACH PARTITION evo.<tbl>_to_tsvector_idx;

-- ============================================================
-- MELHORIA 1c: Fix rpc_search_messages default p_instance
-- ============================================================
-- Default anterior: 'wpp_pink_test' (instancia deletada em 09/07/2026)
-- Default novo: 'wpp2' (instancia ativa de producao)
CREATE OR REPLACE FUNCTION public.rpc_search_messages(
  p_query    text,
  p_instance text    DEFAULT 'wpp2',
  p_limit    integer DEFAULT 20
)
RETURNS TABLE(
  id           uuid,
  message_id   text,
  remote_jid   text,
  from_me      boolean,
  content      text,
  message_type text,
  created_at   timestamp with time zone,
  push_name    text,
  rank         real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'evo'
AS $function$
  SELECT m.id, m.message_id, m.remote_jid, m.from_me,
    m.content, m.message_type, m.created_at, m.push_name,
    ts_rank(
      to_tsvector('portuguese', COALESCE(m.content,'')),
      plainto_tsquery('portuguese', p_query)
    ) AS rank
  FROM evo.evolution_messages m
  WHERE (p_instance IS NULL OR m.instance_name = p_instance)
    AND m.content IS NOT NULL AND m.deleted_at IS NULL
    AND to_tsvector('portuguese', COALESCE(m.content,''))
        @@ plainto_tsquery('portuguese', p_query)
  ORDER BY rank DESC, m.created_at DESC
  LIMIT p_limit;
$function$;

-- ============================================================
-- MELHORIA 2: VACUUM ANALYZE evolution_messages_wpp2
-- ============================================================
-- 38 dead tuples (threshold=25, autovacuum nao trigou desde 10/07)
-- Executado via portainer_exec_container:
-- VACUUM ANALYZE evo.evolution_messages_wpp2;

-- ============================================================
-- MELHORIA 3: Fix grep -oP -> sed no entrypoint Evolution
-- ============================================================
-- BusyBox (Alpine) nao tem Perl-compatible grep (-P flag)
-- A linha: echo "... db_user=$(echo $URI | grep -oP '(?<=://)([^:]+)')" 
-- gera ruido: "grep: unrecognized option: P" nos logs
-- Fix: substituir por sed 's|.*://\([^:]*\).*|\1|'
-- Commitado em infra/evolution/docker-compose.evolution.yml (v3)
-- Aplicar no proximo redeploy planejado (sem rolling restart durante burnin)
