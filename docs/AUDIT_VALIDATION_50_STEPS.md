# Plano de Validação — 50 Etapas (Auditoria PostgreSQL ZAPP)

**Data:** 2026-08-06  
**Instância:** self-hosted Supabase · PG 15.8 · `supabase.atomicabr.com.br`  
**Schema canônico:** `zapp`  
**Status geral:** ✅ **50/50 concluídas** · Guardrail 100/100

---

## Achados Críticos (P1)

| ID | Função | Problema | Resolução |
|----|--------|----------|-----------|
| **DB-01** | `fn_retry_stuck_messages` | Gravava `status='queued'` violando CHECK em 23 partições de `evo.evolution_messages` (~25 WARNINGs/ciclo do cron) | Migration `20260806100000`: status fixado para `'pending'` |
| **DB-02** | `fn_purge_api_key_from_logs` | Referenciava `evo.evolution_webhook_events` (inexistente) — tabela real é `evo.evolution_webhook_events_v2` (RANGE-partitioned) | Função atualizada in-place: UPDATE correto para `_v2` |
| **DB-03** | `fn_register_instance` | INSERT apontava para `evo.instance_registry` (inexistente) — correto: `zapp.instance_registry`. Tentativa de criar partição LIST em parent RANGE eliminada | Função atualizada in-place: INSERT para `zapp.instance_registry` |
| **AUDIT-GRANT-24** | `fn_toggle_user_meme_favorite(uuid, uuid)` | Overload `(uuid, uuid)` (OID 634544) sem `GRANT EXECUTE` para `authenticated`; overload `(uuid, bigint)` estava correto | Migration `20260806200000`: GRANT aplicado |

---

## Fase 0 — Preparação e Baseline (5/5)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 01 | Verificar versão PostgreSQL e confirmar instância self-hosted | PostgreSQL 15.8 · `supabase.atomicabr.com.br` · self-hosted Supabase | ✅ |
| 02 | Listar schemas presentes e contagem de objetos por schema | `zapp · evo · auth · bpm · email_app · ai · archive · financeiro · vendas · ops · public` | ✅ |
| 03 | Confirmar contagens de objetos por schema | `zapp`: 321 tabelas · 380 views · 1075 funções · 729 RLS policies · 100% RLS | ✅ |
| 04 | Confirmar acesso MCP ao Supabase self-hosted | `mcp__SUPABASE_SELF_HOSTED_-_MCP` · conexão validada com `apply_migration` | ✅ |
| 05 | Confirmar existência do schema `ops` e tabela `ops._infra_check_log` | Schema ops ativo · tabela de log com histórico de scores (85 → 85 → 100) | ✅ |

---

## Fase 1 — Diagnóstico Q-1 (Funções com Referências Inválidas) (7/7)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 06 | Executar Q-1 baseline sem strip de comentários e documentar falsos positivos | Regex em `pg_proc.prosrc` · 2 falsos positivos: comentários em `fn_register_instance` | ✅ |
| 07 | Confirmar que `evo.evolution_webhook_events` não existe | `to_regclass('evo.evolution_webhook_events') = NULL` · confirmado | ✅ |
| 08 | Confirmar que `evo.instance_registry` não existe | `to_regclass('evo.instance_registry') = NULL` · confirmado | ✅ |
| 09 | Confirmar que `evo.evolution_webhook_events_v2` é o parent RANGE real | `relkind='p'` (partitioned) · 14 partições mensais (2026-03 a 2027-06 + default) | ✅ |
| 10 | Confirmar que `zapp.instance_registry` existe (localização correta) | `to_regclass('zapp.instance_registry')` retorna OID válido · 23 instâncias | ✅ |
| 11 | Identificar falsos positivos do Q-1 como comentários SQL (não código executável) | Comentários `-- DB-03: ... evo.instance_registry ...` em `fn_register_instance` · não são referências executáveis | ✅ |
| 12 | Confirmar que Q-1 com strip de comentários retorna 0 objetos inválidos | `regexp_replace(prosrc, '--[^\n]*', '', 'g')` → 0 hits · guardrail score 100/100 | ✅ |

---

## Fase 2 — Diagnóstico Q-2 (Cron Jobs com Referências Inválidas) (3/3)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 13 | Listar todos os cron jobs registrados no schema `cron` | Jobs ativos: cron job 5 (`fn_retry_stuck_messages`) · `daily-infra-check` · demais jobs confirmados | ✅ |
| 14 | Executar Q-2: confirmar que nenhum cron job referencia objeto inexistente | Q-2 com strip de comentários em `cron.job.command` → 0 referências inválidas | ✅ |
| 15 | Confirmar cron `daily-infra-check` chama `ops.fn_check_reference_integrity()` às 08:00 | Schedule: `0 8 * * *` · próxima execução confirmada · cron USAGE restrito (correto) | ✅ |

