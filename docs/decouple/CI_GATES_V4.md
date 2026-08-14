# CI_GATES_V4 — Todos os gates ativos pós-#1079/#1082/#1084 (V4-FINAL #27)

> **Status:** VIVO · **Data:** 2026-08-14 · **Escopo:** inventário fiel dos gates de desacoplamento ativos, lidos dos scripts/workflows reais (não de memória).
> **Fonte da verdade:** PRs #1079 (inventory v4 / diagnóstico), #1082 (ownership 0 pendentes), #1084 (decouple-guard v3: TOTAL=0 + sql-gate via fixture + verb-contract 12 verbos).

## Sumário

| # | Gate | Script/Bloco | Comando local exato | Onde roda no CI | Blocking? |
|---|---|---|---|---|---|
| 1a | Inventory de acoplamento v4 | `scripts/decouple/inventory.mjs` | `node scripts/decouple/inventory.mjs` | `decouple-guard.yml` (job `coupling-inventory`) | ✅ (TOTAL>0 falha) |
| 1b | Infra-regression (split evo-stack) | inline no workflow | — (checkout+ls) | `decouple-guard.yml` (job `infra-regression`) | ✅ |
| 1c | SQL egress gate | `scripts/decouple/sql-gate.mjs` + fixture commitada | `node scripts/decouple/sql-gate.mjs scripts/decouple/fixtures/sql_report_snapshot.json` | `decouple-guard.yml` (job `coupling-inventory`) | ✅ |
| 1d | Verb-contract (12 verbos) | `scripts/decouple/verb-contract-gate.mjs` | `node scripts/decouple/verb-contract-gate.mjs` | `decouple-guard.yml` (job `coupling-inventory`) | ✅ |
| 2 | Ownership gate (writes → evo) | `scripts/decouple/ownership-gate.mjs` | `node scripts/decouple/ownership-gate.mjs --ci` (sem `--ci` sai 0 sempre) | `ownership-gate.yml` (push main/`feat/decouple*` + PR) | ✅ (críticos/regressão) |
| 3 | Runner consolidado | `scripts/decouple/run-all-gates.mjs` | `node scripts/decouple/run-all-gates.mjs` (`SQL_REPORT_PATH=...` p/ override) | **Não roda no CI** — runner local/orquestração | — |
| 4 | Contract-coverage + suíte de contrato | `supabase/functions/_shared/__tests__/*.test.ts` (Deno) | `deno test --allow-net --allow-env --allow-read supabase/functions/_shared/__tests__/contract-coverage.test.ts` | `deno-contract-tests.yml` (push/PR em `supabase/functions/**` + cron diário 06:00) | ✅ |
| 5a | ts-nocheck drift gate | `scripts/check-ts-nocheck.mjs` | `node scripts/check-ts-nocheck.mjs` (`--update` regrava baseline; `--max=N` teto) | `ci.yml` (job `quality`) | ✅ |
| 5b | Dead-code gate | `scripts/check-dead-code.mjs` | `node scripts/check-dead-code.mjs` (`--list` p/ só listar) | `quality-gate.yml` (advisory/warning) + `bun run check` local | ⚠️ advisory no CI |
| 6 | ESLint decouple | bloco "CONTRACT + DECOUPLE GUARDS" em `eslint.config.js` (fundido 2026-08-14) | `npx eslint . --max-warnings 6` (npm run lint) | `ci.yml` (job `quality`) + `quality-gate.yml` (step Lint) | ✅ |

---

## 1. decouple-guard v3 — `.github/workflows/decouple-guard.yml` (PR #1084)

Workflow com 2 jobs:

### 1a. Job `infra-regression` — split do evo-stack (E22)
- **O que verifica:** não existir `infra/evolution*` nem `.github/workflows/publish-evolution*.yml` neste repo (infra da Evolution pertence a `adm01-debug/evolution-stack`).
- **Comando local exato:** (não há script — a checagem é inline no workflow) `ls infra/evolution*` e `ls .github/workflows/publish-evolution*.yml`; se qualquer um listar algo → falha.
- **O que falha:** qualquer arquivo `infra/evolution*` ou workflow `publish-evolution*` presente → `::error` + exit 1.
- **Onde roda no CI:** em todo PR que toca `src/**`, `supabase/functions/**`, `infra/**`, `scripts/**` (branch main) e push em main (`src/**`, `supabase/functions/**`, `scripts/**`).

