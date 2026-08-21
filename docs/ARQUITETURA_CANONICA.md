# Arquitetura Canônica — ZAPP Web V3 (pós-auditoria 2026-08-20)

> **Documento canônico único** de arquitetura (plano-100 etapa 100): hosting,
> banco, edge, secrets e deploy num só lugar, com o estado **verificado ao vivo**
> em 2026-08-20. Substitui, como ponto de entrada, os fragmentos
> `docs/ARCHITECTURE_AND_FLOW.md` (frontend), `docs/db/ARCHITECTURE.md` (banco),
> `docs/ARCHITECTURE_SCHEMAS.md` e `docs/ARCHITECTURE_RLS.md` — que continuam
> valendo como aprofundamento por área.
> Estado operacional (o que está ligado): `ESTADO.md`. Validação etapa-a-etapa:
> `docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`.

---

## 1) Hosting e domínios

**Fonte única de produção: VPS AtomicaBR (Docker Swarm + Traefik).**
A Vercel foi **aposentada** para o ZAPP — verificado em 2026-08-20 que o team
`juca1` não possui mais nenhum projeto zapp (o único projeto restante é
`promo-gifts-v4`, de outro produto). Não recriar deploy na Vercel.

| Domínio | Papel | Router Traefik (stack 157) |
|---|---|---|
| `zapp.atomicabr.com.br` | **Canônico** (`rel=canonical` no index.html) | `zapp-prod` |
| `zappweb.app.br` | Alias | `zappweb` |
| `www.zappweb.app.br` | Alias (migrado da Vercel em 2026-08-20; DNS A → VPS) | `zappweb-www` |

- Os 3 routers servem o **mesmo serviço** `zapp-web-prod_web` (verificado
  byte-a-byte em 2026-08-20: mesmo bundle `index-CtCUX9jA.js` nos 3 hosts) e
  passam pelo middleware `crowdsec-bouncer`.
- Certificados Let's Encrypt válidos (verificado 2026-08-20): zapp → 23/10,
  apex → 05/11, www → 18/11, supabase → 23/10. Renovação automática pelo
  `letsencryptresolver` do Traefik.
- **nginx do container**: `nginx.conf` (copiado pelo `Dockerfile`) é o ÚNICO
  usado em produção — CSP v10 canônica (`docs/csp.md`), headers de segurança,
  `/sentry-tunnel` (resolver IPv4-only), bloqueio de `.map`, cache imutável em
  `/assets/`. `nginx-prod.conf` é target legado de serving direto na VPS (o
  próprio cabeçalho do arquivo explica) — não é usado pelo build Docker.

## 2) Deploy (pipeline canônico)

`deploy-vps.yml` — push na `main` (com `paths-ignore` p/ `**.md` e `docs/**`)
ou dispatch com `image_tag`:

1. **Preflight** `check-deploy-secrets.mjs` (fail-closed): presença dos secrets,
   URL não pode ser `*.supabase.co`, publishable key não pode ser
   `service_role` **e precisa ser aceita pelo Kong (200)**.
2. **Build** Bun/Vite → imagem nginx (`ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha12>`)
   com retenção de assets do deploy anterior (sessões abertas não tomam 404).
3. **Retenção GHCR**: keep 30 (10 deploys íntegros; múltiplo de 3 por causa de
   index+amd64+attestation) + tags protegidas de rollback
   (`infra/ghcr-protected-tags.txt`).
4. **Gate pré-PUT**: extrai a anon do bundle recém-buildado e valida contra o
   Kong ANTES de trocar a stack (fecha na origem o incidente de 2026-08-20).
5. **PUT Portainer stack 157** (compose inline com tag SHA imutável, redes
   `AtomicaBRNet`+`zapp-net`, healthcheck, rollback `start-first`,
   `no-new-privileges`). Espelho versionado: `infra/stacks/zapp-web-prod.yml`.
