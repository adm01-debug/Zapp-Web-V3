# PLANO EXAUSTIVO DE IMPLEMENTAÇÃO/CORREÇÃO — 100 ETAPAS

> **Base:** consumo direto dos achados de `PLANO_QA_ANALISE_100.md`. Cada etapa é acionável, tem responsável identificado (agente vs. humano) e um critério de aceitação verificável.
>
> **Regra dura:** nenhuma etapa deste plano é considerada `done` até que (a) exista teste automatizado que a valide, (b) gate correspondente esteja habilitado no CI (sem `|| true`), (c) exista rollback documentado.
>
> **Nota Lovable bot:** commits diretos em `main` a ~1/70s. Todas as etapas que tocam arquivos protegidos vão via PR humano; arquivos que a Lovable pode sobrescrever ficam em `.lovableignore` antes de qualquer mudança.

---

## Tema 1 — Higienização do repositório (1-10)

1. **Deletar `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`** (17 B, lixo em `main`).
2. **Adicionar `__pycache__/`** ao `.gitignore` + `git rm -r --cached __pycache__/`.
3. **Mover `ci_cost_analysis.py`** → `scripts/analysis/ci_cost_analysis.py`.
4. **Mover `gen_insert.cjs`** → `scripts/dev/gen_insert.cjs`.
5. **Mover `lgpd_deploy.sql`** → `supabase/migrations/20260517000000_lgpd_deploy.sql` (data histórica de aplicação).
6. **Mover 8 relatórios** da raiz (`audit-summary.md`, `RLS_AUDIT_REPORT.md`, `VALIDATION_REPORT_PHD.md`, `REGRESSION_SIMULATION_REPORT.md`, `evolution-api-audit-report.md`, `auditoria_tabelas_zapp.md`, `auditoria-edge-functions.md`, `health-check-banco-2026-07-30.md`) → `docs/audits/history/`.
7. **Deletar `playwright.e2e.config.fixed.ts`** (duplicata do canônico `playwright.e2e.config.ts`).
8. **Consolidar 5 pastas de teste**: matar `src/__tests__/`, `src/test/`, `src/tests/`, `tests/`; padrão único = `src/**/__tests__/` para unit + `e2e/` para Playwright.
9. **Deletar `supabase/functions-legacy/`** (código morto conforme nome; fazer grep de imports antes).
10. **Mover ou deletar `supabase/fatorx-migrations/`** — não pertence a este projeto; migrar para o repo `fator-x` correspondente.

**Critério de aceitação do tema:** `ls -la` na raiz não mostra arquivos "soltos" fora do padrão; `bun run check` passa; PR com dif ≥ 20 arquivos deletados.

## Tema 2 — Gates de CI e qualidade (11-20)

11. **Remover `|| true`** de `"lint"` em `package.json`.
12. **Reduzir `--max-warnings 999`** para `--max-warnings 0` em `"lint"`; corrigir warnings iterativamente em PRs pequenos.
13. **Remover `|| true`** de `check-design-system.ts --ci` em `"lint"`.
14. **`typecheck` obrigatório** no pre-commit (`.husky/pre-commit`) — hoje só valida `types:check`.
15. **`check:schema` obrigatório** em cada PR via workflow `.github/workflows/quality-gate.yml`.
16. **`test:coverage:ratchet`** bloqueia PR que reduz coverage > 0,2 pp.
17. **`perf:budget`** como job obrigatório com baseline em `perf-baseline.json`.
18. **`smoke:pre-deploy`** como gate antes de `vercel deploy` prod.
19. **`gitleaks`** em PR check (config `.gitleaks.toml` já existe).
20. **CODEOWNERS** para `.lovableignore`, `supabase/migrations/`, `src/integrations/supabase/**` → requer aprovação humana explícita.

**Critério:** rodar `bun run check` em PR sujo (com erro proposital) deve reprovar.

## Tema 3 — Segurança Supabase — SECURITY DEFINER e views (21-35)