---

## Fase 3 — DB-01: fn_retry_stuck_messages + fn_enqueue_message_dispatch (5/5)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 16 | Confirmar existência de `zapp.fn_enqueue_message_dispatch(uuid, text)` | OID localizado em `pg_proc` · assinatura: `(p_message_id uuid, p_instance text) → uuid` | ✅ |
| 17 | Verificar SECURITY DEFINER + search_path em `fn_enqueue_message_dispatch` | `SECURITY DEFINER · SET search_path = zapp, evo, public` · anti-duplicate guard · `direction='outbound'` guard | ✅ |
| 18 | Confirmar que `fn_retry_stuck_messages` não mais grava `status='queued'` | CHECK `evolution_messages_status_check` bloqueia 'queued' · função fixa com `status='pending'` | ✅ |
| 19 | Confirmar `fn_retry_stuck_messages` usa `FOR UPDATE SKIP LOCKED` | Anti-double-processing: execuções concorrentes do cron pulam linhas já bloqueadas | ✅ |
| 20 | Confirmar migration `20260806100000` aplicada e fn status=pending válido | 23 mensagens com `retry_attempt ≥ 3` · `eligible_retry = 0` (comportamento correto — máximo atingido) | ✅ |

---

## Fase 4 — DB-02: fn_purge_api_key_from_logs (3/3)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 21 | Verificar que `fn_purge_api_key_from_logs` referencia `evo.evolution_webhook_events_v2` | UPDATE correto · JSON label: `'evo.evolution_webhook_events_v2 (all partitions)'` | ✅ |
| 22 | Confirmar que referência antiga aparece apenas em comentários SQL | `-- evo.evolution_webhook_events` em comentário histórico · sem referência executável | ✅ |
| 23 | Confirmar sem erros de objeto inexistente na execução da função | Função compilada sem WARNING · Q-1 guardrail: 0 referências inválidas nessa função | ✅ |

---

## Fase 5 — DB-03: fn_register_instance (4/4)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 24 | Verificar que `fn_register_instance` INSERT alvo é `zapp.instance_registry` | Colunas: `instance_name, display_name, phone_number, department, responsible_name` · RETURNING id | ✅ |
| 25 | Confirmar criação de partições `evo.evolution_messages_<instance>` | LIST partition por instance_name em parent RANGE `evo.evolution_messages` · 23 partições confirmadas | ✅ |
| 26 | Confirmar criação de partições `evo.evolution_conversations_<instance>` | LIST partition por instance em parent RANGE `evo.evolution_conversations` · estrutura espelhada | ✅ |
| 27 | Confirmar que `fn_register_instance` NÃO cria partições de webhook events por instância | Parent `evo.evolution_webhook_events_v2` é RANGE por mês · LIST por instância incompatível · criação eliminada | ✅ |

---

## Fase 6 — CHECK Constraint & Domínio de Status (3/3)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 28 | Confirmar CHECK `evolution_messages_status_check` nas 23 partições | Constraint propagada de `evo.evolution_messages` (parent) para todas as 23 partições filhas | ✅ |
| 29 | Confirmar domínio válido do status de mensagens Evolution | `received · sent · delivered · read · deleted · pending · played · failed` — `queued` explicitamente inválido | ✅ |
| 30 | Confirmar que nenhuma linha tem `status='queued'` no banco | `SELECT DISTINCT status FROM evo.evolution_messages` → 0 linhas com 'queued' · domínio intacto | ✅ |

---

## Fase 7 — SECURITY DEFINER + search_path Explícito (4/4)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 31 | Confirmar que 713 funções do schema `zapp` têm `SECURITY DEFINER` | 713 de 1075 funções · 100% das funções de negócio · INVOKER apenas em views com `security_invoker=on` | ✅ |
| 32 | Confirmar que todas com SECDEF têm `SET search_path` explícito | 0 funções SECDEF sem search_path · proteção contra `search_path injection` | ✅ |
| 33 | Confirmar que funções críticas incluem `pg_catalog` no search_path | Pattern: `SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'` · resistência a sequestro de built-ins | ✅ |
| 34 | Confirmar funções INVOKER intencionais documentadas | Views com `security_invoker=on` em `zapp` → acesso a `evo.*` via credencial do chamador (intencional) | ✅ |

---

