# PORTAINER — Footprint Canônico do `zapp-web` + Runbook de Rollback

> **Fonte:** Plano de 50 etapas "Faxina Portainer/Zapp Web" (Revisão 2, 2026-08-05) — etapas 29, 46, 47 e 48.
> **Host:** Docker Engine 28.1.1 · Swarm 1 nó (`AtomicaBR`, Leader) · Portainer CE 2.39.5 · rede `AtomicaBRNet`

---

## 1. O que DEVE existir (estado canônico)

| Tipo | Artefato | Evidência esperada | Status |
|------|----------|--------------------|--------|
| Stack | `zapp-web-prod` (id 157) | único stack do app | ✅ |
| Stack | `zapp-health-guard` (165) | guard de saúde | ✅ |
| Stack | `schema-drift-guard` (164) | guard de schema | ✅ |
| Serviço | `zapp-web-prod_web` | 1 réplica, healthy | ✅ |
| Containers | `zapp-web-prod_web.1.*` | running/healthy | ✅ |
| Imagens locais | `production-<CURRENT>` (em uso) + `production-<PREV>` (rollback) + `production-latest` | 3–4 imagens TAGADAS (ver §2); resíduos untagged de deploys concorrentes são transitórios e limpos pelo prune_dangling | ✅ |
| Volumes | **NENHUM** `zapp*` | stateless | ✅ |
| Redes | `AtomicaBRNet` (compartilhada) | **NUNCA tocar** | ✅ |
| Configs | **NENHUM** `zapp*` | 0 | ✅ |
| Secrets | **NENHUM** `zapp*` | 0 | ✅ |

## 2. Keep-set de imagens (host + GHCR)

```
ATUAL   : ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-atual>     (em uso pelo serviço)
ROLLBACK: ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>  (pré-pullada no host)
TAG     : ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-latest          (ponteiro móvel)
```

**Estado verificado em 2026-08-05 (após faxina) com sha256 digests:**