### 1b. Job `coupling-inventory` — gates endurecidos (v3)
Roda 3 gates em sequência + diagnóstico em falha:

#### Inventory v4 — `scripts/decouple/inventory.mjs`
- **O que verifica:** 4 métricas de acoplamento vs baseline NOVO 0/0/0/0 (delta vs baseline antigo 9/0/6/2):
  1. `frontEvoBypass` — arquivos de `src/` chamando `invoke('evolution-api', …)` fora de `whatsappAdapter.ts`/`sendFunctionRouter.ts`;
  2. `backendUrlBypass` — edge functions lendo `EVOLUTION_API_URL` via `Deno.env.get`/`requireEnv` (aspas simples/duplas/template literal) fora de `evolution-api-proxy`, `providers/evolution` e `connection-health-check` (exceção por design);
  3. `frontEvoWrites` — `.from('evolution_*').insert/update/delete/upsert` direto no front;
  4. `frontDirectEvoHttp` — qualquer string `evolution.atomicabr.com.br` | `/message/sendText` | `/instance/` (ou `VITE_EVOLUTION_API_URL`, fetch direto, import de `evolutionClient`) em `src/`, fora das exceções documentadas (linhas 27–39 do script: `_archive`, adapter, `ZappWebbDemoPage`, `evolutionClient.ts` decoupled, `useEvolutionApiIntegration` etc.).
  - Whitelist de tooling: `scripts/`, `.github/`, `__tests__`, `*.test.ts`, `eslint.config.js`, `docs/`, `src/test/`, `src/tests/`.
- **Comando local exato:** `node scripts/decouple/inventory.mjs` (override de raiz p/ teste: `INVENTORY_ROOT=/caminho node scripts/decouple/inventory.mjs`).
- **O que falha:** **TOTAL > 0** (qualquer métrica > 0) → exit 1. No CI o step extrai `TOTAL` da linha `TOTAL:` e falha com `::error` listando os violadores (grep) e instrução de rodar local.
- **Onde roda no CI:** `decouple-guard.yml`, step "Run coupling inventory" (Node 20) + step "Fail if TOTAL > 0". **Verificado local em 2026-08-14: exit 0, TOTAL=0** (front 0, backend 0, writes 0, http 0).

#### SQL egress gate via fixture — `scripts/decouple/sql-gate.mjs` (ADR-010)
- **O que verifica:** nenhuma função PL/pgSQL em escopo (`evo`, `zapp`, `ops`, `public`) com egresso Evolution fora do gateway SQL. Duas regras (qualquer violação → exit 1):
  1. `prosrc` com `net.http_get(`/`net.http_post(` **e** menção a `evolution` **sem** usar `ops.fn_evo_url()`/`ops.fn_evo_key()` → violação;
  2. `prosrc` lendo `vault.decrypted_secrets` **e** `evolution_api_url` sem usar os resolvers → violação.
  - Conformidade (V3/V7): fn que resolve URL/key via `ops.fn_evo_url`/`ops.fn_evo_key` é compliant — mata falsos positivos de comentários.
  - Whitelist nominal: `ops.fn_evo_url`, `ops.fn_evo_key`, `zapp.fn_check_license_heartbeat` (health check sem apikey), `evo.fn_detect_instance_recreate` (alerta n8n bootstrap).
- **Comando local exato:**
  - Validar o snapshot commitado (determinístico, sem secrets): `node scripts/decouple/sql-gate.mjs scripts/decouple/fixtures/sql_report_snapshot.json`
  - Gerar a query do report (para rodar na VPS): `node scripts/decouple/sql-gate.mjs --sample` — imprime a consulta `pg_proc` (docker exec psql → `report.json`), depois `node scripts/decouple/sql-gate.mjs report.json`.
  - Teste de regressão do próprio gate: `node --test scripts/decouple/__tests__/sql-gate.test.mjs` (4 casos: egresso hardcoded real → violação; fn compliant → OK; falsos positivos legítimos → OK; entry `null` no report → não crasha — bug V7).
