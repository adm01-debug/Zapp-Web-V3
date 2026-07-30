# Database Health Audit — zapp-web-v3
# Generated: 2026-07-30 via Supabase MCP (produção)

## Resumo

| Métrica | Valor | Status |
|---------|-------|--------|
| PostgreSQL | 15.8 | ✅ |
| Tamanho total | 1,563 MB | ✅ |
| Cache hit ratio | 99.82% | ✅ Excelente |
| Conexões ativas | 4 de 37 | ✅ Saudável |
| Índices | 840 (134 MB) | ✅ |
| Índices não-usados | 0 | ✅ |
| RLS policies (zapp) | 701 | ⚠️ Verificar |
| Tabelas (zapp) | 321 | — |
| Views (zapp) | 406 | — |
| Functions (zapp) | 998 | — |
| FKs (zapp) | 173 | ✅ |

## Top 5 Tabelas por Tamanho

| Tabela | Tamanho | Linhas | Schema |
|--------|---------|--------|--------|
| webhook_events_processed | 96 MB | 202K | zapp |
| webhook_audit_log | 85 MB | 220K | zapp |
| evolution_messages_wpp2 | 64 MB | 57K | evo |
| evolution_contacts | 31 MB | 21K | evo |
| evolution_webhook_events | 22 MB | 40K | evo |

## Top 5 Tabelas por Referências FK

| Tabela | Referenciada por N tabelas |
|--------|---------------------------|
| evolution_contacts | 53 |
| profiles | 26 |
| users | 20 |
| whatsapp_connections | 14 |
| queues | 8 |

## Health Check Rápido

```sql
-- Conexões ativas (deve ser < 50)
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Locks pendentes
SELECT count(*) FROM pg_locks WHERE NOT granted;

-- Tabelas com bloat (> 30% desperdício)
SELECT schemaname, relname, 
       round(100 * (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)), 1) as dead_pct
FROM pg_stat_user_tables 
WHERE n_dead_tup > 1000 
ORDER BY dead_pct DESC 
LIMIT 10;
```

## Alertas

- ⚠️ `webhook_events_processed` (96 MB) + `webhook_audit_log` (85 MB) — 181 MB combinados.
  Considere particionamento por mês ou política de retenção.
- ⚠️ 701 RLS policies requerem auditoria manual — verificar policies sem `using_expr` adequado.
- ✅ Nenhum índice não-usado — manutenção em dia.