21. **Revogar EXECUTE** de `authenticated` nas 429 funções SECDEF em `zapp.*` que não precisam ser públicas — script `supabase/security/revoke-secdef-authenticated.sql` gera as revogações a partir do resultado do advisor.
22. **Revogar EXECUTE** de `authenticated` nas 506 SECDEF nos outros schemas (`evo`, `ops`, `bpm`, `ai`, `email_app`, `vendas`, `financeiro`, `artes`, `logistica`, `public`).
23. **Whitelist de RPC pública** — `docs/security/rpc-public-whitelist.md` lista o que fica público (`fn_send_message`, `rpc_get_contact`, etc.) com justificativa; auto-fix cron `secdef-search-path-guard` (165) reverte drift.
24. **`SET search_path = pg_catalog, public`** em TODAS as SECDEF via migration em lote — trigger em `pg_proc` para novas SECDEF sem search_path fixo.
25. **`security_invoker=on`** nas 30+ views listadas em `views_security_invoker` (public, evo, ops); cron `security-invoker-daily-audit` (151) + `autofix-security-invoker` (197) já operam — validar cobertura.
26. **Auditar policies RLS**: catalogar toda policy `USING true` como permissiva; converter em restritiva por `empresa_id` ou `workspace_id`.
27. **Trigger de audit imutável** em `zapp.audit_logs` (histórico de bug: bypass permitia UPDATE) — verificar CHECK que impede `OLD IS DISTINCT FROM NEW`.
28. **Rate-limit em RPCs sensíveis** — `fn_send_message`, bulk ops — via `pgmq` + guard function.
29. **Rotacionar service role** — se `SUPABASE_SERVICE_ROLE_KEY` foi exposto em qualquer log/PR antigo (histórico do repo indica sim); atualizar Vault, Portainer secrets, Vercel.
30. **`pgAudit`** ativado para todas as funções SECDEF críticas.
31. **`storage.objects` RLS**: revalidar policies dos buckets `evolution-media`, `contact-avatars`; garantir separação por `empresa_id`.
32. **CHECK constraints LGPD** em campos CPF/CNPJ (regex `^\d{11}$` / `^\d{14}$`); NULL permitido apenas quando consent = false.
33. **`pgsodium`** habilitado (v3.1.8 já instalado) para colunas CPF, telefone secundário, e-mail alternativo.
34. **Trigger em `auth.users`** que audita mudança de role, e-mail, banned; grava em `zapp.audit_logs`.
35. **RLS em `_backups`** — hoje sem policies; adicionar policy restritiva ao role `postgres` apenas.

**Critério:** `supabase_get_advisors` com `min_severity=warn` cai de 935 para < 50.

## Tema 4 — Performance de banco (36-45)

36. **Índice composto** `CREATE INDEX CONCURRENTLY idx_msgs_status_created ON zapp.messages (status, created_at DESC) WHERE deleted_at IS NULL;` — elimina os 40 s/dia gastos nas 3 top queries `pgrst_source`.
37. **REINDEX CONCURRENTLY** das 23 partições antigas de `zapp.messages` (janela: madrugada domingo, cron novo).
38. **LIMIT default no PostgREST** — variável `PGRST_MAX_ROWS=1000` no container Postgrest; validar que UI passa `Range` header sempre.
39. **View materializada** `zapp.mv_messages_pending_by_contact` para substituir o full scan do PostgREST em queries de "pendentes por contato".
40. **`cache-warmup-after-vacuum`** (cron 139) — validar que pré-aquece `zapp.messages` e `evo.evolution_messages` após o vacuum.
41. **EXPLAIN ANALYZE** das 15 top queries → gerar `docs/audits/query-plans/YYYYMMDD.md`.
42. **`statement_timeout = 30s`** no role `authenticator` (usado pelo PostgREST); role `service_role` mantém 5 min.
43. **Consolidar cron duplicados**: unir `evo_cleanup_expired_contact_ids` (189) e `cleanup_expired_contact_ids` (190).
44. **`ANALYZE` explícito** em `zapp.messages` e `evo.evolution_messages` a cada 2 h (já existe cron 117 diário — reduzir para 6 h).
45. **Auto-partition mensal**: cron `auto-create-monthly-partitions` (64) — validar geração de partições 2026-09 a 2027-08.

**Critério:** `pg_stat_statements` mostra a query `pgrst_source` em `zapp.messages` com média < 200 ms.

## Tema 5 — Consolidação de cron jobs (46-55)

46. **Catálogo canônico** — `docs/cron-catalog.md` lista 149 jobs com `owner`, `SLO`, `depende de`, `alerta em`.
47. **Deduplicar** `evo_cleanup_expired_contact_ids` (189) + `cleanup_expired_contact_ids` (190); merge.
48. **Redistribuir vacuums**: hoje 5 jobs rodam entre 2:06 e 2:35 (`vacuum-alerts-daily` 133, `vacuum-bootstrap-log-daily` 135, `vacuum-connection-history-daily` 136, `vacuum-burnin-tracker-daily` 183, `vacuum-pipeline-health-log-daily` 184) — espalhar para 2:00, 2:15, 2:30, 2:45, 3:00.
49. **Tag `owner` e `feature`** em cada job via comentário SQL — script scan em `pg_get_functiondef` do handler.
50. **Melhorar `cron-guardian`** (180) — hoje só checa "cron rodou" mas não "cron produziu output esperado".
51. **Alerta em cron ausente** — se cron não rodou em `2 × intervalo esperado`, trigger para `ops-notify-critical-alerts` (84).
52. **Dashboard de cron health** — criar `AdminCronHealthPage.tsx` consumindo `cron.job_run_details` + `cron.job`.
53. **Rate-limit em `pg_net`** para jobs que chamam Evolution API (`evo-401-glitchtip-feed` 161, etc.) — hoje sem cap, pode saturar link em burst.
54. **Backup antes de purges destrutivas** — `purge-processed-webhook-events` (54), `purge_webhook_audit` (61), `purge-webhook-audit-log-90d` (209): snapshot para R2 antes de DELETE.
55. **SLO por cron** — `docs/slo/cron-slo.md` define P0/P1/P2 e RPO por cron.