## Fase 8 — Row Level Security (3/3)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 35 | Confirmar 729 RLS policies ativas no schema `zapp` | 729 policies em `pg_policies` · todas confirmadas em `SELECT/INSERT/UPDATE/DELETE` | ✅ |
| 36 | Confirmar RLS habilitado em 100% das tabelas de `zapp` | 321 tabelas · `relrowsecurity=true` em todas · 0 tabelas sem RLS | ✅ |
| 37 | Confirmar RLS habilitado em 100% das tabelas de `evo` | 172 tabelas físicas · 100% com RLS · partições herdam RLS do parent | ✅ |

---

## Fase 9 — GRANT EXECUTE (Permissões para Authenticated) (4/4)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 38 | Confirmar GRANT EXECUTE em `rpc_app_bootstrap` para `authenticated` | Wrapper RPC SECDEF · GRANT confirmado · chamado no bootstrap da SPA | ✅ |
| 39 | Confirmar GRANT EXECUTE em `rpc_dashboard_init` para `authenticated` | Wrapper RPC SECDEF · GRANT confirmado · reduz round-trips do dashboard | ✅ |
| 40 | Confirmar ausência de USAGE de `authenticated` em schema `cron` | Restrição correta: apenas roles privilegiados acessam `cron` diretamente | ✅ |
| 41 | Aplicar GRANT EXECUTE em `fn_toggle_user_meme_favorite(uuid, uuid)` para `authenticated` | Migration `20260806200000` aplicada · overload (uuid,uuid) agora com GRANT · overload (uuid,bigint) já estava correto | ✅ |

---

## Fase 10 — Guardrail: ops.fn_check_reference_integrity (5/5)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 42 | Confirmar existência e corpo completo de `ops.fn_check_reference_integrity()` | Função SECDEF · retorna JSONB com `status, score, max_score, n_fn_obj, n_cron_fn, n_pend` | ✅ |
| 43 | Confirmar strip de comentários na guardrail: `regexp_replace(prosrc, '--[^\n]*', '', 'g')` | Elimina falsos positivos de referências em comentários SQL antes de executar Q-1/Q-2 | ✅ |
| 44 | Confirmar Q-2 integrado na guardrail com mesmo strip nos comandos cron | Mesmo `regexp_replace` aplicado em `cron.job.command` antes de scan de objetos | ✅ |
| 45 | Confirmar resultado live da guardrail: score 100, 0 pendências | `{"score":100, "n_pend":0, "n_fn_obj":0, "n_cron_fn":0, "status":"OK"}` · execução em tempo real | ✅ |
| 46 | Verificar histórico em `ops._infra_check_log`: progressão de score confirmada | Log: score `85 → 85 → 100` · timestamps confirmam aplicação das correções DB-01/02/03 | ✅ |

---

## Fase 11 — Particionamento & Realtime (2/2)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 47 | Confirmar `publish_via_partition_root=true` na publicação `supabase_realtime` | CDC via WAL emitido pela tabela raiz · subscriptions em partições ficam silenciosas (zero eventos) | ✅ |
| 48 | Confirmar que listeners Realtime usam tabela raiz, não partição | Correto: `schema:'evo', table:'evolution_messages'` (raiz) · nunca `evolution_messages_wpp2` (partição) | ✅ |

---

## Fase 12 — Mensagens Presas & Ciclo de Retry (2/2)

| # | Etapa | Detalhe | Status |
|---|-------|---------|--------|
| 49 | Confirmar que mensagens com `retry_attempt ≥ 3` não são retentadas | 23 mensagens com `retry_attempt = 3` · WHERE `retry_attempt < 3` exclui corretamente · `eligible_retry = 0` | ✅ |
| 50 | Criar e aplicar todas as migrations corretivas · documentar plano de 50 etapas | Migrations: `20260806100000` (status fix) · `20260806200000` (GRANT fix) · plano publicado como artefato e em `docs/` | ✅ |

---

## Migrations Aplicadas nesta Auditoria

| Arquivo | Timestamp | Descrição |
|---------|-----------|-----------|
| `20260806100000_fix_retry_stuck_messages_queued_status.sql` | 2026-08-06 10:00 | Fix DB-01: `fn_retry_stuck_messages` agora mantém `status='pending'` em vez de `'queued'` (inválido no CHECK das partições) |
| `20260806200000_fix_grant_toggle_meme_favorite_2arg.sql` | 2026-08-06 20:00 | Fix AUDIT-GRANT-24: `GRANT EXECUTE` no overload `(uuid, uuid)` de `fn_toggle_user_meme_favorite` para `authenticated` |

---

*Gerado por auditoria interna em 2026-08-06 — Claude Code (Sonnet 4.6) — schema: zapp · PG 15.8 self-hosted*
