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

**Digests de referência (2026-08-05, verificados no host — ATUAL = SHA de origin/main, muda a cada merge):**

| Tag | Papel | sha256 digest |
|-----|-------|---------------|
| `production-<sha-atual>` | atual em uso (ex.: `58fb15fe5f77`) | puxada por digest — ver `docker service inspect zapp-web-prod_web --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` |
| `production-988086a2bbbd` | rollback histórico (tagada) | `sha256:c8a722e9124e305287eec51c7839d99679a1ab2fbe0bfd6b33f8e7b28c107626` |
| `production-fbd04bec303d` | rollback histórico (tagada) | `sha256:67e97210f5b1402f705a26f78b7f9274f02a51186b8e5bd7aa2e584fcb06f108` |
| `production-latest` | ponteiro móvel | aponta para o build mais recente no GHCR |

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

## 4. Runbook de Rollback (etapa 29 — validado em 2026-08-05, 2 rodadas de validação)

```bash
# PRÉ-REQUISITO — garantir imagem de rollback disponível localmente (antes de qualquer incidente).
# Execute este passo PREVENTIVAMENTE após cada deploy bem-sucedido:
docker pull ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>
# Verificar que a imagem está local com digest:
docker images --digests ghcr.io/adm01-debug/zapp-web-v3/zapp-web | grep production-<sha-anterior>

# PASSO 0 — SALVAR a ref canônica ATUAL ANTES de rolar (o ATUAL costuma estar
# <none> local — puxado por digest — e NÃO é encontrável por tag no awk).
REF_ATUAL=$(docker service inspect zapp-web-prod_web --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
case "$REF_ATUAL" in *@*) ;; *)   # spec sem digest (deploy tag-only) → deriva do container
  D=$(docker image inspect "$(docker inspect "$(docker ps -q --filter name=zapp-web-prod_web)" --format '{{.Image}}')" \
     --format '{{index .RepoDigests 0}}' | sed 's/.*@//')
  REF_ATUAL="ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-atual>@$D" ;;
esac
echo "$REF_ATUAL" > /tmp/ref_atual.txt
echo "Ref atual salva: $REF_ATUAL"

# 1. Flippar com REF CANÔNICA (tag@digest) — funciona até com GHCR fora do ar
#    (moby#34153: manager não resolve com digest; worker satisfaz com imagem
#    local — adapter skip pull + fallback imageExists).
DIGEST=$(docker images --digests --no-trunc --format '{{.Repository}}:{{.Tag}} {{.Digest}}' | awk -F' ' '$1 ~ /:production-<sha-anterior>$/ {print $2; exit}')
timeout 600s docker service update --detach=false \
  --image "ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>@${DIGEST}" zapp-web-prod_web

# 2. Validar — gate REAL = UpdateStatus completed/rollback_completed + digest do
#    container (o healthz 200 pode vir da task ANTIGA com start-first):
docker service ps zapp-web-prod_web --no-trunc
docker service inspect zapp-web-prod_web --format '{{.UpdateStatus.State}} — {{.UpdateStatus.Message}}'
docker ps --filter name=zapp-web-prod_web --format '{{.Image}}'
for i in $(seq 1 6); do CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://zapp.atomicabr.com.br/healthz); [ "$CODE" = "200" ] && break; sleep 10; done
[ "$CODE" = "200" ] || { echo "healthz FALHOU: $CODE"; exit 1; }
echo "healthz: $CODE"

# 3. Voltar para a atual — ref salva no passo 0 (fallback: PreviousSpec do spec,
#    que é o ATUAL anterior ao rollback — NUNCA derivar do container pós-rollback)
timeout 600s docker service update --detach=false --image "$(cat /tmp/ref_atual.txt)" zapp-web-prod_web
```

