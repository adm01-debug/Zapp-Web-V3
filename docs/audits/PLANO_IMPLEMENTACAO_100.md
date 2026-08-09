> **Nota histórica**: Este documento refere-se ao banco 'FATOR X' (projeto Supabase `tdprnylgyrogbbhgdoik`), descomissionado em 2026-07-15. O termo foi mantido para rastreabilidade histórica.

# PLANO DE CORREÇÃO — populado durante a análise

> Documento vivo. Cada achado real da análise vira uma etapa aqui, com origem (etapa da análise), evidência (query/arquivo/log) e critério de aceite.
> **Correção é responsabilidade do próximo chat.**

Convenção de ID: `F<bloco>-<seq>` — ex. `F1-01` = primeiro achado do bloco 1 da análise.

**Total de achados até agora: 200** (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4 + 30 Bloco 5 + 30 Bloco 6 + 32 Bloco 7 + 17 Bloco 8 + 11 Bloco 9A + 8 Bloco 9B + 9 Bloco 10).

---

## Como ler um achado — campos de triagem (normalizados em 2026-08-02, Etapa 1 itens 3-5)

Cada achado traz, logo abaixo do título, até quatro campos:

| Campo | Para que serve |
|---|---|
| **Sev:** | Severidade normalizada. Presente nos 200. |
| **Depende de:** | Achado ou decisão que precisa vir antes. Executar fora de ordem desperdiça a sessão ou ativa bug latente. |
| **Raiz de:** | Achados que são sintoma deste. Corrigir a raiz costuma fechar vários de uma vez. |
| **Rollback:** | Código do procedimento de reversão (`R-POL`, `R-FN`, `R-VIEW`, `R-CRON`, `R-DDL`, `R-CODE`), detalhado na **Parte II do `PLANO_CORRECAO_20_ETAPAS.md`**. **Ausência do campo significa que a Ação não altera produção.** |

### Escala de severidade

Ordenada, do mais para o menos urgente:

| Classe | Significa | Qtd | % |
|---|---|---:|---:|
| `SEC` | Segurança ou LGPD: vazamento, RLS aberta, PII exposta, segredo legível, bypass de auth | 28 | 14,0% |
| `QUEBRADO` | Feature morta ou que mente: não executa, retorna vazio sempre, KPI falso | 46 | 23,0% |
| `RISCO` | Latente: funciona hoje e quebra sob condição — race, ausência de fallback, hardcode, falta de validação | 43 | 21,5% |
| `DEGRADADO` | Performance, custo ou UX ruins, **sem** perda de função | 34 | 17,0% |
| `HIGIENE` | Organização, dead code, lint, cobertura de teste, duplicata | 38 | 19,0% |
| — | Obsoletos — fora da esteira | 11 | 5,5% |

> A etiqueta antiga no título (`CRÍTICO (P0)` / `ALTO` / `MÉDIO` / `BAIXO`) foi **preservada para rastreabilidade mas não é mais canônica**. Ela estava inflacionada — 16 `CRÍTICO` em 30 achados só no F5 — e misturava naturezas incompatíveis (vazamento cross-tenant e lentidão de busca com a mesma etiqueta). **Ordene por `Sev:`.**

> **Leitura sugerida da esteira:** `SEC` e `QUEBRADO` primeiro, mas sempre checando `Depende de:` — 34 achados têm pré-requisito e 15 são raízes. As duas maiores raízes são **F6-04** (6 sintomas) e **F5-01** (5 sintomas): valem mais que qualquer achado isolado.

---

## Tema 1 — Higienização do repositório

> **Nota de revisão (2026-08-02, Lote C) — achados F1-\*.** F1-05 a F1-14 são **títulos-resumo sem `Evidência`/`Ação`/`Aceite`** (mesmo padrão do bloco F2). A substância de cada um foi revalidada abaixo/em `REVISAO_BACKLOG_172.md`, mas não são executáveis pela esteira enquanto Ação e Aceite não forem escritos. F1-01 a F1-04 têm Ação e foram confirmados: os 5 alvos existem na raiz e `scripts/` já existe.

### F1-01 — Deletar `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`
- **Sev:** `HIGIENE`
- **Rollback:** R-CODE
- **Ação:** `git rm ___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`.
- **Aceite:** arquivo ausente em `main`.

### F1-02 — Ignorar e remover `__pycache__/`
- **Sev:** `HIGIENE`
- **Rollback:** R-CODE
- **Ação:** adicionar `__pycache__/` e `*.pyc` ao `.gitignore`; `git rm -r --cached __pycache__`.

### F1-03 — Mover scripts soltos para `scripts/`
- **Sev:** `HIGIENE`
- **Evidência:** `ci_cost_analysis.py`, `gen_insert.cjs` na raiz.
- **Ação:** `mv` para `scripts/`. Atualizar `package.json`.

### F1-04 — Migrar `lgpd_deploy.sql` para `supabase/migrations/`
- **Sev:** `RISCO`
- **Rollback:** R-DDL
- **Ação:** renomear com timestamp; registrar em `supabase_migrations.schema_migrations`.

### F1-05 — Mover 8 relatórios `.md` da raiz para `docs/audits/history/`
- **Sev:** `HIGIENE`
- **⚠️ Revisado em 2026-08-02 — números corrigidos:** a raiz tem **21 arquivos `.md`**, não 8. Destes, ~9 são relatórios movíveis (`CI_COST_ANALYSIS_REPORT.md`, `QUALITY_METRICS_REPORT.md`, `REGRESSION_SIMULATION_REPORT.md`, `RLS_AUDIT_REPORT.md`, `PLANO_CORRECOES_CI_CD.md`, `FLUXO_CLIQUE_CHATPANEL.md`, …) e os demais são canônicos de raiz (`README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, `CLAUDE.md`) e **não devem ser movidos**. Além disso **`docs/audits/history/` não existe** — a Ação precisa criar o diretório antes do `git mv`.

### F1-06 — Deletar duplicata `playwright.e2e.config.fixed.ts`

- **Sev:** `HIGIENE`
- **✅ Consumido fora de ordem em 2026-08-02, dentro da Etapa 2 (junto de F10-09).** `playwright.e2e.config.fixed.ts` removido via `git rm`. Motivo do desvio: era a 4ª config Playwright e confundiria qualquer trabalho em F10-09. `Rollback: R-CODE` (git revert basta). **Aceite:** `ls playwright*.ts` → 3 arquivos.
- **Rollback:** R-CODE
### F1-07 — Consolidar 5 pastas de teste em `src/**/__tests__/` + `e2e/`

- **Sev:** `HIGIENE`
### F1-08 — Deletar `supabase/functions-legacy/` (grep imports antes)

- **Sev:** `HIGIENE`
- **Rollback:** R-CODE
### F1-09 — Mover/deletar `supabase/fatorx-migrations/` (projeto errado)

- **Sev:** `RISCO`
- **Rollback:** R-CODE
---

## Tema 2 — Gates de CI e qualidade

### F1-10 — Remover `|| true` do script `lint` em `package.json`
- **Sev:** `QUEBRADO`
- **✅ Corrigido em 2026-08-02 (Etapa 2) — ⚠️ escopo era maior que o descrito.** Não eram 2 camadas de máscara, eram **5**: os dois `|| true` do `package.json`, o wrapper `set +e … exit 0` do passo "Lint (advisory)" em `quality-gate.yml`, e mais dois wrappers iguais em `ci.yml` ("ESLint diagnostics" e "Design-system diagnostics"). Remover só os `|| true` deixaria o gate cego pelas outras três. Todas as 5 foram removidas.
- **A armadilha do `bun` não se confirmou no CI.** `ci.yml:99/202`, `quality-gate.yml:27` e os 4 `e2e-*-vps.yml` usam `oven-sh/setup-bun@v2` com `bun-version: 1.3.14`. O `bun` só falta no **container local** — a máscara não protegia contra isso. `bun run scripts/check-design-system.ts` foi mantido (funciona no CI); ver achado novo **E02-N01**.
- **Débito real de ESLint medido:** 2.238 arquivos analisados → **1 erro + 6 warnings**. O erro era `variant` não usado em `src/hooks/use-toast.ts:64` (corrigido para `variant: _variant`). O `--max-warnings 999` protegia 6 warnings.
- **Design-system:** `--ci` reprovava com **88 violações**. Em vez de manter cosmético, o script ganhou `--max=<n>` (ratchet, padrão dos `check-*-ratchet` do repo) e o teto foi congelado em 88 — regressão acima disso reprova. Ver **E02-N03**.
- **Raiz de:** F10-06
- **⚠️ Revisado em 2026-08-02 — há DOIS `|| true`, não um.** `package.json` l.23: `"lint": "eslint . --max-warnings 999 || true; bun run scripts/check-design-system.ts --ci || true"`. Remover só o primeiro deixa o gate ainda cego pelo segundo. **Armadilha adicional:** o segundo comando invoca `bun`, que **não existe no container** — ao remover o `|| true` o script passa a falhar sempre. Trocar `bun run` por `npx tsx`/`node` na mesma correção.

### F1-11 — Reduzir `--max-warnings 999 → 0` progressivamente

- **Sev:** `HIGIENE`
- **✅ Corrigido em 2026-08-02 (Etapa 2).** Achado sem corpo (título-resumo). Baseline honesto medido antes de apertar: **6 warnings, 0 erros**. `--max-warnings` foi de **999 → 6**. Verificado que o teto morde: `eslint . --max-warnings 5` → exit 1; `--max-warnings 6` → exit 0. Próximo aperto: 6 → 0 depende de resolver 5 `react-hooks/exhaustive-deps` em `useExternalApiManagement.ts` e 1 em `MessageStatusTimeline.tsx`.
---

## Tema 3 — Segurança Supabase

> **Nota de revisão (2026-08-02, Lote A):** os achados **F2-\*** foram herdados do Bloco 2 como títulos-resumo — não possuem seções `Evidência` / `Ação` / `Aceite`. A evidência de cada um foi **revalidada e confirmada** nesta revisão (ver `REVISAO_BACKLOG_172.md`), mas eles **não são executáveis pela esteira de correção** enquanto Ação e Aceite não forem escritos. Tratar como `📝 AÇÃO FRÁGIL (estrutural)`.

### F2-01 — Revogar `EXECUTE` de `authenticated` nas 6 TRIGGER functions em `public`

- **Sev:** `SEC`
- **Rollback:** R-POL
- `fn_contacts_proxy_delete/insert/update`, `fn_messages_bridge_delete/insert/update`.

### F2-02 — Revogar `EXECUTE` de `authenticated` nas 3 outras TRIGGER functions em `public`
- `handle_new_user_settings`, `on_role_change`, `trg_fn_set_transfer_ticket`.
- **Sev:** `SEC`
- **Rollback:** R-POL
- **⚠️ Revisado em 2026-08-02:** as 3 existem **em `public` E em `zapp`** (homônimas). O `REVOKE` **deve** qualificar `public.<fn>(<args>)`; sem qualificação o comando pode atingir a função errada. `authenticated` tem `EXECUTE` nas 3 de `public` — problema confirmado.

### F2-03 — Revisar 9 RPCs SECDEF em `public` — garantir `auth.uid()` + tenant check
- `rpc_get_contact` (2 overloads), `rpc_app_bootstrap`, `rpc_dashboard_init`, `generate_transfer_ticket`, `get_companies_by_phones_batch`, `get_contact_intelligence_by_phone`, `increment_webhook_rate_limit`, `is_instance_paused`, `log_rls_denied`.
- **Sev:** `SEC`
- **Rollback:** R-POL
- **⚠️ Revisado em 2026-08-02:** 7 dos 9 nomes também existem em `zapp` (`rpc_get_contact` — 4 overloads em `public`+`zapp` —, `generate_transfer_ticket`, `get_companies_by_phones_batch`, `get_contact_intelligence_by_phone`, `increment_webhook_rate_limit`, `is_instance_paused`, `log_rls_denied`). **Qualificar `public.` em toda alteração.** `public` tem 19 funções SECDEF acessíveis a `authenticated`.

### F2-04 — Auditoria CSV das 119 SECDEF+authenticated em `zapp` (`docs/audits/secdef-zapp.csv`)

- **Sev:** `SEC`
### F2-05 — Auditoria similar em `financeiro` (25), `artes` (11), `vendas` (5)

- **Sev:** `SEC`
---

## Tema 4 — Performance de banco

> **Nota de revisão (2026-08-02):** vide nota estrutural dos achados `F2-*` no Tema 3 — sem `Ação`/`Aceite` formais.

### F2-09 — Mover `ops.fn_regression_tests()` para off-peak + MV cached (8,8 s/call → 0)

- **Sev:** `DEGRADADO`
- **Rollback:** R-CRON
### F2-10 — Consolidar 588 042 INSERTs unitários em `financeiro.pagamentos_diarios` para batch

- **Sev:** `DEGRADADO`
- **Rollback:** R-DDL
### F2-11 — Investigar `zapp.fn_system_health_score_cached` (289 ms apesar do nome "_cached")

- **Sev:** `DEGRADADO`
### F2-12 — Reduzir invalidações do PostgREST schema cache (203 s totais em introspection)

- **Sev:** `DEGRADADO`
### F2-13 — Índice parcial em `zapp.messages` para badge unread inbound

- **Sev:** `DEGRADADO`
- **Rollback:** R-DDL
- **⚠️ Revisado em 2026-08-02 — referência corrigida.** O SQL original **não roda**, por 3 motivos: (a) `zapp.messages` é **VIEW** (`relkind='v'`) sobre `evo.evolution_messages` — `CREATE INDEX` em view falha; (b) `evo.evolution_messages` é **tabela particionada** (`relkind='p'`) — `CREATE INDEX CONCURRENTLY` não é suportado em tabela particionada; (c) a view **remapeia** `direction`: base grava `'inbound'`/`'outbound'`, a view expõe `'incoming'`/`'outgoing'`. Índice equivalente não existe hoje — o problema de performance é real.
- **Ação (reescrita):** criar o índice em cada partição de `evo.evolution_messages` e anexar ao índice pai:
```sql
-- 1) no pai (sem CONCURRENTLY; particionada aceita, mas trava DDL nas partições)
CREATE INDEX idx_msg_unread_inbound
  ON evo.evolution_messages (direction, is_read)
  WHERE is_read = false AND direction = 'inbound';
-- 2) alternativa sem lock longo: CREATE INDEX CONCURRENTLY por partição
--    + CREATE INDEX ... ON ONLY evo.evolution_messages + ALTER INDEX ... ATTACH PARTITION
```
- **Aceite:** `EXPLAIN` da query do badge usa `idx_msg_unread_inbound`; `pg_indexes` lista o índice em todas as partições de `evo.evolution_messages`.

---

## Tema 5 — Consolidação de cron jobs

> **Nota de revisão (2026-08-02):** vide nota estrutural dos achados `F2-*` no Tema 3 — sem `Ação`/`Aceite` formais.

### F2-06 — Consolidar 4 pares de duplicatas de cron

- **Sev:** `DEGRADADO`
- **Rollback:** R-CRON
- `cleanup_expired_contact_ids` (190) + `evo_cleanup_expired_contact_ids` (189).
- `purge-processed-webhook-events` (54) + `purge_webhook_events_processed` (152).
- `purge-webhook-audit-log-90d` (209) + `purge_webhook_audit` (61).
- `cleanup-cron-job-history` (99) + `cleanup-cron-job-logs` (216).

### F2-07 — Escalonar 6 VACUUMs diários (02:06–02:21) em janelas > 5 min

- **Sev:** `DEGRADADO`
- **Rollback:** R-CRON
### F2-08 — Reagrupar chain logflare (7 jobs, 03:00–03:45) em job único

- **Sev:** `DEGRADADO`
- **Rollback:** R-CRON
---

## Tema 6 — Frontend: router, navegação, arquitetura

### F1-12 — Homônimos em `src/pages/` — padronizar `<slug>/index.tsx`

- **Sev:** `HIGIENE`
### F1-13 — 11 pages órfãs (sem `<Route>`) mas lazy-carregadas — decidir URL ou `?view=`
- **Sev:** `HIGIENE`
- **Depende de:** **F1-14**
- **⚠️ Revisado em 2026-08-02 — número corrigido:** medindo contra o roteador de rotas real (`src/components/routing/AppRoutes.tsx`), são **17** arquivos em `src/pages/` sem `<Route>`, não 11: `AdminAlertHistoryPage`, `AdminAlertHistoryPageParts`, `AdminDispatchErrorsHistoryPage`, `AdminEvolutionApiLogsPage`, `AdminEvolutionApiLogsPageParts`, `AdminFailedMessagesPage`, `AdminInstancePausesPage`, `AdminRealtimeMonitorPage`, `AdminSearchInsightsPage`, `AdminTelemetriaPage`, `AdminWebhookEventsPage`, `AdminWebhookOverviewPage`, `AdminWebhookSecretStatusPage`, `BackendDiagnostics`, `RealtimeFanoutDebug`, `SendStatusBusDebug`, `ViewRouter`. Nem todos são "pages": `ViewRouter` e os `*Parts` são infraestrutura/fragmentos. `src/pages/lazyViews.ts` tem **76** imports dinâmicos — a maioria dessas telas é alcançável por `?view=`, então **órfã ≠ inalcançável** (mesmo erro que produziu os falsos positivos F8-01/F8-10).

### F1-14 — Consolidar padrão duplo URL canônica vs `?view=X&tab=Y`

- **Sev:** `HIGIENE`
- **Raiz de:** F1-13, F7-09
---

## Tema 7 — Frontend: auth e sessão

_(Achados F3-01 a F3-12 registrados no Bloco 3, mantidos abaixo.)_

### F3-01 — CRÍTICO (P0): `supabase.auth.getSession()` fora de `useEffect` em `ProtectedRoute.tsx`

- **Sev:** `SEC`
- **Origem:** Etapa 22 (Bloco 3).
- **Evidência:** `src/features/auth/components/ProtectedRoute.tsx` linhas 260-269 — executa em cada render (2× em StrictMode). Se `getSession()` retornar null transitoriamente, dispara logout automático.
- **⚠️ Revisado em 2026-08-02 — linha corrigida:** o `supabase.auth.getSession().then(...)` está na **l.243**, dentro do bloco `if (!authLoading && user) { ... }` no corpo do componente (fora de qualquer `useEffect` — os `useEffect` do arquivo estão nas l.55 e l.74). **As linhas 260-269 citadas apontam para outro trecho** — o bloco `const isDev = hasRole('dev'); if (isDev) { markTimeToMainScreen(...); return children; }` (l.261-264), que é o assunto do **F3-02**. Diagnóstico do F3-01 confirmado; a referência de linha é que estava trocada.
- **Ação:** mover para `useEffect(() => { ... }, [authLoading, user])` com `AbortController`.
- **Aceite:** teste manual com "Slow 3G" — user autenticado não é deslogado por race entre `getSession` calls.

### F3-02 — `isDev` bypass total sem log de auditoria

- **Sev:** `SEC`
- **Origem:** Etapa 28 (Bloco 3).
- **📝 Revisado em 2026-08-02 — a chamada como escrita falha.** O bypass está confirmado (`ProtectedRoute.tsx` l.261-264). Mas `zapp.log_security_event` tem assinatura **`(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb)`** — **5 parâmetros, nenhum com DEFAULT**. Invocar com apenas `p_event_type` retorna `function ... does not exist`.
- **Ação (corrigida):** `void supabase.rpc('log_security_event', { p_event_type: 'dev_bypass_used', p_resource: location.pathname, p_action: 'route_access', p_status: 'bypassed', p_details: { roles: userRoles } })` com throttle.
- **Aceite:** `SELECT count(*) FROM zapp.security_events WHERE event_type='dev_bypass_used' AND created_at > now() - interval '1 day'` > 0 após uso do bypass em ambiente dev.

### F3-03 — ~~OBSOLETO~~ `verifyHttpOnlyCookieAuth()` é dead code — remover
- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Rollback:** R-CODE
- **🔄 Revalidado em 2026-08-02 — FALSO POSITIVO. NÃO REMOVER.** A função é **chamada em produção**: `src/features/auth/components/AuthProvider.tsx` l.8 (import) e **l.327** (`if (!verifyHttpOnlyCookieAuth()) { ... }`), no caminho de bootstrap de sessão. Definição em `src/integrations/supabase/cookieStorage.ts` l.92. Remover quebraria o bootstrap de auth.

> **Nota de revisão (2026-08-02, Lote C) — achados F3-03 a F3-12.** São **títulos-resumo sem `Evidência`/`Ação`/`Aceite`**. A substância de cada um foi revalidada em `REVISAO_BACKLOG_172.md`; escrever Ação e Aceite antes de entrar na esteira. Arquivo de referência para quase todos: `src/features/auth/components/AuthProvider.tsx`.

### F3-04 — `refreshAll` sem `AbortController` — race em `TOKEN_REFRESHED` consecutivo

- **Sev:** `RISCO`
### F3-05 — Parsing frágil de `role_permissions` — pode retornar `permissions = []` silenciosamente

- **Sev:** `RISCO`
### F3-06 — Realtime `zapp.profiles` só captura UPDATE — trocar para `event: '*'`

- **Sev:** `RISCO`
### F3-07 — `retryBootstrap()` pode empilhar `getSession()` sob `navigator.locks`

- **Sev:** `RISCO`
### F3-08 — ~~OBSOLETO~~ Deletar `externalSessionBridge.ts` — dead code ativo
- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Rollback:** R-CODE
- **🔄 Revalidado em 2026-08-02 — FALSO POSITIVO. NÃO DELETAR.** O arquivo é `src/integrations/supabase/externalSessionBridge.ts` (o PLANO não dava caminho) e está **registrado no boot da aplicação**: `src/main.tsx` l.9 `import { registerExternalSessionBridge } from './integrations/supabase/externalSessionBridge'`. Também é importado por `src/features/auth/services/authService.ts` l.6. Deletar quebraria o build e o bridge de sessão externa.

### F3-09 — `signOut` sem fallback local se supabase-js falhar

- **Sev:** `RISCO`
### F3-10 — `QuotaExceededError` silenciado em cookieStorage — CustomEvent + toast

- **Sev:** `DEGRADADO`
### F3-11 — `markTimeToMainScreen` triplicado no ProtectedRoute — guard com `useRef`

- **Sev:** `HIGIENE`
### F3-12 — `log_security_event` sem contexto (tenant/UA/IP) — enriquecer

- **Sev:** `SEC`
---

## Tema 8 — Frontend: inbox e mensageria

> **Nota de revisão (2026-08-02, Lote B) — caminhos de arquivo dos achados F4-\*.** As Evidências citam **nomes de arquivo sem caminho**, e dois deles são **ambíguos** (existem 2 arquivos distintos, não re-exports):
> - `useRealtimeMessages.ts` → canônico **`src/features/inbox/hooks/useRealtimeMessages.ts`** (697 l.). Existe também `src/hooks/useRealtimeMessages.ts` (310 l.), implementação separada que importa `supabase` direto.
> - `useMediaUrl.ts` → canônico **`src/features/inbox/hooks/useMediaUrl.ts`**. Existe também `src/lib/useMediaUrl.ts` (hook central, ADR-001/ADR-003).
> Sem ambiguidade: `useRealtimeInbox.ts` → `src/features/inbox/hooks/`; `useMessageQueue.ts` → `src/features/inbox/hooks/`; `messageSender.ts` → `src/features/inbox/hooks/realtime/`.
> **Os números de linha do PLANO estão defasados** (o código evoluiu). Linhas revalidadas em 2026-08-02: F4-01 l.24-25 e 377/384 · F4-02 l.369-405 · F4-03 l.427 · F4-04 l.588-613 · F4-05 l.33 · F4-06 l.383 · F4-07 l.358 · F4-08 l.142 · F4-09 l.121 · F4-10 l.90 · F4-11 l.169 · F4-13 l.308 · F4-14 l.343-355 · F4-17 l.194-203 · F4-20 l.75 · F4-21 l.176 vs l.214. **Localizar por símbolo, não por número de linha.**

### F4-01 — `fetchConversations` sem cursor/paginação (500+1000 fixo)

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 31/32 (Bloco 4).
- **Evidência:** `useRealtimeMessages.ts` linhas ~250: `SEEDED_CONTACT_LIMIT = 500`, `RECENT_MESSAGES_LIMIT = 1000`.
- **Ação:** substituir por cursor com `updated_at + id`, tamanho de página 100, load-more sob demanda ao rolar sidebar.
- **Aceite:** tenant com 5000+ contatos ativos carrega inbox em < 2 s; sidebar suporta scroll infinito com virtualização.

### F4-02 — `fetchConversations` sem guard de mount para setState/commitConversations

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** await do `.select()` sem checar `active` flag; se hook desmonta durante fetch, setState roda após unmount.
- **Ação:** propagar `AbortController` do `useEffect` para as chamadas `dbFrom`, e no `.finally` checar `active` antes de setLoading/setError.
- **Aceite:** navegar entre rotas durante fetch inicial não gera warning "Can't perform a React state update on an unmounted component".

### F4-03 — Channel realtime com nome aleatório (`Math.random()`)

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useRealtimeMessages.ts` linha ~330: `` const channelName = `messages-realtime-${Math.random().toString(36).slice(2, 9)}` ``.
- **Ação:** usar chave estável (ex.: `` `messages-realtime-${profile.id}` ``); cleanup async esperar unsubscribe antes de novo subscribe (usar promise).
- **Aceite:** logs mostram apenas 1 channel `messages-realtime-*` por sessão de user; unsubscribe → new subscribe é sequencial em StrictMode.

### F4-04 — `conversationSendState` computed fora de `useMemo`

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useRealtimeMessages.ts` linhas ~560-600: `for (const c of conversations) { ... getSendStatus(m.id) }` — O(n·m) a cada render.
- **Ação:** envolver em `useMemo` com deps `[conversations, sendStateTick]`.
- **Aceite:** DevTools Profiler mostra o cálculo cacheado; render de 500 conversations sem re-computar quando outra parte do state muda.

### F4-05 — `USE_EXTERNAL_DB = true` hardcoded

- **Sev:** `RISCO`
- **Origem:** Etapa 31 (Bloco 4).
- **Evidência:** `useRealtimeInbox.ts` linha 27: `const USE_EXTERNAL_DB = true;`.
- **Ação:** trocar por `import.meta.env.VITE_USE_EXTERNAL_DB === 'true'`; documentar em `.env.example`.
- **Aceite:** toggle via env sem PR; teste em ambos os modos.

### F4-06 — `handleSelectConversation` chama `evolution-api/read-messages` fire-and-forget

- **Sev:** `RISCO`
- **Origem:** Etapa 31 (Bloco 4).
- **Evidência:** `useRealtimeInbox.ts` linha ~370: `void supabase.functions.invoke('evolution-api', { ... })` sem `.catch`.
- **Ação:** adicionar `.catch(err => log.warn('[read-messages] failed', err))` no mínimo; opcionalmente reintroduzir toast silenciado para não spammar.
- **Aceite:** falhas de `read-messages` aparecem em GlitchTip; UI não trava.

### F4-07 — Reconciliação de delivery limitada a `.slice(-10)`

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useRealtimeInbox.ts` linha ~330: `const recent = selectedMessages.slice(-10)`.
- **Ação:** ampliar para todas as mensagens `external_id != null` da última janela (`created_at > now() - interval '5min'`).
- **Aceite:** teste com burst de 20 mensagens: todas reconciliam com queue.

### F4-08 — `seededAvatarsRef` sem limpeza — memory leak

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 33 (Bloco 4).
- **Ação:** convert `Set<string>` para `Map<string, timestamp>` com TTL 30min; sweep periódico via `setInterval`.
- **Aceite:** heap snapshot após 4h de uso mostra Set com < 1000 entries.

### F4-09 — `convProbeRef` log de debug em produção

- **Sev:** `HIGIENE`
- **Origem:** Etapa 33 (Bloco 4).
- **Evidência:** `useRealtimeInbox.ts` linhas ~140-165: `log.info('[probe] conversations state', { ... })`.
- **Ação:** guard com `import.meta.env.DEV` ou remover completamente.
- **Aceite:** produção não tem entradas `[probe]` no console.

### F4-10 — `processedDeliveriesRef` (Set) cresce sem cap

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useMessageQueue.ts` linha ~30: `const processedDeliveriesRef = useRef<Set<string>>(new Set())`. Cada `reconcileWithDelivery` adiciona; nunca remove.
- **Ação:** substituir por LRU (`lru-cache` já em deps) com cap de 5000.
- **Aceite:** heap snapshot em session de 8h mostra < 5000 entries.

### F4-11 — `localStorage.setItem` sem try/catch em useMessageQueue

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useMessageQueue.ts` linha ~135: `useEffect(() => { localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueToSave)); }, [queue])`.
- **Ação:** envolver em try/catch; no catch emitir `CustomEvent('zapp:storage-quota-exceeded')` (reuso do handler do F3-10).
- **Aceite:** encher localStorage propositalmente + enfileirar msg → toast aparece; sem crash.

### F4-12 — `beforeunload` handler ausente — cascade de sends no próximo load

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Ação:** listener `beforeunload` que marque items `sending` como `pending` no localStorage antes do unload (already handled parcialmente no restore, mas garantir ordem).
- **Aceite:** fechar aba com 10 msgs pending, reabrir → sends ocorrem em rate limitado (não paralelo).

