-- ============================================================
-- MIGRATION: 20260710_proactive_maintenance.sql
-- Melhorias proativas para manter 100.0/A+ (160/160) a longo prazo
--
-- Contexto: Sistema processando 3476+ eventos/hora organicamente.
-- Com alto trafego, dead tuples e tamanho de tabelas crescem rapido.
-- Este script prevenira degradacoes de score antes que ocorram.
--
-- Itens executados:
-- 1. VACUUM ANALYZE em 4 tabelas criticas
-- 2. Purge + VACUUM FULL em zapp.webhook_audit_log (19.47MB → 4.47MB)
-- 3. Autovacuum ajustado: scale_factor 5% → 3% (triggers antes do threshold)
-- 4. Cron vacuum-messages-wpp2-2h criado (a cada 2h, mais protecao)
-- 5. Cron diario antigo substituido pelo cron de 2h
--
-- Score antes: 100.0/A+ (potencialmente em risco com crescimento)
-- Score depois: 100.0/A+ (com margem de seguranca ampliada)
-- ============================================================

-- ITEM 1: VACUUM ANALYZE nas tabelas de alto trafego
-- (executado manualmente - documentado aqui para rastreabilidade)
-- VACUUM ANALYZE evo.evolution_messages_wpp2;
-- VACUUM ANALYZE evo.evolution_contacts;
-- VACUUM ANALYZE zapp.webhook_events_processed;
-- VACUUM ANALYZE public.whatsapp_connections;

-- ITEM 2: Purge webhook_audit_log (linhas > 3 dias)
-- Reduces table size para dar mais margem ao threshold de 300MB
DELETE FROM zapp.webhook_audit_log
WHERE status='processed' AND created_at < NOW()-INTERVAL '3 days';

DELETE FROM zapp.webhook_audit_log
WHERE status='rejected' AND created_at < NOW()-INTERVAL '1 day';

DELETE FROM zapp.webhook_audit_log
WHERE status='duplicate' AND created_at < NOW()-INTERVAL '3 days';

-- VACUUM FULL para reclamar espaco fisico apos purge
-- VACUUM FULL ANALYZE zapp.webhook_audit_log;
-- (executado manualmente - 19.47MB → 4.47MB)

-- ITEM 3: Ajustar autovacuum para disparar em 3% (antes do threshold de score 5%)
-- evolution_messages_wpp2: tabela de maior risco (3476 eventos/h)
ALTER TABLE evo.evolution_messages_wpp2
  SET (autovacuum_vacuum_scale_factor = 0.03,     -- 3% (era 5% = nivel critico)
       autovacuum_analyze_scale_factor = 0.02,
       autovacuum_vacuum_cost_limit = 4000,        -- mais agressivo (era 2000)
       autovacuum_vacuum_cost_delay = 1);          -- mais rapido (era 2ms)

-- evolution_contacts: tabela secundaria de alto trafego
ALTER TABLE evo.evolution_contacts
  SET (autovacuum_vacuum_scale_factor = 0.03,
       autovacuum_analyze_scale_factor = 0.02,
       autovacuum_vacuum_cost_limit = 4000,
       autovacuum_vacuum_cost_delay = 1);

-- ITEM 4: Substituir cron diario por cron a cada 2h (muito mais protetor)
SELECT cron.unschedule('vacuum-messages-wpp2-daily');

SELECT cron.schedule(
  'vacuum-messages-wpp2-2h',
  '5 */2 * * *',  -- a cada 2 horas no minuto :05
  $$VACUUM ANALYZE evo.evolution_messages_wpp2; VACUUM ANALYZE evo.evolution_contacts;$$
);

-- VERIFICACOES POS-DEPLOY
-- 1. Autovacuum ajustado
SELECT relname, reloptions FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='evo' AND c.relname IN ('evolution_messages_wpp2','evolution_contacts')
  AND '0.03' = ANY(
    ARRAY(SELECT regexp_replace(v,'autovacuum_vacuum_scale_factor=','') FROM unnest(reloptions) AS v WHERE v ILIKE '%vacuum_scale%')
  );

-- 2. Cron de 2h ativo
SELECT jobname, schedule, active FROM cron.job WHERE jobname='vacuum-messages-wpp2-2h';

-- 3. Score ainda 100/A+
SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS still_100,
       fn_system_health_score()->>'grade'='A+' AS still_aplus;
