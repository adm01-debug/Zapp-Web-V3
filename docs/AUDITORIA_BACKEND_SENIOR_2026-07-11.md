# Auditoria Back-End Sênior — ZAPP Web
**Data:** 2026-07-11 • **Auditor:** Dev Sênior (PhD em BD) • **Baseline objetivo:** 0 erros TS · 2.649 testes verdes · 64 WARN no linter · 690 migrations · 124 Edge Functions

---

## 1. Sumário Executivo

O sistema está **operacionalmente estável** e supera os gates funcionais (chat abre, Evolution conectada, autenticação self-hosted validada). A auditoria sistêmica identifica **3 riscos altos**, **6 médios** e **8 baixos**, concentrados em: (i) superfície de RPC `SECURITY DEFINER` aceita mas não hardened, (ii) débito técnico do `@ts-nocheck` em 93 arquivos, (iii) ausência de observabilidade end-to-end no proxy externo, (iv) drift de contrato entre schema Lovable/Evolution e (v) falta de burn-in de 7 dias documentado em `INFRA.md`.

**Score consolidado:** **8.6/10** (produção-ready com débito controlado; não é 10/10 até fechar HIGH-1..HIGH-3).

---

## 2. Achados por Categoria

### 2.1 Segurança  🔴 Alta prioridade

| # | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| **HIGH-1** | Alta | **64 funções `SECURITY DEFINER` executáveis por `authenticated`** sem revoke explícito por função. Aceite documentado em `LINTER_0029_ACCEPTANCE_2026-07-11.md`, mas o aceite é *coletivo*. RPCs como `fn_create_transfer`, `rpc_dlq_retry_now`, `pause_instance`, `unpause_instance`, `manage_department_member` executam mutações sem `has_role()` **dentro da função** — dependem exclusivamente de RLS na tabela alvo. | `supabase--linter` (64 WARN 0029); leitura de `fn_accept_transfer`, `pause_instance`, `unpause_instance`, `manage_department_member` — nenhuma checa `has_role(auth.uid(),'admin')`. | Um `agent` autenticado pode chamar `pause_instance('wpp2','x',999)` e paralisar o pipeline; `manage_department_member` permite mover qualquer profile entre departamentos. | Adicionar guarda `IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;` no topo de: `pause_instance`, `unpause_instance`, `manage_department_member` (todas as sobrecargas), `fn_create_transfer`, `fn_accept_transfer`, `fn_complete_transfer`, `rpc_migrate_whatsapp_integration`. `rpc_dlq_*` e `rpc_list_failed_messages` já protegem — usar como referência. |
| **HIGH-2** | Alta | **`prevent_role_escalation` reverte silenciosamente** em vez de rejeitar. Um atacante interno consegue medir a diferença de latência entre revert e sucesso, e o log de tentativa não é emitido. | Função `prevent_role_escalation` faz `NEW.role := OLD.role` sem `PERFORM log_security_event`. | Bypass de auditoria em tentativa de escalada. | Trocar revert por `RAISE EXCEPTION` + `log_security_event('privilege_escalation_attempt', ...)` antes de abortar. |
| **HIGH-3** | Alta | **`notify_sicoob_on_reply` chama `extensions.http_post` com `Authorization: Bearer <service_role>` lido de `current_setting('app.settings.service_role_key')`**. Se essa GUC vazar em `pg_settings` ou log de crash, o service role é comprometido. | `notify_sicoob_on_reply` (linha `Authorization: 'Bearer ' \|\| current_setting('app.settings.service_role_key', true)`). | Comprometimento total do banco caso GUC seja logada. | Mover a chamada para um Edge Function assinado por HMAC (`sicoob-bridge-reply` já existe); o trigger deve apenas enfileirar em `pgmq` ou publicar em `pg_notify`. Alternativa mínima: usar `vault.decrypted_secrets` em vez de GUC. |
| MED-1 | Média | Edge Functions com `verify_jwt = false` implícito (padrão Lovable) — 124 funções. Nem todas validam JWT em código. | `ls supabase/functions/` (124), grep por `getUser`. | Endpoints anônimos podem ser abusados para negação de serviço/spam. | Auditar por função: manter `verify_jwt=false` apenas para webhooks assinados (HMAC) e adicionar `require-user` em todas as demais. |
| MED-2 | Média | `decrypt_gmail_token` usa `current_setting('app.encryption_key', true)` — mesmo padrão frágil de HIGH-3. | Função `decrypt_gmail_token`. | Chaves de OAuth podem vazar. | Migrar para `pgsodium` ou `vault.decrypted_secrets`. |
| LOW-1 | Baixa | `handle_new_user_role` atribui `'agent'` a **todo** novo usuário. Sem waitlist/aprovação. | Trigger em `auth.users`. | Convite espontâneo → acesso operacional. | Adicionar coluna `status='pending'` em `profiles` e bloquear RLS por `status='active'`. |

