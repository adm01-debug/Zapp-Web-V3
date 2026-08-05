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
| Imagens locais | `production-<CURRENT>` (em uso) + `production-<PREV>` (rollback) + `production-latest` | 3 imagens (ver §2) | ✅ |
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

**Estado verificado em 2026-08-05 (após faxina):**
- `production-20023785ecfe` — atual (deploy PR #859)
- `production-988086a2bbbd` — rollback primário (pré-pullada no host, tagada)
- `production-fbd04bec303d` — rollback secundário (pré-pullada no host, tagada)
- `production-latest` — ponteiro

## 3. Runbook de Rollback (etapa 29)

```bash
# Pré-requisito: imagem de rollback JÁ pré-pullada no host (feito na faxina).
# Se não estiver: docker pull ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>

# 1. Flippar o serviço para a imagem anterior (via disk-actioner ou SSH no nó)
docker service update --image ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior> zapp-web-prod_web

# 2. Validar
docker service ps zapp-web-prod_web --no-trunc
curl -s -o /dev/null -w '%{http_code}' https://zapp.atomicabr.com.br/healthz   # esperado 200

# 3. Voltar para a atual (quando a causa for corrigida)
docker service update --image ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-atual> zapp-web-prod_web
```

> O `update_config.failure_action: rollback` do stack já faz rollback automático se o healthcheck falhar no monitor de 60s.

## 4. Guardrails anti-recorrência (etapas 46–47)

1. **`docker-housekeeping` v2.2** (`docs/infra/docker-housekeeping-v2.2.yml`, stack Portainer 199):
   - **NUNCA** `docker image prune -a` / `-af` (v2.1 usava `-af --filter until=168h` e apagou a imagem de rollback do zapp-web).
   - Prune de tagged = loop `docker rmi` por imagem, protegendo: (a) imagens em uso por containers; (b) **TODAS** as imagens do repo `ghcr.io/adm01-debug/zapp-web-v3/zapp-web`.
2. **Deploy (CI `deploy-vps.yml`):**
   - Usa tag SHA imutável `production-<sha>` (nunca `production-latest` no stack) — zero dangling por deploy.
   - `pullImage: true` no update do stack — rollout `start-first` sem downtime.
   - **Retenção GHCR automática** (etapa 34): `actions/delete-package-versions` com `min-versions-to-keep: 8` — mantém current + rollback + 5 anteriores + latest.
3. **Nunca** apagar manualmente imagem do zapp-web no host sem confirmar que não é a de rollback.

## 5. Registry GHCR — política de retenção (etapa 31)

- Manter: **últimas 8 versões** (cobre: atual + rollback + 5 anteriores + produção-latest) + qualquer versão com tag `staging-*`.
- Remover: o restante (na faxina de 2026-08-05: 546 → 8 versões; lista exata em `ghcr-delete-list.txt`).
- Execução inicial manual exige token com escopo `write:packages`; a partir do próximo deploy, a retenção é automática.

## 6. Órfãos removidos na faxina (etapa 44–45)

- **Configs (27):** `evolution_consumer_v1..v6/v5_1/v5_2` (7), `openclaw_boot_v6..v17/v10b` (13), `openclaw_guard_v4` (1), `watchdog_script_v1..v5` + `watchdog_v12_script` (6). (Verificação: nenhum serviço nem stack file referenciava; `docker config rm` recusa os em uso.)
- **Secrets (3):** `gh_runner_pat_v1`, `portainer_agent_secret_v1`, `portainer_readonly_password_v1` (nenhum serviço/stack referenciando).
- **Volume anônimo vazio** (`61003dad…`, 0B).

## 7. Recuperação de disco (etapa 40, medido em 2026-08-05)

| Fonte | Recuperado |
|-------|------------|
| Containers parados (prune) | ~1,13 GB |
| Imagens dangling (prune sem `-a`) | ~54 MB |
| **Total** | **~1,19 GB** |

Volumes (66,5 GB): 0 recuperável — **nunca tocar** (37/38 em uso; `runner-work` = cache do runner, 1,1 GB, é volume NOMEADO do serviço — não remover).
