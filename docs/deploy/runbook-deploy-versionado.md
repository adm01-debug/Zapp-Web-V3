# 🚀 Runbook — Deploy Versionado (zapp-web-v3, self-hosted)

> **Manutenção:** Hermes AtomicaBR | **Última atualização:** 2026-08-17
> **Repositório:** https://github.com/adm01-debug/zapp-web-v3
> **Escopo:** build reprodutível → imagem GHCR com tag SHA imutável → deploy via Portainer `update_stack` → rollback **sempre com `--image` explícito** (lição 128.3).
> **Referências:** [`docs/PORTAINER_ZAPP_FOOTPRINT.md`](../PORTAINER_ZAPP_FOOTPRINT.md) · [`docs/OPERACAO_BUILD_DEPLOY_V3.md`](../OPERACAO_BUILD_DEPLOY_V3.md) · [`infra/stacks/zapp-web-prod.yml`](../../infra/stacks/zapp-web-prod.yml) · [`.github/workflows/deploy-vps.yml`](../../.github/workflows/deploy-vps.yml) · [`infra/ghcr-protected-tags.txt`](../../infra/ghcr-protected-tags.txt)

---

## 1. Objetivo

Todo deploy de produção do `zapp-web-v3` (Docker Swarm self-hosted, stack `zapp-web-prod` id 157) deve ser:

1. **Reprodutível** — a imagem nasce de um commit específico, com os mesmos build-args de produção;
2. **Identificável** — tag imutável `production-<sha12>` no GHCR, nunca tag móvel no stack;
3. **Aplicado de forma versionada** — via Portainer `update_stack` (API `PUT /api/stacks/157`), com `pullImage: true` e rollout `start-first`;
4. **Reversível** — rollback manual **sempre** com `--image` explícito (`tag@digest`), **nunca** `docker service update --rollback` cego.

Nada de conhecimento tácito, nada de tag móvel no stack, nada de rollback cego.

---

## 2. Modelo de versionamento (tags e digests)

| Artefato | Formato | Papel |
|----------|---------|-------|
| Tag canônica | `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha12>` | Imagem imutável do deploy. `<sha12>` = `GITHUB_SHA::12` do commit em `origin/main` que disparou o build. |
| Tag móvel | `...:production-latest` | **Ponteiro externo apenas** (pushado junto no CI). **NUNCA** referenciada pelo stack (gera dangling images a cada deploy). |
| Digest | `sha256:<64hex>` | Identidade imutável da imagem; base do rollback offline (`tag@digest`). |

- **Cada deploy cria ~3 versões no GHCR**: 1 index OCI tagado (`production-<sha12>`) + manifest `amd64` + `attestation-manifest` (ambos **untagged**, gerados pelo provenance do buildx). A tag é o index; os filhos são parte da mesma versão — nunca tratá-los como versões separadas.
- **Rastreabilidade tag → commit**: a tag é o prefixo do SHA do commit; o build-arg `VITE_GIT_SHA` também grava o SHA completo no bundle (Sentry/production).
- **Ler o estado atual do serviço (Spec e PreviousSpec)**:
  ```bash
  docker service inspect zapp-web-prod_web \
    --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} | {{.PreviousSpec.TaskTemplate.ContainerSpec.Image}}'
  ```
- **Ver digests no host**: `docker image ls --digests ghcr.io/adm01-debug/zapp-web-v3/zapp-web`
- **Conferir tags no GHCR (autoritativo)**: `GET /v2/adm01-debug/zapp-web-v3/zapp-web/tags/list?n=100` (token anônimo `https://ghcr.io/token?scope=repository:adm01-debug/zapp-web-v3/zapp-web:pull`). ⚠️ `docker manifest inspect` sem credenciais dá **falso-missing** — não usar como prova de ausência.

---

## 3. Build reprodutível

### 3.1 Build local (espelho do CI)

