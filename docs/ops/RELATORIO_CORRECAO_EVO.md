# Relatório de Correção — Evolution API PostgreSQL
**Data:** 2026-08-07 | **Executor:** Claude Sonnet 4.6 + 5 Agents | **Sessões:** 3

## Resumo Executivo

Auditoria e remediação completa do banco PostgreSQL 15.8 que suporta a Evolution API (WhatsApp) na infraestrutura AtomicaBR. Executadas **90 etapas formais** de 100 planejadas (7 skipped/na, 3 pendentes estruturais fora do escopo do banco).

## Baseline: Antes × Depois

| Métrica | Antes | Depois | Δ |
|---|---|---|---|
| Tabelas Realtime | 69 | **12** | −83% decode WAL |
| Índices `evolution_contacts` | 25 / 26 MB | **14 / 14 MB** | −44% qtd, −46% tamanho |
| Razão índice:dados contacts | 2,4× | **1,27×** | ✅ meta <1,3× |
| Alertas abertos | 317 | **37** | −88% |
| Log level | fatal | **warning** | ✅ observabilidade restaurada |
| JIT | on | **off** | ✅ OLTP sem overhead |
| /dev/shm | 64 MB | **256 MB** | ✅ +300% |
| Pending irrecuperáveis | 12.522 | **1.692** | 10.864 marcados failed |
| Crôns de monitoramento | 0 | **5 ativos** | 5 alertas automáticos |

## Bugs Críticos Descobertos e Corrigidos

### BUG-01 — evolution_alerts.resolved GENERATED ALWAYS [CORRIGIDO]
5 funções de alerta falhavam silenciosamente. Fix: remover resolved dos INSERTs.
Funções corrigidas: fn_check_401_rate, fn_check_ack_stall, fn_auto_resolve_alerts,
fn_check_connection_saturation, fn_retention_webhook_partitions.

### BUG-02 — Partição julho com estimated_rows=0 [PREVENIDO]
36.647 linhas reais. DROP cancelado. ANALYZE aplicado.

### BUG-03 — media_cache.storage_path guarda base64 inline [PENDENTE]
133 MB TOAST, avg 438 KB/linha, max 14.6 MB/linha.
Fix necessário: migrar para MinIO.

### BUG-04 — DDL churn de policies RLS [PENDENTE ESTRUTURAL]
migrations não-idempotentes via supabase_admin a cada 6-8h.
Fix: requer acesso ao código Lovable/CI.

### BUG-05 — Messages pending irrecuperáveis [CORRIGIDO]
10.864 mensagens >7 dias marcadas como failed. 1.692 recentes aguardam wpp2.

## Crôns de Monitoramento Ativos

- check_401_rate: */15min — alerta se >500 hits 401/h
- check_ack_stall: */30min — alerta se ACK parar >60min
- auto_resolve_alerts: */30min — fecha alertas obsoletos
- check_connection_saturation: */5min — alerta se >80% max_connections
- retention_webhook_partitions: dia 1 de cada mês — limpa partições >3 meses

## Configurações do Postgres (stack 35, 2026-08-07)

- log_min_messages = warning (era fatal)
- log_min_duration_statement = 2000ms
- log_checkpoints = on
- log_lock_waits = on
- log_autovacuum_min_duration = 500ms
- log_temp_files = 0
- log_statement = ddl
- jit = off
- /dev/shm = 256MB (era 64MB)

## Pendentes Estruturais

1. CRITICAL: Migrations idempotentes — requer acesso ao código
2. HIGH: media_cache migrar base64 → MinIO (133 MB recuperáveis)
3. MED: wpp2 estabilização de sessão Baileys (22 desconexões/mês)
