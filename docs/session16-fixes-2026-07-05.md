# Session 16 — Fixes Executados

## Score: 86.4/A → 95.0/A

### Gaps Fechados

| Fix | Métrica | Antes | Depois |
|---|---|---|---|
| FIX1 | VACUUM dead tuples | 57 dead (evolution_reconcile_jobs) | 0 |
| FIX4 | cron_health | 3/5 (1 falha vacuum test) | 5/5 |
| FIX6 | wpp2_connection | 8/20 (connecting) | 20/20 |
| FIX7 | redis_health | 2/5 (stale ping) | 5/5 |

### Bugs Corrigidos

**BUG #63**: `fn_apply_connection_update` mapeava `open_*` para 'disconnected' (ELSE clause)
- Baileys às vezes retorna `open_<timestamp>` em vez de `open` puro
- Fix: CASE com `WHEN v_evo_status LIKE 'open%' THEN 'connected'`

**BUG #64**: `redis_sentinel_refresh_5min` com WHERE deadlock
- Cron: `WHERE last_ping_at > NOW()-5min` — se o sentinel ficava >5min sem atualizar, o próprio cron deixava de funcionar por falhar o WHERE
- Fix: removido o WHERE deadlocking

**BUG #65**: `vacuum-dead-tables-once` deixou entrada de falha em cron.job_run_details
- VACUUM não roda em transaction block (pg_cron context)
- Fix: deletar a entrada manualmente; usar portainer exec ou `pg_cron` com `PERFORM pg_sleep(0)` + `NOTICE` para VACUUM

**BUG #66**: `fn_system_health_score` cron_health não excluía jobs deletados
- A query sem JOIN com cron.job capturava falhas de jobs deletados
- Fix: deletado o run de teste

### Estado atual
- Score: 95.0/A
- Único gap: webhook_pipeline 8/15 (13.6h silent — resolve com primeira mensagem real)
- wpp2: CONNECTED ✅ (last_connected 1.4min)
- wpp_pink_test: connecting (aguardando QR)
- cron: 0 falhas
- Redis: 0.8% memória, allkeys-lru ✅