### 2.2 Performance & Escalabilidade  🟡 Média

| # | Severidade | Achado | Impacto | Recomendação |
|---|---|---|---|---|
| MED-3 | Média | `reassign_absent_agents` faz N+1 (loop de contatos dentro de loop de agentes) sem `LIMIT` externo. Em picos (>500 contatos órfãos) pode segurar transação por minutos. | Bloqueio de writes em `contacts`. | Reescrever como uma única `UPDATE ... FROM (SELECT ... ROW_NUMBER())` com CTE. |
| MED-4 | Média | Ausência de índice em `messages(contact_id, created_at DESC)` foi assumida — validar via `supabase--slow_queries`. Query em `messageRepository.fetchMessagesByContact` faz `ORDER BY created_at` com `range(0, 999)`. | Latência de abertura de chat cresce O(n) por contato. | `CREATE INDEX CONCURRENTLY idx_messages_contact_created ON public.messages(contact_id, created_at DESC);` — via `db/` (não em migration, por causa do `CONCURRENTLY`). |
| MED-5 | Média | `ExternalDbProxyClient.getAuthHeader` cacheia sessão por 30s, mas não invalida em `onAuthStateChange`. Após refresh de token, primeiras 30s usam token velho → 401 espúrio. | Falha intermitente após refresh. | Assinar `supabase.auth.onAuthStateChange` e zerar `cachedSession` em `TOKEN_REFRESHED`/`SIGNED_OUT`. |
| LOW-2 | Baixa | 690 migrations sem consolidação. `supabase db reset` local demora minutos. | DX ruim. | Criar snapshot mensal em `supabase/migrations-snapshot/` e mover as anteriores para `_archive/`. |

### 2.3 Confiabilidade & Contratos  🟡 Média

| # | Severidade | Achado | Impacto | Recomendação |
|---|---|---|---|---|
| MED-6 | Média | **93 arquivos com `// @ts-nocheck`** (baseline em `scripts/ts-nocheck-baseline.txt`). O ratchet impede *aumento*, mas não força redução. | Débito silencioso; refactors futuros pisam em minas. | Definir SLO: remover 5/semana; adicionar tarefa periódica no `quality-gate.yml`. |
| MED-7 | Média | `evolution-api/index.ts` filtrou `.eq('instance_id')` por meses antes do fix — falta contrato explícito. | Bugs silenciosos idênticos podem reaparecer. | Gerar tipos do schema (`supabase gen types typescript`) e importar `Database['public']['Tables']['whatsapp_connections']['Row']` em toda Edge Function que toca a tabela. |
| LOW-3 | Baixa | `rpc_migrate_whatsapp_integration` é um stub retornando `{success:true}` — pode ser chamado por qualquer authenticated. | Ruído em auditoria; falsa sensação de sucesso. | `DROP FUNCTION` ou proteger com `has_role('admin')`. |

### 2.4 Operabilidade & Observabilidade  🔵 Baixa/Média

| # | Severidade | Achado | Recomendação |
|---|---|---|---|
| MED-8 | Média | `external-db-proxy` não expõe métricas Prometheus/StatsD. Diagnósticos dependem de `console.log` no Deno. | Publicar counters via `client-observability` (contadores por `iss`, latência p95, taxa 401). |
| LOW-4 | Baixa | `pg_cron` jobs (171,172,173) sem alarme quando `SKIPPED`/`FAILED`. | Adicionar view `v_cron_health` + alerta no Grafana quando `last_run < now() - 2*schedule`. |
| LOW-5 | Baixa | Falta *chaos test* documentado: matar Rabbit por 60s, verificar retomada. | Playbook em `docs/runbooks/`. |