```bash
bun install --frozen-lockfile

VITE_SUPABASE_URL=https://supabase.atomicabr.com.br \
VITE_SUPABASE_ANON_KEY=<anon key> \
NODE_OPTIONS=--max-old-space-size=6144 \
npm run build
```

- `bun.lock` é a fonte de verdade (nunca `package-lock.json`); o hook `prebuild` roda `bun run scripts/generate-component-registry.ts`.
- **RAM ≥ 8 GB** (heap ≥ 6144) — o rollup estoura com `Killed` (OOM) abaixo disso.
- Saída esperada: `dist/` (~17 MB), `✓ built in ~1m`, assets com `.br`/`.gz`.

### 3.2 Dockerfile (multi-stage, determinístico)

- `oven/bun:1.3-alpine` (deps + builder) → `nginx:1.31-alpine` (runtime) — **build direto `bunx vite build`** (component-registry já versionado; determinístico em CI/Docker).
- Build-args de produção (obrigatórios, senão o bundle não é o de produção):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`, `VITE_GIT_SHA`, `VITE_SENTRY_ENVIRONMENT=production`, `VITE_APP_ENV=production`.
- Config nginx **versionada** em `nginx-prod.conf` (raiz do repo) — nunca editar só no volume.

### 3.3 CI (`.github/workflows/deploy-vps.yml` — job `build-and-push`)

- Runner **self-hosted** `[Linux, X64, vps-zapp]` (hosted runner sem alocação na conta).
- `setup-buildx` com **builder nomeado `atomica-zapp`** + **buildkit pinado `moby/buildkit:v0.20.2`** (fix 2026-08-15: tag móvel `buildx-stable-1` = v0.31.2 quebra neste kernel; sem nome fixo, builders órfãos acumulam).
- Preflight de secrets: `node scripts/check-deploy-secrets.mjs` com `ENFORCE_DEPLOY_SECRETS=1`.
- Tag: `TAG="production-${GITHUB_SHA::12}"` (override via `workflow_dispatch.inputs.image_tag`).
- Push: tag SHA + `production-latest`.

> ⚠️ **Nunca** rebuildar manualmente fora do CI sem os ARG `VITE_*` de produção — o bundle resultante não é o versionado (Sentry env, API keys), e "deploy" de imagem feita à mão quebra a rastreabilidade.

---

## 4. Publicação no GHCR + retenção

- **Retenção automática** (mesmo job do build, `continue-on-error: true`): `actions/delete-package-versions@v5` com:
  - `package-name: zapp-web-v3/zapp-web`, `package-type: container`
  - `min-versions-to-keep: 30` — **sempre múltiplo de 3** (3 versões/deploy = index + amd64 + attestation; 9 = 3 deploys íntegros; corte não-múltiplo deixa index mantido com filho deletado → `manifest unknown` no pull).
  - `ignore-versions` lido de **`infra/ghcr-protected-tags.txt`** (uma SHA 12-hex lowercase por linha → regex `^production-(...)$`; fallback hardcoded se vazio). Protege o index tagado **e** seus filhos.
- **🔴 NUNCA `delete-only-untagged-versions: true`** — apagaria os manifests-filho (amd64/attestation) e o `pull` da tag falharia com `manifest unknown` (P0 confirmado 2026-08-05 via OCI index).
- Falha de retenção **nunca bloqueia deploy**: alerta via webhook n8n ou comentário no commit, com sentinel greppável `GHCR_RETENTION_FAILED`.
- Deleção é assíncrona (até ~24h) — tags continuam resolvendo após DELETE 204; "total > 9/30" durante convergência é esperado, não drift.

---

## 5. Deploy via Portainer (`update_stack`)

**Gatilho:** push em `main` (ou `workflow_dispatch` com `image_tag`). **Serialização:** concurrency group `deploy-vps-v3`, `cancel-in-progress: false` — **nunca 2 deploys simultâneos**. ⚠️ Não reusar o group antigo `deploy-vps-v2` (ficou travado em `pending` sem jobs — bug do GitHub; grupo novo preserva serialização sem herdar o lock corrompido).

### 5.1 O que o CI faz (job `deploy` — canônico)

1. Valida secrets `PORTAINER_API_TOKEN` e `PORTAINER_URL`.
2. Monta o compose **inline** (versão 3.8) com `image: <ZAPP_IMAGE_PLACEHOLDER>` substituído via `sed` pela tag SHA real:
   - Redes externas `AtomicaBRNet` **+ `zapp-net`**; labels Traefik de `zapp.atomicabr.com.br` **e** `zappweb.app.br` (router secundário vive no compose para sobreviver a redeploys); `crowdsec-bouncer`; `com.centurylinklabs.watchtower.enable=false`; `com.atomicabr.tier=critical`.
   - `update_config`: `failure_action: rollback` · `monitor: 60s` · `order: start-first` (zero downtime).
   - `rollback_config`: `order: start-first` · `monitor: 60s` · `failure_action: continue`.
   - `resources`: 256M / 0.5 CPU; healthcheck `wget http://127.0.0.1/healthz` (30s/5s/3/30s).
