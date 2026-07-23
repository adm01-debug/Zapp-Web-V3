Sessão 2026-07-22 — QA Exaustiva de Infraestrutura
===================================================

## Contexto
QA realizado diretamente no ambiente de produção AtomicaBR (VPS Docker Swarm).
144 containers auditados, 11 módulos testados, 7 bugs encontrados.

## Bugs Encontrados e Corrigidos

| # | Componente | Problema | Severidade | Ação |
|---|---|---|---|---|
| ~~BUG-A~~ | CrowdSec Bouncer | 7 dias sem atualizar decisões | 🔴 CRÍTICO | Restart aplicado |
| ~~BUG-B~~ | WAL Slot | `cainophile_s7fgrb36` congelado 278MB lag | 🔴 CRÍTICO | Supabase DB restartado |
| BUG-C | n8n | FK constraint violada em workflow_history | 🟠 ALTO | Pendente |
| BUG-D | Edge Function 404 | POST /rest/v1/contacts 404 | 🟠 ALTO | Pendente |
| ~~BUG-E~~ | Glitchtip | DB disconnect pós-deploy | 🟡 MÉDIO | Glitchtip restartado |
| ~~BUG-F~~ | Backups | Falso alarme (backups OK) | 🟡 MÉDIO | Investigado — FUNCIONANDO |
| BUG-G | bridge.js | Sem Express error handler | 🟢 BAIXO | Baixo risco |

## Configurações Evolution wpp2
- alwaysOnline: true ✅
- readMessages: true ✅
- readStatus: true ✅
- rejectCall: true ✅
- Webhook: desabilitado ✅

## Correções no Runtime
- Evolution API: 4 settings alterados (não persistem no repo)
- PostgreSQL: VACUUM ANALYZE, WAL slot removido
- Docker: Supabase DB, Realtime, Glitchtip, Bouncer restartados
- Hermes Cron: WAL monitor (15min) + Backup check (6h)

## Docs no Repositório
- infra/runbooks/OPERATIONS.md — Runbook completo
- infra/backup/README.md — Backup & restore
- infra/evolution/SETTINGS.md — Configs Evolution
- docs/QA_REPORT_2026-07-22.md — QA Report completo