6. **Convergência verificada** (adicionada 2026-08-20, portada do draft):
   aguarda `UpdateStatus=completed`, confere imagem/replicas — deploy que o
   Swarm reverteu deixa de passar verde. Escape: repo var `ENFORCE_CONVERGENCE=0`.
7. **post-deploy-health** determinístico (TTM www < 3s, PostgREST vivo, edge fn
   viva) + guard assíncrono `bundle-secret-guard` (pós-deploy + diário).

Rollback: dispatch do deploy com `image_tag=production-<sha-anterior>` (ou
`docker service update --image …`). Edge functions: `edge-deploy.yml` em push
na `main` tocando `supabase/functions/**` (parse gate → rsync → restart).

## 3) Banco de dados (Supabase self-hosted)

- Instância: `https://supabase.atomicabr.com.br` (stack 35; Postgres 15.8).
- **36 schemas** (ao vivo 2026-08-20; os "259" da auditoria eram poluição de
  `pg_temp_*`, hoje limpa). Núcleo ZAPP: `zapp` (386 tabelas/257 views, 670 MB,
  992 funções) + `evo` (74 tabelas/33 views, 549 MB) + `auth`/`storage`/`realtime`.
- **Multi-app por design**: `bpm`, `financeiro` (painel-financeiro, stack 140),
  `vendas`, `email_app`, `ai`, `artes` (fechamento-artes, stack 139),
  `logistica` (painel-compras/deptopessoal) coabitam o mesmo Postgres com RLS
  próprio. Não é resíduo: são os outros painéis da casa. Fronteiras em
  `docs/db/SCHEMA-CONTRACT.md`.
- **Topologia evolution_*** (verificada via `pg_class` 2026-08-20): tabelas
  físicas em **`evo`** (`evolution_messages`/`evolution_conversations` raízes
  particionadas; `evolution_contacts` regular); em `zapp` são **views
  auto-updatable**. REST usa schema `zapp` (PostgREST não expõe `evo`);
  **Realtime assina `schema: 'evo'`** (regra 4 do CLAUDE.md).
- **Publication `supabase_realtime`** (`publish_via_partition_root=true`):
  `evo.evolution_{messages,conversations,contacts}` + `zapp.{profiles,
  app_notifications}` + `zapp.{failed_messages,dispatch_error_logs}`
  (reincorporadas pela migration `20260821001000`).
- **RLS: 100%** das tabelas de `zapp` e `evo` (zero sem RLS — ao vivo 2026-08-20).
- **Migrations**: 771 aplicadas no runtime; repo↔runtime reconciliado em
  2026-08-20 (`supabase/MIGRATION_DRIFT_2026-08-20.md` + stamps). Regra: toda
  mudança nova = arquivo em `supabase/migrations/` aplicado pelo pipeline
  (`db-migrate.yml`) — nunca DDL direto via MCP.
- **Retenção/purga**: 239 cron jobs (pg_cron), com famílias de purge para
  webhooks (7d/14d + partições mensais), notificações, telemetria, etc.
- **Backups**: ver `infra/runbooks/RESTORE_DRILL.md` — local diário saudável;
  **offsite do supabase-db parado desde 2026-08-10 (P0 aberto)**; drill de
  restore executado em 2026-08-17 (19 erros ignorados, 2 causas conhecidas).

## 4) Edge Functions

- **122 funções reais** no repo (`supabase/functions/`, excl. `_shared` e
  `_archive`); volume de produção com paridade (diff repo×volume 2026-08-20:
  zero órfãs — sobram no repo apenas `deno.json`/`gmail-tests.test.ts`, que não
  são funções).
- Entrypoint único `main/index.ts` com `VERIFY_JWT=true` + allowlist
  `PUBLIC_FNS` (26 públicas — webhooks com HMAC, trackers, health-check, crons
  com `CRON_SECRET`). `config.toml` NÃO é lido pelo runtime; gate de paridade
  `edge-schema-parity.yml` agora falha se `verify_jwt=false` divergir da
  allowlist.