> **Rollback automático:** o `failure_action: rollback` dispara em **falha de TASK** (pull error, crash, exit) **dentro da janela do `monitor: 60s`** — o updater do Swarm **nunca consulta o health status** (validado no swarmkit `updater.go`). Como `start_period: 30s` + `interval: 30s` × `retries: 3` condena uma task unhealthy só em ~120s (depois da janela), um app que sobe mas fica unhealthy NÃO dispara rollback automático — quem cobre saúde pós-start é o `zapp-health-guard` (stack 165). `rollback_config` = `start-first` + `monitor: 60s` — zero downtime no próprio rollback. Falha DURANTE o rollback → `paused` (nunca re-rola) — o runbook manual é a recuperação (novo update reseta o UpdateStatus).
> **Nota OFFLINE:** imagens TAGADAS pré-pulladas garantem rollback offline (a retenção host v2.4 mantém as `ZAPP_KEEP_TAGS=6` mais recentes + Spec/PreviousSpec/latest). O GHCR retém ~3 deploys (min-versions-to-keep: 9) — 1 deploy atrás com folga. Offline + imagem local perdida = irrecuperável (risco residual aceito; 3 camadas mitigam: ensure_ref_tags + proteção de prune + pré-pull).
> **NUNCA** fazer update com o serviço em **0 réplicas** — sem tasks o rollback automático não dispara; se estiver em 0, escale para 1 antes.

## 5. Guardrails anti-recorrência (etapas 46–47)

1. **`docker-housekeeping` v2.4** (`docs/infra/docker-housekeeping-v2.4.yml`, stack Portainer 199):
   - **NUNCA** `docker image prune -a` / `-af` (v2.1 usava `-af --filter until=168h` e apagou a imagem de rollback do zapp-web).
   - Prune de tagged = loop `docker rmi` por imagem, protegendo: (a) imagens em uso por containers; (b) **TODAS** as imagens do repo `ghcr.io/adm01-debug/zapp-web-v3/zapp-web` (env `PROTECTED_REPOS_REGEX`; regex vazia = protege tudo; zero-match = protege tudo + alerta).
   - **`ensure_ref_tags`**: antes de cada prune, re-taga Spec+PreviousSpec de TODOS os serviços swarm (com `timeout 300` + contadores + alerta se falhar) — o rollback automático nunca perde a imagem local para o prune_dangling.
   - **`prune_zapp_old`** (v2.4, ETAPA 47): retenção HOST — mantém `ZAPP_KEEP_TAGS=6` imagens zapp mais recentes (+ Spec/PreviousSpec/latest) e poda as antigas por TAG. Impede crescimento ilimitado (~116MB/deploy).
   - Imagens multi-tag são removidas por TAG (não por ID) — sem ruído 'retida' eterno.
2. **Deploy (CI `deploy-vps.yml`):**
   - Usa tag SHA imutável `production-<sha>` (nunca `production-latest` no stack) — zero dangling por deploy.
   - `pullImage: true` no update do stack — rollout `start-first` sem downtime.
   - **Retenção GHCR automática** (etapa 34): `actions/delete-package-versions` com `min-versions-to-keep: 9` — **9 versões = 3 deploys ÍNTEGROS** (múltiplo de 3; cada deploy cria index + amd64 + attestation; 8 cortava o 3º deploy no meio → `manifest unknown`). O rollback (penúltimo deploy) ocupa as posições 4–6. ⚠️ **NÃO usar `delete-only-untagged-versions`** — apagaria os manifests-filho e o `pull` da tag falharia (P0 confirmado 2026-08-05). Alerta com fallback (webhook n8n ou comentário no commit) se a retenção falhar — não bloqueia deploy.
3. **Nunca** apagar manualmente imagem do zapp-web no host sem confirmar que não é a de rollback.

## 6. Registry GHCR — política de retenção (etapa 31)

- Manter: **últimas 9 versões** (= 3 deploys íntegros — múltiplo de 3; cortar em 8 deixaria o 3º deploy com index mantido + filho deletado → `manifest unknown`). ⚠️ **NÃO deletar versões untagged isoladamente** (`delete-only-untagged-versions`): as untagged são manifests-filho (amd64/attestation) do index tagado.
- Remover: o restante (na faxina de 2026-08-05: 546 versões inventariadas; lista exata em `ghcr-delete-list.txt`).
- Execução inicial manual exige token com escopo `write:packages`; a partir do próximo deploy, a retenção é automática.
- **Nota (deleção assíncrona):** `delete-package-versions` apaga até 100 versões/run (teto interno da action); convergência medida: 546 → 517 → 452 → 388 (medidos) → … → 9 (projetado, ~11–12 runs; cada deploy adiciona 3 versões). A propagação do GHCR leva até 24h — total MAIOR que 9 durante a convergência é estado intermediário esperado, não drift.

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