- **O que falha:** 1+ violação → exit 1 com lista `fn: razão`; report ausente/JSON inválido → exit 2. Snapshot atual: 12 fns (8 analisadas + 4 whitelist). **Verificado local: exit 0, "SQL gate OK: 0 violações (8 analisadas, 4 no whitelist)".**
- **Onde roda no CI:** `decouple-guard.yml`, step "SQL egress gate (fixture commitado — ADR-010)". A fixture é o snapshot versionado das fns de egresso — refrescar **só** quando o egresso SQL mudar (ADR-010). Nota: este gate valida **estado commitado**; o report fresco do banco (VPS) é o mesmo código rodado via `run-all-gates.mjs`/`SQL_REPORT_PATH`.

#### Verb-contract gate — `scripts/decouple/verb-contract-gate.mjs`
- **O que verifica:** o objeto `export const evolutionClient = { … }` em `supabase/functions/_shared/providers/evolution/client.ts` exporta **exatamente** os 12 verbos do contrato (fonte: PLANO V4-FINAL): `sendText, sendMedia, sendSticker, getConnectionState, getQrCode, restartInstance, listInstances, listGroups, checkWhatsApp, getProfilePicture, get, post`. O gateway é a única fonte desses verbos; divergência = refactor acidental ou verbo novo não documentado.
- **Comando local exato:** `node scripts/decouple/verb-contract-gate.mjs`
- **O que falha:** verbos faltando **ou** extras (diff impresso), ou `evolutionClient` não encontrado → exit 1. **Verificado local: exit 0, "12 verbos — contrato de 12 íntegro".**
- **Onde roda no CI:** `decouple-guard.yml`, step "Verb contract gate (12 verbos do gateway)".

#### Diagnóstico em falha
- Step "Diagnostic - grep de padrões de bypass" roda `if: failure()`: greps de `invoke('evolution-api')` fora do adapter, `EVOLUTION_API_URL` direto em edge fns, writes `.from('evolution_*')`, import dinâmico de `supabase/functions` em `src/` — agrupados em `::group::`.
- Step "Upload inventory report" (`if: always()`): artifact `coupling-inventory` (`/tmp/inventory.txt`, retenção 7 dias).

---

## 2. Ownership gate — `scripts/decouple/ownership-gate.mjs`

- **O que verifica:** o app (edge fns `supabase/functions/` + `src/`) **nunca grava em tabelas do Grupo A** (Evolution-stack owns: `evolution_rabbit_consumer_stats`, `evolution_webhook_events_v2`, `evolution_traefik_401_stats`, `evolution_connection_history`, `evolution_guardian_heartbeat`, `evolution_bootstrap_log`, `evolution_pipeline_health_log`, `evolution_pipeline_history`, `evolution_reconcile_jobs`, `evolution_reconcile_health_log`, `e2e_probe_results`, `migration_watermark`, `lid_phone_map`, `contact_identity`, `lid_convergence_history`, `vps_*`, `ops_runbooks`, `idx_usage_audit`, `media_*`, `ingest_ledger`…). Detecta `insert(/update(/upsert(/delete(` em janela de 7 linhas após `.from('evolution_*'|'media_*'|'contact_identity'|'lid_phone_map'|'ingest_ledger'|'lid_convergence_history')` em `.ts`/`.tsx` (exclui `__tests__`, `*.test.*`, `*.spec.*`).
  - `MIGRATED_TO_ZAPP` (38 tabelas migradas via SET SCHEMA — lotes 1–10 + lote FINAL, 2026-08-13): writes a elas são legítimos (contam como migrados, não pendentes).
  - `BASELINE.total = 0` (meta: 0 pendentes; 4 writes de `evolution_contacts` eliminados/migrados no lote FINAL).