- Credenciais: env do PID 1 do container (secrets Swarm do stack 35 — service
  v3/anon v2/JWT 40c; `exec` em shell novo mostra vazio, é artefato). Fallback
  de segredos dinâmicos: `_shared/vault.ts` → `zapp.fn_get_vault_secret`
  (materializada no repo em `20260821001500`).
- Saída HTTP para Evolution API **somente** pelo gateway
  `_shared/providers/evolution/client.ts` (12 verbos; CI `decouple-guard`).
- Smoke de produção 2026-08-20: REST 200 · auth 200 · `status` 200 ·
  `evolution-webhook` sem HMAC → 401 · `public-api` sem key → 401 · `health`
  → 401 (interno por design, `x-health-secret`).
- Dívidas mapeadas (não bloqueantes, ver validação etapas 25–29): CORS
  bipartido (`cors.ts` 63× vs `validation.ts` 54× + 3 wildcards), rate-limit
  DB-backed só no `evolution-webhook` (19/26 públicas sem limiter), 8 HMACs
  ad-hoc fora do módulo compartilhado.

## 5) Secrets

Inventário canônico: **`docs/SECRETS_INVENTORY.md`** (vault 37 · Swarm secrets ·
GitHub secrets · chaves públicas do bundle). Pontos-chave verificados:
- JWT secret do Supabase **rotacionado** (40c próprio; demo aposentado); anon do
  bundle não é assinada pelo secret demo e é aceita pelo Kong.
- PAT dos runners virou Docker secret `gh_runner_pat_v2` (sem token literal).
- Blindagem tripla contra chave errada no bundle (preflight → gate pré-PUT →
  guard pós-deploy diário).

## 6) Observabilidade

- **Sentry**: DSN nos 3 hosts, release = git SHA, tunnel next-door no nginx;
  consumer da Evolution também reporta (org `promobrindes`).
- **Métricas/logs**: prometheus + cadvisor + node-exporter + 4 pg-exporters +
  loki + grafana (stacks 253–259). Dashboard único provisionável:
  `infra/observability/grafana/zapp-health-dashboard.json` (etapa 92).
- **Watchdogs**: stack 232 `ag6-watchdogs` (w1–w9, `creds-ttl-check`,
  `baileys-drop-check`) + guards de stack/disk/cert/backup — alertas via n8n
  `warroom-alert`.
- **web-vitals**: `client-observability` ligado em prod a partir do build-arg
  `VITE_ENABLE_CLIENT_OBSERVABILITY=true` (2026-08-20).

## 7) CI/CD — mapa resumido

48 workflows após a consolidação de 2026-08-20 (`post-deploy-check.yml`
removido). Famílias: CI principal (`ci.yml`), deploy (`deploy-vps.yml` +
draft desativado), qualidade (quality-gate, ratchets, pr-size, regression-gate),
segurança (gitleaks, codeql, bundle-secret-guard, branch-protection-sentinel,
security-invoker-gate), banco (db-migrate, migration-lint/uniqueness/smoke,
schema-drift ×2, db-invariants, db-reference-integrity), edge (deploy, drift,
parity, auth-smoke, env-completeness, parse-gate, guard, deno-contract),
desacoplamento (decouple-guard, measure-invariants, evo-ddl-gate,
ownership-gate, score-ratchet), E2E (3 suítes + nightly + seeds/cleanup).
Runners: self-hosted `vps-zapp` (stack 210, 5 runners + 1 evo).

## 8) Fronteiras e regras permanentes

1. `main` deploya produção — commits de agente via PR (política HERMES.md).
2. Edge function nova declara chamador no `ESTADO.md` no mesmo commit.
3. DDL só por migration versionada; `evo` é DDL da Evolution (gate).
4. Secret novo entra no `SECRETS_INVENTORY.md` no mesmo PR.
5. Realtime: conferir `pg_publication_tables` antes de assinar tabela nova.
