# Follow-ups executados — 2026-07-11 (pós-auditoria 10/10)

## 1. R13 FINAL — arbitrado por Joaquim ("R13 puro")
- Encerrou ping-pong de 5 rounds entre sessões paralelas sobre fn_system_health_score
- Janela 1h SEM filtros de mensagem no cron_health; failures_24h vira informativo
- Comentário anti-regressão embutido no código da função
- Migration: `20260711121500_r13_final_arbitrated.sql` (commit 73a6981d)
- Validação em 1 chamada: `SELECT ops.fn_test_health_score_unmask()` => pass=true

## 2. R14 — self-heal de health_status no ramo no_change
- Causa raiz: debounce pós-restart + Evolution só emite connection.update em mudança
  => degraded preso para sempre (exigia UPDATE manual)
- Fix simétrico em fn_apply_connection_update e fn_reconcile_apply
- Testes C1 (cura) e C2 (debounce respeitado): PASS, com rollback
- Migration: `20260711123000_r14_health_selfheal_no_change.sql`
- Backups: ops._fn_backups tag 'pre-health-selfheal-fix'

## 3. Consumer base image v1 -> v2
- Janela com backlog 0; stop-first; transição ~2s; "ready — 17/17 filas vivas"
- Código idêntico (config evolution_consumer_v5_2 + patch v17 HMAC)
- Label audit: base-image-v2-refresh-20260711-r14-code-identical-via-config

## 4. Worker evolution-mcp v4.2.0 -> v4.2.1
- FIX: campo `version` ambíguo em evo_status/evo_dashboard/health
- Agora: `worker_version` (4.2.1) + `evolution_version` (real via GET / => 2.3.7)
- Deploy eee0ce5f9b2a4e53a0d5ccb950495a4d; dogfooding OK (evo_status via MCP)

## Estado final verificado
- Score 100.0/A+ (160/160), failures_1h=0, R13 arbitrado intacto, R14 vivo nas 2 fns
- wpp2 connected/ok/reason NULL; 17/17 filas 1 consumer; 0 sintéticos residuais

## Pendência humana (Joaquim)
- Fechar/alinhar a sessão paralela (risco nº1: pode sobrescrever o R13 de novo;
  a migration 20260711121500 é a defesa — idempotente, 3 variantes)
- Painel do uptime monitor externo (fonte dos 401 */5min via Traefik)