### 2.5 Custos

| # | Achado | Recomendação |
|---|---|---|
| LOW-6 | 124 Edge Functions — muitas ai-* raramente invocadas. Cold start × cobrança por invocação. | Consolidar `ai-*` em uma única `ai-router` com `action` no body. Reduz footprint e cache warm. |
| LOW-7 | `evo.evolution_webhook_events_v2` sem retenção agressiva (analytics). | Enforce `pg_partman` + drop > 90 dias. Já parcialmente coberto por `s4-4_analytics_retention.sql`. |

### 2.6 Manutenibilidade

| # | Achado | Recomendação |
|---|---|---|
| LOW-8 | Múltiplas sobrecargas de `manage_department_member`, `fn_accept_transfer`, `fn_transfer_comment`, `rpc_dlq_abandon`, `rpc_dlq_retry_now`. Cliente pode chamar assinatura errada. | Consolidar em UMA assinatura por RPC; deprecar as demais com `RAISE NOTICE 'deprecated'`. |

---

## 3. Roadmap Priorizado

### Sprint 1 (crítico — 3 dias)
1. **HIGH-1** — Migration adicionando `has_role()` guard nos RPCs de escrita listados.
2. **HIGH-2** — Trocar revert por `RAISE EXCEPTION` + log em `prevent_role_escalation`.
3. **HIGH-3** — Retirar `service_role_key` da GUC; migrar `notify_sicoob_on_reply` para `pg_notify` + Edge Function.
4. **MED-5** — Invalidar cache de sessão no `externalProxy` via `onAuthStateChange`.

### Sprint 2 (importante — 1 semana)
5. **MED-1/2** — Auditoria de `verify_jwt` por função; migrar segredos para Vault.
6. **MED-3** — Reescrita de `reassign_absent_agents` sem N+1.
7. **MED-4** — Índice em `messages(contact_id, created_at DESC)`.
8. **MED-6** — Plano de redução de `@ts-nocheck` (SLO 5/semana).
9. **MED-7** — Tipos gerados obrigatórios em Edge Functions que tocam tabelas.
10. **MED-8** — Métricas do `external-db-proxy` para Grafana.

### Sprint 3 (desejável — 2 semanas)
11. LOW-1..LOW-8 — Consolidação de RPCs, retenção, chaos test, waitlist de usuários, snapshot de migrations.

---

## 4. Benchmark de Mercado

| Dimensão | ZAPP Web | Padrão SaaS B2B (p50) | Padrão Enterprise |
|---|---|---|---|
| Cobertura de testes | 2.649 (unit/integration) + 60+ e2e | ~1.500 + 20 e2e | 5.000+ + 100 e2e |
| RLS coverage | 100% tabelas públicas | 60-80% | 100% |
| Migrations governance | 690 sem snapshot | snapshot trimestral | mensal + review obrigatório |
| Edge Function count | 124 | 20-40 | 50-80 (roteadas) |
| Observability (proxy) | logs estruturados, sem métrica | logs + p95 | logs + traces + p95/p99 + SLO |
| Secret storage | GUC + Vault híbrido | Vault | HSM/KMS + rotação automática |

**Conclusão comparativa:** ZAPP Web supera o p50 em RLS/testes, empata em migrations, e fica **atrás** em (a) governance de segredos e (b) consolidação de superfície de API. As correções da Sprint 1 fecham o gap crítico com Enterprise.

---

## 5. Referências
- OWASP Top 10 (2021) — A01 Broken Access Control (HIGH-1), A04 Insecure Design (HIGH-3), A09 Logging Failures (HIGH-2).
- Supabase Database Linter — [lint 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- PostgreSQL 15 — [SECURITY DEFINER best practices](https://www.postgresql.org/docs/15/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).
- `docs/security/LINTER_0029_ACCEPTANCE_2026-07-11.md` — aceite parcial vigente.
- `docs/security/RLS_HARDENING_PLAN.md` — plano existente (referenciado, não substituído).

---

*Este relatório é diagnóstico. Nenhuma alteração de código foi executada nesta rodada — os fixes propostos em HIGH-1..HIGH-3 devem ser aprovados antes de gerar as migrations correspondentes.*