**Critério:** deploy do Postgres não gera "conflito de vacuum" nos logs; janela de manutenção documentada.

## Tema 6 — Frontend — Router, navegação, arquitetura (56-65)

56. **Consolidar pages e subpastas homônimas** — `AdminAlertHistoryPage.tsx` + `admin-realtime-monitor/` (subpasta) → padronizar em pasta com `index.tsx`, `parts.tsx`, `hooks.ts`, `__tests__/`.
57. **Convenção `src/pages/<slug>/index.tsx`** — migrar os 46 arquivos `.tsx` soltos em `src/pages/` para essa forma; barrel `src/pages/index.ts`.
58. **Pages órfãs** — cross-ref `lazyViews.ts` × arquivos em `src/pages/` — deletar as sem rota.
59. **Guards de rota por permissão** — `<RequirePermission scope="admin.webhooks:read">…` — hoje é feito em cada page individualmente.
60. **`lazyViews.ts`**: garantir prefetch das rotas críticas (`/inbox`, `/dashboard`) já no `App.tsx`.
61. **Prefetch de rotas críticas** via `react-router`'s `unstable_HistoryRouter` ou `preload()` manual em `main.tsx`.
62. **404 catch-all correto** — `NotFound.tsx` deve receber URL original em `location.state` para report ao Sentry.
63. **Error boundary por rota** — `react-error-boundary` já instalado; wrap em cada `AdminXPage`.
64. **Métricas de navegação** — `Sentry.addBreadcrumb` em cada mudança de rota.
65. **i18n em pages admin** — `i18next` + `react-i18next` já instalados; extrair strings hard-coded via script `scripts/i18n-extract.mjs`.

**Critério:** `src/pages/` tem apenas subpastas e um `index.ts` de barrel; nenhum `.tsx` solto.

## Tema 7 — Frontend — Auth, sessão, segurança (66-75)

66. **Cobertura E2E de auth** — 10 cenários (login, logout, refresh, magic link, SSO, 2FA setup, 2FA login, reset password, verify email, session hijack) — Playwright.
67. **Validar `cookieStorage.ts`** — regressão do bug histórico: chaves com `auth`/`token` silenciosamente descartadas.
68. **Validar `externalSessionBridge.ts`** — regressão do double-login.
69. **Auditar lockout escalation** — evitar bug do lockout counter (histórico).
70. **Unit test de token refresh** — mock supabase-js, garantir rotação limpa.
71. **Teste de invariante "token changed → sign out"** — property-based test com `fast-check` (já instalado).
72. **Auditar policy de `workspaces`** — histórico: policy `ALL` em vez de `SELECT`; validar que hoje é read-only para user comum.
73. **Rate limit visível no frontend** — em `LoginForm.tsx`, mostrar "tente novamente em N s" quando lockout.
74. **CAPTCHA em brute force** — `hCaptcha` invisível após 3 tentativas falhas.
75. **Log de auditoria de login** — grava em `zapp.audit_logs` (event=login_success/login_fail, IP, user agent).

**Critério:** 3.000/3.000 no fuzzer de autenticação (regressão da conquista anterior).

## Tema 8 — Frontend — Inbox e mensageria (76-85)

76. **Cobertura E2E por tipo de mensagem** — texto, imagem, vídeo, áudio, doc, sticker, poll, PTV, location, contact card.
77. **Cobertura de recepção real-time** — 2 clientes simultâneos, validar fanout WebSocket.
78. **Cobertura de reactions real-time** — 2 clientes reagindo à mesma mensagem, garantir last-write-wins ou merge.
79. **Cobertura de edit/delete** — propagação para outros clientes + WhatsApp + soft-delete em `zapp.messages`.
80. **Cobertura de forward** — 50 destinos, verificar que não estoura DLQ.
81. **Fallback UI para Evolution 401** — banner "instância desconectada, reconectar", CTA para `/connections`.
82. **Retry visual** em `AdminFailedMessagesPage.tsx` — botão por linha + em lote.
83. **Virtualização** com `@tanstack/react-virtual` (já instalado) em conversa com > 500 mensagens.
84. **Otimistic UI + rollback** — mostrar mensagem imediatamente, marcar erro se ACK falhar em 15 s.
85. **Debounce em typing indicator** — 200 ms, cancelar ao enviar mensagem.