### F4-13 — Classificação de erro sem diferenciar retryable

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useMessageQueue.ts` linhas ~230-260: qualquer erro é considerado retryable até esgotar `maxRetries`. Erros 400/403 (validação) retentam desnecessário.
- **Ação:** classificar via `messageSenderHelpers.classifyAuthError` + novos helpers para 4xx permanentes.
- **Aceite:** erro 400 é `failed` imediato (sem retry); 429/5xx entra no loop.

### F4-14 — `dbFrom('failed_messages').insert` falha silenciosa

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `zapp.failed_messages` está **vazia** apesar do path `!shouldAutoRetry` no useMessageQueue inserir.
- **Ação:** (a) confirmar RLS da tabela; (b) `.insert(...).select()` para ter erro estruturado; (c) log estruturado do erro em GlitchTip.
- **Aceite:** forçar 4 falhas seguidas → registro aparece em `failed_messages`; se der erro, GlitchTip captura.

### F4-15 — `sendMessageToContact` faz 8 round-trips por mensagem

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `messageSender.ts` — 8 queries no happy path.
- **Ação:** criar RPC SECDEF `rpc_send_message_atomic(p_contact_id, p_content, p_type, p_media_url, p_optimistic_id, p_conversation_id)` que faz insert de mensagem + audit_logs em 1 transação, retornando `messageId` + payload pronto para Evolution. Front chama a RPC, depois invoca Evolution, depois RPC de finalize.
- **Aceite:** envio de 50 mensagens rápidas gera 100 queries (2× por msg) em vez de 400.

### F4-16 — `buildSendIdempotencyKeyFromFingerprint` 5min bucket colide

- **Sev:** `RISCO`
- **✅ Revisado em 2026-08-02:** confirmado em **`src/lib/sendIdempotency.ts`** — `DEFAULT_BUCKET_MS = 5 * 60 * 1000` (l.54); a função está na l.114. O PLANO não citava o caminho.

- **Origem:** Etapa 32 (Bloco 4).
- **Ação:** reduzir bucket para 30s OU incluir hash do timestamp exato do add-to-queue no fingerprint.
- **Aceite:** manual retry com conteúdo diferente após 30s gera nova key.

### F4-17 — `messageSender.audit_logs` fire-and-forget sem retry

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `.then(() => null).catch(e => log.warn(...))` para writes de audit.
- **Ação:** enfileirar em local buffer + flush retry 3× com backoff; se falhar 3×, escrever em `localStorage` como fallback.
- **Aceite:** simular DB offline durante audit_log write → audit não é perdido.

### F4-18 — `retry_attempt` e `error_reason` 100% NULL em `messages` (bug de persistência)

- **Sev:** `QUEBRADO`
- **Rollback:** R-FN
- **Origem:** Etapa 33.5 (Bloco 4).
- **Evidência:** 8 failed + 23 pending com `error_code/error_reason/retry_attempt = NULL`. Código de `messageSender.ts` explicitamente escreve esses campos.
- **Ação:**
  0. **⚠️ Revisado em 2026-08-02 — referência corrigida.** **`fn_messages_instead_of_update` não existe em nenhum schema.** O trigger real na view `zapp.messages` chama-se `messages_instead_of_update` e executa **`zapp.messages_update_trigger()`**. Diagnóstico confirmado por outra via: a view `zapp.messages` **expõe** `error_code`, `error_reason`, `retry_attempt`, `retry_total`, mas `evo.evolution_messages` tem **48 colunas e nenhuma das quatro** — logo o writeback não tem destino. Contagens exatas confirmadas: 8 `failed` + 23 `pending`, **0** com `error_reason` e **0** com `retry_attempt`.
  1. Investigar **`zapp.messages_update_trigger()`** (trigger `messages_instead_of_update`, `INSTEAD OF UPDATE` na view `zapp.messages`) — descarta os campos que não existem na tabela-fonte `evo.evolution_messages`.
  2. Adicionar colunas `error_code`, `error_reason`, `retry_attempt`, `retry_total` em `evo.evolution_messages` (ou tabela `zapp.message_send_metadata` linkada por FK).
  3. Ajustar trigger para propagar corretamente.
- **Aceite:** query `SELECT COUNT(*) FROM zapp.messages WHERE status='failed' AND error_reason IS NOT NULL` retorna > 0 após 1 dia em produção.

### F4-19 — `extractEvolutionMessageId` pode retornar null; msgs sent sem external_id

- **Sev:** `RISCO`
- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** 42 messages sem external_id, incluindo 1 sent e 1 delivered.
- **Ação:** se `extractEvolutionMessageId` retornar null e response 200, marcar status como `sent_unverified` e enfileirar job de reconciliation contra `evo.evolution_webhook_events_v2` que resolva o external_id pelo timestamp + phone.
- **Aceite:** teste manual — Evolution retorna 200 sem key.id → status = sent_unverified; após webhook chegar, resolve para external_id real.

### F4-20 — `useMediaUrl.refreshCache` sem cap (potencial 100s MB)

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 33 (Bloco 4).
- **Ação:** substituir por `LRUCache` com maxSize por bytes (ex.: 50 MB) usando `lru-cache` + `sizeCalculation`.
- **Aceite:** heap snapshot após visitar 500 conversas com mídia mostra cache < 60 MB.

### F4-21 — `buildFileHash(originalUrl) != buildFileHash(dataUrl)` — cache DB nunca hit

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 33 (Bloco 4).
- **Evidência:** `zapp.media_cache` **vazia** em produção.
- **Ação:** unificar a chave — hash do `originalUrl` como identidade + `storage_path` apontando para o cache real. Ou remover `media_cache` completamente e usar apenas cache em memória.
- **Aceite:** após 24h em produção, `zapp.media_cache` tem > 0 rows; hit rate > 50% em imagens visualizadas 2×.

### F4-22 — `media_cache.storage_path` armazenando data URL base64 (anti-pattern)

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 33 (Bloco 4).
- **Ação:** trocar para upload real ao R2/MinIO retornando URL público; `storage_path` = URL do bucket.
- **📝 Revisado em 2026-08-02 — Aceite não mensurável hoje:** `zapp.media_cache` tem **0 rows**, então `avg(pg_column_size(storage_path))` retorna NULL antes e depois da correção. Depende de F4-21 popular a tabela primeiro.
- **Aceite (reescrito):** (a) F4-21 resolvido e `zapp.media_cache` com > 0 rows; (b) `SELECT max(pg_column_size(storage_path)) FROM zapp.media_cache` < 500 bytes **e** `SELECT count(*) FROM zapp.media_cache WHERE storage_path LIKE 'data:%'` = 0; (c) `storage_path` resolve para URL pública acessível.

### F4-23 — Cron `retry-stuck-messages` opera em tabela vazia (`outbound_message_queue`) — 23 msgs pending há 5 dias

- **Sev:** `QUEBRADO`
- **Rollback:** R-CRON
- **Origem:** Etapa 33.5 (Bloco 4).
- **Evidência:** `fn_retry_stuck_messages()` faz `UPDATE zapp.outbound_message_queue SET status='pending'` mas a table está vazia; as mensagens presas estão em `zapp.messages` (via `evo.evolution_messages`).
- **Ação:**
  1. Reescrever `fn_retry_stuck_messages()` para operar em `evo.evolution_messages` diretamente: `WHERE status='pending' AND updated_at < now() - interval '10 min' AND (retry_attempt IS NULL OR retry_attempt < 3)`.
  2. Ao pegar, invocar edge function de re-send ou marcar como `failed` com `error_reason='timeout_pipeline'` se retry_attempt >= 3.
  3. Adicionar guard para não repostar msgs cuja Evolution API já processou (checar via `webhook_events_processed`).
- **Aceite:** após deploy, as 23 mensagens presas resolvem em < 30 min (sent com external_id OU failed com reason claro).

### F4-24 — ~~OBSOLETO~~ Cron `media_pipeline_health_check` (jobid 213) falha por schema drift

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Raiz de:** F7-15 (duplicata)
- **Rollback:** R-CRON
- **Origem:** Etapa 33.5 (Bloco 4).
- **Evidência:** falhas históricas: `column "severity" of relation "warroom_alerts" does not exist` e `chk_warroom_alert_type` violation com `alert_type='media_pipeline'`.
- **Ação:** (a) verificar schema atual de `zapp.warroom_alerts` — adicionar coluna `severity` ou remover do INSERT; (b) atualizar constraint `chk_warroom_alert_type` para incluir `'media_pipeline'` ou trocar por outro tipo aceito.
- **🔄 Revalidado em 2026-08-02 — CORRIGIDO, condição não existe mais.** (a) `zapp.warroom_alerts` **tem** a coluna `severity` (última da tabela — foi adicionada); (b) a tabela **não possui nenhuma CHECK constraint** — `chk_warroom_alert_type` não existe mais; (c) o cron 213 (`0 */4 * * *`) rodou **6 de 6** execuções esperadas nas últimas 24h, todas `succeeded`. O schema drift foi resolvido entre a auditoria e esta revisão.
- **Aceite:** run manual de `SELECT zapp.fn_run_media_health_alert()` sem erro; 4557 alertas históricos processados.

---

## Tema 9 — Frontend: admin e observabilidade

_(Ver Tema 13 abaixo — achados F7-01 a F7-32 no Bloco 7.)_

## Tema 10 — Infra, deploy e resiliência

_(aguardando Bloco 9 — próximo chat)_

---

## Tema 11 — Contatos e CRM

_(Achados F5-01 a F5-30 registrados no Bloco 5.)_

### F5-01 — CRÍTICO (P0): view `zapp.contacts` descarta silenciosamente CPF, endereço, is_blocked/is_favorite e vários outros campos

- **Sev:** `QUEBRADO`
- **Raiz de:** F5-02, F5-03, F5-05, F5-06, F5-09 — **corrigir esta primeiro elimina ou reduz os 5**
- **Rollback:** R-FN + R-VIEW
- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `pg_get_viewdef('zapp.contacts')` mostra colunas HARDCODED: `NULL::text AS cpf`, `NULL::text AS address`, `NULL::text AS city`, `NULL::text AS state`, `'BR'::text AS country`, `false AS is_blocked`, `false AS is_favorite`, `NULL::text AS surname`, `'normal'::text AS ai_priority`, `'neutral'::text AS ai_sentiment`, `'whatsapp'::text AS channel_type`, `NULL::uuid AS channel_connection_id`, `NULL::text AS group_category`, `0 AS risk_score`. UI pode inserir/editar esses campos; DB descarta.
- **Ação:** decidir por coluna: (a) adicionar suporte real em `evo.evolution_contacts` + propagar via triggers, ou (b) remover da view e limpar UI. Não deixar coluna "fantasma".
- **Aceite:** cada coluna da view `zapp.contacts` ou é backed por dado real em `evo.evolution_contacts`, ou é removida.

### F5-02 — CRÍTICO (P0): trigger UPDATE da view `zapp.contacts` dropa campos LGPD, soft-delete, workspace e AI (mesmo padrão do F4-18)

- **Sev:** `QUEBRADO`
- **Depende de:** **F5-01** (view `zapp.contacts` incompleta — corrigir a view antes do trigger)
- **Rollback:** R-FN
- **Origem:** Etapa 47 (Bloco 5).
- **Evidência:** `fn_contacts_view_update_handler()` só propaga 16 colunas (`full_name`, `phone_number`, `email`, `profile_picture_url`, `lead_status`, `assigned_to`, `queue_id`, `company`, `notes`, `tags`, `whatsapp_labels`, `lead_score`, `last_message_at`, `instance_name`, `raw_data`, `updated_at`). Descartados: `deleted_at`, `deleted_by`, `deleted_reason`, `workspace_id`, `contact_type`, `ai_priority`, `ai_sentiment`, `channel_type`, `group_category`, `risk_score`, `lead_origin`, `last_seen_at`, `first_message_at`, `unread_count`, `total_purchases`, `consent_status`, `nickname`, `surname`, `first_name`, `last_name`, `role_title`, `is_blocked`, `is_favorite`, `cpf`, `address`, `city`, `state`, `country`.
- **Ação:**
  1. Enumerar quais campos precisam de writeback e adicionar clauses no trigger.
  2. Para campos que não precisam de writeback, torná-los somente-leitura na view (remover da UI de edição).
  3. Adicionar teste vitest que faça UPDATE em cada campo da view e verifique persistência.
- **Aceite:** teste `UPDATE zapp.contacts SET is_favorite=true WHERE id=X; SELECT is_favorite FROM zapp.contacts WHERE id=X` retorna `true` (ou é rejeitado com erro claro, não silenciado).

### F5-03 — CRÍTICO (P0): trigger DELETE da view faz HARD DELETE — viola requisito LGPD de soft-delete com undo 30d

- **Sev:** `SEC`
- **Depende de:** **F5-01**
- **Rollback:** R-FN
- **Origem:** Etapa 49 (Bloco 5).
- **Evidência:** `fn_contacts_view_delete_handler()` executa `DELETE FROM evo.evolution_contacts WHERE id = OLD.id`. Sem soft-delete, sem timestamp, sem janela de undo. `evo.evolution_contacts` **tem** coluna `deleted_at` (implica soft-delete estava planejado), e a view filtra `WHERE ec.deleted_at IS NULL` — mas o trigger DELETE ignora tudo isso.
- **Ação:**
  1. Reescrever trigger como `UPDATE evo.evolution_contacts SET deleted_at = now() WHERE id = OLD.id`.
  2. Adicionar coluna `undo_expires_at timestamptz DEFAULT (now() + interval '30 days')`.
  3. Criar cron `hard-delete-expired-soft-deletes` que faz DELETE real onde `deleted_at < now() - interval '30 days'` (compliance LGPD: exclusão real após período).
  4. Adicionar RPC `undo_soft_delete(p_contact_id uuid)` gated por admin + janela de 30d.
- **Aceite:** DELETE via UI cria row com `deleted_at IS NOT NULL`; contato some da view mas persiste em `evo.evolution_contacts` por 30d; RPC `undo_soft_delete` restaura dentro da janela.

### F5-04 — CRÍTICO (P0): `zapp.merge_contacts()` LEVANTA EXCEPTION 'implementacao pendente (etapa 30)' — merge está morto desde deploy

- **Sev:** `QUEBRADO`
- **Depende de:** **F5-08** (merge depende de uma estratégia única de normalização de telefone)
- **Rollback:** R-FN
- **Origem:** Etapa 48 (Bloco 5).
- **Evidência:** `pg_get_functiondef(zapp.merge_contacts)` mostra body de 5 linhas terminando em `RAISE EXCEPTION 'merge_contacts: implementacao pendente (etapa 30)' USING ERRCODE = '0A000'`. `SELECT COUNT(*) FROM evo.evolution_contacts WHERE merge_source_id IS NOT NULL` retorna **0** — feature nunca funcionou em produção. `bulk_auto_merge_duplicates` chama essa função em loop e propaga a exception.
- **Ação:**
  1. Implementar `merge_contacts(p_primary_id, p_secondary_id, p_merged_fields)` respeitando: (a) LGPD — se secundário tem `lgpd_consent_at` mais recente que primário, migrar consent; (b) merge `tags`, `whatsapp_labels`, `notes` (concatenar); (c) migrar `evo.evolution_messages.contact_id`, `evo.evolution_deals.contact_id`, `evo.evolution_tasks.contact_id`, `zapp.contact_notes.contact_id`, `zapp.contact_tags.contact_id` do secundário para primário; (d) marcar secundário como soft-deleted com `merge_source_id = p_primary_id`; (e) log em `zapp.audit_logs`.
  2. Adicionar teste vitest com 2 duplicatas → merge → verificar preservação de consent + mensagens.
- **Aceite:** RPC `merge_contacts` retorna `{success: true}` e produz row com `merge_source_id != NULL`; `bulk_auto_merge_duplicates` reduz duplicatas conhecidas em produção.

### F5-05 — CRÍTICO (P0): `bulk_soft_delete_contacts` referencia colunas `deleted_by`, `deleted_reason` que NÃO existem na view `zapp.contacts` — RPC falha em cada chamada

- **Sev:** `QUEBRADO`
- **Depende de:** **F5-01** (as colunas citadas só existem depois de a view ser corrigida)
- **Rollback:** R-DDL + R-FN + R-VIEW
- **Origem:** Etapa 49 (Bloco 5).
- **Evidência:** RPC executa `UPDATE zapp.contacts SET deleted_at=now(), deleted_by=auth.uid(), deleted_reason=p_reason, updated_at=now()`. View `zapp.contacts` só tem coluna `deleted_at`; não expõe `deleted_by` nem `deleted_reason`. Postgres rejeita statement no parse com `column "deleted_by" of relation "contacts" does not exist`.
- **Ação:**
  1. Adicionar `deleted_by uuid`, `deleted_reason text` em `evo.evolution_contacts` (`deleted_reason` já existe — só falta `deleted_by`).
  2. Expor essas colunas na view `zapp.contacts` (SELECT + trigger UPDATE handler propagando).
  3. OU reescrever `bulk_soft_delete_contacts` para UPDATE direto em `evo.evolution_contacts` (bypass view).
  4. Alinhado com F5-03 (soft-delete real).
- **Aceite:** `SELECT bulk_soft_delete_contacts(ARRAY[<uuid>]::uuid[], 'test')` retorna `1` e a row em `evo.evolution_contacts` tem `deleted_at IS NOT NULL`, `deleted_by = <auth.uid()>`, `deleted_reason='test'`.

### F5-06 — CRÍTICO (P0): sem coluna CPF em `evo.evolution_contacts` e sem coluna CNPJ em lugar nenhum — feature de validação é impossível

- **Sev:** `QUEBRADO`
- **Depende de:** **F5-01**
- **Rollback:** R-DDL + R-FN + R-VIEW
- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `SELECT column_name FROM information_schema.columns WHERE table_schema='evo' AND table_name='evolution_contacts'` mostra 44 colunas — **nenhuma** contém `cpf` ou `cnpj`. View `zapp.contacts` expõe `cpf` HARDCODED NULL. UI pode ter campo de CPF, mas dado vai para o void.
- **Ação:**
  1. Adicionar `cpf text`, `cnpj text` em `evo.evolution_contacts` (com constraint length 11 e 14 respectivamente, digits-only).
  2. Adicionar `pii_cpf_masked_at timestamptz` (mascarar via cron para compliance). **Revisado 2026-08-02:** `evo.evolution_contacts` **já tem** `pii_masked_at` — avaliar reuso antes de criar coluna nova.
  3. Atualizar view + triggers.
- **Aceite:** `INSERT INTO zapp.contacts (name, phone, cpf) VALUES ('X', '+5541999887777', '12345678909')` persiste CPF; `SELECT cpf FROM zapp.contacts WHERE ...` retorna o valor.

### F5-07 — CRÍTICO (P0): sem `validate_cpf(text)` nem `validate_cnpj(text)` no banco — só `mask_cpf`

- **Sev:** `QUEBRADO`
- **Rollback:** R-FN
- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `SELECT proname FROM pg_proc WHERE proname ILIKE '%cpf%' OR proname ILIKE '%cnpj%'` retorna só `zapp.mask_cpf(cpf text)`. Sem validação de dígitos verificadores.
- **Ação:**
  1. Implementar `zapp.validate_cpf(cpf text) RETURNS boolean` IMMUTABLE com algoritmo dos dois DVs.
  2. Implementar `zapp.validate_cnpj(cnpj text) RETURNS boolean` IMMUTABLE.
  3. Adicionar constraints em `evo.evolution_contacts`: `CHECK (cpf IS NULL OR zapp.validate_cpf(cpf))`.
  4. Frontend chama validação local antes de submit; backend é última linha de defesa.
- **Aceite:** `SELECT zapp.validate_cpf('12345678909')` retorna resultado correto (algorítmico); INSERT com CPF inválido é rejeitado.

### F5-08 — CRÍTICO (P0): 5 estratégias diferentes de normalização de telefone — merge, search e intelligence usam estratégias divergentes

- **Sev:** `RISCO`
- **Raiz de:** F5-04, F5-22
- **Origem:** Etapa 46, 48, 55 (Bloco 5).
- **Evidência:** 4 funções SQL retornam formatos diferentes para o mesmo input:
  - `fn_normalize_br_phone('+55 (41) 9 9988-7777')` → `41999887777` (10→11 dígitos, sem 55)
  - `fn_normalize_phone('+55 (41) 9 9988-7777')` → `5541999887777` (11+55)
  - `get_normalized_phone('+55 (41) 9 9988-7777')` → `41999887777` (11, sem 55)
  - `normalize_phone_for_unique('+55 (41) 9 9988-7777')` → `41999887777` (11, sem 55)
  - Frontend `useContactIntelligence.cleanPhone`: apenas `[^0-9]+ → ''` → `5541999887777` (dependente do input original)
  - `bulk_auto_merge_duplicates` usa 6ª estratégia hand-rolled inline: `regexp_replace(phone_number, '\D', '', 'g')`.
- **Ação:**
  1. Escolher UMA função canônica (`fn_normalize_phone` retorna E.164-ish: `5541999887777`).
  2. Deprecar as outras 3 funções SQL + a lógica JS.
  3. Criar índice funcional único `CREATE UNIQUE INDEX ON evo.evolution_contacts (fn_normalize_phone(phone_number))`.
  4. Migrar `bulk_auto_merge_duplicates` para usar essa função.
  5. Frontend chama RPC de normalização em vez de fazer localmente.
- **Aceite:** `fn_normalize_phone` é única função referenciada em código de contatos; grep no repo retorna 0 outras estratégias.

### F5-09 — CRÍTICO (P0): `add_contact_note` DESCARTA `p_note_type` e `p_is_pinned` silenciosamente — colunas não existem em `zapp.contact_notes`

- **Sev:** `QUEBRADO`
- **Depende de:** **F5-01**
- **Raiz de:** F5-11
- **Rollback:** R-DDL + R-FN
- **Origem:** Etapa 52 (Bloco 5).
- **Evidência:** `zapp.add_contact_note(p_contact_id, p_content, p_note_type='general', p_is_pinned=false)` — INSERT só usa 3 colunas: `contact_id, author_id, content`. `zapp.contact_notes` tem 6 colunas (`id, contact_id, author_id, content, created_at, updated_at`) — sem `note_type`, sem `is_pinned`, sem `version`. Signature mente.
- **Ação:**
  1. Adicionar `note_type text DEFAULT 'general' CHECK (note_type IN ('general','call','meeting','task','followup'))`, `is_pinned boolean NOT NULL DEFAULT false`, `updated_by uuid REFERENCES auth.users(id)` em `zapp.contact_notes`.
  2. Ajustar RPC para escrever os campos.
- **Aceite:** `SELECT add_contact_note('<uuid>', 'testando', 'meeting', true)` cria row com `note_type='meeting'` e `is_pinned=true`.

### F5-10 — CRÍTICO (P0): `useContactNotes.addNote` BYPASSA a RPC — INSERT direto na tabela contorna toda validação de segurança

- **Sev:** `SEC`
- **Raiz de:** F5-11
- **Rollback:** R-POL
- **Origem:** Etapa 52 (Bloco 5).
- **Evidência:** `src/features/contacts/hooks/useContactNotes.ts` linhas ~100-115: `supabase.from('contact_notes').insert({ contact_id, author_id, content }).select().maybeSingle()`. Não chama `add_contact_note` RPC. Se RLS `contact_notes_insert` policy falhar (edge case, migração incompleta, etc.), insert passa sem validação.
- **Ação:**
  1. Trocar para `supabase.rpc('add_contact_note', { p_contact_id, p_content, p_note_type, p_is_pinned })`.
  2. RPC já valida `is_admin_or_supervisor OR is_contact_visible_to_user`.
  3. Alinhado com F5-09 (RPC precisa suportar todos os campos primeiro).
- **Aceite:** grep por `.from('contact_notes').insert` retorna 0 hits; todas notas passam pela RPC.

### F5-11 — CRÍTICO (P0): `zapp.contact_notes` **VAZIA** em produção (0 rows) — feature 100% dead

- **Sev:** `QUEBRADO`
- **Depende de:** **F5-09** e **F5-10** (a tabela só recebe linhas depois de a RPC funcionar e o bypass ser removido)
- **Origem:** Etapa 52 (Bloco 5).
- **Evidência:** `SELECT COUNT(*) FROM zapp.contact_notes` retorna 0; `notes_7d=0`, `notes_30d=0`, `total=0`. Feature ativa em produção mas nunca produziu dado.
- **Ação:**
  1. Instrumentar telemetria: log de `[notes] addNote called` para verificar se usuários tentam usar mas falha silenciosa.
  2. Investigar RLS: `contact_notes_insert` policy exige `is_contact_visible_to_user(contact_id, auth.uid())` — se `zapp.contacts` view filtra `deleted_at IS NULL`, e user não é o `assigned_to`, policy nega.
  3. Confirmar via GlitchTip: `Failed to fetch author profiles for notes:` seria log de sucesso; ausência total sugere que UI nem tenta.
- **Aceite:** após correções (F5-10, F5-13, review de RLS), `notes_7d > 0` em produção.

### F5-12 — CRÍTICO (P0): `search_contacts_cursor` NÃO usa `pg_trgm` — full scan em ILIKE

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** RPC body: `v_where := v_where || ' AND (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)'`. Índices `pg_trgm` existem em `evo.evolution_contacts.push_name` e `.email`, mas RPC busca em `zapp.contacts.name` (que é `COALESCE(full_name, push_name, 'Sem nome')`) — nenhum índice trgm em `full_name`. Search em 20k+ contatos → sequential scan.
- **Ação:**
  1. `CREATE INDEX idx_ec_full_name_trgm ON evo.evolution_contacts USING gin (full_name gin_trgm_ops);`
  2. Reescrever RPC: `WHERE c.name % $1 OR c.email % $1 OR fn_normalize_phone(c.phone) LIKE fn_normalize_phone($1) || '%'` (usar `%` operator do trgm, não ILIKE).
  3. Adicionar `similarity_threshold` argumento (default 0.3) para tuning por caller.
- **Aceite:** `EXPLAIN ANALYZE` do RPC mostra `Bitmap Index Scan on idx_ec_full_name_trgm`; tempo < 100ms para query em 50k rows.

### F5-13 — CRÍTICO (P0): `zapp.tags.name` UNIQUE global — cross-workspace conflict impossibilita multi-tenant real

- **Sev:** `SEC`
- **Rollback:** R-DDL
- **Origem:** Etapa 50 (Bloco 5).
- **Evidência:** `CREATE UNIQUE INDEX uq_tags_name ON zapp.tags (name)`. Se workspace A criar tag "VIP" via `bulk_add_tag`, workspace B não consegue criar sua própria "VIP" — a RPC faz `SELECT id FROM zapp.tags WHERE name = p_tag LIMIT 1` e pega o de A, e o `INSERT INTO zapp.contact_tags` associa contatos de B ao tag_id de A. **Contatos misturados entre tenants por nome de tag idêntico.**
- **Ação:**
  1. Adicionar `workspace_id uuid REFERENCES zapp.workspaces(id) NOT NULL DEFAULT get_default_workspace_id()` em `zapp.tags`.
  2. Trocar `uq_tags_name` por `CREATE UNIQUE INDEX ON zapp.tags (workspace_id, name)`.
  3. `bulk_add_tag` filtra por workspace do caller.
- **Aceite:** dois workspaces podem ter tag "VIP" independentes; contatos de A com tag "VIP" não aparecem na busca de B.

### F5-14 — ~~OBSOLETO~~ CRÍTICO (P0): RLS `evo.evolution_contacts.contacts_insert` policy tem `WITH CHECK NULL` — anyone pode inserir contato com qualquer `assigned_to`

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Rollback:** R-POL
- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `SELECT polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polrelid='evo.evolution_contacts'::regclass` mostra `contacts_insert` com `polcmd='a'` e `polqual=NULL` — sem `WITH CHECK` expression. Qualquer authenticated pode inserir contato com `assigned_to = <UUID de outro user>`, `workspace_id` de outro tenant.
- **🔄 Revalidado em 2026-08-02 — FALSO POSITIVO.** A policy `contacts_insert` (`polcmd='a'`) **tem** `WITH CHECK`: `EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY(ARRAY['admin','supervisor']))`. O `polqual=NULL` observado é o comportamento **normal** de policy `INSERT` (usa `polwithcheck`, não `polqual`) — a medição original leu a coluna errada. Hoje só admin/supervisor insere. **Não executar a Ação.** Risco residual a registrar em outro achado: o `WITH CHECK` não valida `assigned_to`, então admin/supervisor pode atribuir a qualquer usuário.
- **Ação:**
  1. `ALTER POLICY contacts_insert ON evo.evolution_contacts WITH CHECK (assigned_to::text = (SELECT p.id::text FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR is_admin_or_supervisor())`.
  2. Adicionar teste que confirma que non-admin não pode inserir com `assigned_to` de outro.
- **Aceite:** INSERT como authenticated com `assigned_to` de outro usuário retorna `new row violates row-level security policy`.

### F5-15 — CRÍTICO (P0): RLS `contacts_select` expõe contatos `assigned_to IS NULL` a TODOS os usuários — cross-tenant leak

- **Sev:** `SEC`
- **Rollback:** R-POL
- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** Policy `contacts_select` `polqual`: `((EXISTS (admin/supervisor)) OR (assigned_to = <profile>) OR (assigned_to IS NULL))`. **Última cláusula não filtra por workspace**. Todo contato sem `assigned_to` é visível para toda a base de usuários.
- **Ação:**
  1. Remover `OR (assigned_to IS NULL)` OU condicionar a workspace: `OR (assigned_to IS NULL AND workspace_id = (SELECT workspace_id FROM zapp.profiles WHERE user_id = auth.uid()))`.
  2. Necessita coluna `workspace_id` real em `evo.evolution_contacts` (não HARDCODED via view — F5-16).
- **Aceite:** query `SET ROLE authenticated; SET request.jwt.claims.sub = '<UUID>'; SELECT COUNT(*) FROM evo.evolution_contacts WHERE assigned_to IS NULL` retorna 0 (ou apenas contatos do próprio workspace).

### F5-16 — CRÍTICO (P0): `get_default_workspace_id()` retorna workspace mais antigo — sem tenant isolation em contatos

- **Sev:** `SEC`
- **Rollback:** R-POL + R-VIEW
- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `get_default_workspace_id()` faz `SELECT id FROM zapp.workspaces ORDER BY created_at LIMIT 1`. View `zapp.contacts.workspace_id` = essa constante para TODOS os contatos. `evo.evolution_contacts` não tem coluna `workspace_id`. Toda infra multi-tenant é fake.
- **Ação:**
  1. Adicionar `workspace_id uuid NOT NULL DEFAULT get_default_workspace_id()` em `evo.evolution_contacts`.
  2. Migrar dados existentes (todos para workspace default por enquanto).
  3. Atualizar view `zapp.contacts` para expor `ec.workspace_id` (não a constante).
  4. Ajustar RLS policies para filtrar por workspace.
- **Aceite:** `SELECT DISTINCT workspace_id FROM evo.evolution_contacts` retorna > 1 valor (após onboarding de 2º workspace).

### F5-17 — `bulk_add_tag` sem cap de tamanho + sem visibility check por contato

- **Sev:** `RISCO`
- **Origem:** Etapa 50 (Bloco 5).
- **Evidência:** RPC não valida `array_length(p_contact_ids, 1)` (ao contrário de `bulk_soft_delete_contacts` que caps em 500). Chamada com 100k UUIDs consome memória do worker. Também só verifica `is_admin_or_supervisor()`; sem check por contato — admin pode tag contatos de outro workspace.
- **Ação:**
  1. `IF array_length(p_contact_ids, 1) > 1000 THEN RAISE EXCEPTION 'max 1000 contatos por chamada' END IF`.
  2. Filtrar `WHERE contact_id IN (SELECT id FROM zapp.contacts WHERE workspace_id = <caller_ws>)` no INSERT.
- **Aceite:** teste com 5000 UUIDs → rejeita; teste com contato de outro workspace → não tagia.

### F5-18 — `bulk_auto_merge_duplicates` seleção de primário sem regra LGPD explícita — pode migrar consent errado

- **Sev:** `SEC`
- **Origem:** Etapa 48 (Bloco 5).
- **Evidência:** RPC ordena `array_agg(ct.id ORDER BY coalesce(ct.total_messages, 0) DESC, ct.created_at ASC)`. Se primário tiver `lgpd_opt_out_at IS NOT NULL` (usuário pediu remoção) e secundário tiver `lgpd_consent_at` (deu consent), merge tornaria opt-out o consentimento antigo — violação LGPD.
- **Ação:**
  1. Regra de precedência LGPD: se qualquer dos merged tem `lgpd_opt_out_at IS NOT NULL`, resultado é opt-out.
  2. Se ambos têm consent, manter o mais recente `lgpd_consent_at`.
  3. Documentar regra em `merge_contacts()` (F5-04).
- **Aceite:** teste unitário: merge(primary=consented, secondary=opted_out) → resultado é opted_out.

### F5-19 — `get_contact_intelligence_by_phone` lê SÓ `evo.evolution_messages_wpp2` — multi-instância bug

- **Sev:** `QUEBRADO`
- **Rollback:** R-FN + R-VIEW
- **Origem:** Etapa 51 (Bloco 5).
- **⚠️ Revisado em 2026-08-02 — referência corrigida:** o hardcode `_wpp2` está **apenas em `zapp.get_contact_intelligence_by_phone`** (13.129 chars). A homônima `public.get_contact_intelligence_by_phone` (731 chars) **não** contém `evolution_messages_wpp2`. **Qualificar `zapp.` na Ação** — sem isso o refactor pode reescrever a função errada. Distribuição atual: `wpp2`=17.493, `wpp_pink_test`=2.949, outras=4 (total 20.446).
- **Evidência:** RPC body: `FROM evo.evolution_messages_wpp2 m WHERE m.remote_jid = v_jid_s ...`. Hardcoded `_wpp2`. **17492 contatos estão em `wpp2` (85.5%) mas 2949 estão em `wpp_pink_test` + 4 em outras instâncias**. Esses 2953 contatos recebem intelligence com `total_interactions=0` e sentiment `neutral` mesmo tendo histórico real.
- **Ação:**
  1. Refatorar para consultar tabela pai `evo.evolution_messages` (particionada) OU dispatch por instância: `FROM evo.evolution_messages_{instance_name}`.
  2. Alternativa: usar view `zapp.messages` que agrega todas as instâncias.
- **Aceite:** `SELECT get_contact_intelligence_by_phone(<phone_de_wpp_pink_test>)` retorna `total_interactions > 0` para contato com histórico.

### F5-20 — `contacts_count_by_type` SECURITY DEFINER sem filtro por workspace — data leak agregado

- **Sev:** `SEC`
- **Rollback:** R-POL
- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** RPC `SELECT COALESCE(lead_status, 'open')::text, count(*) FROM evo.evolution_contacts WHERE deleted_at IS NULL GROUP BY lead_status` — sem `workspace_id` filter. Any authenticated vê agregado global.
- **Ação:** adicionar `AND workspace_id = (SELECT workspace_id FROM zapp.profiles WHERE user_id = auth.uid())` após F5-16.
- **Aceite:** dois workspaces com dados diferentes → count por type é isolado.

### F5-21 — `search_contacts_cursor` faz COUNT CTE em cada página — custo dobrado

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** Query gerada: `WITH total AS (SELECT COUNT(*)::bigint FROM zapp.contacts c <where>) SELECT ..., t.cnt AS total_count FROM zapp.contacts c, total t <where> ORDER BY ... LIMIT $8`. COUNT é recomputado a cada requisição de página.
- **Ação:**
  1. Retornar `total_count` só na primeira página (`cursor_id IS NULL`), NULL nas subsequentes.
  2. Alternativa para tenants grandes: usar estimativa via `pg_class.reltuples` para `search_term=''` (sem filtro).
  3. Frontend cacheia total_count entre navegações da mesma query.
- **Aceite:** `EXPLAIN ANALYZE` de page 2+ não tem `Aggregate (COUNT)` step; latência cai proporcionalmente.

### F5-22 — `search_contacts_cursor` sem normalização de phone na busca — busca por telefone formatado falha

- **Sev:** `DEGRADADO`
- **Depende de:** **F5-08**
- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** `c.phone ILIKE '%<search>%'`. Se user digita `(41) 9 9988-7777`, busca é `%(41) 9 9988-7777%` — literal. Contato armazenado como `+5541999887777` não casa.
- **Ação:**
  1. Detectar se `search_term` é predominantemente dígitos: `IF regexp_match(search_term, '^[\d\s\-()+\.]+$') IS NOT NULL THEN v_where := ... AND fn_normalize_phone(c.phone) LIKE '%' || fn_normalize_phone($1) || '%'`.
  2. Criar índice `CREATE INDEX ON evo.evolution_contacts (fn_normalize_phone(phone_number))`.
- **Aceite:** busca `(41) 9 9988-7777` encontra contato `+5541999887777`; grep em produção mostra hits em `phone` searches.

### F5-23 — `search_contacts_cursor` só busca em `name`, `email`, `phone` — não busca em company, job_title, nickname, cpf

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** WHERE clause: `c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1`. UI tem filtros de company/job_title separados, mas usuário que busca "Acme" no campo geral não encontra contato da Acme Corp.
- **Ação:**
  1. Expandir WHERE: `... OR c.company ILIKE $1 OR c.nickname ILIKE $1 OR c.job_title ILIKE $1 OR c.cpf = regexp_replace($1, '\D', '', 'g')` (após F5-06).
  2. Adicionar indexes trgm em todas as colunas.
- **Aceite:** busca "Acme" retorna contatos com `company='Acme Corp'`; busca por CPF numérico retorna contato correspondente.

### F5-24 — `useContactsSearch.pageIndexToCursor` sem deep-link support — jump-to-page-N via URL retorna page 0

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** Mapa é populado incrementalmente ao navegar. URL `?p=5` (deep link) inicia com `pageIndexToCursor = Map([[0,null]])` — `currentPageCursor = get(5) ?? null` = null → RPC retorna page 0.
- **⚠️ Revisado em 2026-08-02 — caminho corrigido:** o arquivo canônico é **`src/features/contacts/hooks/useContactsSearch.ts` (l.159)**. `src/hooks/useContactsSearch.ts` é apenas um re-export de 2 linhas — editar lá não tem efeito.
- **Ação:**
  1. Se `cursor_id` for null e `page > 0`, RPC internalmente faz `OFFSET (page * page_size)` (fallback lento mas correto).
  2. Frontend: quando restaura de URL, se page > 0, carrega páginas 0..N em sequência via `refetch` (custo alto, mas correto para deep-links raros).
  3. Alternativa preferida: URL contém cursor encodado, não `p=N`.
- **Aceite:** URL `?p=3` renderiza page 3 (não page 0).

### F5-25 — `useContactNotes` N+1 query + sem pagination + sem edit mutation

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 52 (Bloco 5).
- **Evidência:** Hook faz `.from('contact_notes').select(...)`, depois `.from('profiles').select('id, name, avatar_url').in('id', authorIds)` — 2 queries em vez de 1 JOIN. Sem `.limit()` — carrega TODAS as notas. Sem mutation de UPDATE (só add e delete).
- **Ação:**
  1. Trocar por RPC `get_contact_notes_with_authors(p_contact_id, p_limit=50, p_cursor=null)` que faz JOIN + pagination.
  2. Adicionar `updateNoteMutation` com campo `updated_by`.
  3. Após F5-09, permitir editar `note_type`, `is_pinned` também.
- **Aceite:** carregamento de contato com 500 notas leva < 500ms; feature de edit funcional.

### F5-26 — 20445 contatos, ZERO com `lgpd_consent_at` ou `lgpd_opt_out_at` set — compliance LGPD ausente

- **Sev:** `SEC`
- **Rollback:** R-FN
- **Origem:** Etapa 49 (Bloco 5).
- **Evidência:** `SELECT COUNT(*) FROM evo.evolution_contacts WHERE lgpd_consent_at IS NOT NULL` = 0. `SELECT MAX(lgpd_last_updated_at)` = NULL. Colunas existem mas nunca populadas.
- **Ação:**
  1. RPC `record_lgpd_consent(p_contact_id, p_consent_channel, p_marketing, p_data_sharing, p_profiling)`.
  2. Trigger em `evo.evolution_contacts` para popular `lgpd_last_updated_at` quando qualquer coluna LGPD muda.
  3. UI de opt-in ao primeiro contato (Evolution API pode enviar mensagem de consent).
  4. Sincronizar com F5-02 (trigger UPDATE precisa propagar colunas LGPD).
- **Aceite:** após onboarding, novos contatos têm `lgpd_consent_at IS NOT NULL` OU `lgpd_opt_out_at IS NOT NULL`; `SELECT COUNT(*) FROM evo.evolution_contacts WHERE lgpd_last_updated_at IS NOT NULL` cresce diariamente.

### F5-27 — Trigger INSERT view assume individual (`@s.whatsapp.net`) — quebra suporte a grupos (`@g.us`)

- **Sev:** `QUEBRADO`
- **Rollback:** R-FN
- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `fn_contacts_view_insert_handler` fallback: `COALESCE(NULLIF(NEW.remote_jid,''), NULLIF(NEW.external_id,''), NEW.phone || '@s.whatsapp.net')`. Contato de grupo tem JID `<groupid>@g.us`; se UI não fornecer `remote_jid` explícito, trigger monta JID errado.
- **Ação:**
  1. Adicionar detecção: se `NEW.channel_type = 'group'` OU `NEW.remote_jid LIKE '%@g.us'`, usar `@g.us` suffix.
  2. Alternativa: exigir `remote_jid` explícito em INSERT via view (não fabricar).
- **Aceite:** INSERT de contato de grupo produz `remote_jid` com `@g.us`; webhook de grupo linka corretamente.

### F5-28 — `rpc_get_contact` (4 overloads em `public` + `zapp`) expõe deals/messages/tasks de contatos opted-out — LGPD violation

- **Sev:** `SEC`
- **Rollback:** R-FN
- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** Todas 4 versões: `WHERE c.id = p_contact_id` (ou `WHERE remote_jid = p_remote_jid AND deleted_at IS NULL`). Filtro só por `deleted_at`, não por `lgpd_opt_out_at`. Após opt-out, dado ainda é acessível via RPC.
- **Ação:**
  1. Adicionar `AND lgpd_opt_out_at IS NULL` a todas versões.
  2. Se caller é service_role (backend), permitir mesmo com opt-out (para compliance operations).
  3. Auditar retorno: `deals`, `recent_messages`, `tasks` de contato opted-out devem ser mascarados/omitidos.
- **Aceite:** `SELECT rpc_get_contact(<uuid_de_opted_out>)` retorna `{"contact": null}` OU dados mascarados; audit log gerado.

### F5-29 — Sem FK/relação `zapp.contacts` ↔ `zapp.empresas` — Etapa 54 (validar FK cascade) é unmeetable

- **Sev:** `RISCO`
- **Rollback:** R-DDL
- **Origem:** Etapa 54 (Bloco 5).
- **Evidência:** `zapp.empresas` tem 51688 rows mas schema mínimo (6 colunas: `id, created_at, nome, email jsonb, telefone, bitrix_empresa_id`). Sem FK de/para `contacts`. Só `empresas_pkey` como index. Coluna `company` em `zapp.contacts` é `text` livre, não referencia `empresas.id`.
- **Ação:**
  1. Decidir: (a) manter `company` como texto livre (atual) e documentar que "empresa vinculada" via FK não é feature real; (b) adicionar `company_id bigint REFERENCES zapp.empresas(id)` e migrar textos para FKs.
  2. Se (b): índices em `empresas.nome` para lookup + backfill.
- **Aceite:** modelagem documentada; se FK adicionada, cascade behavior definido explicitamente.

### F5-30 — `zapp.tags` schema mistura AI tag suggestions com canonical tags — dupla responsabilidade

- **Sev:** `HIGIENE`
- **Rollback:** R-CODE
- **Origem:** Etapa 50 (Bloco 5).
- **Evidência:** `zapp.tags` tem 11 colunas: `(id, name, color, description, created_by, created_at, updated_at)` (canonical tag definition) MAIS `(contact_id, tag_name, confidence, source)` (parece ML tag suggestion linkada a contato específico). Duas responsabilidades numa tabela; UNIQUE constraint só em `name`.
- **Ação:**
  1. Separar: `zapp.tags` (canonical: id, workspace_id, name, color, description, created_by, timestamps) + `zapp.contact_tag_suggestions` (ML: id, contact_id, tag_name, confidence, source, created_at).
  2. Migrar dados existentes: rows com `contact_id NOT NULL` vão para tag_suggestions; rows canônicas ficam.
  3. Ajustar `bulk_add_tag` para operar só em canonical + criar tags.
- **📝 Revisado em 2026-08-02 — Aceite reescrito:** `zapp.tags` está com **0 rows** hoje, logo o passo 2 ("migrar dados existentes") é no-op e o Aceite original já é verdadeiro antes de qualquer mudança — não discrimina sucesso.
- **Aceite (reescrito):** (a) `zapp.contact_tag_suggestions` existe com as colunas `(id, contact_id, tag_name, confidence, source, created_at)`; (b) `zapp.tags` **não possui mais** as colunas `contact_id`, `tag_name`, `confidence`, `source` (`information_schema.columns` retorna 0 para elas); (c) `bulk_add_tag` insere em `zapp.tags` sem tocar em colunas de sugestão; (d) teste vitest cria 1 tag canônica + 1 sugestão e verifica que caem em tabelas distintas.


---

## Tema 12 — Conexões WhatsApp

_(Achados F6-01 a F6-30 registrados no Bloco 6.)_

### F6-01 — CRÍTICO (P0): pairing code (Etapa 58) 100% AUSENTE do código

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 58 (Bloco 6).
- **Evidência:** `grep -rn "pairing\|Pairing\|PAIRING\|pairing_code\|pairingCode" src` retorna **1 hit** — apenas um JSDoc em `useEvolutionApiManagement.ts` linha 296: `"lifecycle operations: create, connect, reconnect, logout, restart, delete, and QR/pairing-code retrieval"`. Nenhuma implementação. `grep -rn "pairing" no banco` também retorna 0 funções.
- **Ação:**
  1. Adicionar action `pairing-code` no edge function bridge Evolution.
  2. Implementar `whatsappConnectionService.requestPairingCode(evoName, phone)` → chama Evolution `/instance/connect?number=<phone>` retornando `{pairingCode: string, code: string}`.
  3. Adicionar botão "Usar código de emparelhamento" em `QrCodeDialog.tsx` que troca para PairingCodeDialog exibindo o código em formato `XXXX-XXXX`.
- **Aceite:** `grep -rn "pairing" src/**/*.tsx` retorna implementação real; UI mostra opção "QR" ou "código"; conexão via pairing code funciona em produção.

### F6-02 — CRÍTICO (P0): `handleAddConnection` NÃO chama Evolution `/instance/create` — só INSERT no banco

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `src/features/connections/hooks/parts/useConnectionsActions.ts` linhas ~44-65: `handleAddConnection` faz `safeClient.single('whatsapp_connections', q => q.insert({...}))` e depois chama `handleShowQrCode` que invoca `whatsappConnectionService.requestQrCode`. Nunca chama `createInstance` do `useEvolutionApi`. Instância só passa a existir no Evolution API se um sync automático (`useEvolutionAutoSync`) depois puxar — o que requer que instância já tenha sido criada por outro caminho (ex.: Evolution manager direto). Fluxo de criação via UI está quebrado.
- **Ação:**
  1. Antes do INSERT em `whatsapp_connections`, chamar `useEvolutionApi().createInstance({instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true, ...})`.
  2. Aguardar sucesso e usar `result.instance.instanceId` como `evo_instance_id`.
  3. Só então fazer INSERT no banco com dados sincronizados.
  4. Se createInstance falhar, mostrar erro e não deixar registro fantasma no banco.
- **Aceite:** teste manual — criar conexão via UI e verificar `evo.evolution_instance_credentials` recebeu nova row + Evolution manager (`https://evolution.atomicabr.com.br/manager`) mostra a instância; teste de rollback — Evolution retorna 500 → nenhum registro criado em `whatsapp_connections`.

### F6-03 — CRÍTICO (P0): estado divergente wpp2 entre `zapp.whatsapp_connections` e `evo.evolution_instance_credentials`

- **Sev:** `QUEBRADO`
- **Depende de:** **F6-04** (definir a fonte canônica antes de reconciliar o estado)
- **Rollback:** R-VIEW
- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** JOIN por `instance_name`:
  - `zapp.whatsapp_connections.wpp2`: `status='connected'`, `health_status='ok'`, `last_connected_at='2026-08-01 20:36'`
  - `evo.evolution_instance_credentials.wpp2`: `health_status='unhealthy'`, `online_instances=0`, `total_instances=1`, `last_health_check='2026-08-02 01:20'`
  
  Duas fontes de verdade, conclusões opostas para a mesma instância no mesmo momento. UI provavelmente lê de `whatsapp_connections` (frontend usa `useConnectionsManager` → `whatsappConnectionRepository.fetchConnections` → tabela `whatsapp_connections`). Usuário vê "conectado" enquanto Evolution está unhealthy. **17 alerts `wpp2_disconnection` em 7 dias** (F6-08) corroboram: Evolution API caiu 17× mas UI nunca mostrou.
- **Ação:**
  1. Definir `evo.evolution_instance_credentials.health_status` como fonte de verdade única para health.
  2. Cron `fn_update_instance_health` (já existe) escreve em `evolution_instance_credentials`; adicionar cron para propagar de volta para `whatsapp_connections.health_status`.
  3. Alternativa preferível: remover `health_status`/`last_connected_at` de `whatsapp_connections` (data drift crônico); UI lê via JOIN da view `zapp.evolution_instances`.
- **⚠️ Revisado em 2026-08-02 — evidência atualizada (a divergência permanece, os números não).** Medição atual: `zapp.whatsapp_connections.wpp2` = `status='connected'`, `health_status='ok'`, `last_connected_at='2026-08-02 02:31'`; `evo.evolution_instance_credentials.wpp2` = `health_status='degraded'` (não `'unhealthy'`), `online_instances=1` (não 0), `total_instances=1`, `last_health_check='2026-08-02 16:10'`. **Divergência confirmada** (`ok` vs `degraded`), porém menos severa que o descrito. Atualizar os valores citados antes de usar o achado como baseline.
- **Aceite:** query `SELECT wc.instance_name, wc.health_status AS ui_h, eic.health_status AS canonical_h FROM zapp.whatsapp_connections wc JOIN evo.evolution_instance_credentials eic USING (instance_name) WHERE wc.health_status IS DISTINCT FROM eic.health_status` retorna 0 rows. *(schemas qualificados na revisão — a query original dependia de `search_path`.)*

### F6-04 — CRÍTICO (P0): 2 fontes de verdade para instância (whatsapp_connections vs evolution_instance_credentials) sem canonical

- **Sev:** `RISCO`
- **Raiz de:** F6-03, F6-06, F6-13, F6-14, F6-16, F6-24 — **a maior raiz do backlog: 6 sintomas**
- **Origem:** Etapa 56, 60, 61, 64 (Bloco 6).
- **Evidência:** `zapp.whatsapp_connections` (39 colunas, 3 rows) e `evo.evolution_instance_credentials` (17 colunas, 1 row) armazenam informação sobreposta: `instance_name`, `api_url`, `api_key`, `webhook_url`, `display_name`, `department`, `is_active`, `health_status`, `last_health_check`. Frontend usa a primeira; edge functions e crons usam a segunda. `zapp.instance_registry` também existe com 22 rows e statuses distintos. **3 fontes de verdade parcialmente sobrepostas**.
- **Ação:**
  1. Decidir modelo: (a) `evolution_instance_credentials` é canonical para tudo related a Evolution API — `whatsapp_connections` vira view de compat OU (b) `whatsapp_connections` é canonical do frontend — `evolution_instance_credentials` mantém apenas segredos criptografados.
  2. Documentar em `docs/audits/instance-source-of-truth.md`.
  3. Migrar RPCs e crons para usar a canonical.
- **Aceite:** grep de `evo.evolution_instance_credentials` em código de crons não retorna referências à `zapp.whatsapp_connections`; frontend só lê a canonical.

### F6-05 — CRÍTICO (P0): `fn_reconcile_dispatch` reutiliza `request_id` do net_worker → 373 rows (22%) com applied_at anterior a dispatched_at

- **Sev:** `QUEBRADO`
- **Rollback:** R-FN
- **Origem:** Etapa 59 (Bloco 6).
- **Evidência:** `pg_get_functiondef(zapp.fn_reconcile_dispatch)` mostra `INSERT INTO evo.evolution_reconcile_jobs (request_id) VALUES (v_req_id) ON CONFLICT (request_id) DO UPDATE SET dispatched_at = now()`. `pg_net` recicla request_ids ao longo do tempo. Quando `request_id` colide com o de um job antigo, o UPDATE só toca `dispatched_at`, preservando `applied_at` antigo do job anterior. Resultado: `SELECT COUNT(*) FROM evo.evolution_reconcile_jobs WHERE applied_at < dispatched_at - INTERVAL '1 day'` retorna **373 rows de 1663 (22%)**. Sample: id=24041 tem `dispatched_at=2026-08-02 01:15` mas `applied_at=2026-07-28 03:31` (delta=-4d21h44min).
- **Ação:**
  1. Trocar `ON CONFLICT (request_id) DO UPDATE` por `ON CONFLICT DO NOTHING`.
  2. Ou usar `id bigserial` como PK e `request_id` como coluna secundária sem UNIQUE (permite duplicate request_ids ao longo do tempo). **Revisado 2026-08-02:** a PK **já é** `id` (`evolution_reconcile_jobs_pkey`); o que existe a mais é `evolution_reconcile_jobs_request_id_key UNIQUE (request_id)` — o passo 2 se reduz a `DROP CONSTRAINT evolution_reconcile_jobs_request_id_key`. Números atuais: **361 anômalos de 1609** (22,4%); corpo com `ON CONFLICT (request_id) DO UPDATE SET dispatched_at = now()` confirmado literalmente.
  3. Backfill: `UPDATE evo.evolution_reconcile_jobs SET applied_at = NULL WHERE applied_at < dispatched_at`.
- **Aceite:** query `SELECT COUNT(*) FROM evo.evolution_reconcile_jobs WHERE applied_at < dispatched_at - INTERVAL '1 hour'` retorna 0 após 7 dias; métrica de latência de reconcile fica confiável.

### F6-06 — CRÍTICO (P0): `fn_alert_wpp2_disconnection` hardcoded para instance_name='wpp2' — não escala multi-instância

- **Sev:** `RISCO`
- **Depende de:** **F6-04**
- **Rollback:** R-FN
- **Origem:** Etapa 60, 61 (Bloco 6).
- **Evidência:** `SELECT status, phone_number, ... FROM zapp.whatsapp_connections WHERE instance_name = 'wpp2' LIMIT 1`. Alert body: `format('Instancia wpp2 (%s) desconectada ha %s minutos', ...)`. Também `evo.fn_bootstrap_wpp2_instance` (nome hardcoded), cron `wpp2_disconnection_watchdog` (jobid 104), cron `wpp2-session-expiry-watchdog` (jobid 120). **Multi-instância** (Etapa 61) é fantasia com esse pattern.
- **Ação:**
  1. Refatorar `fn_alert_wpp2_disconnection()` → `fn_alert_instance_disconnection(p_instance text DEFAULT NULL)` que itera sobre `SELECT instance_name FROM zapp.whatsapp_connections WHERE is_active AND api_type='evolution'`.
  2. Renomear crons: `wpp2_disconnection_watchdog` → `instance_disconnection_watchdog`.
  3. Refatorar `fn_bootstrap_wpp2_instance` para receber `p_instance_name`.
- **📝 Revisado em 2026-08-02 — Aceite inatingível pela Ação.** Referências conferidas e corretas: `fn_alert_wpp2_disconnection` resolve para **`zapp`**, `evo.fn_bootstrap_wpp2_instance` existe em `evo`, crons 104 (`*/10 6-23 * * *`) e 120 (`*/15 * * * *`) existem. **Porém: `SELECT ... FROM pg_proc WHERE prosrc ILIKE '%wpp2%'` retorna 47 funções** (em `zapp`, `evo`, `ops` e `monitoring`) — a Ação refatora 3. O Aceite como escrito nunca fecha.
- **Aceite (reescrito):** (a) as 3 funções nomeadas na Ação não contêm mais `'wpp2'` literal; (b) `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosrc ILIKE '%wpp2%' AND n.nspname IN ('zapp','evo')` cai de 47 para o inventário residual documentado em ADR (funções de bootstrap/migração histórica podem manter o literal, desde que listadas); (c) adicionar 2ª instância ativa dispara alerta de desconexão para ela.

### F6-07 — `fn_alert_wpp2_disconnection` NÃO é SECURITY DEFINER — inconsistente com pattern das outras funções afins

- **Sev:** `RISCO`
- **Rollback:** R-POL
- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** `SELECT prosecdef FROM pg_proc WHERE proname='fn_alert_wpp2_disconnection'` → `false`. Todas as outras funções afins (`fn_alert_connection_drift`, `fn_reconcile_dispatch`, `fn_reconcile_apply`, `fn_sync_instance_registry_status`, `fn_detect_401_bursts`) são `SECDEF=true`. A função lê `zapp.whatsapp_connections` e insere em `evo.evolution_alerts` — se chamada por cron owner `postgres`, funciona; se chamada por RPC de authenticated, pode ser bloqueada por RLS.
- **Ação:** `ALTER FUNCTION zapp.fn_alert_wpp2_disconnection() SECURITY DEFINER SET search_path = pg_catalog, zapp, evo, public`.
- **📝 Revisado em 2026-08-02 — Aceite falha mesmo após a Ação.** `prosecdef=false` confirmado para `zapp.fn_alert_wpp2_disconnection`, e as afins citadas são todas `true` (`fn_alert_connection_drift`, `fn_reconcile_dispatch`, `fn_reconcile_apply`, `fn_sync_instance_registry_status`, `fn_detect_401_bursts`). **Mas existe uma segunda exceção não citada: `zapp.fn_alert_connection_lost` também é `prosecdef=false`.** A Ação corrige 1 função; o Aceite exige 2.
- **Ação (complemento):** aplicar o mesmo `ALTER FUNCTION ... SECURITY DEFINER SET search_path = pg_catalog, zapp, evo, public` em `zapp.fn_alert_connection_lost()`.
- **Aceite:** `SELECT proname FROM pg_proc WHERE proname LIKE 'fn_alert_%' AND NOT prosecdef` retorna 0 rows.

### F6-08 — CRÍTICO (P0): 17 de 18 alerts `wpp2_disconnection` nunca resolvidos (94% backlog) — alert fatigue

- **Sev:** `DEGRADADO`
- **Rollback:** R-FN
- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** `SELECT COUNT(*), COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) FROM evo.evolution_alerts WHERE alert_type='wpp2_disconnection'` → `total_ever=18, resolved=1, acked=1`. Alertas nas últimas 10h: 8:00, 9:00, 10:00, 11:10, 12:10, 13:20, 14:20, 15:30, 16:30, 17:40 — um por hora. Anti-flood check `created_at > now() - 60 minutes AND resolved_at IS NULL` funciona (guardaria a alerta a cada 1h), MAS como `resolved_at` nunca é setado, alertas se acumulam indefinidamente sem trigger de auto-close quando instância volta.
- **Ação:**
  1. Trigger em `zapp.whatsapp_connections` AFTER UPDATE OF status: se `NEW.status = 'connected' AND OLD.status != 'connected'`, executar `UPDATE evo.evolution_alerts SET resolved_at = now(), resolved_by='auto:reconnected' WHERE alert_type='wpp2_disconnection' AND resolved_at IS NULL`.
  2. Cron `auto-resolve-stale-alerts` (a cada 1h): resolver alertas `wpp2_disconnection` onde instância voltou.
  3. Purge de alertas `resolved_at < now() - 30d` (cron `purge_evolution_alerts` já existe — verificar se filtra corretamente).
- **Aceite:** `SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL) FROM evo.evolution_alerts WHERE alert_type='wpp2_disconnection'` cai para <= 1 em 24h após reconexão.

### F6-09 — CRÍTICO (P0): cron `wpp2_disconnection_watchdog` (104) schedule `*/10 6-23 * * *` — 6h gap noturno de detecção (23h→6h)

- **Sev:** `RISCO`
- **Rollback:** R-CRON
- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** Schedule limita execução a `6-23` (06:00 até 23:59). Entre 23:00 e 06:00 (7 horas) o watchdog não roda. Se WhatsApp cair às 02:00, alerta só chega às 06:10 — 4h+ de delay. Também `message_pipeline_stalled_alert` `0 8-22 * * *` = 10h gap.
- **Ação:**
  1. Trocar schedule para `*/10 * * * *` (24h/dia).
  2. Se preocupação era pager fatigue noturno, filtrar dentro da função: `IF EXTRACT(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') NOT BETWEEN 8 AND 22 THEN severity='low' ELSE 'critical' END`.
  3. Aplicar mesmo pattern em `message_pipeline_stalled_alert`.
- **Aceite:** `SELECT schedule FROM cron.job WHERE jobname='wpp2_disconnection_watchdog'` = `*/10 * * * *`; disconnection às 03:00 gera alerta em <10min.

### F6-10 — ~~OBSOLETO~~ cron `sync-instance-registry-status` (96) perdeu 11% das execuções em 24h (256/288)

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Rollback:** R-CRON
- **Origem:** Etapa 64 (Bloco 6).
- **Evidência:** Schedule `2-59/5 * * * *` (a cada 5min, offset 2min) = esperado 12 execuções/hora × 24h = 288/dia. `SELECT COUNT(*) FROM cron.job_run_details WHERE jobid=96 AND start_time > NOW() - INTERVAL '24 hours'` retorna 256. 32 execuções perdidas (11%). Provável causa: concorrência com outros crons que usam mesmo pool, ou reboots de container postgres.
- **Ação:**
  1. Verificar `cron.job_run_details WHERE jobid=96 ORDER BY start_time DESC LIMIT 100` para identificar padrão de gaps.
  2. Se sistemático, escalonar schedule offset para reduzir contention.
  3. Adicionar métrica em `zapp.warroom_alerts` quando gap > 15min.
- **🔄 Revalidado em 2026-08-02 — condição não existe mais.** `SELECT status, count(*) FROM cron.job_run_details WHERE jobid=96 AND start_time > now() - interval '24 hours'` retorna **288 `succeeded` / 0 falhas = 100%** — acima do próprio Aceite (>= 97%). A perda de 11% era transitória (provável reboot de container na janela original). Manter o item 3 da Ação (alerta quando gap > 15min) como melhoria preventiva, se desejado.
- **Aceite:** execuções em 24h >= 280/288 (>= 97%). **Já satisfeito: 288/288.**

### F6-11 — 6 triggers em `zapp.whatsapp_connections`; 4 são duplicatas divergentes (2 pares)

- **Sev:** `RISCO`
- **Rollback:** R-FN
- **Origem:** Etapa 62 (Bloco 6).
- **Evidência:** `pg_trigger` mostra 6 triggers:
  - `update_whatsapp_connections_updated_at` (função `update_updated_at_column`) + `trg_wconn_updated_at` (função `fn_wconn_updated_at`) — ambos BEFORE UPDATE fazendo `NEW.updated_at = now()`. Duplicata funcionalmente pura.
  - `clear_qr_on_connect_trigger` (função `clear_qr_on_connect`) + `trg_clear_qr_connect` (função `fn_clear_qr_on_connect`) — ambos BEFORE UPDATE limpando QR. **Divergentes**: primeiro só limpa `qr_code`; segundo limpa `qr_code + qr_code_base64` e seta `connected_at`, `last_connected_at`, `disconnected_at`.
  - `trg_validate_whatsapp_connection_url` — OK
  - `trg_log_whatsapp_connection_state_change` — OK
- **Ação:**
  1. `DROP TRIGGER update_whatsapp_connections_updated_at ON zapp.whatsapp_connections` (versão antiga).
  2. `DROP TRIGGER clear_qr_on_connect_trigger` (versão antiga, incompleta).
  3. Manter `trg_wconn_updated_at` e `trg_clear_qr_connect` (versões novas).
- **Aceite:** `SELECT COUNT(*) FROM pg_trigger WHERE tgrelid='zapp.whatsapp_connections'::regclass AND NOT tgisinternal` retorna 4.

### F6-12 — `fn_validate_whatsapp_connection_url` cai para hardcoded default se vault vazio — não fail-secure

- **Sev:** `SEC`
- **Rollback:** R-FN
- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** Trigger body: `SELECT decrypted_secret INTO v_allowed_url FROM vault.decrypted_secrets WHERE name = 'evolution_api_url'; IF v_allowed_url IS NULL THEN v_allowed_url := 'https://evolution.atomicabr.com.br'; END IF`. Se vault estiver corrompido/vazio, valida contra URL hardcoded — permite INSERTs mesmo em ambiente onde vault deveria ser fonte única. Also, mensagem de erro do `RAISE EXCEPTION` **expõe a URL esperada** (`api_url invalida: X | esperado: Y`) — potencial info leak.
- **Ação:**
  1. Remover fallback hardcoded: `IF v_allowed_url IS NULL THEN RAISE EXCEPTION 'vault.evolution_api_url ausente' USING ERRCODE = '42501' END IF`.
  2. Mensagem genérica: `RAISE EXCEPTION 'api_url invalida' USING DETAIL = format('recebido: %s', NEW.api_url)`.
- **Aceite:** vault vazio → INSERT rejeitado com erro claro; mensagem não vaza URL esperada.

### F6-13 — CRÍTICO (P0): `api_url` e `api_key` são NOT NULL sem default — INSERT via `useConnectionsActions.handleAddConnection` faltaria valores

- **Sev:** `RISCO`
- **Depende de:** **F6-04**
- **Rollback:** R-DDL
- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** Schema de `zapp.whatsapp_connections`: `api_url text NOT NULL` (sem default), `api_key text NOT NULL` (sem default). `handleAddConnection` faz INSERT com só 7 colunas: `name, phone_number, instance_id, instance_name, status, is_default, api_type`. Sem `api_url` e `api_key`. INSERT deveria falhar por NOT NULL. As 3 rows atuais em produção têm valores — indica que INSERTs foram feitos por outro caminho (Evolution manager? seed migration?). UI provavelmente nunca conseguiu criar conexão.
- **Ação:**
  1. Adicionar defaults: `ALTER TABLE zapp.whatsapp_connections ALTER COLUMN api_url SET DEFAULT (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'evolution_api_url')`.
  2. `api_key` é per-instance no Evolution API — populado após `createInstance()` retornar `hash`. Fluxo correto (após F6-02 fix): (a) createInstance retorna `hash`, (b) INSERT com `api_key = <hash>`.
  3. Adicionar teste que confirma que INSERT via `useConnectionsActions.handleAddConnection` funciona ponta-a-ponta em ambiente limpo.
- **Aceite:** criar conexão nova via UI funciona; row tem `api_url` e `api_key` populados.

### F6-14 — Só 1 registro em `evo.evolution_instance_credentials` (wpp2); 2 conexões em `whatsapp_connections` órfãs

- **Sev:** `HIGIENE`
- **Depende de:** **F6-04**
- **Origem:** Etapa 63, 64 (Bloco 6).
- **Evidência:** LEFT JOIN `whatsapp_connections wc LEFT JOIN evolution_instance_credentials eic USING (instance_name)` mostra: `wpp2` (JOINed), `wppmkt` (eic=NULL), `wpp_pink_test` (eic=NULL). Cron 96 (`sync-instance-registry-status`) rodou 810x em 7d mas não corrigiu essas 2 órfãs. Instance drift real.
- **Ação:**
  1. Investigar por que `sync-instance-registry-status` não popula `evolution_instance_credentials` para essas instâncias.
  2. Decidir: (a) as 2 órfãs são zombie state (nunca provisionadas no Evolution) — deletar; (b) provisionar no Evolution API + popular credentials.
  3. Adicionar constraint `FOREIGN KEY (instance_name) REFERENCES evolution_instance_credentials(instance_name)` em `whatsapp_connections` (após limpeza) para prevenir órfãs futuras.
- **Aceite:** LEFT JOIN retorna 0 rows com `eic IS NULL`; FK constraint ativa.

### F6-15 — "WPP Marketing (Cloud API Oficial)" tem `api_type='evolution'` — nome enganoso vs config real

- **Sev:** `HIGIENE`
- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** Row: `name='WPP Marketing (Cloud API Oficial)'`, `api_type='evolution'`, `instance_id=NULL`, `is_active=false`, `health_status='provisioned'`. Nome sugere Meta Cloud API, `api_type` diz Evolution. Provavelmente configurada incorretamente, ficou dormente. Confusão para operador.
- **Ação:**
  1. Confirmar com stakeholder se conexão deve usar Cloud API ou Evolution.
  2. Se Cloud API: `UPDATE whatsapp_connections SET api_type='official' WHERE id='5658bc88-...'`.
  3. Se abandonada: deletar com purge de referências.
  4. Adicionar validação em `useConnectionsActions.handleAddConnection`: se nome contém "Cloud API" ou "Oficial", forçar `api_type='official'`.
- **Aceite:** row corrigida OU deletada; UI não permite criar conexão com nome/type divergentes.

### F6-16 — CRÍTICO (P0): `created_by = NULL` em 3/3 rows de `whatsapp_connections` — ownership perdida

- **Sev:** `SEC`
- **Depende de:** **F6-04**
- **Rollback:** R-FN
- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `SELECT COUNT(*) FILTER (WHERE created_by IS NULL) FROM zapp.whatsapp_connections` = 3 (todas as rows). Sem trilha de ownership. Combinado com F6-17 (RLS permite orphan INSERTs), qualquer authenticated pode listar/editar conexões porque a policy `wconn_insert_auth` também tem cláusula `created_by IS NULL OR ...`. Sem accountability.
- **Ação:**
  1. Backfill: `UPDATE whatsapp_connections SET created_by = (SELECT id FROM auth.users WHERE email='<owner>@promobrindes.com.br')` para rows históricas.
  2. Adicionar `created_by uuid NOT NULL DEFAULT auth.uid()` em `zapp.whatsapp_connections`.
  3. Trigger BEFORE INSERT que rejeita se `NEW.created_by IS NULL` (após backfill).
- **Aceite:** `SELECT COUNT(*) FILTER (WHERE created_by IS NULL) FROM whatsapp_connections` = 0; INSERT sem `created_by` recebe auto-populate ou falha.

### F6-17 — CRÍTICO (P0): RLS `wconn_insert_auth` policy `WITH CHECK (created_by IS NULL OR created_by = auth.uid())` permite orphan INSERTs

- **Sev:** `SEC`
- **Rollback:** R-POL
- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `pg_get_expr(polwithcheck)` = `((created_by IS NULL) OR (created_by = auth.uid()))`. Cláusula `(created_by IS NULL)` permite INSERT sem ownership — combinado com F6-16, é como as 3 rows atuais entraram. Sem workspace/tenant filter na policy.
- **Ação:**
  1. `ALTER POLICY wconn_insert_auth ON zapp.whatsapp_connections WITH CHECK (created_by = auth.uid() AND workspace_id = (SELECT workspace_id FROM zapp.profiles WHERE user_id = auth.uid()))`.
  2. Adicionar `workspace_id uuid NOT NULL` em `whatsapp_connections` primeiro (multi-tenant, alinhado com F5-16).
- **Aceite:** INSERT com `created_by IS NULL` recebe `new row violates row-level security policy`.

### F6-18 — Policy `auth_secure_123` (nome de código de teste) em produção

- **Sev:** `SEC`
- **Rollback:** R-POL
- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `SELECT polname FROM pg_policy WHERE polrelid='zapp.whatsapp_connections'::regclass` retorna `auth_secure_123` entre as 4 policies. Nome sugere teste/debug (`_123` suffix). Policy USING: `(has_role(auth.uid(), 'agent'::zapp.app_role) OR is_admin_or_supervisor())`. Funcionalmente equivalente a `whatsapp_connections_admin_write`, mas com nome não profissional.
- **Ação:** `ALTER POLICY auth_secure_123 ON zapp.whatsapp_connections RENAME TO whatsapp_connections_agent_or_admin_read`.
- **Aceite:** grep por policies com `_[0-9]` suffix em pg_policy retorna 0 hits em `zapp.*`.

### F6-19 — CRÍTICO (P0): `evo.evolution_ip_watch` = 0 rows total — pipeline VPS→DB de detecção 401 morto

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 65 (Bloco 6).
- **Evidência:** `SELECT COUNT(*), MAX(created_at) FROM evo.evolution_ip_watch` → `total=0, newest=NULL`. Comentário dentro de `fn_detect_401_bursts` confirma: `"BLIND: evolution_ip_watch=0 rows — VPS log pipeline (Traefik→DB) not active"`. Pipeline documentado como quebrado há semanas (`Ref: AUDITORIA_EVO_API_2026-07-12.md OBS-2`).
- **Ação:**
  1. Escolher entre: (a) configurar Traefik access log → PostgREST insert em `evo.evolution_ip_watch`; (b) usar GlitchTip (que já recebe 401s desde 2026-07-12) como fonte + edge function que faz pull periódico; (c) descontinuar `evolution_ip_watch` e refatorar `fn_detect_401_bursts` para depender só de outras fontes.
  2. Decisão documentada com owner + prazo.
- **Aceite:** OU pipeline reativado (`SELECT COUNT(*) FROM evo.evolution_ip_watch WHERE created_at > NOW() - INTERVAL '1 day'` > 0) OU função refatorada + tabela DROPada.

### F6-20 — CRÍTICO (P0): `fn_detect_401_bursts` documenta seu próprio "monitoring gap" no comentário — cega por design atual

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 65 (Bloco 6).
- **Evidência:** Body da função contém string literal: `'evo.evolution_ip_watch=0 registros históricos. Ação: configurar Traefik access log → Supabase API. Monitoramento DB-side cego até lá.'`. Função também insere CHECKLIST inteiro no `message` de alertas (7 passos para operador seguir). **Antipattern**: documentação misturada com telemetria; alerta polui `warroom_alerts` sem oferecer detecção real.
- **Ação:**
  1. Após F6-19 (pipeline funcional), remover checklist do body da função — mover para runbook em `docs/runbooks/evolution-401-burst.md`.
  2. Alerta faz REFERÊNCIA ao runbook: `See docs/runbooks/evolution-401-burst.md`, não copia conteúdo.
  3. Simplificar função para apenas detecção real (sem alertas informativos sobre "modo cego").
- **Aceite:** função tem <100 linhas (atualmente >100); checklist migrado para markdown; alertas contêm apenas dado relevante ao momento.

### F6-21 — CRÍTICO (P0): 373 reconcile_jobs (22%) com `applied_at < dispatched_at - 1 day` — telemetria corrompida

- **Sev:** `QUEBRADO`
- **Rollback:** R-FN
- **Origem:** Etapa 59 (Bloco 6).
- **Evidência:** Consequência direta de F6-05. `SELECT COUNT(*) FROM evo.evolution_reconcile_jobs WHERE applied_at < dispatched_at - INTERVAL '1 day'` retorna 373 de 1663 total. Qualquer métrica de "tempo médio de reconcile" ou "latência p95" computada dessa tabela é **completamente falsa**.
- **Ação:**
  1. Corrigir F6-05 primeiro.
  2. Backfill: `UPDATE evo.evolution_reconcile_jobs SET applied_at = NULL WHERE applied_at < dispatched_at`.
  3. Recomputar métricas históricas com filtro `applied_at >= dispatched_at`.
  4. Adicionar assertion no proxima migration: `ALTER TABLE evo.evolution_reconcile_jobs ADD CONSTRAINT chk_applied_after_dispatched CHECK (applied_at IS NULL OR applied_at >= dispatched_at)`.
- **Aceite:** constraint aceita; futuras rows sempre `applied_at >= dispatched_at`.

### F6-22 — 1389 alertas em `zapp.warroom_alerts` em 7d (863 info + 385 critical + 141 warning) — alert fatigue extrema

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 60, 65 (Bloco 6).
- **Evidência:** `SELECT alert_type, COUNT(*) FROM warroom_alerts WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY 1`: `info=863, critical=385, warning=141`. **385 críticos em 7 dias = 55/dia = >2/hora**. Se ninguém age em >99% dessas alertas (padrão de F6-08), sinal:ruído é catastrófico. Alertas de "critical" perdem significado quando são a norma.
- **Ação:**
  1. Auditoria de 24h: para cada `alert_type`, catalogar (a) quem consome (Slack/email/PagerDuty), (b) taxa de ação real, (c) tempo médio até resolução.
  2. Reclassificar: alertas com ação=0% em 7d viram `info` ou são descontinuados.
  3. Rate limit por `alert_type`: máximo 1 por hora, exceto se novos dados são materialmente diferentes.
  4. Deduplicação: agregar N alertas do mesmo tipo/janela em 1 alerta com `count`.
- **Aceite:** `SELECT COUNT(*) FROM warroom_alerts WHERE alert_type='critical' AND created_at > NOW() - INTERVAL '7 days'` cai para <= 50 (redução de 87%); taxa de resolução `resolved_at IS NOT NULL` > 60%.

### F6-23 — `evo.evolution_alerts` 269 unresolved backlog — nenhum triage

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** `SELECT COUNT(*) FROM evo.evolution_alerts WHERE resolved_at IS NULL AND acknowledged_at IS NULL` = 269. Zero triage/acknowledge. Cron `purge_evolution_alerts` (65) rodando diariamente às 04:00 — mas só purga rows antigas, não força triage.
- **Ação:**
  1. Dashboard admin (`AdminAlertHistoryPage.tsx` — já existe) com contador de "pendentes por severidade" no topo.
  2. SLA: alertas `critical` acknowledged em <15min, `high` em <1h, `medium` em <4h.
  3. Auto-escalation: alerta critical sem ack por 30min notifica PagerDuty.
  4. Alinhar com F6-08 (auto-resolve quando condição volta).
- **Aceite:** `unresolved_count` cai para <= 20 em 30 dias.

### F6-24 — `zapp.instance_registry` tem 22 rows; só 3 provisionadas (14%)

- **Sev:** `HIGIENE`
- **Depende de:** **F6-04**
- **Origem:** Etapa 61, 64 (Bloco 6).
- **Evidência:** `SELECT status, COUNT(*) FROM zapp.instance_registry GROUP BY status`: `archived, connected, not_provisioned` totalizando 22. Apenas 3 estão em `whatsapp_connections` (fonte real). 19 registradas mas não provisionadas ou arquivadas.
- **⚠️ Revisado em 2026-08-02 — números corrigidos.** A distribuição real é **`not_provisioned=20`, `archived=1`, `connected=1`** (total 22). Ou seja: **1 provisionada (4,5%)**, não 3 (14%). As 3 rows de `whatsapp_connections` não têm correspondência 1:1 com `status='connected'` no registry — reforça o descasamento de F6-04/F6-14. O item 2 da Ação (documentar `instance_registry` como "registry de intenção") fica ainda mais justificado.
- **Ação:**
  1. Auditar as 22 rows: para cada, decidir manter (relevância histórica), archive, ou hard-delete.
  2. Documentar `instance_registry` como "registry de intenção" separado de "instâncias reais" (whatsapp_connections/evolution_instance_credentials).
  3. Adicionar coluna `archived_reason` para justificar archives.
- **Aceite:** registry tem só rows justificadas; `not_provisioned` count = 0 OU tem `archived_reason` claro.

### F6-25 — `instance_auth_events` últimas 17 rows com `event_type=NULL`, `http_status=NULL`, `success=false` — instrumentação quebrada

- **Sev:** `QUEBRADO`
- **Rollback:** R-FN
- **Origem:** Etapa 65 (Bloco 6).
- **Evidência:** `SELECT event_type, http_status, success, COUNT(*) FROM zapp.instance_auth_events WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY 1,2,3` retorna **UMA row**: `event_type=NULL, http_status=NULL, success=false, count=17`. Todas as 17 inserções falharam em popular os campos essenciais. Instrumentação do lado do produtor (edge function/trigger) está quebrada — schema espera dados, produtor envia só shell.
- **⚠️ Revisado em 2026-08-02 — o problema é MUITO maior que o descrito.** Não são 17 rows nas últimas 24h: a tabela tem **2.495 rows no total, das quais 2.495 (100%) têm `event_type IS NULL` e `success = false`**. Nenhuma row jamais foi gravada corretamente. Além disso o produtor **parou**: última row em `2026-08-01 15:40`, **0 rows nas últimas 24h**. Reescrever a Evidência com esses números — a Ação (investigar produtor + NOT NULL) continua correta, mas a prioridade sobe.
- **Ação:**
  1. Investigar quem escreve em `zapp.instance_auth_events`: grep `instance_auth_events` em edge functions e RPCs.
  2. Adicionar NOT NULL constraints em `event_type` e `success` para forçar produtor a preencher.
  3. Log estruturado no produtor.
- **Aceite:** `SELECT COUNT(*) FILTER (WHERE event_type IS NULL) FROM zapp.instance_auth_events WHERE created_at > NOW() - INTERVAL '1 day'` = 0 após correção.

### F6-26 — Test coverage módulo connections: 2 test files para ~30 arquivos (0 tests em componentes)

- **Sev:** `HIGIENE`
- **✅ Corrigido em 2026-08-02 (Etapa 2, Bloco D).** **9 arquivos de teste novos, 211 testes, todos verdes.** Aceite verificado com `vitest --coverage`:
  - `src/features/connections/` → **62,67% linhas** (era ~0% fora de `useConnectionsState`) ✅
  - `src/services/connections/` → **75,28% linhas** (era **0%**) ✅
- **Prioridade da Ação respeitada:** `useConnectionsActions` primeiro (23 testes — F6-02 depende dele), depois `whatsappConnectionService` (35), depois componente com 0/1/N.
- **Arquivos cobertos a 100% de linhas:** `useConnectionsActions`, `whatsappConnectionService`, `whatsappConnectionRepository`, `useConnectionsRealtime`, `WhatsAppConnectionStatus`, `connectionsService`, `connectionsRepository`, `BridgeService`, `useConnectionsMutations`, `ConnectionsStats`.
- **⚠️ Desvio de escopo na Ação 3:** o snapshot pedido era de `ConnectionsView` (649 linhas, arrasta diálogos, portais e estado global). Foi coberto `ConnectionsStats` em seu lugar — é onde mora a regra de contagem 0/1/N (empty state, singular, plural) que a Ação queria exercitar, sem o custo de montar a view inteira. `ConnectionsView` segue sem teste.
- **Não coberto:** `useConnectionsManager.ts` (333 linhas, 0%) — orquestrador com Evolution API, realtime e Supabase externo acoplados; é sozinho o motivo de `features/connections` parar em 62,67% e não mais. Registrado como **E02-N09**. Também sem cobertura: `useConnectionsQueries.ts` e os 30+ componentes de `src/components/connections/` (fora dos dois diretórios do Aceite).
- **Achado colateral:** o gate de lint recém-armado reprovou um import de domínio no próprio teste (`@/features/connections/services/...` violando o `no-restricted-imports`). Corrigido com caminho relativo intra-feature — o guard funcionou como projetado.
- **Origem:** Etapa 56-65 (Bloco 6).
- **✅ Revisado em 2026-08-02:** os 2 test files confirmados (`useConnectionsState.test.ts`, `useHubTabNavigation.test.tsx`). **Escopo real subestimado:** o módulo tem **52 arquivos** (14 em `src/features/connections/` + 32 em `src/components/connections/` + 6 em services), não ~30.
- **Evidência:** `find src -path "*connection*" -name "*.test.*"` retorna 2 files: `useHubTabNavigation.test.tsx` e `useConnectionsState.test.ts` (328 linhas). Zero tests para: `useConnectionsActions` (100+ linhas de business logic crítica), `useConnectionsRealtime`, `useConnectionsManager` (dispatcher central), `whatsappConnectionService`, `whatsappConnectionRepository`, `BridgeService`, e **30+ componentes** (ConnectionsView 649 linhas, ConnectionCard 359, InstanceSettingsDialog 496, etc.).
- **Ação:**
  1. Priorizar tests para `useConnectionsActions` (F6-02 depende desses tests para regressão).
  2. Tests para `whatsappConnectionService` mockando Evolution API.
  3. Snapshot tests para ConnectionsView com 0/1/N conexões (empty state, single, plural).
- **Aceite:** coverage do módulo `src/features/connections/` e `src/services/connections/` >= 60% linhas cobertas.

### F6-27 — CRÍTICO (P0): `useEvolutionAutoSync` faz SELECT sem filtro por workspace/user — cross-tenant leak potencial

- **Sev:** `SEC`
- **Rollback:** R-POL
- **Origem:** Etapa 61 (Bloco 6).
- **Evidência:** `src/hooks/useEvolutionAutoSync.ts` linhas 20-30: `supabase.from('whatsapp_connections').select('instance_id, phone_number')`. Sem `.eq('workspace_id', currentWorkspace)`. Depende só de RLS. Se RLS `contacts_select`-style estiver frouxa (F6-17, F6-18), retorna instâncias de outros tenants. Pior: `INSERT` de instância "missing" sem check de workspace pode acidentalmente atribuir instância de tenant A ao workspace de user B.
- **Ação:**
  1. Adicionar `.eq('workspace_id', workspace.id)` no SELECT (workspace via context).
  2. INSERT com `workspace_id = workspace.id` explícito.
  3. Alinhado com F5-16 (workspace_id real em contatos) e F6-17 (RLS multi-tenant real).
- **Aceite:** user de workspace A não vê/importa instâncias de workspace B; teste com 2 workspaces confirma isolamento.

### F6-28 — `handleDelete` engole erro do Evolution API `.catch(log.warn)` — deixa instância órfã lá

- **Sev:** `RISCO`
- **Origem:** Etapa 63 (Bloco 6).
- **Evidência:** `src/features/connections/hooks/parts/useConnectionsActions.ts` linhas ~120-125: `await deleteInstance(evoName).catch((e) => log.warn('Failed to delete evolution instance:', e))`. Se Evolution API 5xx, delete no banco continua — instância fica órfã no Evolution manager, consumindo recursos, potencialmente ainda recebendo webhooks para uma tabela que não existe mais.
- **Ação:**
  0. **📝 Revisado em 2026-08-02:** `.catch((e) => log.warn(...))` confirmado em `src/features/connections/hooks/parts/useConnectionsActions.ts` **l.125**. **Mas `zapp.evolution_pending_deletes` NÃO EXISTE** — a Ação manda enfileirar numa tabela que precisa ser criada antes. Sem esse passo, a esteira falha com `relation does not exist`.
  1. **Criar** `zapp.evolution_pending_deletes (id uuid PK default gen_random_uuid(), instance_name text NOT NULL, requested_by uuid, requested_at timestamptz NOT NULL default now(), attempts int NOT NULL default 0, last_error text, resolved_at timestamptz)` + RLS + cron de retry. Só então: se `deleteInstance` falhar com retry-able (5xx, timeout), enfileirar nela.
  2. Se falhar com 404 (já deletada), OK continuar.
  3. Se 4xx (auth/perms), abortar delete no banco e alertar usuário.
- **Aceite:** teste com Evolution 500 → banco não deleta, tarefa fica em pending_deletes; cron retry resolve.

### F6-29 — `handleAddConnection` valida só `name` — permite `phone_number` vazio

- **Sev:** `RISCO`
- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `useConnectionsActions.handleAddConnection`: `if (!newConnection.name) { toast(...); return; }`. Não valida `phone_number`. INSERT com phone vazio passa (`phone_number` é nullable no schema). Depois, `useEvolutionAutoSync` matcha por phone e não encontra match, criando duplicatas.
- **Ação:**
  1. Adicionar validação: `if (!newConnection.phone_number || !isValidBrazilianPhone(newConnection.phone_number)) { toast('Número inválido'); return; }`.
  2. Schema Zod para `NewConnectionData` com `phone_number: z.string().regex(BR_PHONE_REGEX)`.
- **Aceite:** teste — click "Conectar" com phone vazio → toast erro, sem INSERT.

### F6-30 — Múltiplas cópias de tabelas em múltiplos schemas: 13 objetos para 5 nomes distintos

- **Sev:** `HIGIENE`
- **Rollback:** R-DDL
- **Origem:** Etapa 56, 60, 61 (Bloco 6).
- **Evidência:** `pg_class`:
  - `qr_attempts`: 2 (zapp TABLE, public VIEW)
  - `evolution_reconcile_jobs`: 3 (evo TABLE, public VIEW, zapp VIEW)
  - `evolution_alerts`: 3 (evo TABLE, public VIEW, zapp VIEW)
  - `evolution_instance_credentials`: 3 (evo TABLE, public VIEW, zapp VIEW)
  - `instance_auth_events`: 2 (zapp TABLE, public VIEW)
  
  13 objetos para 5 conceitos. Views compat criadas para PostgREST/Supabase auto-expose em schemas `public` e `zapp`. Manutenção multiplicada por 3.
- **Ação:**
  1. Documentar em `docs/db/schema-topology.md` qual é canonical para cada conceito.
  2. Views compat devem ser thin passthroughs (`SELECT * FROM canonical`), não têm lógica.
  3. Auditar se PostgREST realmente precisa de views em `public` — se todas as tabelas relevantes estão em schemas expostos (via `db-schemas` config), pode dispensar.
  4. Se necessário, gerar views compat via migration reproduzível (não manual).
- **Aceite:** `docs/db/schema-topology.md` mapeia canonical → compat views; cron `ensure-evolution-backcompat-views` (jobid 138) sincroniza (já existe).

---

## Tema 13 — Admin, monitoramento, dashboards (Bloco 7)

### F7-01 — `PerformanceDashboard.tsx` renderiza `// @technical` como texto literal em 3 blocos JSX

- **Sev:** `HIGIENE`
- **Raiz de:** F7-02, F7-03
- **Origem:** Etapa 66 (Bloco 7).
- **Evidência:** `src/pages/admin/PerformanceDashboard.tsx` linhas ~120-140 (bloco "Budget de Performance (CI Gate)"): 3 ocorrências de `// @technical` fora de `{/* */}` — texto renderizado no DOM. Usuário vê `< 2500ms // @technical` na tela.
- **Ação:**
  1. Trocar por comentário JSX válido: `{/* @technical */}` ou remover.
  2. Adicionar teste de snapshot da `PerformanceDashboard` para pegar strings inesperadas.
  3. Lint rule (ESLint plugin `react/jsx-no-comment-textnodes`).
- **Aceite:** DOM não contém texto `// @technical`; teste snapshot passa.

### F7-02 — `AdminBridgeStatusPage.tsx` mesmo bug após `</p>`

- **Sev:** `HIGIENE`
- **Depende de:** **F7-01** (mesmo bug e mesma lint rule)
- **Origem:** Etapa 66 (Bloco 7).
- **Evidência:** `src/pages/admin/AdminBridgeStatusPage.tsx` linha ~65: `// @technical` aparece como texto entre elementos irmãos.
- **Ação:** trocar por `{/* @technical */}` ou remover. Aplicar lint rule global.
- **Aceite:** mesma verificação que F7-01.

### F7-03 — `AdminEmailAuditPage.tsx` `// @technical` dentro do children de `<Badge>`

- **Sev:** `HIGIENE`
- **Depende de:** **F7-01**
- **Origem:** Etapa 66 (Bloco 7).
- **Evidência:** `src/pages/admin/AdminEmailAuditPage.tsx` linha ~125: `// @technical` está dentro do children do `<Badge>` — quebra linha visual antes de `Total:`.
- **Ação:** remover.
- **Aceite:** Badge exibe apenas "Total: N".

### F7-04 — `AdminBridgeStatusPage.tsx` latência 42ms e uptime 99.9% hardcoded

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 67 (Bloco 7).
- **Evidência:** KPI cards com valor literal `'42ms'` e `'99.9%'` — "Latência Bridge" NÃO mede; "Uptime 24h" NÃO calcula.
- **Ação:**
  1. Latência real: `ping = performance.now(); await fetch(healthUrl); latency = performance.now() - ping;`
  2. Uptime: agregar `zapp.webhook_health_checks`.
  3. Se dado não disponível, exibir "—" com tooltip "Sem dados".
- **Aceite:** valores refletem tráfego real.

### F7-05 — `AuditEvidenceDashboard.tsx` página inteira MOCK ESTÁTICO

- **Sev:** `QUEBRADO`
- **Depende de:** decisão de produto da **Etapa 13** (a página é conformidade real ou removível?)
- **Rollback:** R-CODE
- **Origem:** Etapa 67 (Bloco 7).
- **Evidência:** `src/pages/admin/AuditEvidenceDashboard.tsx` (78 L completo): array `evidences` com 3 items hardcoded, badge `V5.0.0-PROD` hardcoded, botão "Ver no Repositório" sem `href`.
- **Ação:**
  1. Se conformidade é objetivo real: puxar de `zapp.compliance_evidences` (a criar).
  2. Botão com `href={buildGithubUrl(ev.path)}` (usar `GITHUB_URL` env).
  3. Se não é: **remover a página** e o registro da rota em `src/components/routing/AdminRoutes.tsx` (lazy import na linha 34, `<Route>` na 249). **Corrigido em 2026-08-02:** não há entrada no sidebar (`sidebarNavConfig.ts` não referencia esta página) — a referência original a "rota do sidebar" estava errada.
- **Aceite:** ou página lê dados reais e "Ver no Repositório" abre GitHub, ou página é removida.

### F7-06 — `setLastLastUpdate` (typo)

- **Sev:** `HIGIENE`
- **Origem:** Etapa 68 (Bloco 7).
- **Evidência:** `PerformanceDashboard.tsx` linha 8: `const [lastUpdate, setLastLastUpdate] = useState(new Date());`.
- **Ação:** renomear para `setLastUpdate`.
- **Aceite:** grep `setLastLastUpdate` retorna zero.

### F7-07 — Normalização de progress bar hardcoded a 4000 para todas as métricas Web Vitals

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 68 (Bloco 7).
- **Evidência:** `<Progress value={Math.min((m.value / 4000) * 100, 100)} />`. CLS (0-1) dá 0.025%; TTFB (100-500ms) 2-12%; INP (200ms good) 5%. Comparação sem sentido.
- **Ação:**
  1. `THRESHOLDS = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 }`.
  2. `value = Math.min((m.value / THRESHOLDS[m.name]) * 100, 100)`.
  3. Cor por rating: green/yellow/red.
- **Aceite:** cada métrica tem barra própria; LCP=2500ms → barra ~100% no limite.

### F7-08 — Polling 500x/hora sem `document.visibilityState`

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 68 (Bloco 7).
- **Evidência:** `const interval = setInterval(update, 2000);` sem pausar quando aba oculta.
- **Ação:**
  1. Pausar quando `document.hidden === true` (listener `visibilitychange`).
  2. Aumentar intervalo para 5-10s.
  3. Ou event-driven via `web-vitals` library com callbacks.
- **Aceite:** DevTools performance profiler mostra idle quando aba oculta.

### F7-09 — Rota `/admin/webhook-overview` inexistente

- **Sev:** `QUEBRADO`
- **Depende de:** **F1-14** (decidir URL canônica vs `?view=` define se o alvo é uma rota nova ou o `?view=` existente)
- **Origem:** Etapa 69 (Bloco 7).
- **Evidência:** `AdminInboxSyncStatusPage.tsx` alert "sem inbound" linka `<Link to="/admin/webhook-overview">`. Listagem de `src/pages/admin/` NÃO contém `AdminWebhookOverviewPage.tsx`. Route table cai em NotFound.
- **Ação:**
  1. **Corrigido em 2026-08-02 — NÃO criar a página.** `AdminWebhookOverviewPage.tsx` **já existe** em `src/pages/` (não em `src/pages/admin/`, que foi onde a evidência procurou), com lazy import em `src/pages/lazyViews.ts:103` e item de menu `webhook-overview` em `src/components/layout/sidebarNavConfig.ts:145` — é alcançável por `?view=webhook-overview`. O que falta é só a **rota de path**: ou corrigir o `<Link>` de `AdminInboxSyncStatusPage.tsx:112` para o destino real, ou registrar `/admin/webhook-overview` em `src/components/routing/AdminRoutes.tsx` apontando para a página existente.
  2. Grep global de `Link to="/admin/...` e validar cada destino.
- **Aceite:** clique no link não gera 404.

### F7-10 — `AdminChannelsPage.tsx` `color: "bg-primary"` usado como inline style `backgroundColor`

- **Sev:** `QUEBRADO`
- **Depende de:** nada — mas o **Aceite só é verificável depois** de existir ao menos 1 canal (`zapp.service_channels` tem 0 linhas)
- **Rollback:** R-DDL
- **Origem:** Etapa 70 (Bloco 7).
- **Evidência:** `emptyChannel()` retorna `color: "bg-primary"` (classe Tailwind), depois usado em `<span style={{ backgroundColor: ch.color }}>` — CSS `background-color: bg-primary` é inválido. Canais criados via UI ficam sem cor de fundo.
- **Ação:**
  1. Padronizar: guardar `color` como hex ou CSS variable name.
  2. `emptyChannel()` retorna `color: 'var(--primary)'`.
  3. Migration: `UPDATE zapp.service_channels SET color = CASE ... END`.
- **Aceite (reescrito em 2026-08-02 — Lote C est.2):** o critério original é vácuo: `zapp.service_channels` tem **0 linhas**, logo não há "canais existentes" e a migration do item 3 afeta 0 registros (mantê-la como profilática). Novo critério binário: criar um canal pela UI → o valor gravado em `color` é hex ou CSS var (**nunca** `bg-primary`) e o swatch de `AdminChannelsPage.tsx:149` renderiza com fundo colorido; `grep -c '"bg-primary"' src/pages/admin/AdminChannelsPage.tsx` retorna 0.

### F7-11 — `zapp.provider_message_log` = 0 rows total

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** `AdminWhatsAppLogsPage` diz "provider_message_log — últimas 150 entradas" mas painel sempre em EmptyState. Sistema em produção deveria estar logando.
- **Ação:**
  1. Auditar edge functions de envio — inserção está sendo chamada?
  2. Verificar RLS/NOT NULL bloqueando insert.
  3. `RAISE NOTICE` para debug.
- **Aceite:** enviar 1 mensagem via UI → 1 row com `direction='outbound'` e `delivery_status` populado.

### F7-12 — `AdminSecurityLogsPage` KPI "Tentativas Negadas (24h)" mente sobre janela

- **Sev:** `SEC`
- **Raiz de:** F7-28
- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** 
  1. `zapp.security_audit_logs` = 0 rows total.
  2. Código: `logs.filter((l) => l.status === 'denied').length` — filtra lista COMPLETA (sem 24h).
- **Ação:**
  1. `logs.filter(l => l.status === 'denied' && new Date(l.created_at) > new Date(Date.now() - 24*3600*1000)).length`.
  2. Ou puxar do backend agregado via RPC.
  3. Auditar por que `security_audit_logs` está vazia.
- **Aceite:** tabela populada; KPI reflete janela de 24h.

### F7-13 — Painel Rate Limiting inteiro sempre em zero

- **Sev:** `QUEBRADO`
- **Depende de:** decisão de produto da **Etapa 13** (rate limiting existe ou a página sai?)
- **Rollback:** R-CODE
- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** `rate_limit_logs=0`, `blocked_ips=0`, `ip_whitelist=0`. `RateLimitDashboard.tsx` (489 L) exibe 4 KPIs cards + 5 tabs permanentemente vazios.
- **Ação:**
  1. Auditar se rate-limiting está de fato ativo — provavelmente não.
  2. Se não é implementado: **remover a página**.
  3. Se é implementado mas escreve em outra tabela: mapear e migrar hook.
- **Aceite:** painel exibe dados reais OU não existe.

### F7-14 — `webhook_health_alerts` 724 unresolved (98.6% backlog); sistema pede "não vá pra prod"

- **Sev:** `DEGRADADO`
- **Rollback:** R-CRON + R-FN
- **Origem:** Etapa 72 (Bloco 7).
- **Evidência:** total=734, unresolved=724, last_24h=20. Breakdown: `burnin_critical_alert=709`, `lovable_parity_drift=9`, `burnin_disconnection=4`, `backup_sentinel_stale=2`. Título recorrente: `E10-03: N new critical alert(s) during burn-in — 72h counter reset. Investigate before go-live.` Cron 145 gera 1-2/h.
- **Ação:**
  1. Decidir política: (a) burn-in acabou → desativar cron 145 + resolver massa; (b) burn-in continua → criar `AdminBurnInMonitorPage` com triage/resolve em batch.
  2. Trigger auto-resolve quando counter zera.
  3. Widget de backlog no sidebar admin.
- **Aceite:** backlog < 50; nenhum alerta com "go-live" após decisão.
- **Revisado em 2026-08-02 (Lote C est.2):** números atualizados — **741 total · 731 não resolvidos · 12 em 24h**; breakdown `burnin_critical_alert` 715, `lovable_parity_drift` 9, `burnin_disconnection` 4, `backup_sentinel_stale` 3. O backlog **cresceu** desde a medição original (724→731). Atenção: `zapp.webhook_health_alerts` **não tem coluna `resolved`** — usar `resolved_at IS NULL`. Cron 145 confirmado: `burnin-monitor`, `*/15 * * * *`, `SELECT evo.fn_burnin_monitor()`, ativo.

### F7-15 — ~~OBSOLETO~~ Cron 213 `media_pipeline_health_check` 42.8% falha

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Depende de:** **F4-24** — mesmo cron (jobid 213), achado duplicado; ambos obsoletos
- **Rollback:** R-CRON + R-FN
- **Origem:** Etapa 73 (Bloco 7).
- **Evidência:** Duas cascatas: (a) coluna `severity` NÃO EXISTE em `warroom_alerts`; (b) `alert_type='media_pipeline'` viola `chk_warroom_alert_type`.
- **Ação:**
  1. Verificar schema real e coluna equivalente a "severity".
  2. Adicionar `'media_pipeline'` ao CHECK ou usar valor existente.
  3. Atualizar `fn_run_media_health_alert()`.
  4. `fn_verify_warroom_schema()` no CI.
- **Aceite:** cron 213 100% sucesso nas próximas 24h.
- **Revalidado em 2026-08-02 (Lote C est.2):** as duas cascatas já foram corrigidas. `severity varchar(20)` **existe** em `zapp.warroom_alerts`; a constraint `chk_warroom_alert_type` **não existe mais** (`alert_type` virou enum `warroom_alert_type`). `cron.job_run_details` do jobid 213: 16 sucessos × 4 falhas, **todas as falhas ≤ 2026-07-30**, último sucesso 2026-08-02T16:00Z. Achado obsoleto — não executar.

### F7-16 — ~~OBSOLETO~~ Cron 100 `analytics-log-retention` 100% falha (`dblink` não instalada)

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Depende de:** **F9-13** (mesma causa-raiz: `search_path` sem `zapp`) — ambos já obsoletos
- **Rollback:** R-CRON
- **Origem:** Etapa 73 (Bloco 7).
- **Evidência:** `function public.dblink(text, text) does not exist`. Extensão dblink NÃO instalada.
- **Ação:**
  1. `CREATE EXTENSION IF NOT EXISTS dblink;` (via `supabase_db_query`).
  2. Ou reescrever para não usar dblink (FDW permanente).
- **Aceite:** cron 100 sucesso.
- **Revalidado em 2026-08-02 (Lote C est.2):** dblink **v1.2 instalada**; 4 funções `dblink` no schema `zapp`; `ops.fn_analytics_log_retention` existe e o jobid 100 teve último run **succeeded** em 2026-08-02T05:20Z ("1 row"). Últimas falhas em 2026-07-31. `CREATE EXTENSION` seria no-op — não executar.

### F7-17 — `remote_jid` completo em URL query (PII em logs)

- **Sev:** `SEC`
- **Origem:** Etapa 74 (Bloco 7).
- **Evidência:** `<Link to={`/?contact=${encodeURIComponent(c.remote_jid)}`}>` em `AdminInboxSyncStatusPage.tsx` — vaza número WhatsApp em logs/Referer/telemetria.
- **Ação:**
  1. Alternativa A: `useNavigate` com state (`navigate('/', { state: { contact } })`).
  2. Alternativa B: hash SHA-256 (`?c=abc123`) + lookup via RPC.
  3. Grep de `to={\`/?contact=` e corrigir todos.
- **Aceite:** DevTools Network → nenhuma URL contém número WhatsApp.

### F7-18 — `hmac_selftest_audit` = 0 rows

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** Edge function `webhook-hmac-selftest` roda (botão dispara) mas nunca insere audit.
- **Ação:**
  1. Auditar edge function — está tentando insert? Que erro?
  2. Verificar RLS/GRANT — service_role tem INSERT?
  3. `RAISE NOTICE`/`console.error` para debug.
- **Aceite:** clicar "Rodar novamente" → 1 row em `hmac_selftest_audit`.

### F7-19 — `STATUS_BADGE[ch.status]` sem defensive fallback

- **Sev:** `RISCO`
- **Origem:** Etapa 70 (Bloco 7).
- **Evidência:** `AdminChannelsPage.tsx` — se `ch.status='provisioning'` (não mapeado), `statusInfo=undefined` → `TypeError`.
- **Ação:** `const statusInfo = STATUS_BADGE[ch.status] ?? { label: ch.status, variant: 'outline' };` + teste.
- **Aceite:** canal com status `'unknown'` renderiza Badge sem crash.

### F7-20 — `automation_executions` = 0 rows

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** `AdminAutomationLogsPage` mostra filtros elaborados mas tabela vazia. Regras são criadas (`AdminAutomationsPage` 790 L) mas execuções não logadas OU escritas em outra tabela.
- **Ação:**
  1. Auditar `useAutomationLogs` — qual tabela consulta?
  2. ~~Se `evo.evolution_automation_logs` for real, criar view compat.~~ **Corrigido em 2026-08-02:** já feito — `zapp.evolution_automation_logs` **já existe como VIEW** sobre a tabela `evo.evolution_automation_logs`. Item resolvido. O hook a auditar é `src/hooks/useAutomationLogs.ts` (`src/pages/admin/useAutomationLogs.ts` é apenas re-export).
  3. Verificar engine de execução — insere onde?
- **Aceite:** disparar regra manualmente → row visible no painel.

### F7-21 — ~~OBSOLETO~~ `HmacSelfTestPage` useEffect com dependência `[run]` — risco de loop infinito

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `useEffect(() => { void run(); }, [run])`. Se `run` NÃO estiver em `useCallback` dentro de `useHmacSelfTest`, muda referência a cada render → loop.
- **Ação:**
  1. Auditar `useHmacSelfTest.ts` — confirmar `run` em `useCallback`.
  2. Se não: envolver em `useCallback` OU usar ref pattern.
  3. Teste: mount + assert 1 chamada após 500ms.
- **Aceite:** DevTools Network → só 1 request no mount.
- **Revalidado em 2026-08-02 (Lote C est.2):** o risco não se materializa. `run` é `admin.runSecurityTest`, definido com `useCallback` em `src/features/admin/hooks/useAdminManagement.ts:1122`, deps `[instance, includeNegative, logSecurityAudit, syncSecurityAlert]`; `logSecurityAudit` (1027) e `syncSecurityAlert` (1055) também são `useCallback`, e os outros dois são primitivos. Referência estável → sem loop. Itens 1 e 2 são no-op; manter só o item 3 (teste de regressão) se desejado.

### F7-22 — Botão "Run test suite" sem confirmação; label hardcoded "50 testes"

- **Sev:** `RISCO`
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `AdminEvoApiHealthPage.tsx` — clique acidental dispara 50 tests em produção sem confirmação.
- **Ação:**
  1. `<AlertDialog>` com "Executar 50 testes em produção?".
  2. Label dinâmico: `Rodando ${data?.total_tests ?? 'os'} testes…`.
  3. Rate-limit server: 1 run a cada 5min.
- **Aceite:** clicar → dialog; segundo clique <5min → toast "aguarde".

### F7-23 — Decisão de variant baseada em `overall?.includes('🟢')` (contrato frágil)

- **Sev:** `RISCO`
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `<Alert variant={readiness.overall?.includes('🟢') ? 'default' : 'destructive'}>`. Se backend trocar emoji, todos os banners viram destructive.
- **Ação:**
  1. Backend retorna `readiness.status: 'healthy' | 'degraded' | 'error'` (enum) + `overall_label` string.
  2. Frontend usa enum.
  3. Contract test Zod na resposta RPC.
- **Aceite:** trocar emoji não muda comportamento visual.
- **Revisado em 2026-08-02 (Lote C est.2):** são **2 ocorrências**, não 1 — `AdminEvoApiHealthPage.tsx:100` (`readiness.overall`) e `:111` (`runTestsData.overall`). Corrigir as duas.

### F7-24 — `AdminWhatsAppWebhookVerifyCard.tsx` chave React duplicável

- **Sev:** `RISCO`
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `<li key={`${p.kind}-${p.created_at}`}>` — 2 pings do mesmo tipo no mesmo ms → warning + remount errado.
- **Ação:** incluir `id`: `<li key={p.id ?? `${p.kind}-${p.created_at}`}>`. Adicionar `id` no payload retornado.
- **Aceite:** console sem warnings de duplicate key.

### F7-25 — Cloud API webhook sem tráfego há 90 dias

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 75b (Bloco 7).
- **Evidência:** `zapp.whatsapp_cloud_webhook_pings`: 173 total, 0 last 24h, 0 last 7d. Último: `2026-05-04 10:30 UTC`. `AdminWhatsAppWebhookVerifyCard` sempre zero. Sem alertagem.
- **Ação:**
  1. Investigar: (a) canal Cloud API desligado? (b) Meta parou de enviar?
  2. Cron `cloud-api-webhook-heartbeat` (1h): alerta se `max(created_at) < now() - 4h`.
  3. Badge "Silêncio há X dias" no card.
  4. Decidir se Cloud API é usado — se não, arquivar handler.
- **Aceite:** decisão documentada + alerta futuro.

### F7-26 — `AdminQueuesPage` helper `NOT_IMPLEMENTED` em produção

- **Sev:** `HIGIENE`
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `const NOT_IMPLEMENTED = 'Ação indisponível nesta versão. Em breve.'; const notImplemented = () => toast.info(NOT_IMPLEMENTED);`.
- **Ação:**
  1. Grep de `notImplemented(` — identificar botões.
  2. Remover botões OU implementar OU marcar "Em breve" com tooltip + desabilitar.
- **Aceite:** nenhum toast "Ação indisponível" em uso normal.

### F7-27 — `AdminProvidersPage` promete "health-check 2min" mas `provider_configs` vazia

- **Sev:** `QUEBRADO`
- **Rollback:** R-CRON
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** Descrição promete health-check automático 2min, mas tabela vazia.
- **Ação:**
  1. Verificar cron: `SELECT * FROM cron.job WHERE command ILIKE '%provider_configs%'`.
  2. Se cron existe mas tabela vazia: nada roda; texto misleading.
  3. Se cron não existe: implementar OU remover texto.
- **Aceite:** ou tabela populada + cron ativo + descrição verdadeira, ou descrição atualizada.

### F7-28 — `AdminSecurityLogsPage` comentário TODO em prod, filtro sem janela

- **Sev:** `SEC`
- **Depende de:** **F7-12** (o filtro sem janela de 24h é o mesmo defeito; corrigir uma vez)
- **Rollback:** R-POL
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** Grid tem 4 slots mas 1 card + comentário `{/* Adicionar mais cards conforme necessário */}`. Filtro sem janela 24h (mesmo bug de F7-12).
- **Ação:**
  1. Adicionar 3 cards: "Mudanças de permissão (24h)", "Logins de admin (7d)", "Falhas de RLS (24h)".
  2. Corrigir filtro respeitando "24h".
  3. Remover comentário TODO.
- **Aceite:** grid com 4 cards; filtros janelados corretos.

### F7-29 — `AdminFailedAuthMessagesPage` sem validação `from > to` nem timezone

- **Sev:** `RISCO`
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `useState<Date | undefined>` sem validação; `new Date(dateStr)` sem timezone.
- **Ação:**
  1. Validação: se `from > to`, Alert + não roda query.
  2. `startOfDay(from)` e `endOfDay(to)` com timezone do usuário.
  3. Query backend em UTC.
- **Aceite:** `from > to` → alert amarelo; sem query.

### F7-30 — `AdminEmailStatusPage` usa `location.hash =` em app path-based

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 69 (Bloco 7).
- **Evidência:** `onClick={() => (window.location.hash = '#admin/email-audit')}` em app com react-router-dom `BrowserRouter` — não navega.
- **Ação:** `import { useNavigate } from 'react-router-dom'; const navigate = useNavigate(); onClick={() => navigate('/admin/email-audit')}`.
- **Aceite:** clicar "Ver Auditoria" navega para `AdminEmailAuditPage`.

### F7-31 — `SelfHostedHealthPage` sem AbortController + results stale em erro

- **Sev:** `RISCO`
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `run = async () => { ... }` sem cancel signal. Clique duplo dispara 10 requests. Se throw, `results` antigos stale.
- **Ação:**
  1. AbortController via `useRef`; abort anteriores; propagar `signal` para probes.
  2. Catch: `if (!controller.signal.aborted) { setResults([]); toast.error(...); }`.
- **Aceite:** clique múltiplo aborta anteriores; erro deixa results vazios com toast.

### F7-32 — ~~OBSOLETO~~ `AdminAutomationLogsPage` paginação 0-indexed inconsistente

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `const [page, setPage] = useState(0);` e `setPage(0)` no reset. Convenção Supabase 0-indexed mas UI mostra "página N" ao usuário.
- **Ação:**
  1. `page` 1-indexed no state; converter para 0-indexed apenas no `range()`.
  2. `setPage(1)` no reset.
  3. Rótulo "Página 1 de 10", não "Página 0".
- **Aceite:** primeira página exibida como "1"; reset volta para "1".
- **Revalidado em 2026-08-02 (Lote C est.2):** **o Aceite já passa hoje.** `AdminAutomationLogsPage.tsx:234` renderiza `Página {page + 1}`, então a primeira página aparece como "1" e `setPage(0)` volta para "1". O usuário nunca vê "Página 0". Resta apenas preferência de convenção interna — sem impacto observável.

---


## Tema 14 — SLA/BPM (Bloco 8)

_(Achados F8-01 a F8-17 registrados no Bloco 8.)_

### F8-01 — ~~OBSOLETO~~ CRÍTICO (P0): página `SLAAlertPreferences.tsx` órfã — 215 linhas de UI inalcançáveis em produção

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Rollback:** R-CODE
- **Origem:** Etapa 78 (Bloco 8).
- **Evidência:** `wc -l src/pages/SLAAlertPreferences.tsx` = 215 linhas (formulário completo de canal in-app/email/webhook + thresholds + silence hours). `grep -rn "SLAAlertPreferences" src/App.tsx src/pages/lazyViews.ts src/pages/ViewRouter.tsx` retorna **0 matches**. Página nunca é registrada em `<Route>`, `lazyViews`, ou navegação por `?view=`. Combinado: `SELECT COUNT(*) FROM zapp.sla_alert_preferences` = 0 rows — nenhum usuário jamais configurou preferência.
- **Ação:**
  1. Decidir: (a) publicar a página adicionando entrada em `lazyViews.ts` + rota em `App.tsx`/`ViewRouter.tsx` + link no menu admin, ou (b) remover `SLAAlertPreferences.tsx` + hook `useSLAAlertPreferences` + tabela `zapp.sla_alert_preferences`.
  2. Se (a): teste E2E que abre a rota e persiste 1 preferência.
  3. Se (b): migration DROP + `git rm`.
- **🔄 Revalidado em 2026-08-02 — FALSO POSITIVO (erro de arquivo).** A página **está roteada**: `src/components/routing/AppRoutes.tsx` l.27 `const SLAAlertPreferences = lazyWithRetry(() => import('@/pages/SLAAlertPreferences'))` e rota `path="/sla/preferences"` (l.144-147). A evidência original grepou `src/App.tsx`, `src/pages/lazyViews.ts` e `src/pages/ViewRouter.tsx` — os 3 arquivos **existem**, mas **não são o roteador de rotas** deste app; por isso o grep deu 0. O arquivo tem **221 linhas** (não 215). **Não remover a página.**
- **O que permanece verdadeiro:** `SELECT COUNT(*) FROM zapp.sla_alert_preferences` = **0** — feature alcançável porém **sem adoção**. Reescrever o achado como problema de descoberta/UX (falta link no menu admin), não de rota inexistente.
- **Aceite (reescrito):** `/sla/preferences` está acessível a partir da navegação (não só por URL direta) **e** ≥ 1 row em `zapp.sla_alert_preferences` após teste E2E.

### F8-02 — CRÍTICO (P0): schema `bpm` inteiro morto — 41 tabelas com 0 rows, zero funções, zero views

- **Sev:** `QUEBRADO`
- **Raiz de:** F8-04, F8-05, F8-06, F8-15
- **Rollback:** R-CRON + R-DDL
- **Origem:** Etapa 77 (Bloco 8).
- **Evidência:** `SELECT relkind, COUNT(*) FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='bpm' GROUP BY relkind` → `r=41, i=62` (zero `v`, zero `m`, zero `f`). `COUNT(*)` real (não estimado) de 9 tabelas críticas (`bpm_cards`, `bpm_flows`, `bpm_flow_steps`, `bpm_automations`, `bpm_automation_executions`, `bpm_activity_log`, `bpm_card_movements`, `bpm_card_comments`, `bpm_sla_records`) todas retornam 0. Módulo BPM nunca teve tráfego em produção.
- **Ação:**
  1. Decidir com Produto: BPM está roadmap ativo, sunset, ou hibernando?
  2. Se ativo: publicar módulo (rotas, seeds mínimos, teste E2E de criar 1 card).
  3. Se sunset: migration `DROP SCHEMA bpm CASCADE` (é rápido — não há FKs entrantes verificáveis) + remover 82 views `public.bpm_*` e `zapp.bpm_*` + remover 41 hooks/services do frontend.
  4. Se hibernando: adicionar comment em `pg_namespace` (`COMMENT ON SCHEMA bpm IS 'Módulo em hibernação — não populado em prod até 2026-Q4'`) e mover crons 198 (e correlatos) para `active=false`.
- **Aceite:** decisão registrada em `docs/adrs/`, schema tem `COMMENT` ou foi dropado, cron 198 alinha com decisão (ativo se módulo ativo; inativo se sunset/hibernando).

### F8-03 — CRÍTICO (P0): 3+ sistemas SLA paralelos sem canonical

- **Sev:** `RISCO`
- **Raiz de:** F8-04, F8-05, F8-08, F8-14, F8-17
- **Origem:** Etapa 77 (Bloco 8).
- **Evidência:** existem 4 fontes distintas de "SLA":
  - `bpm.bpm_sla_records` (0 rows) — SLA por card BPM
  - `zapp.conversation_sla` (0 rows) — SLA por conversa WhatsApp
  - `zapp.sla_delivery_violations` (2 rows, smoke test 2026-05-04) — violações de política SLA
  - `zapp.sla_violations`, `zapp.sla_history`, `zapp.sla_rules`, `zapp.sla_policies` (0 rows cada) — camada adicional não usada
  - `evo.evolution_alerts` (severity='critical') — alertas gerais nos quais SLA breaches deveriam aterrissar mas não aterrissam
  Total: **9 tabelas SLA em `zapp`** + 1 em `bpm` + parte de `evo.evolution_alerts`. Nenhuma é fonte de verdade documentada.
- **Ação:**
  1. Escrever ADR canonicalizando 1 fonte de verdade por dimensão (SLA de card BPM, SLA de fila de atendimento, SLA de conversa).
  2. Marcar tabelas redundantes como deprecated com `COMMENT ON TABLE ... IS 'DEPRECATED: usar ...'` + adicionar advisor.
  3. Migration que dropa tabelas 0-row confirmadas obsoletas.
- **Aceite:** `docs/db/schema-topology.md` mapeia SLA canonical → derivados; 1 ADR aprovado; contagem de tabelas `zapp.sla_*` cai de 9 para ≤ 3.

### F8-04 — CRÍTICO (P0): triggers `zapp.bpm_track_sla()` e `bpm_track_sla_on_create()` são stubs vazios

- **Sev:** `QUEBRADO`
- **Depende de:** **F8-02** (decisão sobre o schema `bpm`) e **F8-03** (qual sistema SLA é canônico)
- **Rollback:** R-FN
- **Origem:** Etapa 79 (Bloco 8).
- **Evidência:** `pg_get_functiondef(zapp.bpm_track_sla)` e `pg_get_functiondef(zapp.bpm_track_sla_on_create)` retornam body idêntico: `BEGIN RETURN NEW; END;`. Amarrados em `bpm.bpm_cards` como triggers AFTER INSERT (`bpm_sla_on_create`) e AFTER UPDATE (`bpm_sla_on_move`). Consequência: quando/se um card for criado ou movido, **nenhum record de SLA será materializado** em `bpm.bpm_sla_records`. Cron 198 fica NOP eterno.
- **Ação:**
  1. Implementar `bpm_track_sla_on_create`: INSERT em `bpm.bpm_sla_records (card_id, step_id, sla_hours, entered_at, deadline_at)` com `sla_hours` vindo de `bpm.bpm_flow_steps.sla_hours` e `deadline_at = now() + sla_hours * interval '1 hour'`.
  2. Implementar `bpm_track_sla`: se `NEW.current_step_id != OLD.current_step_id`, UPDATE do record ativo com `exited_at = now(), time_in_step_minutes = ...` e INSERT novo record para o step de destino.
  3. Teste vitest: criar 1 card, mover 1 vez, verificar 2 rows em `bpm_sla_records` com `entered_at`/`exited_at`/`deadline_at` corretos.
- **✅ Revisado em 2026-08-02:** bodies e triggers confirmados (`bpm_sla_on_create`→`zapp.bpm_track_sla_on_create`, `bpm_sla_on_move`→`zapp.bpm_track_sla`, ambos `tgenabled='O'`). **Achado adicional:** existe um **3º** trigger SLA em `bpm.bpm_cards` não citado — `trg_check_card_sla` → `zapp.fn_check_card_sla`. Auditar os 3 juntos para não criar lógica duplicada.
- **Aceite:** INSERT em `bpm.bpm_cards` cria row em `bpm.bpm_sla_records`; UPDATE de `current_step_id` fecha o record anterior e cria novo. Teste verde.

### F8-05 — CRÍTICO (P0): cron 198 chama função no-op (`bpm_check_breached_slas`); a versão completa (`fn_check_all_cards_sla`) é dead code

- **Sev:** `QUEBRADO`
- **Depende de:** **F8-02** e **F8-03**
- **Rollback:** R-CRON + R-FN
- **Origem:** Etapa 79 (Bloco 8).
- **Evidência:** cron 198 (`*/5 * * * *`) executa `SELECT zapp.bpm_check_breached_slas()` — corpo tem 5 linhas: `UPDATE bpm_sla_records SET is_breached=TRUE WHERE exited_at IS NULL AND is_breached=FALSE AND deadline_at < NOW()`. Só marca flag; nenhuma notificação. `zapp.fn_check_all_cards_sla()` (também SECDEF) tem body completo com `INSERT INTO evolution_alerts (alert_type='sla_exceeded', severity, message, payload)` incluindo dedup por 4h — mas **nenhum cron a chama** (`grep command from cron.job WHERE command ILIKE '%fn_check_all_cards_sla%'` = 0).
- **Ação:**
  1. Decidir intenção: cron 198 deve marcar flag OU emitir alerta?
  2. Se emitir: rewrite `bpm_check_breached_slas` para incluir a lógica de `fn_check_all_cards_sla` (INSERT em `evolution_alerts` com dedup) OU trocar cron 198 para chamar `fn_check_all_cards_sla` diretamente.
  3. Dropar a função órfã que sobrar.
- **Aceite:** breach de SLA em `bpm.bpm_cards` produz row em `evolution_alerts` dentro de 5min; dedup impede duplicatas na mesma janela de 4h; só 1 função SLA-checker existe.

### F8-06 — CRÍTICO (P0): RLS de todas as 41 tabelas `bpm.*` é `USING(true) WITH CHECK(true)` para `authenticated`

- **Sev:** `SEC`
- **Depende de:** **F8-02** — se o schema for removido, o achado desaparece
- **Rollback:** R-POL
- **Origem:** Etapa 79 (Bloco 8).
- **Evidência:** `SELECT * FROM pg_policies WHERE schemaname='bpm'` = 82 rows (2 por tabela). Padrão: `auth_full_access` para role `{authenticated}` com `qual=true, with_check=true`, e `service_full_access` para role `{service_role}` com mesmo qual. Zero policy filtra por `workspace_id`, `owner_id`, tenant, ou qualquer coisa. RLS "ligado" mas efetivamente aberto para qualquer authenticated. Repete o padrão sistêmico já registrado em F5-XX/F6-XX.
- **Ação:**
  1. Se módulo BPM for reativado (F8-02): substituir cada `auth_full_access` por policy que valida `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())` ou equivalente.
  2. Padronizar via migration única gerando as 41 policies.
  3. Teste: usuário do workspace A não pode SELECT em row de workspace B.
- **Aceite:** teste SQL verde para todas as 41 tabelas; 0 rows retornadas para query cross-workspace.

### F8-07 — CRÍTICO (P0): `useSLAMetrics.overallRate` fallback = 100 mascara dashboard vazio

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 76 (Bloco 8).
- **Evidência:** `src/features/sla/hooks/useSLAMetrics.ts` tem **dois** fallbacks: `overallRate: combinedTotal > 0 ? ((frOnTime + resOnTime) / combinedTotal) * 100 : 100` (visão geral) e `overallRate: total > 0 ? ((s.frOn + s.resOn) / total) * 100 : 100` (por agente). Como `zapp.conversation_sla` está com 0 rows, `combinedTotal=0` e dashboard exibe eternamente "SLA 100%". Métrica cosmética que esconde a ausência total de dados — usuário nunca percebe que módulo está morto.
- **Ação:**
  1. Substituir fallback por sentinela distinguível: `overallRate: combinedTotal > 0 ? ((frOnTime + resOnTime) / combinedTotal) * 100 : null` e no componente renderizar "Sem dados" quando `null`.
  2. Adicionar teste unitário que garanta que `useSLAMetrics` com input `[]` retorna `overallRate: null` (não 100).
- **Aceite:** dashboard exibe "Sem dados no período" quando `conversation_sla` vazia; teste verde.

### F8-08 — CRÍTICO (P0): `zapp.queues` = 0 rows → `rpc_queue_sla_panel` sempre retorna vazio; comentário v2 admite bug histórico ainda não corrigido

- **Sev:** `QUEBRADO`
- **Depende de:** **F8-03**
- **Rollback:** R-VIEW
- **Origem:** Etapa 76 (Bloco 8).
- **Evidência:** `COUNT(*)` real: `zapp.queues=0, queue_positions=0, sticky_assignments=0, queue_members=0`. `pg_get_functiondef(zapp.rpc_queue_sla_panel)` contém comentário: `-- v2 (2026-07-02): CTEs de espera/SLA repontadas de zapp.contacts.queue_id (que é NULL::uuid hardcoded na view => métricas eternamente 0, bug provado)`. Ou seja: bug histórico documentado; v2 tentou corrigir mas painel continua vazio porque a fonte alternativa (`zapp.queue_positions`) também está vazia.
- **Ação:**
  1. Popular `zapp.queues` com filas iniciais (é ADR de Produto).
  2. Popular `zapp.queue_members` com atribuições reais de agentes.
  3. Se filas não fazem parte do escopo v3: remover página SLADashboard/rota + dropar `rpc_queue_sla_panel`.
- **✅ Revisado em 2026-08-02:** contagens confirmadas (`queues`, `queue_positions`, `queue_members`, `sticky_assignments` = 0). **Ressalva:** o comentário v2 citado está **desatualizado** — a view `zapp.contacts` hoje expõe `ec.queue_id` real, não `NULL::uuid` hardcoded. O painel continua vazio pela ausência de dados, não pelo hardcode. Atualizar o comentário da função junto com a correção.
- **Aceite:** `rpc_queue_sla_panel` retorna ≥ 1 row real em produção **OU** rota removida.

### F8-09 — CRÍTICO (P0): `evo.evolution_health_logs` vazia → cron 163 (`evo-peak-hours-sla`) retorna `NO_PEAK_DATA` em 100% das execuções

- **Sev:** `QUEBRADO`
- **Rollback:** R-CRON
- **Origem:** Etapa 79 (Bloco 8).
- **Evidência:** `evo.fn_peak_hours_sla_check` (SECDEF, cron 163 `*/15 * * * *`) faz `SELECT COUNT(*) FROM evo.evolution_health_logs WHERE created_at >= now() - p_window AND EXTRACT(HOUR ...) BETWEEN 11 AND 21`. Cron 163 rodou 237 vezes em 7d (última 2026-08-02 13:45), todas succeeded — mas o path early-return é `IF v_total_checks = 0 THEN ... RETURN 'NO_PEAK_DATA'`. Nunca chega no cálculo real de uptime.
- **Ação:**
  0. **⚠️ Revisado em 2026-08-02 — evidência corrigida:** a tabela **não está vazia** — tem **1 row** (`instance_name='wpp2'`, `status='success'`, `performed_at='2026-06-13T16:01:13Z'`, `created_at='2026-07-01T14:51:41Z'`). Como a janela do cron é `'1 hour'`, esse row único fica sempre fora e o early-return `NO_PEAK_DATA` se mantém — **a conclusão do achado continua válida**. Números atualizados: cron 163 com **245** execuções `succeeded`, última em **2026-08-02 15:45**.
  1. Investigar por que `evo.evolution_health_logs` está **praticamente vazia** (1 row de 13/06, produtor parou depois disso — qual é? crashado? deprecated?).
  2. Se produtor existiu e crashou: reativar produtor.
  3. Se deprecated: dropar `evo.evolution_health_logs` + `fn_peak_hours_sla_check` + cron 163.
- **Aceite:** ou cron 163 retorna `uptime_pct` real (≠ `NO_PEAK_DATA`), ou tabela+função+cron foram removidos.

### F8-10 — ~~OBSOLETO~~ MÉDIO (P1): `src/pages/SLADashboard.tsx` (22 linhas) é wrapper dead code

- **Sev:** — (achado **OBSOLETO** — não entra na esteira)
- **Rollback:** R-CODE
- **Origem:** Etapa 76 (Bloco 8).
- **Evidência:** `cat src/pages/SLADashboard.tsx` mostra 22 linhas: só monta Sidebar + `<SLADashboardComponent />` importado de `@/components/queues/SLADashboard` (349 linhas — o real). Router (`ViewRouter.tsx`) importa direto de `@/components/queues/SLADashboard`, pulando o wrapper. Arquivo em `src/pages/` só serve para confundir grep e IDE.
- **Ação:**
  1. `git rm src/pages/SLADashboard.tsx`.
  2. Verificar que ninguém mais importa `@/pages/SLADashboard`.
- **🔄 Revalidado em 2026-08-02 — FALSO POSITIVO (erro de arquivo). NÃO EXECUTAR.** O wrapper **é o entrypoint da rota `/sla`**: `src/components/routing/AppRoutes.tsx` l.25 `const SLADashboard = lazyWithRetry(() => import('@/pages/SLADashboard'))`, usado na rota `path="/sla"` (l.128-131). A afirmação de que "`ViewRouter.tsx` importa direto de `@/components/queues/SLADashboard`" é falsa para o roteador de rotas. `git rm src/pages/SLADashboard.tsx` **quebraria o build** — mesmo erro de medição do F8-01.
- **O que permanece verdadeiro:** o wrapper adiciona `Sidebar` + `SectionErrorBoundary`; o componente real (`src/components/queues/SLADashboard.tsx`, 349 linhas) é importado por ele. Homonímia entre `pages/` e `components/queues/` continua atrapalhando grep/IDE → tratar junto com F1-12 (padronização de homônimos), não como remoção.

### F8-11 — MÉDIO (P1): `zapp.sla_alert_preferences` tem policy redundante — `users_own_preferences` é subset estrito de `auth_secure_105`

- **Sev:** `HIGIENE`
- **Rollback:** R-POL
- **Origem:** Etapa 78 (Bloco 8).
- **Evidência:** `SELECT policyname, qual FROM pg_policies WHERE tablename='sla_alert_preferences'`:
  - `auth_secure_105` (role authenticated): `((user_id = auth.uid()) OR is_admin_or_supervisor())`
  - `users_own_preferences` (role authenticated): `(user_id = auth.uid())`
  - `service_full_access` (role service_role): `true`
  Como RLS é OR entre policies, `users_own_preferences` nunca adiciona acesso — sempre é dominado por `auth_secure_105`. Ruído semântico + custo de plan cache extra por policy.
- **Ação:**
  1. Migration `DROP POLICY users_own_preferences ON zapp.sla_alert_preferences`.
  2. Adicionar teste RLS que garanta: admin acessa qualquer row, usuário comum só a própria.
- **Aceite:** 2 policies restam (uma para `authenticated`, uma para `service_role`); teste passa.

### F8-12 — BAIXO (P1): `src/hooks/useSLAHistory.ts` é re-export duplicado (2 linhas)

- **Sev:** `HIGIENE`
- **Rollback:** R-CODE
- **Origem:** Etapa 77 (Bloco 8).
- **Evidência:** `cat src/hooks/useSLAHistory.ts` retorna literal: `/** React hook: use S L A History. */\nexport * from '@/features/sla/hooks/useSLAHistory';`. Duas linhas. Diferentes lugares no repo podem importar `@/hooks/useSLAHistory` ou `@/features/sla/hooks/useSLAHistory` — mesma coisa mas leva a confusão de barrel.
- **Ação:**
  1. `grep -rn "hooks/useSLAHistory" src/` → identificar todos consumidores.
  2. Substituir todos por `@/features/sla/hooks/useSLAHistory`.
  3. `git rm src/hooks/useSLAHistory.ts`.
- **✅ Revisado em 2026-08-02:** 2 linhas confirmadas. Consumidor real existente: **`src/hooks/__tests__/useSLAHistory.test.tsx` l.14** — ajustar o import do teste antes do `git rm`.
- **Aceite:** grep para `@/hooks/useSLAHistory` = 0; teste + tsc passam.

### F8-13 — BAIXO (P1): smoke test data ("F4 SLA", "E2 Race") vazando em produção há 3 meses

- **Sev:** `HIGIENE`
- **Rollback:** R-DDL
- **Origem:** Etapa 80 (Bloco 8).
- **Evidência:** `SELECT * FROM zapp.sla_delivery_rules` retorna 2 rows: `name='F4 SLA' created_at='2026-05-04T01:38:46Z'`, `name='E2 Race' created_at='2026-05-04T09:11:46Z'`. `SELECT * FROM zapp.sla_delivery_violations ORDER BY detected_at` mostra 2 rows: 1 warning resolved 2026-05-04T01:10, 1 breach unresolved 2026-05-04T01:36 (ainda unresolved 90+ dias depois). Nomes explícitos de smoke test/regressão.
- **Ação:**
  1. `DELETE FROM zapp.sla_delivery_violations WHERE detected_at < '2026-06-01'` + `DELETE FROM zapp.sla_delivery_rules WHERE name IN ('F4 SLA', 'E2 Race')`.
  2. Verificar se testes automatizados ainda dependem desses IDs — se sim, mover seed para `tests/fixtures/`.
- **Aceite:** `SELECT COUNT(*) FROM zapp.sla_delivery_rules WHERE name LIKE 'F4%' OR name LIKE 'E2%'` = 0; testes verdes.

### F8-14 — MÉDIO (P1): cron 205 (`verify-alert-delivery-10min`) não cobre alertas SLA — premissa da etapa 80 é falsa

- **Sev:** `QUEBRADO`
- **Depende de:** **F8-03**
- **Rollback:** R-CRON
- **Origem:** Etapa 80 (Bloco 8).
- **Evidência:** `ops.fn_verify_alert_delivery` filtra `evo.evolution_alerts WHERE severity='critical' AND payload ? 'notify_request_id'`. Bloco 8 (etapa 80) do PLANO_QA descreve o cron como "verificar entrega em cada canal" para SLA breach. Mas: (a) breach SLA de BPM nunca aterrissa em `evolution_alerts` (F8-05 mostra que cron 198 só marca flag), (b) 275 delivered / 2 failed / 0 unverifiable em 7d — mas todos são alertas de outros produtores (`ops.disk-defense`, `fn_detect_401_bursts`, `connection_health`, `pg_cron:auth-session-overflow-alert`), não SLA.
- **Ação:**
  1. Alinhar etapa 80 do PLANO_QA_ANALISE com realidade: cron 205 é verificação de entrega de alertas críticos gerais, não específico de SLA.
  2. Se objetivo era cobrir SLA: rewrite `fn_check_all_cards_sla` (F8-05) para publicar alerta em `evolution_alerts` com `payload->notify_request_id` — só então cron 205 passa a cobrir.
- **Aceite:** documentação alinhada (comment na função + ADR de fluxo de alerta); breach SLA passa por cron 205 quando implementado.

### F8-15 — MÉDIO (P1): `bpm.bpm_sla_records` só tem `pkey` — sem índice em `deadline_at, exited_at, is_breached`

- **Sev:** `DEGRADADO`
- **Depende de:** **F8-02**
- **Rollback:** R-DDL
- **Origem:** Etapa 79 (Bloco 8).
- **Evidência:** `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='bpm' AND tablename='bpm_sla_records'` retorna 1 row: `bpm_sla_records_pkey` (unique btree em `id`). Cron 198 faz `UPDATE ... WHERE exited_at IS NULL AND is_breached=FALSE AND deadline_at < NOW()` a cada 5min. Tabela 0 rows hoje = não pesa. Quando módulo for populado (F8-02), seq scan ao passar 10k rows já custa; ao passar 1M vira problema.
- **Ação:**
  1. Migration: `CREATE INDEX CONCURRENTLY idx_bpm_sla_records_open_deadline ON bpm.bpm_sla_records (deadline_at) WHERE exited_at IS NULL AND is_breached = FALSE;`
  2. `EXPLAIN ANALYZE` da query do cron 198 depois de popular 100k rows sintéticos.
- **Aceite:** query do cron 198 usa `idx_bpm_sla_records_open_deadline` em EXPLAIN; execução < 100ms com 100k rows abertos.

### F8-16 — MÉDIO (P1): histórico documentado de blackout de notificação em 31/07/2026 18:40 UTC — 14 falhas, 0 sucessos em 2h

- **Sev:** `RISCO`
- **Rollback:** R-CRON
- **Origem:** Etapa 80 (Bloco 8) — retroativo, descoberto ao auditar `zapp.warroom_alerts`.
- **Evidência:** `SELECT * FROM zapp.warroom_alerts WHERE source='fn_verify_alert_delivery'` retorna 1 row: `alert_type='critical', title='BLACKOUT DE NOTIFICACAO — nenhum alerta critico esta sendo entregue', message='Ultimas 02:00:00 no canal: 0 entregas confirmadas, 14 falhas', created_at='2026-07-31T18:40:00.123Z'`. Nenhum blackout depois. Evento aconteceu, foi capturado pelo cron 205 (validando que o mecanismo funciona), mas: (a) não há registro de investigação/post-mortem, (b) o próprio evento passou despercebido — `warroom_alerts` tem 4501 rows total, se ninguém filtra por `severity='critical' AND source='fn_verify_alert_delivery'` regularmente, esse alerta específico se perde.
- **Ação:**
  1. Adicionar painel admin/dashboard que destaque alertas críticos de `warroom_alerts` últimas 30d — foco em `source='fn_verify_alert_delivery'`.
  2. Escrever post-mortem retroativo para o evento de 31/07 18:40 UTC — o que causou 14 falhas? (provavelmente relacionado a incidente registrado em F7-XX).
  3. Configurar alerta secundário: se `fn_verify_alert_delivery` emitir blackout, PagerDuty/Slack fora do próprio pipeline que está quebrado.
- **Aceite:** dashboard existe; post-mortem em `docs/postmortems/2026-07-31-notification-blackout.md`; teste de blackout dispara notificação fora do canal principal.

### F8-17 — MÉDIO (P1): `zapp.fn_check_all_cards_sla` tem `search_path` sem `bpm` — resolução implícita via views é armadilha oculta

- **Sev:** `RISCO`
- **Depende de:** **F8-03**
- **Rollback:** R-FN + R-VIEW
- **Origem:** Etapa 79 (Bloco 8).
- **Evidência:** `pg_get_functiondef(zapp.fn_check_all_cards_sla)` mostra `SET search_path TO 'zapp', 'evo', 'monitoring'`. Body faz `FROM bpm_cards c JOIN bpm_flow_steps s`. Como `bpm` não está no search_path, PostgreSQL resolve `bpm_cards` → view `zapp.bpm_cards` (que aponta para `bpm.bpm_cards` via `SELECT *`). Funciona hoje, mas: (a) qualquer refactor da view `zapp.bpm_cards` adicionando GROUP BY, DISTINCT ou UNION quebra a resolução automática de UPDATE/JOIN, (b) se view for dropada por engano, função falha silenciosamente com "relation does not exist". A função `zapp.bpm_check_breached_slas` tem o mesmo padrão. Fragilidade sistêmica.
- **Ação:**
  1. Substituir `search_path TO 'zapp','evo','monitoring'` por `search_path TO 'bpm','zapp','evo','monitoring'` (ou qualificar `FROM bpm.bpm_cards c JOIN bpm.bpm_flow_steps s`).
  2. Regra de estilo: toda função SECDEF que toca outro schema deve qualificar explicitamente ou incluir o schema no search_path.
  3. Grep `pg_proc.prosrc` por outras funções `zapp.*` que fazem `FROM bpm_*` sem qualificar. **Confirmado em 2026-08-02:** `zapp.bpm_refresh_dashboards` e `zapp.bpm_check_breached_slas` têm o **mesmo** `proconfig` (`search_path=zapp, evo, monitoring`, sem `bpm`) — as 3 funções entram no escopo. Existem **41 views `zapp.bpm_*`** (+41 em `public`) sustentando a resolução implícita.
- **Aceite:** grep sql retorna 0 funções `zapp.*` que fazem FROM/JOIN em objeto `bpm.*` sem qualificação nem `bpm` no search_path.


## Tema 15 — Resiliência e edge cases (Bloco 9A, etapas 81-85)

**Executado em:** 2026-08-02 · **Etapas:** 81 (rede offline), 82 (rede intermitente), 83 (Supabase down + reconexão), 84 (Evolution 401 sustentado), 85 (fila cheia / DLQ).
**Achados:** 11 (F9-01..F9-11) — 1 CRÍTICO, 3 ALTO, 6 MÉDIO, 1 BAIXO.

**Confirmações de achados anteriores (sem novo número F):**
- `F6-19` **confirmado**: `evo.evolution_ip_watch` segue com `COUNT(*) = 0` — pipeline VPS→DB nunca escreveu uma linha.
- `F4-23` **confirmado e ampliado**: o padrão "cron ativo sobre tabela vazia" se repete integralmente na DLQ — 3 crons (87/146/91) somam **1.207 execuções em 3,46 dias**, todas `succeeded`, todas no-op, sobre `evo.evolution_webhook_dlq` com **0 rows**.
- **Nota de instrumentação:** `cron.job_run_details` retém **3,46 dias** (29.199 runs, mais antigo `2026-07-30 04:00`), não os 7 dias assumidos no handoff. Toda janela de análise de cron acima de 3 dias é cega.

---

### F9-01 — ALTO (P0): `src/lib/offlineQueue.ts` (226 linhas) não tem um único consumidor em produção — a fila offline é código morto

- **Sev:** `HIGIENE`
- **Rollback:** R-CODE
- **Origem:** Etapa 81 (Bloco 9A).
- **Evidência:**
  - `wc -l src/lib/offlineQueue.ts` = **226 linhas**, exportando `offlineQueue`, `enqueueMessage()`, `processQueue()`, `getQueueStats()`, `setupOnlineListener()`.
  - `grep -rn "enqueueMessage\|setupOnlineListener\|processQueue\|getQueueStats\|offlineQueue" src/ --include=*.ts --include=*.tsx` excluindo o próprio arquivo → **0 hits reais**. O único retorno é `processQueue` homônimo e não relacionado em `src/components/gamification/GamificationProvider.tsx:96` (fila de toasts de gamificação).
  - `setupOnlineListener()` — a única função que registra `window.addEventListener('online', ...)` para drenar a fila — **nunca é invocada**; não aparece em `main.tsx`, `App.tsx` nem em nenhum provider.
  - Consequência medida: nenhum caminho de envio chama `enqueueMessage`. O `messageSender.ts` (usado pelo inbox) importa `invokeEvolutionWithRetry` de `@/lib/evolutionSendRetry`, que falha direto sem enfileirar.
  - A etapa 81 do PLANO_QA pressupõe o hook `useOnlineStatus` — `grep -rn "useOnlineStatus" src/` retorna **0 hits**. O hook não existe.
- **Ação:**
  1. Decidir explicitamente: ativar ou remover. Se ativar, chamar `setupOnlineListener()` em `src/main.tsx` no bootstrap e envolver o `catch` de `sendMessageToContact` em `messageSender.ts` com `enqueueMessage(...)` quando `!navigator.onLine`.
  2. Se remover, deletar `src/lib/offlineQueue.ts` e o handler `sync` órfão em `public/sw.js` (ver F9-02).
  3. Criar `src/hooks/useOnlineStatus.ts` como fonte única de estado de rede, consumido por F9-06 (banner) e pela fila.
- **Aceite:** `grep -rn "enqueueMessage" src/ | grep -v "src/lib/offlineQueue.ts" | wc -l` retorna `>= 1` (ativado) **ou** `test ! -f src/lib/offlineQueue.ts` retorna 0 (removido). Estado atual — arquivo existe com 0 consumidores — reprova.

### F9-02 — ALTO (P0): `sendQueuedMessages()` no Service Worker é stub de `console.log` e a tag de sync não bate com a registrada

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 81 (Bloco 9A).
- **Evidência:**
  - `public/sw.js:141-143`, corpo integral da função:
    ```js
    async function sendQueuedMessages() {
      console.log('[ServiceWorker] Processing queued messages');
    }
    ```
    Não abre IndexedDB, não lê `pending-messages`, não faz fetch. É no-op puro.
  - **Tag mismatch**: `src/lib/offlineQueue.ts:137` registra `await reg.sync.register('send-queued-messages')`, mas `public/sw.js:138` escuta `if (event.tag === 'send-messages')`. As strings divergem — o handler jamais dispararia mesmo se a fila estivesse ativa (F9-01).
  - Ou seja, há **dois defeitos independentes em série**: a fila nunca é preenchida, e se fosse, o sync não seria roteado, e se fosse roteado, o handler não enviaria nada.
- **Ação:**
  1. Unificar a tag em uma constante compartilhada (`send-queued-messages`) referenciada nos dois arquivos.
  2. Implementar `sendQueuedMessages()` de fato: abrir `zapp-offline-queue` / store `pending-messages`, iterar, `fetch` para a edge function de envio, remover em sucesso, incrementar `attempts` em falha (espelhando `processQueue()` de `offlineQueue.ts:149-182`).
  3. Adicionar teste vitest que registra a tag e assere que o handler lê ao menos 1 item do IndexedDB mockado.
- **Aceite:** `grep -c "indexedDB" public/sw.js` retorna `>= 1` **e** a string de tag em `sw.js` é idêntica à de `offlineQueue.ts` (`diff <(grep -o "send-[a-z-]*messages" public/sw.js | sort -u) <(grep -o "send-[a-z-]*messages" src/lib/offlineQueue.ts | sort -u)` vazio).

### F9-03 — MÉDIO (P1): `index.html` desregistra todos os Service Workers na primeira visita de cada sessão, inviabilizando Background Sync por design

- **Sev:** `QUEBRADO`
- **Origem:** Etapa 81 (Bloco 9A).
- **Evidência:**
  - `index.html:74` — script inline `recoverPreview()` roda em toda carga: usa flag de sessão `zapp_sw_purged_v3` em `sessionStorage`; se `firstRun` (flag ausente) **ou** `suspicious`, executa `regs.map(r => r.unregister())` seguido de `caches.delete(k)` para todas as chaves.
  - Como `sessionStorage` é zerado a cada nova aba/sessão, `firstRun` é verdadeiro em toda primeira carga — o unregister é **incondicional na prática**, não apenas em caso suspeito.
  - Efeito combinado: `navigator.serviceWorker.ready` (usado em `offlineQueue.ts:135`) resolve para um registro recém-destruído ou nunca reinstalado; nenhum código do repo re-registra `/sw.js` após o purge (`grep -rn "register('/sw.js')\|register(\"/sw.js\")" src/` → 0 hits).
  - Coerente com `src/lib/buildVersion.ts:53-67`, que trata cache de workbox como estado a ser expurgado (`forceBundleRefresh('stale-workbox-cache')`) — a postura do projeto hoje é anti-SW.
- **Ação:**
  1. Restringir o purge ao ramo `suspicious` apenas, removendo `firstRun` da condição de disparo.
  2. Se o SW for mantido para push notifications (há handlers `push`/`notificationclick` em `sw.js:31,77`), adicionar re-registro explícito de `/sw.js` após o purge.
  3. Documentar em ADR a decisão sobre PWA/offline — hoje há `manifest.json` + `sw.js` em `public/` sem estratégia declarada.
- **Aceite:** recarregar a app duas vezes em abas novas e verificar `navigator.serviceWorker.getRegistrations()` com `length >= 1` na segunda carga; hoje retorna `0`.

### F9-04 — MÉDIO (P1): cliente supabase-js criado sem qualquer política de retry — falha de rede transitória vira erro imediato para o usuário

- **Sev:** `RISCO`
- **Origem:** Etapa 82 (Bloco 9A).
- **Evidência:**
  - `grep -rn "retry\|backoff\|exponential" src/integrations/supabase/client.ts` → **nenhum hit de retry**. Os 3 únicos hits são `timeout`: `setTimeout` (linha 143) e `clearTimeout` (162), pertencentes ao `AbortController` do bootstrap de auth (linha 129), não a repetição de request.
  - Não há `global.fetch` customizado com retry na criação do client; qualquer `.from().select()` que caia em `TypeError: Failed to fetch` propaga direto ao componente.
  - A infraestrutura de retry existe no repo (`src/lib/retry.ts`, `withRetry`), mas só é aplicada em **2 pontos de produção**: `src/lib/evolutionSendRetry.ts:15` e `src/features/inbox/components/AIConversationAssistant.tsx:26`. Nenhum deles cobre leituras de dados do inbox.
  - Cenário da etapa 82 (30% de perda de pacotes) hoje resulta em ~30% de telas em estado de erro, sem retentativa.
- **Ação:**
  1. Injetar `fetch` customizado na criação do client em `src/integrations/supabase/client.ts` que envolva a chamada em `withRetry` de `@/lib/retry` para erros de rede e HTTP 5xx/429 (nunca 4xx de negócio).
  2. Limitar a 2 retentativas com backoff ~300ms/900ms + jitter, para não mascarar indisponibilidade real nem estourar o SLA de UI.
  3. Excluir do wrapper as chamadas de `auth` já cobertas pelo `AbortController`, evitando dupla temporização.
- **Aceite:** `grep -n "global:" src/integrations/supabase/client.ts` mostra `fetch` customizado, e teste vitest com `fetch` mockado falhando 2x e sucedendo na 3ª retorna dados sem erro ao chamador.

### F9-05 — BAIXO (P1): quatro implementações paralelas de backoff exponencial coexistem (1.266 linhas), sem fonte única de verdade

- **Sev:** `HIGIENE`
- **Rollback:** R-CODE
- **Origem:** Etapa 82 (Bloco 9A).
- **Evidência:**
  - `wc -l` das camadas concorrentes: `src/lib/retry.ts` **95**, `src/lib/retryConfig.ts` **220**, `src/lib/retryStrategyAudit.ts` **420**, `src/hooks/useRetryAndErrorPrevention.ts` **531** → **1.266 linhas** para o mesmo conceito.
  - Cada uma define seu próprio jitter: `retryStrategyAudit.ts:179-182` (`jitterFactor` 0.15/0.2/0.25/0.3 em 4 presets), `failedMessagesEnqueue.ts:37` (`capped * 0.15`), `retry.ts:52` (jitter próprio), `useMessageQueue.ts:14` (`jitter: boolean`).
  - `retryStrategyAudit.ts` expõe 4 configs (`RETRY_CONFIG_TRANSIENT/API/DATABASE/ASYNC`) e é consumido por **um único arquivo** (`src/hooks/useRetryAndErrorPrevention.ts:33`), que por sua vez tem apenas **2 consumidores de produção** (`EditContactDialog.tsx:30`, `useContactFormV3.ts:6`) — ambos formulários de contato, nenhum caminho de mensageria.
  - Resultado prático: o caminho crítico (envio de mensagem) usa `retry.ts`, enquanto as 420 linhas de política mais elaborada servem dois diálogos de CRUD.
- **Ação:**
  1. Eleger `src/lib/retry.ts` + `src/lib/retryConfig.ts` como fonte única; reescrever `withRetry` para aceitar um preset de `retryConfig`.
  2. Migrar `useRetryAndErrorPrevention.ts` para consumir esse preset e deletar `src/lib/retryStrategyAudit.ts`.
  3. Substituir os cálculos locais de jitter em `failedMessagesEnqueue.ts` e `useMessageQueue.ts` por import do helper único.
- **Aceite:** `grep -rl "Math.random()" src/lib/*retry* src/lib/failedMessagesEnqueue.ts src/features/inbox/hooks/useMessageQueue.ts | wc -l` retorna `1` (apenas o helper canônico).

### F9-06 — MÉDIO (P1): não existe indicador de perda de conectividade de rede/Supabase — o único "status" da UI reporta conexões WhatsApp

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 83 (Bloco 9A).
- **Evidência:**
  - `src/components/layout/ConnectionStatusIndicator.tsx` — docstring linha 2: *"Indicador discreto de status das conexões WhatsApp"*. Linha 47 monta o texto a partir de `disconnected.length` de instâncias Evolution, não de `navigator.onLine` nem do estado do canal realtime.
  - `grep -rn "navigator.onLine" src/` retorna **4 arquivos**, nenhum deles de UI global: `offlineQueue.ts` (morto, F9-01), `AuthProvider.tsx:233` (só no bootstrap, converte em `bootstrapError='offline'`), `useInboxHeartbeat.ts:13` (grava presença do agente no banco).
  - `AuthProvider.tsx:114` + `ProtectedRoute.tsx:114-115` exibem estado offline **apenas durante o bootstrap inicial**; se a rede cair com a sessão já montada, nenhuma superfície da UI muda.
  - Cenário da etapa 83 (Supabase indisponível com app aberto): o usuário continua digitando e clicando em enviar sem qualquer sinal visual de degradação.
- **Ação:**
  1. Criar `useOnlineStatus()` (ver F9-01, ação 3) combinando `navigator.onLine` com o estado do canal realtime do supabase-js.
  2. Renderizar banner global persistente no shell da aplicação enquanto o estado for degradado, com contador de itens pendentes vindo de `getQueueStats()`.
  3. Desabilitar o botão de envio (ou trocar seu rótulo para "Enfileirar") enquanto offline, evitando falha silenciosa.
- **Aceite:** com `navigator.onLine` forçado a `false` via DevTools após login, um elemento com `role="status"` fica visível no shell; hoje nenhum elemento muda.

### F9-07 — CRÍTICO (P0): guard de deduplicação de `fn_detect_401_bursts` filtra o campo errado — 96 alertas idênticos por dia, 1.843 acumulados

(cross-ref: F6-19, F6-20)

- **Sev:** `DEGRADADO`
- **Rollback:** R-FN
- **Origem:** Etapa 84 (Bloco 9A).
- **Evidência:**
  - `pg_get_functiondef('evo.fn_detect_401_bursts')` — o guard de 24h consulta **`message`**:
    ```sql
    WHERE source='fn_detect_401_bursts' AND alert_type='info'
      AND message LIKE '%stale_api_key_hunt%'
      AND created_at > now() - interval '24h'
    ```
    Mas a string `stale_api_key_hunt` está no **`title`** (`'🔍 OBS-2 stale_api_key_hunt: encontre o consumer com chave velha'`); o `message` começa com *"A Evolution API gera ~1 × 401 a cada 5 min..."*.
  - Medição direta: `SELECT count(*) FILTER (WHERE title LIKE '%stale_api_key_hunt%') AS t, count(*) FILTER (WHERE message LIKE '%stale_api_key_hunt%') AS m FROM zapp.warroom_alerts WHERE source='fn_detect_401_bursts' AND alert_type='info'` → **t=1843, m=0**. O predicado nunca casa, `v_already_hunt` é sempre `false`.
  - Prova da razão 1:1 com o cron: alertas `info` nas últimas 24h = **96**; execuções do jobid 173 (`*/15 * * * *`) em 24h = **96**. Um alerta por execução, sem exceção.
  - Volume acumulado desde 2026-07-13: **1.843 alertas** a 91,1/dia — **40,9% de toda a tabela** `zapp.warroom_alerts` (4.505 rows) é este único alerta repetido.
  - Efeito colateral grave: a fadiga de alerta encobre os sinais reais — os 2 alertas `critical` de burst 401 legítimos (`'🚨 401 BURST: 5 signals em 15min'`, 2026-08-01) estão soterrados numa proporção de 1:921.
- **Ação:**
  1. `CREATE OR REPLACE FUNCTION evo.fn_detect_401_bursts()` trocando o predicado do guard para `title LIKE '%stale_api_key_hunt%'` (ou, preferencialmente, `(title || ' ' || message) LIKE ...` para resistir a futura reescrita de texto).
  2. Purgar o histórico redundante mantendo o mais recente: `DELETE FROM zapp.warroom_alerts WHERE source='fn_detect_401_bursts' AND alert_type='info' AND id <> (SELECT id FROM zapp.warroom_alerts WHERE source='fn_detect_401_bursts' AND alert_type='info' ORDER BY created_at DESC LIMIT 1)`.
  3. Adicionar índice de suporte ao guard: `CREATE INDEX CONCURRENTLY idx_warroom_alerts_source_type_created ON zapp.warroom_alerts (source, alert_type, created_at DESC)`.
- **Aceite:** após o fix, `SELECT count(*) FROM zapp.warroom_alerts WHERE source='fn_detect_401_bursts' AND alert_type='info' AND created_at > now()-interval '24h'` retorna `<= 1` (hoje: 96).

### F9-08 — MÉDIO (P1): `zapp.warroom_alerts` não tem política de retenção e acumula desde 2026-05-12

- **Sev:** `DEGRADADO`
- **Rollback:** R-CRON
- **Origem:** Etapa 84 (Bloco 9A).
- **Evidência:**
  - `SELECT count(*), min(created_at), max(created_at) FROM zapp.warroom_alerts` → **4.505 rows**, janela de **2026-05-12 20:05** a **2026-08-02 14:45** (82 dias, sem nenhuma purga).
  - Nenhum cron de limpeza referencia a tabela: `SELECT count(*) FROM cron.job WHERE command ILIKE '%warroom_alerts%'` no conjunto auditado retorna apenas produtores (`fn_detect_401_bursts`), nenhum consumidor ou faxineiro.
  - Composição atual é dominada por ruído: **1.927 rows (42,8%)** têm `source='fn_detect_401_bursts'`, das quais 1.843 são o alerta duplicado de F9-07 e 82 são o `warning` de "401 DETECTION BLIND" (guard de 6h funcionando como projetado, mas repetindo 3,8×/dia enquanto `evolution_ip_watch=0`).
  - Sem retenção, o custo cresce linearmente e a query de guard de F9-07 (sem índice, ver ação 3 daquele achado) degrada junto.
- **Ação:**
  1. Criar cron de retenção: `DELETE FROM zapp.warroom_alerts WHERE created_at < now() - interval '90 days' AND alert_type <> 'critical'` em schedule diário.
  2. Silenciar o `warning` recorrente de "401 DETECTION BLIND" ampliando o guard de 6h para 7 dias — é uma condição estrutural conhecida (F6-19), não um evento.
  3. Após F9-07, reavaliar o volume: espera-se queda de ~42% no tamanho da tabela.
- **Aceite:** `SELECT max(now() - created_at) FROM zapp.warroom_alerts WHERE alert_type <> 'critical'` retorna `< 90 days`.

### F9-09 — ALTO (P0): o roteador de DLQ exclui explicitamente a partição viva (`_v2_%`) e opera apenas sobre 22 tabelas legadas vazias

(cross-ref: F4-14, F4-23)

- **Sev:** `QUEBRADO`
- **Depende de:** **F9-10** — **pré-requisito**: corrigir F9-09 antes de F9-10 ativa bug latente. Inverter a ordem natural.
- **Rollback:** R-CRON
- **Origem:** Etapa 85 (Bloco 9A).
- **Evidência:**
  - `pg_get_functiondef('zapp.fn_route_failed_webhooks_to_dlq')` — o cursor que escolhe as tabelas contém:
    ```sql
    AND t.table_name NOT IN ('evolution_webhook_events_v2','evolution_webhook_events_default')
    AND t.table_name NOT LIKE 'evolution_webhook_events_v2_%'
    ```
  - Reproduzindo o predicado, as **22 tabelas elegíveis** são todas legadas por departamento (`_artes`, `_comercial_01..15`, `_compras`, `_financeiro`, `_gravacao`, `_logistica`, `_marketing`, `_wpp2`). Volume somado ≈ **5 rows** (`pg_class.reltuples`).
  - O volume real vive exatamente onde o cron não olha: `evolution_webhook_events_v2_2026_07` = **43.798 rows**, `_v2_2026_08` (mês corrente) = 51. `SELECT count(*) FROM evo.evolution_webhook_events_v2` = **46.286**.
  - Consequência medida: `SELECT count(*) FROM evo.evolution_webhook_dlq` = **0 rows** — a DLQ nunca recebeu uma linha. Enquanto isso há **1 evento órfão** elegível parado em `_v2` (`processed=false AND error_message IS NOT NULL AND created_at < now()-'30min'`), o mais antigo de **2026-06-13**, ou seja, **50 dias sem roteamento**.
  - O cron 87 roda `*/10 * * * *` — **362 execuções em 3,46 dias, 100% `succeeded`**, todas retornando `newly_routed_to_dlq: 0`. Sucesso reportado, trabalho zero.
  - `EXPLAIN (ANALYZE, BUFFERS)` da query correta contra `_v2`: **Seq Scan** em `_2026_07` com `Rows Removed by Filter: 46206`, `Buffers: shared hit=2403`, `Execution Time: 16.203 ms` — não há índice parcial em `(processed, error_message)`.
- **Ação:**
  1. Corrigir o cursor para incluir a partição-mãe `evolution_webhook_events_v2` (e remover o `NOT LIKE '_v2_%'`, já que consultar a mãe cobre todas as partições via partition pruning).
  2. Criar índice de suporte antes de ativar, para não introduzir Seq Scan a cada 10 min: `CREATE INDEX CONCURRENTLY idx_evt_v2_unprocessed_failed ON evo.evolution_webhook_events_v2 (created_at) WHERE processed=false AND error_message IS NOT NULL`.
  3. Rodar backfill único para drenar o órfão de 2026-06-13 e validar o caminho até `evo.evolution_webhook_dlq`.
- **Aceite:** após o fix, `SELECT count(*) FROM evo.evolution_webhook_dlq` retorna `>= 1` e `SELECT count(*) FROM evo.evolution_webhook_events_v2 WHERE processed=false AND error_message IS NOT NULL AND created_at < now()-interval '30 minutes'` retorna `0`.

### F9-10 — MÉDIO (P1): `fn_monitor_dlq_health` "resolve" alertas sem alterar os booleanos do WHERE — o primeiro alerta trava o canal para sempre

- **Sev:** `QUEBRADO`
- **Raiz de:** F9-09 (ordem invertida — ver abaixo)
- **Rollback:** R-FN
- **Origem:** Etapa 85 (Bloco 9A).
- **Evidência:**
  - `pg_get_functiondef('zapp.fn_monitor_dlq_health')` — ramo de resolução:
    ```sql
    UPDATE evo.evolution_alerts
    SET resolved_at = now(), acknowledged_at = now()
    WHERE alert_type='dlq_accumulation' AND acknowledged=false AND resolved=false;
    ```
    Escreve apenas os timestamps; **`acknowledged` e `resolved` permanecem `false`**.
  - Ambas as colunas booleanas existem e são distintas dos timestamps — `information_schema.columns` para `evo.evolution_alerts` lista `acknowledged:boolean`, `acknowledged_at:timestamptz`, `resolved:boolean`, `resolved_at:timestamptz`.
  - Efeito 1 (ruído de escrita): a cada 30 min o cron 91 reescreve as mesmas linhas que acredita ter fechado — **120 execuções em 3,46 dias**, todas `succeeded`.
  - Efeito 2 (mais grave): o ramo de criação usa `IF NOT EXISTS (... acknowledged=false AND resolved=false)` para evitar flood. Como nada nunca sai desse predicado, **assim que o primeiro alerta `dlq_accumulation` for criado, nenhum outro será criado jamais** — a função entra permanentemente no retorno `'alert_already_open'`.
  - Hoje o defeito está latente e não observável: `SELECT count(*) FROM evo.evolution_alerts WHERE alert_type='dlq_accumulation'` = **0**, porque a DLQ está vazia por causa de F9-09. Corrigir F9-09 sem corrigir este achado ativa o bug.
- **Ação:**
  1. Alterar o UPDATE para `SET resolved=true, acknowledged=true, resolved_at=now(), acknowledged_at=now()`.
  2. Adicionar `AND resolved_at IS NULL` ao WHERE, tornando a operação idempotente e eliminando a reescrita a cada 30 min.
  3. Ordenar o deploy: este fix **antes** do fix de F9-09, para que o alerta funcione quando a DLQ começar a receber dados.
- **Aceite:** simular com `INSERT` de um alerta `dlq_accumulation` e rodar `SELECT zapp.fn_monitor_dlq_health(p_threshold := 10)` com DLQ vazia — a linha deve terminar com `resolved=true`, e uma segunda execução deve retornar `status='healthy'` sem tocar em linhas (`rowCount=0`).

### F9-11 — MÉDIO (P1): `fn_flag_poison_messages` engole silenciosamente a falha do alerta — mensagens envenenadas podem ser marcadas sem ninguém saber

(cross-ref: F4-14)

- **Sev:** `RISCO`
- **Rollback:** R-POL
- **Origem:** Etapa 85 (Bloco 9A).
- **Evidência:**
  - `pg_get_functiondef('evo.fn_flag_poison_messages')` — o INSERT do alerta está envolvido em:
    ```sql
    EXCEPTION WHEN OTHERS THEN NULL; END;
    ```
    Qualquer erro ao gravar em `zapp.webhook_health_alerts` (RLS, coluna ausente, constraint) é descartado sem log, sem `RAISE WARNING`, sem contador no retorno.
  - O `UPDATE ... SET status='poison'` **fora** do bloco protegido é commitado normalmente: o resultado possível é DLQ com linhas `poison` e zero alertas correspondentes — falha invisível.
  - Contraste interno: a função irmã `fn_route_failed_webhooks_to_dlq` trata a mesma classe de erro corretamente, com `RAISE WARNING 'dlq_router: tabela % inacessivel (SQLSTATE=%): %'` e contador `v_skipped` exposto no JSON de retorno. O padrão bom já existe no mesmo schema.
  - O `jsonb` retornado (`checked_at`, `newly_flagged`, `total_dlq_rows`) **não tem campo de erro** — o cron 146 registra `succeeded` mesmo com o alerta perdido. Medição: **725 execuções em 3,46 dias, 100% `succeeded`**, todas com `total_dlq_rows: 0` (latente por F9-09).
  - O UPDATE também não tem `LIMIT`/batch: se a DLQ acumular após o fix de F9-09, um único ciclo pode marcar toda a tabela numa transação.
- **Ação:**
  1. Trocar `EXCEPTION WHEN OTHERS THEN NULL` por `RAISE WARNING` + campo `alert_insert_failed: true` no `jsonb` de retorno, espelhando `fn_route_failed_webhooks_to_dlq`.
  2. Adicionar `p_batch_size integer DEFAULT 500` e aplicar `WHERE id IN (SELECT id FROM ... LIMIT p_batch_size)` no UPDATE.
  3. Revisar as demais funções do schema pelo mesmo antipadrão: `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('evo','zapp') AND pg_get_functiondef(p.oid) ILIKE '%WHEN OTHERS THEN NULL%'`.
- **Aceite:** `pg_get_functiondef('evo.fn_flag_poison_messages')` não contém a string `THEN NULL` e o `jsonb` de retorno inclui a chave `alert_insert_failed`.

---

## Tema 15B — Resiliência e edge cases (Bloco 9B, etapas 86-90)

**Executado em:** 2026-08-02 · **Etapas:** 86 (deadman switch), 87 (race condition no envio), 88 (idempotência), 89 (timeouts), 90 (circuit breaker).
**Achados:** 8 (F9-12..F9-19) — 2 CRÍTICO, 2 ALTO, 4 MÉDIO.

**Correções de premissa do roteiro (etapas que passaram sem achado próprio):**
- **Etapa 87 — CONFORME.** A constraint `uq_msg_msgid_instance` **existe** em `evo.evolution_messages` (tabela particionada), e cada partição carrega seu índice único equivalente `evolution_messages_<part>_message_id_instance_name_key` (22 partições verificadas). A nota da sessão anterior — "Plano A menciona mas não existe" — nasceu de consultar `zapp.messages`, que é **VIEW**; constraints não são visíveis pela view. Proteção contra envio duplicado está de pé.
- **Etapa 88 — volume corrigido.** `zapp.webhook_events_processed` tem **108.894 rows**, não as 171k do roteiro. A diferença é retenção: o cron 152 `purge_webhook_events_processed` (`30 4 * * *`) mantém janela de **3,45 dias** e roda `succeeded` diariamente.
- **Etapa 90 — janela inexistente.** O roteiro descreve "5 falhas em 10s". O breaker real conta **falhas consecutivas sem janela temporal** (`failureThreshold: 5`, cooldown 30.000 ms). Não há critério de 10s em nenhuma das três implementações.

---

### F9-12 — CRÍTICO (P0): o deadman switch do guardian é auto-alimentado por um cron — nunca poderá disparar

- **Sev:** `QUEBRADO`
- **Rollback:** R-CRON + R-FN
- **Origem:** Etapa 86 (Bloco 9B).
- **Evidência:**
  - `evo.fn_check_guardian_alive()` (cron 188) alerta quando `now() - max(heartbeat_at) > 15 min` para `service_name='swarm-task-guardian'`.
  - O cron **193** (`guardian-db-heartbeat-resilient`, `*/5 * * * *`) executa, sem qualquer verificação de vitalidade do serviço:
    ```sql
    INSERT INTO evo.evolution_guardian_heartbeat (service_name, heartbeat_at)
    VALUES ('swarm-task-guardian', NOW()) ON CONFLICT ... DO NOTHING;
    ```
    Grava o **mesmo `service_name`** que o guardian real usaria. O gap monitorado nunca passa de 5 min por construção.
  - Prova de origem: `SELECT COALESCE(details->>'source','(cron 193 direto)'), count(*) FROM evo.evolution_guardian_heartbeat GROUP BY 1` → **uma única linha: 2.168 heartbeats, todos sem `details`**. A função que representaria o guardian real (`fn_sync_guardian_heartbeat`) grava `details->>'source'='dblink'` — **zero ocorrências**.
  - Cadência confirma a autoria: **288 heartbeats nas últimas 24h** = exatamente 1440/5, a frequência do cron 193.
  - Efeito observável: os alertas `guardian_heartbeat_missing` em `evo.evolution_alerts` cessaram em **2026-07-15** (3 no total: 12/07, 13/07, 15/07) — o silêncio desde então é o cron mascarando, não o serviço saudável. **0 alertas abertos hoje**.
- **Ação:**
  1. Alterar o cron 193 para gravar `service_name='pg-cron-liveness'` — o propósito declarado no próprio comentário do comando é "provar que o banco está processando crons", que é um sinal **diferente** de vitalidade do guardian.
  2. Ajustar `fn_check_guardian_alive` para filtrar exclusivamente heartbeats com `details->>'source'='dblink'`, ignorando qualquer origem sintética.
  3. Validar após o fix: com o cron 131 ainda quebrado (F9-13), o alerta `guardian_heartbeat_missing` deve voltar a disparar em ≤15 min.
- **Aceite:** `SELECT count(DISTINCT service_name) FROM evo.evolution_guardian_heartbeat WHERE heartbeat_at > now()-interval '1h'` retorna `2` (guardian real + liveness do cron), hoje retorna `1`.

### F9-13 — ALTO (P0): `fn_sync_guardian_heartbeat` quebrada há 7+ dias por `search_path` sem `zapp`, com a falha convertida em `succeeded` pelo cron

(cross-ref: F9-12)

- **Sev:** `QUEBRADO`
- **Raiz de:** F7-16
- **Rollback:** R-CRON + R-FN
- **Origem:** Etapa 86 (Bloco 9B).
- **Evidência:**
  - Execução direta da função hoje: `SELECT evo.fn_sync_guardian_heartbeat()` →
    ```json
    {"status":"error","message":"function dblink(text, unknown) does not exist","checked_at":"2026-08-02T12:15:41-03"}
    ```
  - Causa raiz é resolução de schema, não ausência de extensão: `pg_extension` reporta `dblink` versão **1.2 instalada**, mas as 4 sobrecargas da função vivem em **`zapp.dblink(...)`** — enquanto a função declara `SET search_path TO 'evo', 'vault'`. `zapp` não está no caminho. (Drift adicional: `pg_extension.extnamespace` ainda aponta para `public`, onde há **0 funções `dblink`**.)
  - Pré-requisitos de credencial estão **corretos** — não é problema de segredo: `vault.decrypted_secrets` tem `evolution_pg_password` com valor válido (`PRESENTE_VALIDO`), e o fallback `evo._secure_config` está corretamente marcado `[MIGRADO PARA VAULT ...]`.
  - Mascaramento: o `EXCEPTION WHEN OTHERS` final retorna JSON de erro **sem re-raise**. O cron 131 acumula **729 execuções, 0 falhas**, `last_msg='1 row'` — sucesso reportado para uma função que não faz nada há mais de 7 dias.
  - Consequência combinada com F9-12: nenhum heartbeat real jamais chegou ao banco, e nada alertou.
- **Ação:**
  1. `ALTER FUNCTION evo.fn_sync_guardian_heartbeat(text) SET search_path TO 'evo','vault','zapp';` — ou, preferencialmente, qualificar a chamada como `zapp.dblink(...)` no corpo, tornando-a imune a search_path.
  2. Trocar o `EXCEPTION WHEN OTHERS` por `RAISE WARNING` antes do `RETURN`, para que a falha apareça nos logs do pg_cron.
  3. Fazer o cron 131 falhar de fato quando `status='error'`: envolver com `SELECT CASE WHEN (evo.fn_sync_guardian_heartbeat()->>'status')='error' THEN 1/0 END` ou registrar em `zapp.warroom_alerts`.
- **Aceite:** `SELECT count(*) FROM evo.evolution_guardian_heartbeat WHERE details->>'source'='dblink' AND heartbeat_at > now()-interval '30 minutes'` retorna `>= 1` (hoje: 0 em todo o histórico).

### F9-14 — MÉDIO (P1): a "resiliência" do heartbeat é ilusória — os dois destinos são a mesma tabela física

- **Sev:** `RISCO`
- **Rollback:** R-FN
- **Origem:** Etapa 86 (Bloco 9B).
- **Evidência:**
  - O cron 193 chama-se `guardian-db-heartbeat-resilient` e faz **dois INSERTs**, um em `zapp.evolution_guardian_heartbeat` e outro em `evo.evolution_guardian_heartbeat`, sugerindo redundância entre destinos independentes.
  - `pg_class.relkind` desmente: `evo.evolution_guardian_heartbeat` = **TABELA**; `zapp.evolution_guardian_heartbeat` = **VIEW**, com `pg_get_viewdef` = `SELECT ... FROM evo.evolution_guardian_heartbeat` (passthrough puro, sem filtro).
  - Confirmação por dados: ambas reportam exatamente **2.167 rows** e o mesmo `max(heartbeat_at)`.
  - O segundo INSERT sempre colide com a linha que o primeiro acabou de gravar: `return_message` do cron 193 é literalmente **`INSERT 0 0`**. Metade do trabalho do cron é desperdiçada, e a mensagem de retorno registrada no histórico é enganosa (sugere que nada foi inserido).
  - `fn_check_guardian_alive` herda a ilusão: computa `GREATEST(max(evo...), max(zapp...))` sobre "AMBAS as tabelas", conforme seu próprio comentário — mas são a mesma. Se `evo` for corrompida, os dois braços caem juntos.
- **Ação:**
  1. Remover o INSERT redundante em `zapp.evolution_guardian_heartbeat` do comando do cron 193.
  2. Simplificar `fn_check_guardian_alive` para ler apenas `evo.evolution_guardian_heartbeat`, eliminando o `GREATEST` que finge cobertura dupla.
  3. Corrigir os comentários de ambos os objetos, que hoje documentam uma redundância inexistente.
- **Aceite:** `SELECT return_message FROM cron.job_run_details WHERE jobid=193 ORDER BY start_time DESC LIMIT 1` deixa de retornar `INSERT 0 0` e passa a refletir 1 linha inserida.

### F9-15 — MÉDIO (P1): `idempotency_key` é 100% NULL em 108.894 linhas, mantendo um índice único sem função

- **Sev:** `HIGIENE`
- **Rollback:** R-DDL
- **Origem:** Etapa 88 (Bloco 9B).
- **Evidência:**
  - `SELECT count(*) FROM zapp.webhook_events_processed WHERE idempotency_key IS NULL` → **108.894 de 108.894 (100%)**. A coluna nunca foi preenchida por nenhum produtor.
  - O índice `webhook_events_processed_idempotency_key_key` (btree único) existe e é mantido a cada INSERT sobre uma coluna que só contém NULL — custo de escrita sem benefício de leitura. (Não causa erro: o PostgreSQL permite múltiplos NULLs em índice único.)
  - A idempotência **real** está funcionando, por outra coluna: `webhook_events_processed_event_id_uq` sobre `event_id`. Verificação de duplicatas lógicas: `SELECT count(*) FROM (SELECT instance, message_key_id ... GROUP BY 1,2 HAVING count(*)>1)` → **0**. Nenhum evento processado duas vezes.
  - Risco: qualquer código futuro que consulte `WHERE idempotency_key = $1` retornará vazio silenciosamente e reprocessará o evento, sem que nada acuse o problema.
- **Ação:**
  1. Decidir a coluna canônica. Se `event_id` é a chave (evidência diz que sim), `DROP INDEX zapp.webhook_events_processed_idempotency_key_key` e `ALTER TABLE ... DROP COLUMN idempotency_key`.
  2. Se `idempotency_key` for requisito de roadmap, popular no produtor e adicionar `CHECK (idempotency_key IS NOT NULL)` para impedir regressão ao estado atual.
  3. Auditar consumidores antes de remover: `grep -rn "idempotency_key" src/ supabase/functions/`.
- **Aceite:** a coluna deixa de existir **ou** `SELECT count(*) FROM zapp.webhook_events_processed WHERE idempotency_key IS NULL AND processed_at > now()-interval '1 day'` retorna `0`.

### F9-16 — CRÍTICO (P0): tokens JWT configurados com validade de 365 dias [REVISADO 2026-08-02]

- **Sev:** `SEC`
- **Origem:** Etapa 89 (Bloco 9B).
- **⚠️ Revalidado em 2026-08-02 (recon pré-execução da Etapa 3) — REFERÊNCIA ERRADA. Não executar a Ação como escrita.** Dois números do corpo acima não descrevem produção:
  - **(a) A validade efetiva do token é 8 horas, não 365 dias.** O GoTrue roda com `GOTRUE_JWT_EXP=28800` no ambiente (lido de dentro do container `supabase_auth`, `supabase/gotrue:v2.189.0`). Nessa versão o env **vence** o `app.settings.jwt_exp` do banco. O `31536000` medido em `pg_db_role_setting` existe, mas **não emite token nenhum**: varredura em `pg_proc` (todas as funções), `pg_views` e `information_schema.columns.column_default` retorna **zero** referências a `app.settings.jwt_exp`. Executar o item 1 da Ação deixaria o Aceite verde **sem mudar um segundo** da validade real — a armadilha exata que o recon existia para pegar.
  - **(b) São 18 usuários, 10 ativos em 30 dias** — não "~50 operadores". Medido em `auth.users`: 18 totais, 10 com login nos últimos 30 dias, 54 sessões, 18 tocadas em 7 dias, 53 refresh tokens não revogados.
  - **(c) A rotação de refresh token já está ativa** — `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true`, `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10` (confirmado por env, além dos 208/261 tokens com `parent` preenchido). O item 2 da Ação está satisfeito de antemão.
- **Sev revisada em 2026-08-02:** de `SEC` para `DEGRADADO`. Com 8h de validade e rotação ativa, um token vazado deixa de ser um ano de acesso e vira uma janela de horas. Continua havendo higiene a fazer; deixou de ser P0.
- **Ação revisada:**
  1. `ALTER DATABASE postgres RESET app.settings.jwt_exp;` — remover a cópia órfã, que hoje só serve para enganar auditoria. **Não** gravar `3600` no banco: seria manter o mesmo engano com outro número.
  2. Se e quando se quiser encurtar a sessão de verdade, o alvo é `GOTRUE_JWT_EXP` **no stack file** (não só no serviço em execução, ou o próximo redeploy reverte). Decisão de produto — 8h ≈ uma jornada de trabalho —, não de segurança urgente: combinar com o Pink.
  3. O item 3 original (rotacionar no mesmo deploy para tornar o corte retroativo) **cai**. Ele existia porque tokens de 365 dias não expirariam sozinhos; com 8h, expiram. Ver F9-17.
- **Aceite revisado:** `SELECT current_setting('app.settings.jwt_exp', true)` retorna `NULL`, **e** o valor de `GOTRUE_JWT_EXP` fica registrado como a validade real vigente.
- **Evidência:**
  - `pg_db_role_setting` no nível do banco contém `app.settings.jwt_exp=31536000` — **31.536.000 segundos = 365 dias**.
  - Referência: o padrão do Supabase é `3600` (1 hora). O valor em produção é **8.760× maior**.
  - Consequência direta: um access token que vaze por qualquer via — `localStorage` de máquina compartilhada, log de proxy, print de DevTools, extensão de navegador — permanece **válido por um ano**. Logout no cliente não invalida o token já emitido; sem rotação de `jwt_secret`, não há como revogá-lo.
  - Agrava-se com F9-17: quem obtiver o secret pode forjar tokens com o mesmo horizonte de validade.
  - Contexto de exposição: ~50 usuários da Promo Brindes operando o inbox, muitos em máquinas compartilhadas de setor.
- **Ação:**
  1. Reduzir para `ALTER DATABASE postgres SET app.settings.jwt_exp = 3600;` e reiniciar GoTrue/PostgREST para releitura.
  2. Confirmar que o refresh token rotation está ativo no GoTrue antes do corte, para não forçar re-login de hora em hora.
  3. Rotacionar `jwt_secret` no mesmo deploy, invalidando de uma vez todos os tokens de 365 dias já emitidos e em circulação.
- **Aceite:** `SELECT current_setting('app.settings.jwt_exp')` retorna `3600` (hoje: `31536000`).

### F9-17 — ALTO (P0): `jwt_secret` persistido em texto claro no catálogo, legível por `anon` e `authenticated` [REVISADO 2026-08-02]

(cross-ref: F9-16)

- **Sev:** `SEC`
- **Rollback:** R-POL
- **Origem:** Etapa 89 (Bloco 9B).
- **⚠️ Revalidado em 2026-08-02 (recon pré-execução da Etapa 3) — ACHADO VÁLIDO, mas a premissa de risco da Ação já está satisfeita.** O secret **já é servido pelo ambiente**; o que está no catálogo é uma **cópia órfã**:
  - `supabase_auth`, `supabase_realtime`, `supabase_storage`, `supabase_kong` e `supabase_functions` montam todos o Docker Swarm secret `supabase_jwt_secret_v1` (41 bytes = 40 chars + newline, bate com os 40 chars do catálogo). `GOTRUE_JWT_SECRET` **não existe** como variável de ambiente — é injetado no entrypoint a partir do secret montado.
  - PostgREST **não** lê o secret do catálogo: `current_setting('pgrst.jwt_secret', true)` é `NULL` e não há nenhuma entrada `pgrst.*` em `pg_db_role_setting` para `authenticator`. A fonte dele é env.
  - **Zero** objetos do banco leem `app.settings.jwt_secret`: varredura em `pg_proc`, `pg_views` e `information_schema.columns.column_default` retorna vazio. `pgjwt 0.2.0` está instalado, mas não usa a setting.
  - Consequência: o item 1 deixa de ser a coreografia "configurar -> verificar -> resetar" e vira um `RESET` isolado sobre um valor que **ninguém lê**. O cenário que dava risco `ALTO` à etapa — resetar antes de configurar e derrubar a API — **não existe neste ambiente**.
  - A "calibração honesta do vetor" registrada acima **continua correta** e não deve ser reescrita para mais nem para menos: segue sendo defesa em profundidade.
- **Ação revisada:**
  1. `ALTER DATABASE postgres RESET app.settings.jwt_secret;` — seguro, sem pré-requisito. Verificar login logo em seguida mesmo assim.
  2. **Rotação desacoplada da Etapa 3.** Continua justificada (o valor esteve legível a todo role por tempo indeterminado), mas deixou de ser pré-requisito de qualquer outra coisa. Vira item próprio, com janela e **lista de propagação fechada antes**. Rotacionar regenera `anon key` e `service_role key`, que são JWTs assinados com esse secret. Consumidores levantados no recon — dentro da stack: Swarm secrets `supabase_jwt_secret_v1` e `supabase_service_key_v1`; envs `ANON_KEY` (storage), `SUPABASE_ANON_KEY` (kong e functions), `PROMOGIFTS_SUPABASE_ANON_KEY` (functions), `METRICS_JWT_SECRET` e `SECRET_KEY_BASE` (realtime). Fora da stack: n8n (credencial `<REDACTED — rotacionar via n8n UI>` e demais), Evolution API, os ~20 MCPs `SUPABASE - * - MCP` deste workspace, `VITE_SUPABASE_ANON_KEY` do frontend e os Cloudflare Workers. **A lista fora da stack ainda não foi conferida item a item — fazer isso é pré-condição da janela.**
  3. Item 3 (`REVOKE SELECT ON pg_catalog.pg_db_role_setting FROM PUBLIC`) — **recomendação: não aplicar, decisão registrada.** Cumprido o item 1, o que sobra legível no catálogo é `TimeZone`, `work_mem`, `search_path`, `statement_timeout` e afins. O risco de quebrar o schema cache do PostgREST passa a ser maior que o ganho. Reabrir só se algum secret voltar a ser gravado ali.
- **Aceite mantido**, com uma ressalva: ele agora prova **remoção de redundância**, não migração de fonte — a migração já estava feita antes desta auditoria.
- **Evidência:**
  - `pg_db_role_setting` do banco corrente contém `app.settings.jwt_secret=<40 caracteres>` em texto claro, junto de parâmetros operacionais inócuos (`TimeZone`, `work_mem`, `search_path`).
  - Permissões medidas: `has_table_privilege('anon','pg_catalog.pg_db_role_setting','SELECT')` = **true**; idem para `authenticated`. `has_function_privilege('anon','pg_catalog.current_setting(text)','EXECUTE')` = **true**. `length(current_setting('app.settings.jwt_secret'))` = **40**.
  - **Calibração honesta do vetor:** via PostgREST, `anon` não executa SQL arbitrário, e `pg_catalog` não está entre os schemas expostos — não é exploração de um passo. O que este achado quebra é **defesa em profundidade**: qualquer RPC `SECURITY DEFINER` que aceite nome de setting, qualquer SQL injection em função existente, ou qualquer alargamento futuro de schema exposto converte-se imediatamente em vazamento total do secret.
  - Com o secret em mãos, um atacante forja tokens `service_role` — que ignoram todas as RLS auditadas nos Blocos 3-8 — e, por F9-16, com validade de um ano.
  - O secret **não deveria estar no banco**: o padrão Supabase é injetá-lo por variável de ambiente em GoTrue/PostgREST, nunca por `ALTER DATABASE SET`.
- **Ação:**
  1. `ALTER DATABASE postgres RESET app.settings.jwt_secret;` e garantir que GoTrue/PostgREST leem `JWT_SECRET` do ambiente (Docker Swarm secret).
  2. Rotacionar o secret no mesmo deploy — o valor atual deve ser considerado comprometido, já que esteve legível a todo role por tempo indeterminado.
  3. Revogar o acesso amplo ao catálogo, se a versão do PostgREST permitir: `REVOKE SELECT ON pg_catalog.pg_db_role_setting FROM PUBLIC;`
- **Aceite:** `SELECT current_setting('app.settings.jwt_secret', true)` retorna `NULL` e a autenticação segue funcionando (prova de que a fonte migrou para o ambiente).

### F9-18 — MÉDIO (P1): `authenticated` tem `statement_timeout` de 120s, 4× o padrão do cluster — uma query travada segura a conexão por 2 minutos [CONFIRMADO 2026-08-02]

- **Sev:** `DEGRADADO`
- **Origem:** Etapa 89 (Bloco 9B).
- **✅ Revalidado em 2026-08-02 (recon pré-execução da Etapa 3) — CONFIRMADO, sem alteração.** Releitura de `pg_db_role_setting`: `authenticated statement_timeout=120s`; `service_role` **sem `statement_timeout` próprio**, herdando os 30s do cluster; `anon=5s`; `authenticator=8s`; `postgres=120s`. A Ação vale exatamente como escrita.
- **Dois detalhes que o corpo original não registrava:** (a) `authenticated` também tem `lock_timeout=10s` e `authenticator` tem `lock_timeout=8s` — vale manter coerência ao mexer no `statement_timeout`; (b) `supabase_auth_admin` tem `idle_in_transaction_session_timeout=60000` **sem unidade**, que o Postgres interpreta como 60000 ms = 60s. Funciona, mas destoa dos demais (`60s`) e vale normalizar por legibilidade.
- **Ordem dentro da Etapa 3:** este é o **primeiro** item a executar — reversível, sem impacto em sessão, e serve de ensaio do caminho `ALTER ROLE` -> reload -> verificação **de dentro de uma conexão real do PostgREST**, não só via `pg_roles`.
- **Evidência:**
  - Timeouts efetivos medidos por role: `anon=5s` · `authenticator=8s` · **`authenticated=120s`** · `service_role=herdado` · `postgres=120s`. Default do cluster (`pg_settings`): **30s**.
  - O roteiro da etapa 89 pergunta pelo comportamento acima de 30s — a resposta é que o usuário logado tem **quatro vezes** essa folga.
  - Assimetria relevante: `authenticator` (o role de conexão do PostgREST) tem 8s, mas após `SET ROLE authenticated` o limite aplicado passa a ser o do role destino, 120s. O teto baixo do authenticator dá falsa sensação de proteção.
  - `service_role` sem valor próprio herda os 30s do cluster — edge functions são mais estritas que o navegador do usuário, o inverso do esperado.
  - Contraste com o EXPLAIN de F9-09: a query mais pesada medida nesta auditoria roda em 16ms. Não há carga legítima conhecida que justifique 120s; o efeito prático é manter conexões do pool ocupadas durante incidentes.
  - Mitigação parcial já presente: `idle_in_transaction_session_timeout=60s` no nível do banco limita transação ociosa — mas não query ativa.
- **Ação:**
  1. `ALTER ROLE authenticated SET statement_timeout = '15s';` — folga confortável sobre os 16ms observados no pior caso.
  2. Definir explicitamente `ALTER ROLE service_role SET statement_timeout = '60s';` para jobs de backend, em vez de herdar.
  3. Se algum relatório pesado precisar de mais, isolá-lo em RPC própria com `SET LOCAL statement_timeout` no corpo da função.
- **Aceite:** `SELECT (SELECT c FROM unnest(rolconfig) c WHERE c LIKE 'statement_timeout%') FROM pg_roles WHERE rolname='authenticated'` retorna `statement_timeout=15s`.

### F9-19 — MÉDIO (P1): três circuit breakers independentes para a mesma Evolution API, com limiares divergentes e sem estado compartilhado

- **Sev:** `RISCO`
- **Origem:** Etapa 90 (Bloco 9B).
- **Evidência:**
  - Implementação 1 — `src/lib/evolutionCircuitBreaker.ts` (**260 L**): máquina de estados `CLOSED/OPEN/HALF_OPEN`, `failureThreshold: 5`, cooldown **30.000 ms**, estado por instância em memória. Consumidor: `src/lib/evolutionSendRetry.ts:27`.
  - Implementação 2 — classe `CircuitBreaker` dentro de `src/lib/retryStrategyAudit.ts:241`: `circuitBreakerThreshold: 10`, `circuitBreakerResetMs: 60000`, com `circuitBreakerMap` próprio.
  - Implementação 3 — objeto literal em `src/integrations/zappweb/evolutionClient.ts:136`: `THRESHOLD: 3`, `OPEN_MS: 30 * 60_000` (**30 minutos**), disparado só por 401/403.
  - Divergência de política para o **mesmo serviço**: abre com 3, 5 ou 10 falhas; permanece aberto por 30s, 60s ou 30min. Um caminho de código pode estar em `OPEN` enquanto outro segue martelando a Evolution API — nenhum dos três compartilha estado.
  - O breaker principal não tem janela temporal: conta apenas falhas **consecutivas**. Cinco falhas espaçadas ao longo de uma hora abrem o circuito igual a cinco falhas em um segundo — e um único sucesso intercalado zera o contador, impedindo a abertura sob degradação intermitente (exatamente o cenário da etapa 82).
  - Estado é in-memory e some no reload — decisão deliberada e documentada no cabeçalho do arquivo, mas significa que N abas do mesmo operador mantêm N circuitos distintos.
- **Ação:**
  1. Eleger `src/lib/evolutionCircuitBreaker.ts` como implementação única; migrar `evolutionClient.ts` para consumi-lo, preservando a regra específica de 401/403 como um tipo de falha (não como breaker paralelo).
  2. Remover a classe `CircuitBreaker` de `retryStrategyAudit.ts` junto com o arquivo, conforme F9-05.
  3. Adicionar janela deslizante ao breaker canônico (ex.: 5 falhas em 60s) para cobrir degradação intermitente, hoje invisível ao contador consecutivo.
- **Aceite:** `grep -rln "THRESHOLD\|failureThreshold\|circuitBreakerThreshold" src/ --include=*.ts | grep -v __tests__ | wc -l` retorna `1`.

---

## Tema 16 — Cross-browser, mobile, a11y e performance (Bloco 10, etapas 91-100)

**Executado em:** 2026-08-02 · **Etapas:** 91-94 (cross-browser), 95 (PWA), 96 (teclado), 97 (screen reader), 98 (contraste WCAG), 99 (print), 100 (bundle/Lighthouse).
**Achados:** 9 (F10-01..F10-09) — 3 ALTO, 5 MÉDIO, 1 BAIXO.

**Natureza deste bloco:** diferente dos anteriores, o Bloco 10 encontrou o ferramental **todo instalado** — `vite-plugin-pwa`, `@axe-core/playwright`, `@storybook/addon-a11y`, `rollup-plugin-visualizer` e `@playwright/test` estão em `package.json` com versões atuais. O problema não é ausência de ferramenta: é que **quatro delas não estão ligadas em lugar nenhum**. O roteiro descreve cada uma como "já existe" / "já configurado" / "já habilitado" — e em três casos isso é falso.

**Colisão declarada com o Bloco 9 (não remedido aqui):** a etapa 95 (PWA offline) depende de `offlineQueue.ts` (morto, F9-01), do handler de sync no `sw.js` (stub, F9-02) e do purge de Service Worker no `index.html` (F9-03). Este tema registra apenas o que é **novo**: a dependência fantasma do plugin.

---

### F10-01 — ALTO (P0): a suíte cross-browser cobre apenas Chromium — Safari, Firefox, Edge e mobile não têm um único teste

- **Sev:** `HIGIENE`
- **Origem:** Etapas 91-94 (Bloco 10).
- **Evidência:**
  - `playwright.config.ts` declara **um único project**: `{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }`. Não há `webkit`, `firefox`, `Desktop Edge`, `Pixel 5` nem `iPhone 13`.
  - `playwright.a11y.config.ts` repete exatamente o mesmo project único — nenhum navegador adicional.
  - Cobertura por etapa do roteiro: **91** parcialmente atendida (Chrome desktop sim, Chrome Android **não**); **92** (Safari desktop + iOS 17+) — **zero**; **93** (Firefox ESR) — **zero**; **94** (Edge Chromium) — **zero**.
  - O `@playwright/test` v1.61.1 instalado já traz webkit e firefox — não há impedimento técnico, apenas configuração ausente.
  - Risco concreto e não hipotético: o app usa `navigator.onLine`, `SyncManager`, `IndexedDB` e `serviceWorker` (`offlineQueue.ts`, `buildVersion.ts`) — APIs com divergências conhecidas de comportamento em WebKit/iOS. Nenhuma delas jamais foi executada fora do Chromium.
  - Mobile também não é coberto por viewport: nenhum project define `viewport` reduzido, embora a UI tenha **217 arquivos `.tsx` com breakpoints Tailwind** (`md:`/`lg:`) — layout responsivo extenso, verificação zero.
- **Ação:**
  1. Adicionar projects em `playwright.config.ts`: `webkit`, `firefox`, `Mobile Chrome` (`devices['Pixel 5']`) e `Mobile Safari` (`devices['iPhone 13']`).
  2. Rodar a matriz completa apenas no workflow de `main`/nightly e manter só `chromium` no PR, para não estourar tempo de CI.
  3. Priorizar `webkit` no primeiro corte — é onde as APIs de offline/SW divergem mais e onde está iOS Safari, exigido pela etapa 92.
- **Aceite:** `grep -c "name: '" playwright.config.ts` retorna `>= 4` e o run de CI publica resultados para webkit e firefox (hoje: 1 project, só chromium).

### F10-02 — ALTO (P0): 28 dos 61 testes E2E nunca são executados por nenhum workflow

- **Sev:** `HIGIENE`
- **🟡 Parcialmente corrigido em 2026-08-02 (Etapa 2).** Ação 2 (job nightly rodando a suíte inteira) **feita**: `.github/workflows/e2e-nightly-full.yml` roda `test:e2e:full` sem filtro, cron 06:00 UTC. Ação 1 (trocar as listas `SPECS` por `--grep @tag`) **não feita** — exigiria tagear 61 specs; o nightly resolve a órfandade sem esse custo. Ação 3 (converter `e2e-admin-vps`/`e2e-evolution-vps` para `pull_request`) **não feita**: ambos exigem VPS viva, e o padrão do repo é pular VPS em PR.
- **Aceite verificado com comando real:** criado `scripts/check-e2e-spec-coverage.mjs`; `node scripts/check-e2e-spec-coverage.mjs` → `specs em e2e/: 61 · órfãos: 0 · exit 0`. O script roda como job próprio (`spec-coverage`) e reprova se um spec novo ficar sem execução.
- **Depende de:** **F10-09** (apontar o `testDir` certo é pré-requisito para os 28 specs rodarem)
- **Origem:** Etapas 91-94 (Bloco 10).
- **Evidência:**
  - `ls e2e/*.spec.ts | wc -l` = **61 specs**, todos versionados (`git ls-files e2e/` = 68 arquivos).
  - Cruzando cada nome de arquivo contra `.github/workflows/`: **31 referenciados**, 30 não. Descontando `auth-accessibility.spec.ts` e `auth-keyboard-navigation.spec.ts` — que rodam via `testMatch` do `test:a11y` sem serem citados por nome — restam **28 specs genuinamente órfãos**.
  - Os 4 workflows que consomem `e2e/` (`e2e-admin-vps`, `e2e-crm-vps`, `e2e-evolution-vps`, `e2e-inbox-vps`) selecionam subconjuntos por variável `SPECS="..."` hardcoded. Um spec novo em `e2e/` **não é coletado automaticamente** — precisa ser adicionado à lista à mão.
  - Agravante de gatilho: **2 dos 4** rodam em `pull_request` (`e2e-crm-vps`, `e2e-inbox-vps`). Os outros dois são **`workflow_dispatch` apenas** — execução manual, nunca automática.
  - Entre os órfãos há testes de valor evidente: `critical-flows.spec.ts`, `visual-regression.spec.ts`, `pipeline.spec.ts`, `dlq-idempotency.spec.ts`, `failure-isolation-per-thread.spec.ts`, `error-handling.spec.ts` e **8 specs `teams-*`** (incluindo `teams-security-integration.spec.ts`).
  - O custo já foi pago — os testes estão escritos, revisados e commitados. O que falta é execução.
- **Ação:**
  1. Substituir as listas `SPECS` hardcoded por seleção via tag/grep do Playwright (`--grep @admin`), de modo que specs novos entrem automaticamente.
  2. Criar um job nightly que rode `playwright test --config=playwright.e2e.config.ts` **sem filtro**, cobrindo os 61 de uma vez.
  3. Converter `e2e-admin-vps` e `e2e-evolution-vps` para também disparar em `pull_request`, ou documentar explicitamente por que são manuais.
- **Aceite:** script que compara `ls e2e/*.spec.ts` com os specs efetivamente executados no último run de CI retorna diferença `0` (hoje: 28).

### F10-03 — MÉDIO (P1): `vite-plugin-pwa` é dependência fantasma — declarada, instalada, nunca importada

(cross-ref: F9-02, F9-03)

- **Sev:** `HIGIENE`
- **Rollback:** R-CODE
- **Origem:** Etapa 95 (Bloco 10).
- **Evidência:**
  - `package.json:140` declara `"vite-plugin-pwa": "^0.21.0"` em devDependencies.
  - `grep -rn "VitePWA\|vite-plugin-pwa"` em todo o repo (excluindo `node_modules` e lockfile) retorna **exatamente uma linha: a própria declaração no `package.json`**. Nenhum import, nenhum uso no array `plugins` de `vite.config.ts`.
  - Contraste no mesmo arquivo: `rollup-plugin-visualizer` **é** importado (`vite.config.ts:6`) e usado condicionalmente (`vite.config.ts:119`, `mode === 'production'`). O padrão correto existe ao lado.
  - Consequência: `public/sw.js` é um Service Worker **escrito à mão** (confirmado no Bloco 9A), não gerado pelo plugin. Não há precache, não há manifest injection, não há estratégia Cache-First — a etapa 95 descreve "service worker Cache-First" que não existe.
  - Sinal de intenção revertida: há 4 specs em `src/tests/e2e/` cujo propósito é **garantir a ausência** de workbox (`no-workbox-after-reload`, `no-workbox-precache`, `no-workbox-precache-cache-storage`, `no-service-worker-persist`). O projeto ativamente testa que o PWA **não** está lá.
- **Ação:**
  1. Remover `vite-plugin-pwa` do `package.json` — a decisão de projeto, evidenciada pelos 4 specs anti-workbox, é não usá-lo.
  2. Registrar ADR consolidando a postura anti-PWA junto com F9-03 (purge de SW no `index.html`), para que a próxima auditoria não trate isso como regressão.
  3. Corrigir a etapa 95 do roteiro, que descreve um ferramental desativado.
- **Aceite:** `grep -c "vite-plugin-pwa" package.json` retorna `0`, ou o plugin passa a aparecer no array `plugins` de `vite.config.ts`.

### F10-04 — MÉDIO (P1): `@storybook/addon-a11y` instalado mas não registrado — o contraste WCAG nunca é verificado

- **Sev:** `HIGIENE`
- **✅ Corrigido em 2026-08-02 (Etapa 2).** `@storybook/addon-a11y` e `@storybook/addon-docs` registrados em `.storybook/main.ts`; `parameters.a11y` com `color-contrast` habilitado e `test: 'error'` gravado em `.storybook/preview.ts`. **Aceite:** `grep -c "addon-a11y" .storybook/main.ts` → `1`.
- **Ação 3 não feita:** job de CI com `build-storybook` + `addon-vitest` ficou fora — o repo já tem 48 workflows e o custo/benefício de mais um job foi julgado pior que o ganho. Registrado como **E02-N05**.
- **Origem:** Etapa 98 (Bloco 10).
- **Evidência:**
  - `package.json:152` declara `"@storybook/addon-a11y": "^10.4.6"`.
  - `.storybook/main.ts` registra **um único addon**:
    ```ts
    addons: [
      "@storybook/addon-links",
    ],
    ```
    Sem `addon-a11y`, o painel de acessibilidade nunca carrega e nenhuma regra de contraste roda no Storybook.
  - Outros três addons também estão instalados e não registrados: `@storybook/addon-docs`, `@storybook/addon-vitest`, `@chromatic-com/storybook`.
  - `.storybook/preview.*` não tem nenhuma chave `a11y` ou `parameters.a11y` — não há configuração de regras nem exceções.
  - A etapa 98 afirma "`@storybook/addon-a11y` **já habilitado**; ratchet no CI". Ambas as metades são falsas: não está habilitado, e `grep -rn "storybook" .github/workflows/` não retorna nenhum job de build ou teste de Storybook.
  - Efeito prático: **nenhuma verificação automatizada de contraste WCAG AA existe no projeto**, nem via Storybook nem via axe (o axe roda, mas restrito a 3 rotas — F10-05).
- **Ação:**
  1. Adicionar `"@storybook/addon-a11y"` e `"@storybook/addon-docs"` ao array `addons` de `.storybook/main.ts`.
  2. Configurar `parameters.a11y` em `.storybook/preview.ts` com as regras de contraste do WCAG AA e `test: 'error'` para falhar em violação.
  3. Adicionar job de CI rodando `build-storybook` + `@storybook/addon-vitest`, estabelecendo o ratchet que a etapa 98 pressupõe.
- **Aceite:** `grep -c "addon-a11y" .storybook/main.ts` retorna `1` e o painel Accessibility aparece no Storybook (hoje: 0).

### F10-05 — ALTO (P0): a verificação de acessibilidade cobre só 3 telas de autenticação — o produto inteiro fica de fora

- **Sev:** `HIGIENE`
- **🟡 Corrigido com desvio em 2026-08-02 (Etapa 2) — ⚠️ a Ação como escrita era insuficiente.** Ampliar o `testMatch` para `**/*-accessibility.spec.ts` passa a incluir `e2e/chat-accessibility.spec.ts`, que chama `login(page)` do `testHelpers`. O job `a11y` do `ci.yml` **não tem credenciais** e aponta para um vite local com Supabase placeholder: a ampliação sozinha transformaria um gate verde-e-estreito num gate **vermelho-e-quebrado**.
- **O que foi feito:** `playwright.a11y.config.ts` reescrito com dois projects — `public` (specs `auth-*`, sem storageState, roda em qualquer runner) e `authenticated` (todo o resto, com `storageState` de `e2e/global.setup.ts`), este **só registrado quando `E2E_USER_EMAIL`+`E2E_USER_PASSWORD` existem**. `webServer` passa a ser omitido quando `E2E_BASE_URL` aponta para ambiente já de pé. Um passo `bun run test:a11y --project=authenticated` foi adicionado ao `e2e-inbox-vps.yml`, que tem VPS e secrets.
- **Correção de referência:** `chat-accessibility.spec.ts` **não estava órfão** — já roda dentro da lista `SPECS` de `e2e-inbox-vps.yml`. O que faltava era ele estar no **gate de a11y**, não execução.
- **Aceite:** atendido pelo caminho do `e2e-inbox-vps` (rota autenticada de inbox/chat sob axe), não pelo job `a11y` do `ci.yml`. Ação 2 (criar `inbox-accessibility.spec.ts`) e Ação 3 (ratchet de violações por rota) **não feitas** — ver **E02-N04**.
- **Origem:** Etapa 97 (Bloco 10).
- **Evidência:**
  - `playwright.a11y.config.ts:18` restringe o escopo por `testMatch`:
    ```ts
    testMatch: ['**/auth-accessibility.spec.ts', '**/auth-keyboard-navigation.spec.ts']
    ```
    Apenas **2 arquivos**, ambos de autenticação.
  - O próprio CI documenta o alcance em `.github/workflows/ci.yml:343`: *"Run axe regression suite (**/auth, /forgot-password, /reset-password** + keyboard nav)"* — três rotas públicas, todas pré-login.
  - Existe um terceiro spec de acessibilidade no repo — **`e2e/chat-accessibility.spec.ts`** — que o `testMatch` **não inclui**, ficando fora do gate de a11y.
  - Não coberto: inbox (a tela onde os ~50 operadores passam o expediente), CRM/contatos, admin, dashboards, filas. `@axe-core/react` também está instalado (`package.json:63`), mas serve só para avisos em dev, não é gate.
  - Assimetria reveladora: as telas de login — usadas alguns segundos por dia — têm verificação de acessibilidade; o inbox, usado 8 horas por dia, não tem nenhuma.
- **Ação:**
  1. Ampliar `testMatch` para `['**/*-accessibility.spec.ts', '**/*-keyboard-navigation.spec.ts']`, incorporando de imediato `chat-accessibility.spec.ts`.
  2. Criar `inbox-accessibility.spec.ts` cobrindo lista de conversas, painel de chat e composer com `AxeBuilder().analyze()`.
  3. Estabelecer ratchet de violações por rota (baseline atual, proibido subir), no mesmo padrão de `check-coverage-ratchet.mjs`.
- **Aceite:** `bun run test:a11y --list` inclui ao menos uma rota autenticada do inbox (hoje: só `/auth`, `/forgot-password`, `/reset-password`).

### F10-06 — MÉDIO (P1): o gate de performance roda com `continue-on-error: true` — nunca reprova nada

- **Sev:** `QUEBRADO`
- **✅ Corrigido em 2026-08-02 (Etapa 2) — ⚠️ mas a premissa "a infraestrutura funciona" é FALSA.** O `continue-on-error: true` foi removido do passo Performance Budget Gate (**Aceite:** `grep -A2 "Performance Budget Gate" .github/workflows/quality-gate.yml` não contém `continue-on-error`). Porém `scripts/check-performance-budget.mjs` **não mede nada**: `currentMetrics` é um objeto literal (`LCP: 1200, bundleSize: 450*1024`…) com valor fixo no código. O gate deixou de ser advisory e continua passando sempre — por outro motivo. Ver **E02-N02**; foi adicionado `console.warn` no script para que ninguém confunda o verde com medição.
- **`perf:budget:baseline` não foi executado:** ele grava `performance-baseline.json` com os mesmos literais e o arquivo **nunca é lido** pelo script. Rodá-lo teria produzido artefato inútil.
- **`test:fuzz` (o segundo gate cosmético citado):** mantido `continue-on-error: true` — aponta para `localhost:54321`, que não existe no runner. É advisory correto, não máscara. Registrado como **E02-N06**.
- **Depende de:** **F1-10** (mesma classe: gate de CI que nunca reprova — tratar juntos na Etapa 2)
- **Origem:** Etapa 100 (Bloco 10).
- **Evidência:**
  - `.github/workflows/quality-gate.yml:141-143`:
    ```yaml
    - name: Performance Budget Gate
      run: npm run perf:budget
      continue-on-error: true
    ```
    O passo chama-se "Gate" mas é incapaz de barrar merge — falha vira aviso verde.
  - O próprio repo já reconhece o problema: `.github/workflows/CI_GATES_REDUNDANCY_REPORT.md:42` lista *"Performance Budget Gate | `npm run perf:budget` | ❌ | ✅ (continue-on-error) | ❌ | ❌"*.
  - Contradiz diretamente a **Definição de pronto** declarada no `PLANO_QA_ANALISE_100.md`: *"(c) run em CI passa sem `|| true`"*. `continue-on-error: true` é a forma YAML de `|| true`.
  - A infraestrutura funciona: `scripts/check-performance-budget.mjs` existe, com `perf:budget:baseline` para regravar o baseline — só falta ser obrigatório.
  - Padrão adjacente no mesmo arquivo: `test:fuzz` (linha 133) também roda com `continue-on-error: true`. Dois gates de qualidade cosméticos no mesmo workflow.
- **Ação:**
  1. Regravar o baseline com `npm run perf:budget:baseline` no estado atual, para partir de um patamar honesto.
  2. Remover `continue-on-error: true` do passo Performance Budget Gate.
  3. Se o bundle estiver acima do budget hoje, abrir issue de redução em vez de manter o gate desligado — o padrão atual esconde a dívida.
- **Aceite:** `grep -A2 "Performance Budget Gate" .github/workflows/quality-gate.yml` não contém `continue-on-error`.

### F10-07 — MÉDIO (P1): Lighthouse não existe no repositório, embora a etapa 100 o exija

- **Sev:** `HIGIENE`
- **Origem:** Etapa 100 (Bloco 10).
- **Evidência:**
  - `grep -rln "lighthouse" --include=*.yml --include=*.json --include=*.mjs .` (fora de `node_modules`) → **nenhum arquivo**. Sem `@lhci/cli`, sem `lighthouserc.json`, sem action `treosh/lighthouse-ci-action`, sem script npm.
  - A metade "bundle" da etapa 100 **está atendida**: `rollup-plugin-visualizer` é importado e ativo em build de produção (`vite.config.ts:6,119`), e `perf:budget` existe — ainda que desarmado (F10-06).
  - A metade "Lighthouse" não tem nenhum artefato: não há medição de LCP, CLS, TBT nem de PWA score. Sem isso, não existe número para os critérios de performance percebida que o gate de release pressupõe.
  - Relevante para o público real: os operadores acessam `https://zapp.atomicabr.com.br` de máquinas de escritório e celulares; sem métrica de campo nem de laboratório, regressões de carga passam despercebidas.
- **Ação:**
  1. Adicionar `@lhci/cli` com `lighthouserc.json` apontando para o preview do build de PR.
  2. Configurar assertions mínimas (`performance >= 0.7`, `accessibility >= 0.9`) começando permissivas e apertando por ratchet.
  3. Rodar em nightly, não em todo PR — Lighthouse é lento e ruidoso sob concorrência de runner.
- **Aceite:** existe `lighthouserc.json` e o CI publica scores como artefato em pelo menos um workflow.

### F10-08 — MÉDIO (P1): impressão está globalmente bloqueada — a etapa 99 pede transcript imprimível e o app entrega página em branco

- **Sev:** `HIGIENE`
- **Origem:** Etapa 99 (Bloco 10).
- **Evidência:**
  - Única ocorrência de `@media print` em todo o `src/` está em `src/features/auth/hooks/useScreenProtection.ts:155`, injetada dinamicamente:
    ```css
    @media print { body { display: none !important; } }
    ```
  - O hook é ativado **globalmente**, em `src/App.tsx:72` (`spMod.useScreenProtection()`), junto de bloqueios de cópia, arraste e menu de contexto.
  - Resultado observável: qualquer `Ctrl+P` em qualquer tela do sistema produz **página em branco**. Não existe folha de estilo de impressão para transcript de conversa, nem lógica de redação de PII.
  - **Calibração:** isto não é um bug — é proteção deliberada de PII, coerente com um sistema que trafega conversas de clientes, e resolve a preocupação de vazamento da forma mais radical possível. O achado é o **conflito não resolvido**: o roteiro da etapa 99 pressupõe impressão suportada com redação, e a decisão contrária não está registrada em nenhum ADR nem comentada no código.
  - Risco operacional real: se alguém do comercial precisar anexar um transcript a um processo, não há caminho — e a ausência de mensagem ao usuário faz parecer defeito do navegador.
- **Ação:**
  1. Decidir e registrar em ADR: impressão proibida (posição atual) **ou** impressão suportada com redação.
  2. Se proibida, adicionar aviso visível no `@media print` (`body::after` com "Impressão desabilitada por política de privacidade") em vez de `display: none` silencioso.
  3. Se suportada, criar rota dedicada de exportação de transcript com PII mascarada, isenta do `useScreenProtection`, e exportar em PDF em vez de `window.print()`.
- **Aceite:** existe ADR sobre política de impressão **e** a tentativa de imprimir produz mensagem explicativa, não página em branco.

### F10-09 — BAIXO (P1): três configs Playwright com `testDir` divergentes — `test:e2e` aponta para o diretório com 13 specs, não o de 61

(cross-ref: F10-02)

- **Sev:** `HIGIENE`
- **✅ Corrigido em 2026-08-02 (Etapa 2) — ⚠️ eram QUATRO configs, não três.** `playwright.e2e.config.fixed.ts` (duplicata órfã, achado **F1-06**) ainda existia. Foi **deletada nesta etapa** — F1-06 consumido fora de ordem, de propósito: manter a quarta config enquanto se mexia nas outras três era convite a erro. Zero referências em código ou workflow (só menções em `docs/audits/`).
- **O que foi feito:** `test:e2e` passou a declarar `--config=playwright.config.ts`; criados `test:e2e:boot` (13 specs de `src/tests/e2e`) e `test:e2e:full` (61 specs de `e2e/`). Os jobs "E2E Tests" de `ci.yml` e `quality-gate.yml` chamam `test:e2e:boot` e dizem no nome o que rodam. **O alvo não mudou** — mudou o fato de estar declarado; apontar o gate bloqueante para os 61 specs de VPS o deixaria vermelho por falta de backend.
- **Ação 3 (fundir as configs em uma com `projects`) não feita:** as três restantes têm `webServer`/`storageState` incompatíveis. Fundir é refatoração própria, não higiene.
- **Correção de referência adicional:** os specs não vivem em 2 diretórios, e sim em **4** — `e2e/` (61), `src/tests/e2e/` (13), `tests/e2e/` (10, dos quais 3 são `.test.ts` de vitest) e `tests/` (2 visuais). Ver **E02-N07**.
- **Raiz de:** F10-02
- **Origem:** Etapas 91-94 (Bloco 10).
- **Evidência:**
  - Três arquivos de configuração coexistem com alvos diferentes:
    - `playwright.config.ts:4` → `testDir: './src/tests/e2e'` (**13 specs**)
    - `playwright.e2e.config.ts:25` → `testDir: './e2e'` (**61 specs**)
    - `playwright.a11y.config.ts:17` → `testDir: './e2e'` + `testMatch` de 2 arquivos
  - O script `"test:e2e": "playwright test"` (`package.json:30`) roda **sem `--config`**, ou seja, usa o default `playwright.config.ts` → executa os **13** specs de `src/tests/e2e/`, não os 61 de `e2e/`.
  - Esse é exatamente o script invocado por `.github/workflows/ci.yml:311` e `.github/workflows/quality-gate.yml:139` — os dois jobs chamados "E2E Tests" no CI principal.
  - O nome dá a entender cobertura ampla; a cobertura real é o diretório menor, cujos specs são majoritariamente sobre boot e ausência de workbox (`app-boot`, `boot-resilience`, `no-workbox-*`).
  - Ninguém percebe porque ambos passam: o job fica verde executando 13 testes enquanto 61 aguardam em outro diretório.
- **Ação:**
  1. Renomear os scripts para revelar o alvo: `test:e2e:boot` (config default) e `test:e2e:full` (`--config=playwright.e2e.config.ts`).
  2. Fazer os jobs "E2E Tests" do `ci.yml` e `quality-gate.yml` chamarem explicitamente a config pretendida.
  3. Considerar fundir as três configs em uma com `projects` distintos, eliminando a divergência de `testDir`.
- **Aceite:** `grep -n '"test:e2e"' package.json` mostra `--config` explícito, e o run de CI reporta contagem de testes compatível com o diretório pretendido.