- **Comando local exato:** `node scripts/decouple/ownership-gate.mjs --ci` — **sem `--ci` o script sempre sai 0** (modo relatório). No CI: `node --experimental-vm-modules scripts/decouple/ownership-gate.mjs --ci` (flag vestigial, mantida no workflow).
- **O que falha:** (a) qualquer write crítico em Grupo A → exit 1 imediato; (b) com `--ci`, pendentes > baseline (regressão) → exit 1; progresso (pendentes < baseline) imprime aviso para decrementar `BASELINE.total`.
- **Onde roda no CI:** `ownership-gate.yml` — push em `main`/`feat/decouple*` e PRs com paths `src/**/*.ts`, `src/**/*.tsx`, `supabase/functions/**/*.ts`. **Verificado local: exit 0, "0 pendentes (igual ao baseline 0, sem regressão)".**

---

## 3. Runner consolidado — `scripts/decouple/run-all-gates.mjs`

- **O que verifica:** nada por si — orquestra os 3 gates em sequência: `inventory.mjs` → `ownership-gate.mjs --ci` → `sql-gate.mjs <report>`. Exit composto: 0 = todos os executados passaram; 1 = algum falhou; SKIP (script/report ausente) não conta como falha.
- **Comando local exato:**
  - `node scripts/decouple/run-all-gates.mjs` (procura `report.json` ao lado do script)
  - `SQL_REPORT_PATH=/caminho/report.json node scripts/decouple/run-all-gates.mjs` (override do report do sql-gate — report gerado na VPS com `node sql-gate.mjs --sample`)
- **O que falha:** qualquer gate com exit ≠ 0 (inventory com TOTAL>0, ownership crítico/regressão, sql-gate com violação); erro de spawn também conta como falha.
- **Onde roda no CI:** **não roda em nenhum workflow** — é o runner local/orquestração (cada gate tem workflow próprio: `decouple-guard.yml` + `ownership-gate.yml`). Zero dependências (Node ESM, stdlib).

---

## 4. Contract-coverage / webhook-contracts — `supabase/functions/_shared/__tests__/` (Deno)

- **O que verifica:** a suíte de contratos das edge functions roda por arquivo com `deno test`. Destaques (gate de cobertura + webhook):
  - **`contract-coverage.test.ts` — "DEFINIÇÃO EXECUTÁVEL de cobertura 100%":** para CADA edge function de primeiro nível (`supabase/functions/<fn>/index.ts`), se o fonte lê body (`req.json()`, `request.json()`, `req.text()`, `req.formData()`…) então DEVE invocar o gate de contrato (`parseOrReject(` ou `parseRequestOrReject(`). Allowlist documentada (máx. 3): `main` e `mcp` (proxy — não podem consumir o stream; gate no-op só p/ req sem body) e `evolution-proxy` (validação manual method/path com allowlist de 6 verbos). Asserts: zero violações + `withGate >= 90%` + allowlist ≤ 3. Fecha o gap das 52 funções sem validação (consolidação 2026-08-04).
  - **`evolution-webhook-security.test.ts` (contrato do webhook):** regressões de segurança do pipeline Evolution — C-1 `unmarkEventProcessed` (rollback da marca de idempotência no path 429, sem perda silenciosa) e A-2 `scrubWebhookSecrets` + `routeToDeadLetter` (secrets de producer — apikey/sender/token — removidos antes de persistir na DLQ).
  - Demais arquivos do diretório (contract-kit, contract-schemas*, registry, hmac-multi-secret, rate-limiter, whatsapp-cloud-normalizer, service-role-contract, etc.) completam a suíte — todos pegos pelo loop do workflow.
- **Comando local exato (por arquivo, isolamento de processo):**
  - `deno test --allow-net --allow-env --allow-read supabase/functions/_shared/__tests__/contract-coverage.test.ts`
  - Suíte completa: `find supabase/functions -name '*.test.ts' | xargs -I{} deno test --allow-net --allow-env --allow-read {}` (mesmo loop do CI; **sem `--no-check`** — type-check faz parte do contrato, TS2339 derruba).
