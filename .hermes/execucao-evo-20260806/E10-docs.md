# E10 — Sincronização Docs/Compose + Tracking 100 Etapas (docs/compose)

**Data:** 2026-08-06 · **Branch real:** `fix/check-deploy-secrets-node12` (contexto do task dizia `fix/onda-bugs-console-v1`; commits da onda estão caindo na branch atual — HEAD f2f653c6c + 9887358b0) · **Commit:** (ver sha no final)

## Resumo executivo

Etapas 1–4 do plano 100 etapas (FASE 0) executadas + tracking board criado:
1. **Compose sincronizado com o stack 25 REAL** (Portainer `get_stack_file` ao vivo) — `infra/evolution/docker-compose.evolution.yml` agora é espelho fiel da produção (imagem custom build-time T1–T6, secrets v5→v4 + supabase v3→v1, healthcheck CORS-aware, rate limit 200/100/1m, read_only + no-new-privileges + cap_drop ALL, tmpfs /tmp, manager whitelist, watchtower off).
2. **5 docs obsoletas arquivadas** em `docs/_archive/` via `git mv` (logpatch runtime → build-time): AUDITORIA_EVO_API_2026-07-10/12, AUDITORIA_EXAUSTIVA_2026-07-12/16, AUDIT_EXAUSTIVO_2026-07-10.
3. **3 docs críticos untracked commitados**: INCIDENTE-EVOLUTION-20260806, PLANO-B-BAILEYS-6.7.24, RUNBOOK_401_WORKERS_EVOLUTION_20260806.
4. **Tracking board** `.hermes/auditoria-infra/AUDITORIA_TRACKING_EVO_20260806.md` com as 100 etapas (7 ✅, 2 🔄, 91 ⏳ conforme evidência disponível até 19:05).

## 1. Sync compose (etapa 4) — diff stack 25 REAL × compose antigo

Fonte: `.hermes/execucao-evo-20260806/pt_mcp.sh portainer_get_stack_file '{"stackId":25}'` → `stack25-live.json` → `stack25-evolution.yml` (220 linhas, 8.044 B). Conteúdo = **runtime, sem drift spec×runtime** (A10-17).

| Aspecto | ANTES (legacy) | DEPOIS (= stack 25 REAL) |
|---|---|---|
| Imagem | `evoapicloud/evolution-api@sha256:6b195676…` (oficial, logpatch runtime) | `ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:9d110bc7…` (custom T1–T6 build-time) |
| Entrypoint/command | bash inline com logpatch.cjs + Prisma deploy | `/evolution/docker-entrypoint.sh` + `node dist/main.js` |
| Configs swarm (main_v2_js/mjs, t4) | 3 configs externos | **ausentes** (mecanismo antigo eliminado) |
| Secret API key | `evolution_api_key_v4_20260704` direto | source `v5_20260805` → target `v4_20260704` |
| Secret supabase | ausente | source `supabase_service_key_v3` → target `v1` |
| Hardening | nenhum | `read_only: true` + `no-new-privileges` + `cap_drop: ALL` + tmpfs `/tmp` 1 GB |
| Healthcheck | `wget --spider http://127.0.0.1:8080/` | CORS-aware `/manager/health` + Origin |
| Rate limit | average 1000 / burst 500 | average **200** / burst **100** / 1m |
| Router manager | ausente | `evolution-manager` PathPrefix `/manager` + whitelist IPs (127.0.0.1, 10.0.0.0/8, 186.207.138.55) |
| CORS | ausente (default) | `CORS_ORIGIN=*` + `CORS_CREDENTIALS=false` (decisão F2-07b documentada) |
| Env RMQ | 17 eventos (incl. labels/qrcode/logout) | 4 eventos (messages.upsert/update, contacts.upsert→connection_update…, qrcode OFF) — alinhado à instância viva |
| Cache | redis + local habilitados | `CACHE_REDIS_SAVE_INSTANCES=false` + `CACHE_LOCAL_ENABLED=false` |
| label audit | `canonical-v3-20260711-grep-to-sed-fix` | cadeia completa `…20260805-buildtime-image-B1-H-B3|F2-09-secret-v5|20260806-F2-07-cors|keyfix-supabase-service-v3` + `com.atomicabr.tier=critical` |

