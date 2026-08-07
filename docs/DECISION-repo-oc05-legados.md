# DECISION — Legados do repositório (OC-05, 2026-08-07)

Registro de decisões da onda OC-05 (repo-only) sobre achados de auditoria.
Todas as decisões foram tomadas **sem merge** (PRs abertos) e sem alterar
comportamento de runtime. Evidências: varredura do código no commit
`origin/main` `3a8344246`.

---

## REC-06-07 — `vercel.json` é relicto da fase Lovable/Vercel

**Status: DOCUMENTADO (não removido).**

**Evidência:**
- `README.md` (seção Deploy) dizia *"O deploy é gerenciado automaticamente pelo
  Lovable"* e *"Produção: Vercel (vercel.com)"* — **falso** desde a migração
  self-hosted (2026-06-30). Corrigido neste PR.
- Deploy real: push em `main` → `.github/workflows/deploy-vps.yml` → build +
  push `ghcr.io/adm01-debug/zapp-web-v3` → Portainer stack `zapp-web-prod`
  (Docker Swarm na VPS). Edge functions via `edge-deploy.yml`.
- `vercel.json` (raiz) define framework/build/rewrites/headers/CSP — nada no
  pipeline atual consome esse arquivo.
- Vestígios Vercel no código: fallbacks de e2e `https://zapp-web-v3.vercel.app/`
  em `src/tests/e2e/no-workbox-after-reload.spec.ts` e
  `no-service-worker-persist.spec.ts` (defaults de `E2E_PREVIEW_URL`/
  `E2E_PUBLISHED_URL`); rota `/.lovable/oauth/consent` em
  `src/components/routing/AppRoutes.tsx`.

**Decisão:** manter `vercel.json` como referência histórica (headers/CSP que a
stack Nginx reproduz — ver `nginx.conf`/`nginx-prod.conf`), documentado no
README. Remoção fica para onda futura, junto com a limpeza dos fallbacks de e2e
(risco: quebrar specs que rodam contra preview).

---

## REC-06-03 — `EVOLUTION_API_KEY` NÃO é órfã (manter)

**Status: DECISÃO = MANTER; nada a deletar no GitHub.**

**Evidência (grep em `.github/`, `src/`, `infra/`, `scripts/`, `supabase/`):**
- **33 referências ativas** — todas em `supabase/functions/*` via
  `Deno.env.get('EVOLUTION_API_KEY')` (evolution-api, connection-test,
  connection-health-check, evolution-sync, batch-fetch-avatars,
  fetch-whatsapp-avatar, health, migrate-media-storage) e em
  `infra/supabase/docker-compose.supabase.yml` (secret docker
  `evolution_api_key_v4_20260704`).
- **0 referências** em `.github/` (nenhum workflow usa a var).
- `gh secret list` (repo `adm01-debug/zapp-web-v3`): **não existe** secret GH
  com esse nome → não há secret órfão a remover.

**Decisão:** a variável é **ativa em runtime** (edge functions + secret docker
do stack Supabase). Não existe secret no GitHub Actions com esse nome — a
rotação/gestão é feita via **Docker secrets** (Portainer), não GH Actions.
Nenhuma ação de remoção. (Se um secret GH `EVOLUTION_API_KEY` antigo reaparecer
no futuro, pode ser deletado com segurança — o runtime não o consome.)

---

## REC-03-13 — Fallbacks dev/staging embutidos no código (manter)

**Status: DOCUMENTADO (não removido — risco de quebra).**

**Evidência** — fallbacks por ambiente em `src/hooks/useConnections.ts`
(linhas 51-75) e `src/pages/admin/Connections.tsx` (linhas 56-72):

| VITE_APP_ENV | Fallback de URL no código |
|---|---|
| `development` | `https://supabase-dev.atomicabr.com.br` (via `VITE_DEV_EXTERNAL_SUPABASE_URL`) |
| `staging` | `https://supabase-staging.atomicabr.com.br` (via `VITE_STAGING_EXTERNAL_SUPABASE_URL`) |
| `production` (default) | `https://supabase.atomicabr.com.br` (via `VITE_EXTERNAL_SUPABASE_URL`) |

Além disso, detecção de host Lovable (`*.lovableproject.com`,
`*.lovableproject-dev.com`, `*.beta.lovable.dev`, `*.lovable.app`) em
`src/App.tsx`, `src/hooks/useServiceWorker.ts` e
`src/features/auth/components/PreviewPreconditionBanner.tsx` — usada para
desativar SW e ajustar preview em ambiente Lovable.

