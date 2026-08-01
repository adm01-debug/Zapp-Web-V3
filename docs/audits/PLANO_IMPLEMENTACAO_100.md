# PLANO DE CORREÇÃO — populado durante a análise

> Documento vivo. Cada achado real da análise vira uma etapa aqui, com origem (etapa da análise), evidência (query/arquivo/log) e critério de aceite.
> **Correção é responsabilidade do próximo chat.**

Convenção de ID: `F<bloco>-<seq>` — ex. `F1-01` = primeiro achado do bloco 1 da análise.

---

## Tema 1 — Higienização do repositório

### F1-01 — Deletar arquivo lixo `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`

- **Origem:** Etapa 1 (contagem de arquivos raiz), Etapa 10 (dead-code).
- **Evidência:** presença do arquivo (17 B) na raiz do repo com o próprio nome `DO_NOT_MERGE`.
- **Ação:** `git rm ___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`.
- **Aceite:** arquivo ausente em `main`.

### F1-02 — Ignorar e remover `__pycache__/` do versionamento

- **Origem:** Etapa 1, Etapa 10.
- **Evidência:** pasta `__pycache__/` versionada na raiz do repo (bytecode Python).
- **Ação:** adicionar `__pycache__/` e `*.pyc` ao `.gitignore`; `git rm -r --cached __pycache__`.
- **Aceite:** pasta ausente do próximo `git status --ignored`.

### F1-03 — Mover scripts soltos para `scripts/`

- **Origem:** Etapa 1, Etapa 10.
- **Evidência:** `ci_cost_analysis.py` e `gen_insert.cjs` na raiz.
- **Ação:** `mv ci_cost_analysis.py scripts/`, `mv gen_insert.cjs scripts/`. Atualizar referências em `package.json` se houver.
- **Aceite:** apenas `README.md`, configs de tooling e configs de deploy na raiz.

### F1-04 — Migrar `lgpd_deploy.sql` para `supabase/migrations/`

- **Origem:** Etapa 10.
- **Evidência:** SQL migration solta na raiz do repo, fora da estrutura padrão do Supabase.
- **Ação:** renomear para `supabase/migrations/YYYYMMDDHHMMSS_lgpd_deploy.sql` seguindo timestamp de origem; registrar em `supabase_migrations.schema_migrations` (workaround `apply_migration` bugado).
- **Aceite:** migration em ordem cronológica correta; nenhum SQL solto na raiz.

### F1-05 — Mover relatórios `.md` da raiz para `docs/audits/history/`

- **Origem:** Etapa 10.
- **Evidência:** 8 relatórios em markdown ocupando raiz.
- **Ação:** `mkdir -p docs/audits/history` e `git mv *.md docs/audits/history/` (preservando `README.md`, `CHANGELOG.md`, `SECURITY.md`).
- **Aceite:** raiz limpa de relatórios ad-hoc.

### F1-06 — Deletar duplicata `playwright.e2e.config.fixed.ts`

- **Origem:** Etapa 10.
- **Evidência:** arquivo com sufixo `.fixed` convive com `playwright.e2e.config.ts` (duplicata).
- **Ação:** `git rm playwright.e2e.config.fixed.ts` após diff confirmar equivalência ou merge de mudanças pontuais.
- **Aceite:** um único config de Playwright e2e.

### F1-07 — Consolidar 5 pastas de teste em padrão único

- **Origem:** Etapa 1, Etapa 10.
- **Evidência:** convivem `src/__tests__/`, `src/test/`, `src/tests/`, `src/pages/__tests__/`, `src/features/*/__tests__/`, `tests/` (raiz) e `e2e/` (raiz).
- **Ação:** padronizar em `src/**/__tests__/` para unit/integration e `e2e/` para Playwright. Migrar/mover arquivos. Ajustar `vitest.config.ts` e ESLint patterns.
- **Aceite:** apenas duas convenções vivas (`__tests__` + `e2e/`), documentadas em `CONTRIBUTING.md`.

### F1-08 — Deletar `supabase/functions-legacy/`

- **Origem:** Etapa 10.
- **Evidência:** nome `functions-legacy/` sinaliza dead code.
- **Ação:** validar via grep global se algum import ativo ainda referencia o path; caso não, `git rm -r supabase/functions-legacy`.
- **Aceite:** pasta removida; nenhum import quebrado no CI.

### F1-09 — Mover/deletar `supabase/fatorx-migrations/`