3. Chama o `update_stack` via API:
   ```bash
   STACK_CONTENT=$(cat /tmp/compose.yml | jq -Rs .)
   PAYLOAD='{"pullImage":true,"prune":false,"stackFileContent":'"$STACK_CONTENT"'}'
   HTTP=$(curl -s -o /tmp/pr.json -w "%{http_code}" \
     -X PUT "${PORTAINER_URL}/api/stacks/157?endpointId=1" \
     -H "X-API-Key: ${PORTAINER_API_TOKEN}" \
     -H "Content-Type: application/json" -d "${PAYLOAD}")
   [ "${HTTP}" = "200" ] || { echo "::error::Deploy failed HTTP ${HTTP}"; exit 1; }
   ```
   - `pullImage: true` → o nó puxa a tag SHA nova; `prune: false` → nunca remove nada junto do deploy.
4. Aguarda **45s** (start_period 30s + margem) e faz HC best-effort em `https://zapp.atomicabr.com.br/auth` (200/301/302 = OK; falha vira `::warning::POST_DEPLOY_HC=...`, **não** exit 1 — o Swarm monitora a task internamente).
5. `docker image prune -f` pós-deploy (**sem `-a`**) — só dangling.

> **Equivalente manual (emergência, bypass do CI):**
> ```bash
> ZAPP_IMAGE=ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha12> \
>   docker stack deploy --compose-file infra/stacks/zapp-web-prod.yml zapp-web-prod
> ```
> Ou via UI Portainer → Stacks → `zapp-web-prod` → Editor (colar o stack file com a tag SHA). Em qualquer via: **tag SHA imutável, nunca `production-latest`**.

### 5.2 Semântica do rollback automático (não confundir com rollback manual)

- `failure_action: rollback` dispara em **falha de TASK** (pull error, crash, exit) **dentro da janela do `monitor: 60s`** — o updater do Swarm **nunca consulta health status** (swarmkit `updater.go`).
- App que sobe mas fica unhealthy **NÃO** dispara rollback automático (start_period 30s + 30s×3 ≈ 120s > janela de 60s) — quem cobre saúde pós-start é o **`zapp-health-guard`** (stack 165).
- Falha **durante** o rollback → estado `paused` (o Swarm nunca re-rola um rollback). Recuperação = novo `service update` manual (reseta o `UpdateStatus`).

---

## 6. Rollback — SEMPRE com `--image` explícito (lição 128.3)

### 🔴 A lição (incidente realtime 128.3, 17/08/2026)

> **NUNCA** `docker service update --rollback` **sem `--image` explícito** após um rollback automático: o `PreviousSpec` do Swarm aponta para a spec **QUE FALHOU** — o comando cego **reaplica a versão quebrada**.