**Resultado:** `infra/evolution/docker-compose.evolution.yml` (8.712 B) e `docs/infra/evolution-stack.reconciled.yml` (8.751 B) — corpos YAML **byte-idênticos entre si** (`yaml.safe_load` == True) e iguais ao stack 25 real. Cabeçalho `SINCRONIZADO COM STACK 25 EM 2026-08-06 — fonte única: Portainer stackId 25` preservado nos dois. **Risco A10-16 (P1) eliminado**: usar o compose do repo NÃO reverte mais produção.

## 2. Docs arquivadas (etapa 2)

`git mv` → `docs/_archive/` (5 arquivos, todas tracked; refs checadas em AGENTS.md/CLAUDE.md = 0):

- `AUDITORIA_EVO_API_2026-07-10.md` · `AUDITORIA_EVO_API_2026-07-12.md` (mecanismo logpatch runtime — obsoleto após fix build-time 06/08)
- `AUDITORIA_EXAUSTIVA_2026-07-12.md` · `AUDITORIA_EXAUSTIVA_2026-07-16.md` · `AUDIT_EXAUSTIVO_2026-07-10.md` (padrão `AUDIT_*_2026-07-*`)

Histórico preservado (git mv). Refências cruzadas em outros docs (AUDITORIA_COMPLETA_ZAPP_WEB, REMEDIACAO_EVO_API, EXECUCAO_MELHORIAS_EVO) são históricas — não atualizadas (fora do escopo da etapa).

## 3. Docs untracked commitados (etapa 1)

`docs/INCIDENTE-EVOLUTION-20260806.md` · `docs/PLANO-B-BAILEYS-6.7.24.md` · `docs/RUNBOOK_401_WORKERS_EVOLUTION_20260806.md` (A10-24 fechado).

## 4. Tracking board (etapa 3)

`.hermes/auditoria-infra/AUDITORIA_TRACKING_EVO_20260806.md` — 100/100 etapas extraídas do plano (validação programática: nums 1..100, 1 por linha), legenda ✅/🔄/⏳, scorecard parcial da Onda 1, seção de pendências herdadas do tracking anterior.

**Status Onda 1 (evidência até 19:05):**
- ✅ 1, 2, 3, 4 (E10 — este commit) · ✅ 9, 10, 12 (E6 `9887358b0`: higiene raiz, gate anti-*** CI, P0-2 verificado = falso positivo)
- 🔄 47, 87 (E7 em execução — `webhook_source` + log HMAC no `evolution-webhook/index.ts`, worktree não commitado)
- ⏳ 91 restantes — E1–E5/E7–E9 ainda sem relatório publicado no momento da escrita; atualizar quando o orquestrador consolidar.

## 5. Arquivos do commit (paths disjoint — regra respeitada)

| Arquivo | Ação |
|---|---|
| `infra/evolution/docker-compose.evolution.yml` | M (sync stack 25) |
| `docs/infra/evolution-stack.reconciled.yml` | M (sync stack 25) |
| `docs/_archive/{5 docs}` | R (arquivadas) |
| `docs/INCIDENTE-EVOLUTION-20260806.md` | A (untracked→tracked) |
| `docs/PLANO-B-BAILEYS-6.7.24.md` | A |
| `docs/RUNBOOK_401_WORKERS_EVOLUTION_20260806.md` | A |
| `.hermes/auditoria-infra/AUDITORIA_TRACKING_EVO_20260806.md` | A (novo) |
| `.hermes/execucao-evo-20260806/E10-docs.md` | A (novo, este relatório) |

NÃO tocados (domínio alheio): `src/`, `supabase/functions/` (edições E7 intactas no worktree), `infra/evolution-api-custom/`, `infra/evolution-consumer/`, `.github/workflows/` (commit E6 preservado).

## 6. Git

- Branch local sem upstream e inexistente no origin (verificado `git ls-remote`) — mesmo achado do E6. Push cria a branch remota `fix/check-deploy-secrets-node12` (nenhum workflow dispara em push de `fix/*` — verificado por E6 §4).
- `git pull --rebase` pré-push: sem upstream → nada a rebasear contra origin (branch nova). Conflito: N/A (nenhum outro commit remoto na branch).
- Mensagem: `docs(evo): sync stack25 + arquiva docs obsoletas + tracking 100 etapas (onda execução)`.