**Decisão:** manter os fallbacks nesta onda. São o mecanismo que permite dev
local e QA apontarem para os Supabase dev/staging sem configurar nada; remover
quebraria esses fluxos. As variáveis correspondentes estão documentadas no
`.env.example` (seções 1 e 3). Revisão/remoção: onda futura, se os ambientes
dev/staging deixarem de existir.

---

## REC-04-12 — `types.ts` × DB: amostra 5 tabelas SYNC; regeneração pendente de tooling

**Status: VERIFICADO (5/5 tabelas em sync) + DRIFT DOCUMENTADO (tooling local).**

**Verificação (2026-08-07, read-only via postgres-meta/Kong):**

| Tabela (schema `zapp`) | DB (colunas) | types.ts | Resultado |
|---|---|---|---|
| `alert_channels` | 7 | 7 | ✅ SYNC |
| `contacts` | 50 | 50 | ✅ SYNC |
| `conversations` | 19 | 19 | ✅ SYNC |
| `messages` | 52 | 52 | ✅ SYNC (inclui `media_status`) |
| `vault_healthcheck_log` | 8 | 8 | ✅ SYNC |

- Último sync commitado: `9453adb2e` (2026-08-07).
- **Observação:** o types.ts contém **460 tabelas na seção `public`** que não
  existem mais no banco (o schema `public` live tem apenas
  `_wal_slot_guard_events`; o app migrou para `zapp`). Seção legada/espelho —
  inofensiva para o build, mas peso morto; regeneração completa (com
  `SCHEMAS=public,zapp,evo`) tende a preservá-la via cauda legada do gerador.

**Regeneração local — IMPOSSÍVEL no momento:**
- O `META_TOKEN` vive **somente** nos GitHub Secrets (`ZAPP_META_TOKEN`,
  usado por `ci.yml`); não existe `.env` local e o valor não deve ser copiado
  para o worktree.
- `scripts/validate-supabase-types.sh` roda em modo degraded sem o token
  (branch "Skipping actual type generation"). **Caveat de ambiente:** em
  shells onde `npx tsc` resolve para TypeScript ≥ 5.9/7.x (ex.: npx baixando
  `tsc` 7.0.2), a validação sintática do fallback falha com `TS5112`
  (tsconfig presente + arquivos na linha de comando). Com o tsc local pinado
  (`node_modules`, typescript ~5.9.3) o comando passa. **Workaround:**
  `node_modules/.bin/tsc` direto, ou `npx --no-install tsc`.

**Como regenerar (instrução):**
1. **Via CI (recomendado):** push na `main` roda o gate de schema em `ci.yml`
   (`check-types-schemas.mjs` com `ZAPP_META_URL`/`ZAPP_META_TOKEN`); em caso
   de drift, o passo `repair-types-schemas.mjs` auto-repara e o PR resultante
   é revisado. Também existe `npm run types:gen` (`validate-supabase-types.sh`).
2. **Manual com token:** obter `ZAPP_META_TOKEN` em Settings → Secrets →
   Actions; `export META_URL=https://supabase.atomicabr.com.br/pg
   META_TOKEN=<token>` e rodar `bun run gen:types:zapp`
   (`node scripts/gen-types-zapp.mjs` — ver `scripts/gen-types-zapp.README.md`).
3. **Pós-regeneração:** `git diff --stat src/integrations/supabase/types.ts`
   deve tocar só o corpo de `Database`; rodar `node scripts/check-tsc-ratchet.mjs`.
4. **Drift de doc:** `scripts/gen-types-zapp.README.md` referencia
   `.github/workflows/gen-types-zapp.yml` (workflow de `workflow_dispatch`)
   que **não existe mais** no repo — o caminho vigente é o gate do `ci.yml`
   + `repair-types-schemas.mjs`. (Correção do README fica para onda futura.)

---

## Resumo das mudanças deste PR

| Arquivo | Mudança | REC |
|---|---|---|
| `README.md` | Seção Deploy corrigida (GH→GHCR→Portainer; nota `vercel.json` legado) | REC-06-07 |
| `docs/DECISION-repo-oc05-legados.md` | Este registro | REC-06-07/06-03/03-13/04-12 |
| `.env.example` (PR separado) | 36 variáveis documentadas | REC-06-05 |

Nenhuma mudança de runtime. Nenhum merge — PRs abertos para revisão.