O `--rollback` cego restaura o `PreviousSpec`, e depois de um rollback automático (ou de updates sucessivos) o `PreviousSpec` **é a spec ruim**. Rollback manual é **sempre** um update com imagem explícita.

### 6.1 Procedimento (validado — `docs/PORTAINER_ZAPP_FOOTPRINT.md` §4)

```bash
SVC=zapp-web-prod_web
IMG=ghcr.io/adm01-debug/zapp-web-v3/zapp-web

# PRÉ-REQUISITO (preventivo, após todo deploy OK): imagem de rollback disponível localmente
docker pull ${IMG}:production-<sha-anterior>
docker images --digests ${IMG} | grep production-<sha-anterior>

# PASSO 0 — SALVAR a ref ATUAL ANTES de rolar (o ATUAL costuma estar <none> local,
# puxado por digest — não é encontrável por tag no awk)
REF_ATUAL=$(docker service inspect ${SVC} --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
echo "$REF_ATUAL" > /tmp/ref_atual.txt
echo "Ref atual salva: $REF_ATUAL"

# 1. ROLLBACK com ref canônica tag@digest — funciona até com GHCR fora do ar
#    (moby#34153: manager não resolve com digest; worker satisfaz com imagem local)
DIGEST=$(docker images --digests --no-trunc --format '{{.Repository}}:{{.Tag}} {{.Digest}}' \
  | awk -F' ' '$1 ~ /:production-<sha-anterior>$/ {print $2; exit}')
timeout 600s docker service update --detach=false \
  --image "${IMG}:production-<sha-anterior>@${DIGEST}" ${SVC}

# 2. VALIDAR — gate REAL = UpdateStatus + digest do container
#    (healthz 200 pode vir da task ANTIGA com start-first — falso positivo)
docker service ps ${SVC} --no-trunc
docker service inspect ${SVC} --format '{{.UpdateStatus.State}} — {{.UpdateStatus.Message}}'
docker ps --filter name=${SVC} --format '{{.Image}}'
for i in $(seq 1 6); do CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://zapp.atomicabr.com.br/auth); [ "$CODE" = "200" ] && break; sleep 10; done
[ "$CODE" = "200" ] || { echo "auth FALHOU: $CODE"; exit 1; }

# 3. VOLTAR para a atual — ref salva no PASSO 0 (NUNCA derivar do container pós-rollback)
timeout 600s docker service update --detach=false --image "$(cat /tmp/ref_atual.txt)" ${SVC}
```

### 6.2 Garantias de que a imagem de rollback existe

| Camada | Mecanismo |
|--------|-----------|
| **Host** | Housekeeping v2.4 (`docs/infra/docker-housekeeping-v2.4.yml`): `ensure_ref_tags` re-taga Spec+PreviousSpec de **todos** os serviços **antes de qualquer prune** (rollback automático nunca perde a imagem local); `prune_zapp_old` mantém `ZAPP_KEEP_TAGS=6` mais recentes + Spec/PreviousSpec/latest. |
| **GHCR** | Retenção mantém ≥ 3 deploys íntegros; tags de rollback protegidas via `infra/ghcr-protected-tags.txt` (`ignore-versions`). |
| **Operacional** | Pré-pull da tag anterior após cada deploy (passo preventivo acima). |

---

## 7. Validação pós-deploy

- **Job `post-deploy-health`** (roda `if: always()` após o deploy — não depende de webhook):
  1. TTM `https://www.zappweb.app.br/` **< 3.0s** (000/timeout = falha);
  2. PostgREST `https://supabase.atomicabr.com.br/rest/v1/` — 4xx ok; **5xx/000 = falha**;
  3. Edge function `evolution-api/get-media-base64` — 4xx ok; **5xx/000 = falha**.
- **Smoke manual:**
  ```bash
  curl -s https://zapp.atomicabr.com.br/health
  curl -s -o /dev/null -w '%{http_code}' https://zapp.atomicabr.com.br/auth
  docker service ps zapp-web-prod_web --no-trunc
  ```