- **O que falha:** qualquer teste falhando (violação de cobertura, divergência de contrato, erro de tipo TS) → exit 1 no arquivo → job vermelho.
- **Onde roda no CI:** `deno-contract-tests.yml` — push/PR com paths `supabase/functions/**`, `deno.json` ou o próprio workflow; **cron diário 06:00 UTC** (pega órfãos de onda, ex. #922). Secrets `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` injetados como env. Permissions: `checks: write`.

---

## 5a. ts-nocheck drift gate — `scripts/check-ts-nocheck.mjs`

- **O que verifica:** o conjunto de arquivos com `// @ts-nocheck` em `src/` e `supabase/` (grep `-rl`) contra o baseline `scripts/ts-nocheck-baseline.txt` (1 path por linha, ordenado). Baseline atual: **2 arquivos** (`src/_archive/healthCheck.archived.ts`, `src/integrations/supabase/types-manual.ts`).
- **Comando local exato:**
  - `node scripts/check-ts-nocheck.mjs` — falha se drift
  - `node scripts/check-ts-nocheck.mjs --update` — regrava o baseline (após remover ts-nocheck de arquivos)
  - `node scripts/check-ts-nocheck.mjs --max=120` — override do teto
- **O que falha:** (1) arquivo **novo** com `@ts-nocheck` fora do baseline → exit 1; (2) total > `--max` → exit 1; (3) arquivos **removidos** sem `--update` → exit 1 (baseline desatualizado; removidos = progresso, mas exige regravar baseline). Saída lista `+ arquivo` (novos) e `- arquivo` (removidos/progresso).
- **Onde roda no CI:** `ci.yml`, job `quality`, step "ts-nocheck drift gate (blocking)" — após o typecheck ratchet. **Nota Windows/git-bash:** o script usa `execSync('grep …')` (spawn de `cmd.exe`) — nesta máquina (git-bash) falha com `ENOENT spawnSync cmd.exe` por peculiaridade do ambiente; é gate POSIX, roda normal no runner ubuntu (e em WSL/cmd puro).

## 5b. Dead-code gate — `scripts/check-dead-code.mjs`

- **O que verifica:** grafo de imports de `src/` (estáticos `from`, dinâmicos `import(`, `require(`, re-exports e `src=` de `index.html`, varrendo raízes `src/`, `scripts/`, `e2e/`, `.storybook/` + configs) → falha se existir `.ts`/`.tsx` **sem nenhum importador**. Exclusões conscientes: `src/components/ui/**` (design system, lido pelo generate-component-registry), testes/stories/setup, `main.tsx`/`App.tsx`, `*.d.ts` e `scripts/dead-code-allowlist.txt` (188 linhas, 1 path por linha com justificativa em comentário).
- **Comando local exato:** `node scripts/check-dead-code.mjs` (exit 1 = código morto, lista os arquivos) · `node scripts/check-dead-code.mjs --list` (só lista, exit 0) · alias npm: `npm run check:deadcode` (também dentro de `bun run check`).
- **O que falha:** N arquivos sem importador → exit 1 (remova, importe de fato ou adicione à allowlist com justificativa).
- **Onde roda no CI:** `quality-gate.yml`, step "Refactor guards (ratchets — dead code + data layer)" — **advisory**: violação vira `::warning` e o job segue (exit 0); bloqueia de fato no `bun run check` local (que roda `check:deadcode`). **Verificado local: exit 0, "nenhum arquivo morto detectado".**

---

## 6. ESLint decouple — bloco "CONTRACT + DECOUPLE GUARDS" em `eslint.config.js`

- **O que verifica:** bloco único (fundido 2026-08-14 — antes o bloco SCHEMA CONTRACT sobrescrevia o DECOUPLE por causa da semântica flat-config "último vence"; agora os 6 selectors vivem juntos, com ignores = união dos dois) aplicado a `src/**/*.{ts,tsx}`, todos `no-restricted-syntax` **error**:
  1. `[decouple]` `invoke('evolution-api', …)` direto — usar `whatsappAdapter` (E94 Plano V2);
  2. `[decouple]` import de **valor** de `evolutionExternal` fora de `src/adapters/` (type-only permitido — 13 consumidores legítimos);
  3. `[decouple]` literal `VITE_EVOLUTION_API_URL` no front (zombie coupling, V3 F2);
  4. SCHEMA CONTRACT: `.schema('evo'|'email_app')` no front — usar views `zapp`;
  5. SCHEMA CONTRACT: `schema:'public'` em objetos (ex. `postgres_changes`);
  6. SCHEMA CONTRACT: `information_schema` direto — usar RPCs `rpc_schema_tables`/`rpc_schema_columns` (F-06).
  - Ignores documentados: `whatsappAdapter.ts`, `sendFunctionRouter.ts`, `_archive/**`, `ZappWebbDemoPage.tsx`, `healthCheck.ts`, `evolutionClient.ts`, `supabaseClient.ts`, `useMessagesCursor.ts`, `types.ts`/`types-manual.ts`, `client.ts`, testes, `scripts/**`.
  - Outros blocos decouple-adjacentes: DOMAIN BOUNDARY ENFORCEMENT (sem imports profundos entre `@/features/*`), INBOX READ CONTRACT (proíbe imports de `**/evolution-api/**/find*`, `list-messages*` etc. no inbox) e REALTIME HYGIENE (E20: `'wpp2'` hardcoded + canal Realtime estático).
- **Comando local exato:** `npx eslint . --max-warnings 6` — ou o script npm: `npm run lint` (= `eslint . --max-warnings 6 && bun run scripts/check-design-system.ts --ci --max=130`).
- **O que falha:** qualquer selector error → exit ≠ 0; teto de 6 warnings (baseline medido 2026-08-02).
- **Onde roda no CI:** `ci.yml` job `quality`, step "ESLint diagnostics" (`bunx eslint .`, blocking — error title=ESLint se reprovar) e `quality-gate.yml` step "Lint (blocking — E02/F1-10)" (`npm run lint`).

---

## Como rodar tudo localmente (ordem recomendada)

```bash
# Gates de desacoplamento (scripts/decouple):
node scripts/decouple/inventory.mjs                       # TOTAL deve ser 0
node scripts/decouple/ownership-gate.mjs --ci             # 0 pendentes / 0 críticos
node scripts/decouple/verb-contract-gate.mjs              # 12 verbos
node scripts/decouple/sql-gate.mjs scripts/decouple/fixtures/sql_report_snapshot.json   # 0 violações
node scripts/decouple/run-all-gates.mjs                   # runner consolidado (3 gates)
node --test scripts/decouple/__tests__/sql-gate.test.mjs  # teste de regressão do próprio gate

# Gates de higiene (scripts/):
node scripts/check-ts-nocheck.mjs     # baseline 2 arquivos — drift falha
node scripts/check-dead-code.mjs      # 0 arquivos mortos
npx eslint . --max-warnings 6         # ESLint (bloco decouple = 6 selectors error)

# Contratos Deno (supabase/functions/_shared/__tests__/):
deno test --allow-net --allow-env --allow-read supabase/functions/_shared/__tests__/contract-coverage.test.ts
```

### Verificação executada em 2026-08-14 (nesta máquina, worktree chat-h713641)

| Gate | Exit | Resultado |
|---|---|---|
| `inventory.mjs` | 0 | TOTAL=0 (delta -17 vs baseline antigo) |
| `ownership-gate.mjs --ci` | 0 | 0 pendentes = baseline 0 |
| `verb-contract-gate.mjs` | 0 | 12/12 verbos |
| `sql-gate.mjs` (fixture) | 0 | 8 analisadas, 4 whitelist, 0 violações |
| `sql-gate.test.mjs` (node --test) | 0 | 4 casos passando |
| `check-dead-code.mjs` | 0 | nenhum arquivo morto |
| `check-ts-nocheck.mjs` | 1* | *falha ambiental no git-bash (spawn `cmd.exe` ENOENT — script POSIX; no CI ubuntu roda ok) |
