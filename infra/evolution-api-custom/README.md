# evolution-api-custom — imagem custom da Evolution API (stack 25)

Pipeline de build da imagem `ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom`
(Evolution API 2.3.7 + hardening + patches de build-time T1–T18), usada pelo
**stack 25 (`evolution`)** em produção (VPS AtomicaBR, Docker Swarm).

## Arquivos

| Arquivo | Papel |
|---|---|
| `Dockerfile` | Build da imagem custom (base Evolution API + hardening B1/B3) |
| `build-patches.mjs` | Patches aplicados no build (CORS server-to-server, etc.) |
| `docker-entrypoint.sh` | Entrypoint custom (init de secrets, config) |
| `t4_prologue.cjs` | Prólogo de patch T4 |
| `docker-compose.yml` | **COMPOSE CANÔNICO do stack 25** — estado auditado 2026-08-08 (etapas 69–73) |

## docker-compose.yml — COMPOSE CANÔNICO (stack 25)

- **Fonte única auditada:** `runbook-evolution-artifacts/compose/docker-compose.evolution.canonical.yml`
  (key v6 `evolution_api_key_v6_20260808` → target `v4_20260704`; `WEBHOOK_EVENTS_ERRORS=false`;
  secrets via `*_FILE`; healthcheck curl; deploy stop-first + rollback; traefik evo-sec/evo-rl/evo-mgr).
- ⚠️ **NÃO APLICAR diretamente em produção** — o stack real vive no Portainer
  (stackId 25, `https://portainer.atomicabr.com.br`). Aplicação/rollback é do maestro.
- ⏳ Pendência documentada: `CORS_ORIGIN=*` mantido até a **etapa 81** (restrição a lista de origens).
- ⚠️ **Drift conhecido (08/08/2026):** o stack file real no Portainer ainda contém o env legado
  (~90 vars, `SENTRY_DSN` plaintext, `wget` healthcheck 30s, memory 3G) — o canônico é o estado
  auditado pretendido. O detector abaixo quantifica esse drift.

## Detector de drift (auditoria mensal)

```bash
# online (exige token do Portainer):
PORTAINER_TOKEN=<jwt> bash runbook-evolution-artifacts/compose/check-compose-drift.sh
# offline (contra snapshot salvo):
CHECK_COMPOSE_RUNTIME_FILE=<snapshot.yml> bash runbook-evolution-artifacts/compose/check-compose-drift.sh
```

Exit codes: `0` = sem drift · `1` = drift detectado · `2` = erro (token/fetch/YAML).
Saída JSON: `runbook-evolution-artifacts/compose/COMPOSE_DRIFT_RESULT.json`.