| Tag | Papel | sha256 digest |
|-----|-------|---------------|
| `production-20023785ecfe` | atual (PR #859) | `sha256:c8a722e9124e305287eec51c7839d99679a1ab2fbe0bfd6b33f8e7b28c107626` |
| `production-988086a2bbbd` | rollback primário (pré-pullada) | `sha256:67e97210f5b1402f705a26f78b7f9274f02a51186b8e5bd7aa2e584fcb06f108` |
| `production-fbd04bec303d` | rollback secundário (pré-pullada) | verificar com `docker image inspect --format '{{index .RepoDigests 0}}'` |
| `production-latest` | ponteiro móvel | aponta para atual |

> Para fixar rollback por digest (100% imutável): `docker service update --image ghcr.io/.../zapp-web@sha256:<digest> zapp-web-prod_web`
> Para inspecionar digests atuais no host: `docker image ls --digests ghcr.io/adm01-debug/zapp-web-v3/zapp-web`

**Exemplo pontual (2026-08-05 pós-faxina) — NÃO vinculante:** o ATUAL muda a cada merge em `origin/main` (deploys concorrentes avançaram 4 SHAs em horas). **Regra canônica:** ATUAL = SHA de origin/main; keep-set = imagens TAGADAS (nunca apagar); untagged antigas = resíduo de deploy → prune_dangling (o housekeeping v2.3 re-taga Spec+PreviousSpec antes de podar).
- `production-<sha-atual>` — atual (frequentemente presente como `<none>` em uso, sem tag local — normal; imune ao prune por estar em uso)
- `production-94c2ca5d3c02` — PREV (PreviousSpec; o v2.3 `ensure_ref_tags` o re-taga a cada ciclo — rollback automático OFFLINE)
- `production-988086a2bbbd` — rollback primário (tagada, protegida)
- `production-fbd04bec303d` — rollback secundário (tagada, protegida)
- `production-latest` — ponteiro (pode estar stale no host; GHCR é a fonte da tag)

## 3. Arquivo de Stack Canônico

Stack file standalone: `infra/stacks/zapp-web-prod.yml`

Para deploy manual (bypass do CI):
```bash
ZAPP_IMAGE=ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha> \
  docker stack deploy --compose-file infra/stacks/zapp-web-prod.yml zapp-web-prod
```

## 4. Runbook de Rollback (etapa 29 — validado em 2026-08-05)

```bash
# Pré-requisito: imagem de rollback JÁ pré-pullada no host (feito na faxina).
# Se não estiver: docker pull ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>

# 1. Flippar com REF CANÔNICA (tag@digest) — funciona até com GHCR fora do ar,
#    pois o worker satisfaz o pull por digest com a imagem local (moby#34153:
#    ref tag-only + ImagePullPolicy always forçaria pull de rede).
DIGEST=$(docker images --digests --no-trunc --format '{{.Repository}}:{{.Tag}} {{.Digest}}' | awk '/production-<sha-anterior>/ {print $2; exit}')
docker service update --detach=false \
  --image "ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>@${DIGEST}" zapp-web-prod_web

# 2. Validar (task com a imagem alvo Running + UpdateStatus completed + healthz com retry)
docker service ps zapp-web-prod_web --no-trunc
docker service inspect zapp-web-prod_web --format '{{.UpdateStatus.State}} — {{.UpdateStatus.Message}}'
for i in $(seq 1 6); do CODE=$(curl -s -o /dev/null -w '%{http_code}' https://zapp.atomicabr.com.br/healthz); [ "$CODE" = "200" ] && break; sleep 10; done; echo "healthz: $CODE"

# 3. Voltar para a atual (quando a causa for corrigida) — mesma ref canônica
docker service update --detach=false \
  --image "ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-atual>@sha256:<digest-atual>" zapp-web-prod_web
```

> **Rollback automático:** o `failure_action: rollback` cobre falha de pull e crash/healthcheck reprovado **dentro da janela do `monitor: 60s`**. Ponto operacional real: `start_period: 30s` + `interval: 30s` × `retries: 3` só condena a task unhealthy em ~120s — **depois** da janela de 60s — então um app que sobe mas fica unhealthy NÃO dispara o rollback automático; quem cobre saúde pós-start é o `zapp-health-guard` (stack 165). O `rollback_config` é `start-first` + `monitor: 60s` — sem janela de downtime no próprio rollback.
> **Nota OFFLINE:** só as imagens TAGADAS pré-pulladas (`production-988086a2bbbd` / `production-fbd04bec303d`) garantem rollback offline. O housekeeping v2.3 (`ensure_ref_tags`) re-taga Spec+PreviousSpec a cada ciclo, mantendo o PreviousSpec local. Com `pullImage: true` no stack, a policy default é `always` — com ref tag-only o update força pull; com ref `tag@digest` usa a imagem local.
> **NUNCA** fazer update com o serviço em **0 réplicas** — sem tasks o rollback automático não dispara; se estiver em 0, escale para 1 antes.

## 5. Guardrails anti-recorrência (etapas 46–47)

1. **`docker-housekeeping` v2.3** (`docs/infra/docker-housekeeping-v2.3.yml`, stack Portainer 199):
   - **NUNCA** `docker image prune -a` / `-af` (v2.1 usava `-af --filter until=168h` e apagou a imagem de rollback do zapp-web).
   - Prune de tagged = loop `docker rmi` por imagem, protegendo: (a) imagens em uso por containers; (b) **TODAS** as imagens do repo `ghcr.io/adm01-debug/zapp-web-v3/zapp-web` (env `PROTECTED_REPOS_REGEX`; regex vazia = protege tudo; zero-match = protege tudo + alerta).
   - **`ensure_ref_tags`** (v2.3): antes de cada prune, re-taga Spec+PreviousSpec de TODOS os serviços swarm — o rollback automático nunca perde a imagem local para o prune_dangling.
   - Imagens multi-tag são removidas por TAG (não por ID) — sem ruído 'retida' eterno.
2. **Deploy (CI `deploy-vps.yml`):**
   - Usa tag SHA imutável `production-<sha>` (nunca `production-latest` no stack) — zero dangling por deploy.
   - `pullImage: true` no update do stack — rollout `start-first` sem downtime.
   - **Retenção GHCR automática** (etapa 34): `actions/delete-package-versions` com `min-versions-to-keep: 8` — **8 versões ≈ 2,6 deploys de histórico** (cada deploy cria ~3 versões: index + manifest amd64 + attestation, estes untagged); o rollback (penúltimo deploy) ocupa as posições 4–6 das 8 mantidas. ⚠️ **NÃO usar `delete-only-untagged-versions`** — apagaria os manifests-filho e o `pull` da tag falharia com `manifest unknown` (P0 confirmado 2026-08-05). Alerta se a retenção falhar (não bloqueia deploy).
3. **Nunca** apagar manualmente imagem do zapp-web no host sem confirmar que não é a de rollback.

## 6. Registry GHCR — política de retenção (etapa 31)

- Manter: **últimas 8 versões** (≈ 2,6 deploys: current + rollback + margem apertada — 8 é o mínimo, não folga larga). ⚠️ **NÃO deletar versões untagged isoladamente** (`delete-only-untagged-versions`): as untagged são manifests-filho (amd64/attestation) do index tagado — apagá-las quebra o `pull` da tag com `manifest unknown`.
- Remover: o restante (na faxina de 2026-08-05: 546 versões inventariadas; lista exata em `ghcr-delete-list.txt`).
- Execução inicial manual exige token com escopo `write:packages`; a partir do próximo deploy, a retenção é automática.
- **Nota (deleção assíncrona):** `delete-package-versions` apaga até 100 versões/run (teto interno da action); a contagem cai em degraus (546 → 517 → 452) e a propagação do GHCR leva até 24h. Durante a convergência o total é MAIOR que 8 — estado intermediário esperado, não drift.

## 7. Órfãos removidos na faxina (etapa 44–45)

- **Configs (27):** `evolution_consumer_v1..v6/v5_1/v5_2` (8 nomes: v1, v2, v3, v4, v5, v5_1, v5_2, v6 — 7 removidos de fato, `v5_2` era o em uso), `openclaw_boot_v6..v17/v10b` (13), `openclaw_guard_v4` (1), `watchdog_script_v1..v5` + `watchdog_v12_script` (6). Total 27 provado por 37→10. (Verificação: nenhum serviço nem stack file referenciava; `docker config rm` recusa os em uso.)
- **Secrets (3):** `gh_runner_pat_v1`, `portainer_agent_secret_v1`, `portainer_readonly_password_v1` (nenhum serviço/stack referenciando).
- **Volume anônimo vazio** (`61003dad…`, 0B).

## 8. Recuperação de disco (etapa 40, medido em 2026-08-05)

| Fonte | Recuperado |
|-------|------------|
| Containers parados (prune) | ~1,13 GB |
| Imagens dangling (prune sem `-a`) | ~54 MB |
| **Total** | **~1,19 GB** |

Volumes (66,5 GB): 0 recuperável **com segurança** — **nunca tocar** (`runner-work` ~1,1 GB é o único reclaimable nomeado e é volume do serviço github-actions-runner — não remover; contagens totais variam ±1 conforme o momento da coleta).