- **Origem:** Etapa 10; contexto do usuário (FATOR X é outro projeto).
- **Evidência:** pasta `fatorx-migrations/` no repo `zapp-web-v3` (contexto errado).
- **Ação:** migrar para o repo correto (`fator-x` ou equivalente) ou `git rm -r supabase/fatorx-migrations` se já aplicado no destino.
- **Aceite:** repo `zapp-web-v3` sem migrations de outro projeto.

---

## Tema 2 — Gates de CI e qualidade

### F1-10 — Remover `|| true` do script `lint`

- **Origem:** Etapa 10 (análise `package.json` conforme levantamento factual).
- **Evidência:** `package.json` script `lint` termina em `|| true`, escondendo falhas.
- **Ação:** `"lint": "eslint . --max-warnings 999"` → remover ` || true`.
- **Aceite:** `bun run lint` retorna exit code ≠ 0 quando há erros.

### F1-11 — Reduzir `--max-warnings 999` progressivamente até `0`

- **Origem:** Etapa 10.
- **Evidência:** limite atual de 999 warnings mascara acumulação.
- **Ação:** contar warnings atuais, definir baseline pouco acima e reduzir em cada PR até zero. Adicionar CI check `--max-warnings 0` para arquivos novos/modificados.
- **Aceite:** limite ≤ 50 em 30 dias; target ≤ 10 em 90 dias.

---

## Tema 6 — Frontend: router, navegação, arquitetura

### F1-12 — Homônimos em `src/pages/` (padrão duplicado por page)

- **Origem:** Etapa 5 (inventário de pages).
- **Evidência:** para várias views há `.tsx` na raiz de `src/pages/` E subpasta com o mesmo nome-slug (ex: `AdminAlertHistoryPage.tsx` + `admin-realtime-monitor/`).
- **Ação:** padronizar em `src/pages/<slug>/index.tsx` (subpasta única) ou em arquivos flat — nunca ambos. Escolher e migrar.
- **Aceite:** para cada page existe UMA localização canônica; convenção documentada.

### F1-13 — Pages órfãs (sem `<Route>`) mas lazy-carregadas

- **Origem:** Etapa 2, Etapa 5.
- **Evidência:** exports em `lazyViews.ts` sem `<Route path=... element={<X/>} />` correspondente em `AppRoutes.tsx`/`AdminRoutes.tsx`:
  - `AdminTelemetriaPage`
  - `AdminFailedMessagesPage`
  - `AdminSearchInsightsPage`
  - `AdminWebhookEventsPage`
  - `AdminEvolutionApiLogsPage`
  - `AdminAlertHistoryPage`
  - `AdminWebhookOverviewPage`
  - `AdminInstancePausesPage`
  - `AdminRealtimeMonitorPage`
  - `AdminDispatchErrorsHistoryPage`
  - `AdminWebhookSecretStatusPage`
- **Ação:** para cada uma, decidir: (a) criar `/admin/<slug>` protegida, ou (b) manter apenas via `?view=X` no `ViewRouter.tsx`. Nas que ficarem em query, remover do `lazyViews.ts` do primeiro grupo e agrupar em `ViewRouter`.
- **Aceite:** zero pages carregáveis mas não roteáveis; matriz page × rota consolidada em `docs/architecture/routes.md`.

### F1-14 — Consolidar padrão duplo URL canônica vs `?view=X&tab=Y`

- **Origem:** Etapa 2, Etapa 3.
- **Evidência:** `<Route path="/connections" element={<Navigate to="/?view=connections&tab=connections" replace />} />` e similar para `/integrations` — redirects vivos indicam migração incompleta.
- **Ação:** decidir política única: URLs canônicas (`/admin/roles`, `/connections`) OU query-string (`?view=X&tab=Y`). Migrar tudo, atualizar deep-links e bookmarks, documentar em `docs/architecture/routing.md`.
- **Aceite:** um único padrão de navegação vivo; catálogo de rotas com URL final canônica; nenhum `<Navigate>` de compat sobrando após 30 dias.

---

## Tema 3 — Segurança Supabase

_(aguardando Bloco 2)_

## Tema 4 — Performance de banco

_(aguardando Bloco 2)_

## Tema 5 — Consolidação de cron jobs

_(aguardando Bloco 2)_

## Tema 7 — Frontend: auth e sessão

_(aguardando Bloco 3)_

## Tema 8 — Frontend: inbox e mensageria

_(aguardando Bloco 4)_

## Tema 9 — Frontend: admin e observabilidade

_(aguardando Bloco 7)_

## Tema 10 — Infra, deploy e resiliência

_(aguardando Bloco 9)_