- **Gate real pós-update (rollback):** `UpdateStatus.State` ∈ {`completed`, `rollback_completed`} **+** digest do container novo.

---

## 8. Proibições (não negociáveis)

| # | Proibição | Por quê |
|---|-----------|---------|
| 1 | `docker service update --rollback` **sem `--image` explícito** | Lição 128.3 — `PreviousSpec` aponta para a spec **que falhou**; o comando cego reaplica a versão quebrada. |
| 2 | Tag móvel (`production-latest`) no stack/compose | Deploy não rastreável + dangling images (~3.5 GB/dia no cenário antigo). Tag no stack é **sempre** `production-<sha12>`. |
| 3 | `delete-only-untagged-versions: true` na retenção GHCR | Apaga manifests-filho (amd64/attestation) → `pull` da tag falha com `manifest unknown` (P0 2026-08-05). |
| 4 | `docker image prune -a` / `-af` no host | Apaga imagens **tagadas** de rollback (root cause do incidente 2026-08-05). Só `prune -f` (dangling). |
| 5 | Deploy/update com o serviço em **0 réplicas** | Sem tasks, o rollback automático não dispara — falha vira indisponibilidade total. Escalar para ≥1 antes. |
| 6 | Editar a config nginx só no volume | A conf versionada é `nginx-prod.conf`; recriar a workspace com conf só-no-volume derruba o nginx na página default. |
| 7 | Rebuild manual fora do CI sem os ARG `VITE_*` de produção | Bundle não-versionado (Sentry env, API keys) quebra rastreabilidade/reprodutibilidade. |
| 8 | Dois deploys em paralelo / reusar o concurrency group `deploy-vps-v2` | Corrida de deploy; o grupo v2 ficou travado em `pending` (bug GitHub) — usar `deploy-vps-v3`. |
| 9 | Apagar manualmente imagem do zapp-web no host sem confirmar que não é a de rollback | Quebra o rollback offline. |
| 10 | `docker stack deploy` com compose desatualizado (sem router `zappweb.app.br`, sem rede `zapp-net`) | Redeploy destrói labels/redes não presentes no compose — usar `infra/stacks/zapp-web-prod.yml` ou o compose inline do CI. |
| 11 | Confiar em `manifest inspect` sem credenciais para concluir "tag sumiu do GHCR" | Falso-missing para tudo; autoritativo é `GET /v2/.../tags/list` + `GET /v2/.../manifests/<tag>` com token. |
| 12 | IPs reais do dono/VPS em docs vivos | Sanitização de repo: usar placeholders (`<IP-VPS>`/`<IP-ESCRITORIO>`). |

---

## 9. Checklist rápido de deploy

1. [ ] Merge em `main` (ou `workflow_dispatch` com `image_tag`) — workflow `deploy-vps.yml` inicia.
2. [ ] Acompanhar a run (group `deploy-vps-v3`): `build-and-push` → `deploy` → `post-deploy-health`.
3. [ ] Confirmar `HTTP 200` no `update_stack` e a tag `production-<sha12>` presente no GHCR (`tags/list`).
4. [ ] Smoke: `/health`, `/auth` 200, TTM `www.zappweb.app.br` < 3.0s.
5. [ ] (Opcional) Blindar rollback histórico: adicionar a SHA anterior em `infra/ghcr-protected-tags.txt` via `scripts/update-rollback-protection.sh <sha12>`.
6. [ ] Rollback, se necessário: pré-pull da tag anterior + `docker service update --image <tag@digest>` — **nunca** `--rollback` cego.

---

_Última atualização: 2026-08-17 — criado a partir do fluxo real do `deploy-vps.yml`, `infra/stacks/zapp-web-prod.yml`, `docs/PORTAINER_ZAPP_FOOTPRINT.md` e da lição 128.3 (AGENTS.md)._