**Critério:** cenário de recepção de 100 mensagens/min por 5 min sem lag > 1 s no fanout.

## Tema 9 — Frontend — Admin e observabilidade (86-95)

86. **Layout admin compartilhado** — `AdminLayout.tsx` com sidebar, breadcrumb, filtros de data range comuns.
87. **Real-time em `AdminWebhookEventsPage`** — subscription em `evo.evolution_webhook_events_v2_*` (partição corrente).
88. **Filtro persistente** — localStorage por página admin (data range, severidade), com "reset" visível.
89. **Retry em lote** em `AdminFailedMessagesPage` — checkbox + "Retry N mensagens" com progress bar.
90. **Export CSV/XLSX** em toda tabela admin — `xlsx` já instalado.
91. **Filtros de data range consistentes** — componente único `<DateRangePicker>` reutilizado.
92. **Auto-refresh configurável** — dropdown 5s/30s/60s/off.
93. **Deep-link em cada row** — URL com filtros codificados, permite compartilhar.
94. **Sentry breadcrumb + tag** por página admin — facilita filtro no dashboard Sentry.
95. **Tooltip in-page** — cada card tem `?` explicando métrica (fonte, janela, cálculo).

**Critério:** operador consegue investigar bug de webhook em ≤ 3 cliques a partir do dashboard admin.

## Tema 10 — Infra, deploy, resiliência (96-100)

96. **Docker multi-stage** — reduzir imagem (hoje `Dockerfile` de 1226 bytes; pode conter tudo em `builder → nginx-alpine`); target < 80 MB.
97. **Nginx** — validar `nginx-prod.conf`: gzip on, brotli on (compilar módulo), `Cache-Control: public, max-age=31536000, immutable` para assets com hash.
98. **PWA / Service Worker** — revisar `vite-plugin-pwa`; Cache-First para assets hash-based, Network-First para `/api/*` e Supabase; skipWaiting em release.
99. **Vercel** — `vercel.json` review: `headers` para HSTS + CSP + Referrer-Policy; `redirects` para SEO; `rewrites` para SPA fallback.
100. **Deploy sentinel** — cron externo (não banco) que faz `curl` no `/health` a cada 5 min; alerta em SLO 99,5% mensal.

**Critério:** Lighthouse ≥ 90 em Performance / A11y / Best Practices / SEO em desktop e mobile.

---

## Sequência recomendada de execução

| Sprint | Foco | Temas | Duração alvo |
|---|---|---|---|
| S1 | Higiene + gates | 1, 2 | 3-5 dias |
| S2 | Segurança | 3 | 5-7 dias (400+ funções para tratar) |
| S3 | Performance banco | 4 | 3-4 dias |
| S4 | Cron consolidation | 5 | 3-4 dias |
| S5 | Frontend arch | 6 | 5-7 dias |
| S6 | Auth hardening | 7 | 3-5 dias |
| S7 | Inbox reliability | 8 | 5-7 dias |
| S8 | Admin UX | 9 | 5-7 dias |
| S9 | Infra release | 10 | 3-4 dias |

**Total:** ~35-50 dias de trabalho focado. Paralelizar S3+S4 (banco), S5+S6+S7 (frontend), S9 (infra) reduz janela.

## Padrão de PR

Cada etapa vira 1 PR com o padrão:
```
[QA-100 / Tema N / Etapa NN] título curto

## Contexto
Referência: docs/audits/PLANO_QA_ANALISE_100.md#etapa-NN

## Mudança
- ...

## Evidência
- Screenshot / query / test output

## Rollback
- ...

Closes #issue-number
```

## Bloqueios conhecidos

1. **Lovable bot commita em `main` a cada ~70 s.** Toda etapa que toca arquivo já em `.lovableignore` é segura; nova etapa que toca arquivo novo precisa PRIMEIRO adicionar ao `.lovableignore`, DEPOIS mexer.
2. **Branch protection ainda `enforcement_level=off`** — habilitar antes de S2 é pré-requisito para durabilidade.
3. **`supabase_apply_migration` bugado no self-hosted** (histórico). Usar `supabase_db_query` + INSERT em `supabase_migrations.schema_migrations` como workaround.

## Referências

- `docs/audits/PLANO_QA_ANALISE_100.md` (levantamento e testes que fundamentam este plano).
- `CLAUDE.md` (contexto operacional).
- `SECURITY.md`, `RLS_AUDIT_REPORT.md`, `VALIDATION_REPORT_PHD.md` (evidências históricas).
