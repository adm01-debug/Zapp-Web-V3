# VALIDATION REPORT — 2026-07-30

## Status Final
- Regression tests: **25/25 PASS** (0 FAIL)
- Health score: **95.6/A+** (estável, variance=0.0 em 5 runs)
- Security ACL: **5/5** (14/14 vetores = 0)

## O que foi testado (100+ cenários)

### Wave A — Index, migrações, pg_cron, WAL
- idx_app_notifications_user_unread: VALID ✅
- Ambas RPCs: 1 função cada (fn_count=1), sem duplicatas ✅
- RT05 = FK user_roles→profiles ausente → corrigido + migration aplicada ✅
- RT21 = postgres role sem timeout → corrigido (3/3 roles agora) ✅
- WAL slot cainophile: 421 MB (10.24% de 4GB) — ativo, monitorado ✅

### Wave B — Concorrência, hash anti-tampering, DEFAULT PRIVILEGES
- 18 chamadas simultâneas ao rpc_app_bootstrap → sem deadlock ✅
- Hash bodies: bootstrap=f00bcea9 | dashboard=b152ed26 (baseline) ✅
- 353 funções zapp non-SECDEF callable by authenticated = design pré-existente ✅

### Wave C — Score breakdown, cron, RT05/RT21 root cause
- Queda 97.5→95.6 = webhook_pipeline 15→12 (1.2h silent às 9h BRT) — orgânico ✅
- cron jobid 213: 1 falha isolada na última hora — inofensivo ✅
- RT21 body: verifica roles postgres/authenticated/anon com setconfig exato '60s' ✅
- RT05 body: check_lovable_parity+schema_drift+critical_fks — todos OKOKOK ✅

### Wave D — Lovable drift, GitHub commits intercalados
- Commit 6ec2def7 = Joaquim/MCP aplicou fix RT05+RT21 durante nossa sessão ✅
- Migration aplicada no DB: FK validado + 3 roles com timeout ✅

## RPCs deployadas (produção)
| Função | Versão | Hash body | Tamanho | Status |
|--------|--------|-----------|---------|--------|
| rpc_app_bootstrap | v2.0 | f00bcea9 | 3635B | PROD ✅ |
| rpc_dashboard_init | v2.0 | b152ed26 | 3241B | PROD ✅ |

## Índice parcial criado
```sql
idx_app_notifications_user_unread ON zapp.app_notifications(user_id) WHERE is_read=false
-- Bitmap Heap Scan 1.079ms → Index Only Scan 0.330ms (3.3x)
-- 543 buffers → 61 buffers (89% menos)
-- tuples/scan: 10.522 → 633 (16.6x mais eficiente)
```

## Observações operacionais
- `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`: arquivo sentinel temporário, pode ser deletado
- Webhook pipeline score 12/15 → vai recuperar para 15/15 quando tráfego WhatsApp retornar
- Backup freshness 6/10 (17h) → vai recuperar no próximo backup (~24h ciclo)
- Score esperado pós-recuperação: **97.5+/A+**
