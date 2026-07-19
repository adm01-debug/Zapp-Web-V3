> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# Finalização da migração Lovable Cloud → banco canônico (schema `zapp`)

**Data:** 2026-07-01 · **Padrão adotado:** (A) storage real em `zapp`/`public` + views de compatibilidade.

## Objetivo
Concluir a migração iniciada e não finalizada do CRM (Lovable Cloud) para o banco canônico self-hosted, **sem recarregar** o dump (que colidiria com o schema já existente) e **sem tocar** nos dados vivos (3.236 contatos, 17 perfis, domínios `evo`/`financeiro`/`vendas`).

## Diagnóstico (resumo)
- Dump Lovable = 146 tabelas em `public`, **não idempotente** (146 `CREATE TABLE` sem `IF NOT EXISTS`).
- Canônico já tinha o CRM em `zapp` (147 tabelas) + camada de views compat em `public`.
- Das 146 tabelas: 141 já existiam; **5 ausentes**; **40 colunas** faltando em 8 tabelas.

## O que foi aplicado (`supabase/migrations/…_finalizacao_sync_zapp.sql`)
| Seção | Conteúdo |
|---|---|
| 1 | +36 colunas em 6 tabelas (`instance_registry` fusão operador/slot+owner/api/proxy, etc.) |
| 2 | 5 views de compat recriadas (ordem preservada, `security_invoker=true` mantido) |
| 3 | 4 tabelas novas: `public.rls_denied_log`, `public.security_audit_logs`, `zapp.inbox_custom_scopes`, `zapp.dlq_audit_log` (+RLS, policies, views compat) |
| 3B | Tier 3 — `evo.evolution_health_logs` +4 colunas (aditivo) + view recriada |
| 4 | Trigger `trg_sync_online_status` (mantém `online_status` ↔ `is_online`) |
| 5 | Verificação transacional (rollback se algo faltar) |

## Guard de regressão (novo)
`scripts/check_schema_drift.sql` + `scripts/check-schema-drift.sh` verificam as 146 tabelas esperadas + colunas críticas contra o banco vivo (`zapp`/`public` + views compat) e **falham o CI** se algo sumir. Wire de CI em `.github/workflows/schema-drift.yml` (requer secret `DATABASE_URL`).

## Pontos de atenção (dívidas registradas)
1. **Segredo em texto:** `instance_registry.api_key` / `proxy_pass` como `text`. → migrar para `vault`/pgsodium.
2. `online_status` é derivado de `is_online` (fonte da verdade) via trigger — não escrever direto.
3. Tier 3 tocou o schema `evo` (cross-domain), apenas de forma **aditiva** (colunas de log).

## Verificação pós-aplicação: **15/15 OK** · drift = 0.
