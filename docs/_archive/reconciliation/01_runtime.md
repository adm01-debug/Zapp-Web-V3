# FASE 1 — Enumeração do RUNTIME Docker Swarm (reconciliação)

> Auditoria **read-only** via Portainer MCP (endpoint `primary`, id 1). Nenhuma ação de escrita foi executada.
> Gerado em: 2026-08-04T15:16:39 · Fonte: `portainer_list_endpoints/list_stacks/list_services/list_containers/get_container/get_stack_file/list_volumes/list_networks/swarm_info/get_docker_info`
> **Regra de segredos:** nenhum valor sensível é impresso — apenas nomes de variáveis e fingerprint `sha256` (12 chars) quando o valor foi observado.

## 0. Resumo executivo

- **Host:** `AtomicaBR` (single-node Swarm, Docker **28.1.1**, Ubuntu 20.04.6 LTS, 12 vCPU, 25.2 GB RAM, overlay2).
- **Total de containers: 96** (84 running · 10 exited · 2 created). Snapshot Portainer: 95 containers / 69 stacks / 38 volumes / 60 imagens (docker info: 96/84/12 stopped/62 imagens).
- **Stack `supabase`: 13/13 serviços running** (db, rest, auth, kong, functions, meta, storage, realtime, analytics, vector, supavisor, imgproxy, studio). Nenhum serviço do stack em crash — o cenário histórico `supabase_meta Exited 137` **não está presente** (meta running, healthy, recriado 2026-08-04T16:29Z).
- **Front `zapp-web-prod_web`:** running e **healthy** (`/healthz`), imagem `production-b58d2575f778` (bate com o stack file; houve rollover de imagem durante a auditoria).
- **Achados de saúde:** (1) serviço `github-actions-runner_runner` **sem réplica ativa** (6 tasks exited, 0 running); (2) `openclaw-edge-guard_guard` e `zapp-health-guard_guard` com tasks presas em **created** (churn entre 2 snapshots); (3) `kong-rl-test` exited (1) — sobra de teste de rate-limit.
- **Drifts stack file × runtime:** kong (compose 3.9.1 → runtime 3.9.3 + plugin `rate-limiting`) e functions (compose com `EVOLUTION_API_KEY`/`DEEPSEEK_API_KEY` em texto plano antigos; runtime usa secrets novos).

## 1. Endpoints / Stacks

**Endpoint (1):** `primary` — type 2 (Docker Swarm), url `tcp://tasks.agent:9001`, **status up**. Snapshot: containers=95, running=84, stacks=69, volumes=38, images=60.

**Docker info (evidência `get_docker_info`):** ServerVersion=28.1.1 · Name=AtomicaBR · ID=`9db27c03-e777-44cf-bbc5-6c82fc3714e1` · Containers=96 (running 84, paused 0, stopped 12) · Images=62 · NCPU=12 · MemTotal=25.202.905.088 bytes · StorageDriver=overlay2 (extfs) · CgroupDriver=systemd (cgroup v1) · Kernel 5.4.0-216-generic · Warnings: "No swap limit support".

**Swarm (evidência `swarm_info`):** ID=`ypqv6itnmp6vnxz4xdkk4dpod` · Nodes=1, Managers=1 (NodeID `bsihx70cz2r0fxxg2e29t8ipe`, addr 209.142.67.51) · criado 2024-12-07 · TaskHistoryRetentionLimit=1 · AutoLockManagers=false.

**Stacks registrados no Portainer (69; full list):**
  - id 19: `minio` (type 1, criado 2024-12-10)
  - id 20: `postgres` (type 1, criado 2024-12-10)
  - id 23: `redis` (type 1, criado 2024-12-10)
  - id 24: `n8n` (type 1, criado 2024-12-10)
  - id 25: `evolution` (type 1, criado 2024-12-10)
  - id 35: `supabase` (type 1, criado 2024-12-11)
  - id 37: `metabase` (type 1, criado 2025-05-12)
  - id 39: `gotenberg` (type 1, criado 2025-11-24)
  - id 40: `gmaps` (type 1, criado 2026-03-26)
  - id 41: `glitchtip` (type 1, criado 2026-04-04)
  - id 68: `portainer-mcp-v2` (type 1, criado 2026-04-20)
  - id 84: `postgres-backup-weekly` (type 1, criado 2026-04-22)
  - id 85: `postgres-backup-monthly` (type 1, criado 2026-04-22)
  - id 93: `restore-validate` (type 2, criado 2026-04-22)
  - id 109: `watchdog-baileys` (type 1, criado 2026-04-29)
  - id 111: `rabbitmq` (type 1, criado 2026-04-29)
  - id 112: `postgres-backup-daily` (type 1, criado 2026-04-29)
  - id 113: `evolution-rabbit-consumer` (type 1, criado 2026-04-29)
  - id 116: `baileys-backup` (type 1, criado 2026-04-30)
  - id 117: `dlq-inspector` (type 1, criado 2026-04-30)
  - id 118: `wa-version-monitor` (type 1, criado 2026-04-30)
  - id 119: `baileys-error-monitor` (type 1, criado 2026-04-30)
  - id 120: `swarm-task-guardian` (type 1, criado 2026-05-01)
  - id 122: `claude-code` (type 1, criado 2026-05-02)
  - id 124: `supabase-backup` (type 1, criado 2026-05-03)
  - id 125: `promo-gifts-web` (type 1, criado 2026-05-04)
  - id 126: `evolution-db-purge` (type 1, criado 2026-05-04)
  - id 128: `supabase-db-mcp` (type 1, criado 2026-05-05)
  - id 130: `clamav` (type 1, criado 2026-05-09)
  - id 131: `painel-cotacoes` (type 1, criado 2026-05-12)
  - id 139: `fechamento-artes` (type 1, criado 2026-05-22)
  - id 140: `painel-financeiro` (type 1, criado 2026-05-27)
  - id 143: `supabase-artes-mcp` (type 1, criado 2026-06-08)
  - id 146: `openclaw` (type 1, criado 2026-06-10)
  - id 150: `docuseal` (type 1, criado 2026-06-12)
  - id 151: `typebot` (type 1, criado 2026-06-12)
  - id 152: `openwebui` (type 1, criado 2026-06-12)
  - id 154: `crowdsec` (type 1, criado 2026-06-12)
  - id 156: `watchtower` (type 1, criado 2026-06-12)
  - id 157: `zapp-web-prod` (type 1, criado 2026-06-12)
  - id 164: `schema-drift-guard` (type 1, criado 2026-07-01)
  - id 165: `zapp-health-guard` (type 1, criado 2026-07-02)
  - id 166: `infra-boot-guard` (type 1, criado 2026-07-03)
  - id 167: `host-disk-guard` (type 1, criado 2026-07-06)
  - id 168: `sysctl-quic-fix` (type 1, criado 2026-07-07)
  - id 169: `painel-compras` (type 1, criado 2026-07-09)
  - id 170: `watchdog-canary` (type 1, criado 2026-07-10)
  - id 171: `vscode-mcp` (type 1, criado 2026-07-14)
  - id 172: `traefik-log-rotate` (type 1, criado 2026-07-15)
  - id 173: `wal-slot-guard` (type 1, criado 2026-07-16)
  - id 175: `supabase-config-backup` (type 1, criado 2026-07-16)
  - id 176: `openclaw-brain-guard` (type 1, criado 2026-07-17)
  - id 177: `openclaw-edge-guard` (type 1, criado 2026-07-17)
  - id 178: `openclaw-backup` (type 1, criado 2026-07-17)
  - id 179: `openclaw-backup-guard` (type 1, criado 2026-07-17)
  - id 182: `deptopessoal` (type 1, criado 2026-07-21)
  - id 183: `supabase-pttz-mcp` (type 1, criado 2026-07-21)
  - id 185: `hermes-guard` (type 1, criado 2026-07-22)
  - id 187: `hermes-backup` (type 1, criado 2026-07-22)
  - id 188: `hermes` (type 1, criado 2026-07-22)
  - id 195: `mcp-health-monitor` (type 1, criado 2026-07-26)
  - id 196: `traefik-cert-backup` (type 1, criado 2026-07-26)
  - id 197: `traefik-cert-guard` (type 1, criado 2026-07-26)
  - id 198: `portainer-state-backup` (type 1, criado 2026-07-26)
  - id 199: `docker-housekeeping` (type 1, criado 2026-07-26)
  - id 201: `disk-metrics-collector` (type 1, criado 2026-08-01)
  - id 207: `disk-actioner` (type 1, criado 2026-08-01)
  - id 208: `disk-deep-clean` (type 1, criado 2026-08-01)
  - id 210: `github-actions-runner` (type 1, criado 2026-08-01)

**Stacks de interesse para esta fase:** `supabase` (id 35), `zapp-web-prod` (id 157), `schema-drift-guard` (164), `supabase-config-backup` (175), `mcp-health-monitor` (195).

## 2. Serviços (réplicas desejadas × rodando)

**Total: 90 serviços** listados — 89 replicated×1 + 1 global (`portainer_agent`). Todos os serviços replicated×1 têm exatamente 1 task desejada; a contagem de tasks running bate por serviço, EXCETO os sinalizados na seção 7 (`github-actions-runner_runner`, `openclaw-edge-guard_guard`, `zapp-health-guard_guard`).

**Stack supabase (13 serviços, todos replicas=1 e running):** db, rest, auth, kong, functions, meta, storage, realtime, analytics, vector, supavisor, imgproxy, studio.

Destaques de imagem por serviço (evidência `list_services`):
| Serviço | Imagem (runtime) | Versão spec | updatedAt |
|---|---|---|---|
| supabase_db | supabase/postgres:15.8.1.085@sha256:af083e… | 12994718 | 2026-08-02T23:33Z |
| supabase_rest | postgrest/postgrest:v14.12 | 12994715 | 2026-08-02T23:33Z |
| supabase_auth | supabase/gotrue:v2.189.0 | 12994720 | 2026-08-02T23:33Z |
| supabase_kong | **kong:3.9.3**@sha256:62721e… (compose: 3.9.1) | 13049940 | 2026-08-03T14:14Z |
| supabase_functions | supabase/edge-runtime:v1.74.0 | 13066248 | 2026-08-03T18:25Z |
| supabase_meta | supabase/postgres-meta:v0.96.6 | 12994710 | 2026-08-02T23:33Z |
| supabase_storage | supabase/storage-api:v1.60.4 | 12994719 | 2026-08-02T23:33Z |
| supabase_realtime | supabase/realtime:v2.102.3 | 12994705 | 2026-08-02T23:33Z |
| supabase_analytics | supabase/logflare:1.43.1 | 12994707 | 2026-08-02T23:33Z |
| supabase_vector | timberio/vector:0.53.0-alpine | 12994708 | 2026-08-02T23:33Z |
| supabase_supavisor | supabase/supavisor:2.9.5 | 12994717 | 2026-08-02T23:33Z |
| supabase_imgproxy | darthsim/imgproxy:v3.30.1 | 12994706 | 2026-08-02T23:33Z |
| supabase_studio | supabase/studio:2026.06.29-sha-20290c7 | 12994711 | 2026-08-02T23:33Z |
| zapp-web-prod_web | ghcr.io/adm01-debug/zapp-web-v3/zapp-web:**production-b58d2575f778** | 13155531 | 2026-08-04T17:48Z (rollover durante auditoria) |
| portainer_agent | portainer/agent:2.39.5 (global) | 12760930 | 2026-07-26T18:55Z |
| traefik_traefik | traefik:v2.11.2 | 12760930 | 2026-07-26T18:55Z |
| evolution_evolution | evoapicloud/evolution-api@sha256:6b1956… | 13148726 | 2026-08-04T15:59Z |

(Lista completa dos 90 serviços no `01_runtime.json` → `services_resumo` + campo containers.)

## 3. Inventário de containers (96)

Legenda: exit = ExitCode do estado · rc = RestartCount · health = status do healthcheck Docker (quando definido).

| Container | Imagem | Estado | exit | rc | health |
|---|---|---|---|---|---|
| baileys-backup_baileys-backup.1.ta8of8rqaqw678g169goj9gou | `node:20-alpine` | running | - | 0 | - |
| baileys-error-monitor_baileys-error-monitor.1.tg6jni0u15ncju7tos5biaggd | `alpine:3.19` | running | - | 0 | - |
| clamav_clamav.1.98z1efl4f2rkuu1gqu8egc02n | `clamav/clamav:1.4` | exited | - | 0 | - |
| clamav_clamav.1.bhinyios0cx1az37i3wk2vs2z | `clamav/clamav:1.4` | running | - | 0 | healthy |
| clamav_clamav.1.jwvqgvauallkgm648g4ostikb | `clamav/clamav:1.4` | exited | - | 0 | - |
| clamav_clamav.1.pbqt2isbgh9haah2lhu544m1f | `clamav/clamav:1.4` | exited | - | 0 | - |
| claude-code_claude-code.1.0lc13anywcua6pedhmhwfpmj3 | `node:20-bookworm-slim` | running | - | 0 | - |
| crowdsec_crowdsec-bouncer.1.uj43c2ycs57gje0na8uctqmwz | `fbonalair/traefik-crowdsec-bouncer:latest` | running | - | 0 | healthy |
| crowdsec_crowdsec.1.no1mvoar5mvmgi7hlgvbthwl1 | `crowdsecurity/crowdsec:latest` | running | - | 0 | healthy |
| disk-actioner_actioner.1.m3mlc7m9eefjeyu80mkferd34 | `docker:28-cli` | running | - | 0 | - |
| disk-deep-clean_deep-clean.1.pa4fw1nry6yj3z303vs9bo6e0 | `alpine:3.19` | running | - | 0 | - |
| disk-metrics-collector_collector.1.n47v5291sq3dzhjwx9yucwnn4 | `postgres:15-alpine` | running | - | 0 | - |
| dlq-inspector_dlq-inspector.1.i82huolpr25g8x7l5l4q8lbs6 | `python:3.12-alpine` | running | - | 0 | - |
| docker-housekeeping_cleanup.1.w3wzxdcytmos81c3ly2j4mvui | `docker:28-cli` | running | - | 0 | - |
| docuseal_docuseal.1.8vycuh80wefcx9357fcnrwba3 | `docuseal/docuseal:latest` | running | - | 0 | - |
| evolution-db-purge_purge.1.ybvq92glox1wxr8lu5lz0yhlt | `postgres:14-alpine` | running | - | 0 | - |
| evolution-rabbit-consumer_consumer.1.qibi0pfasc2emnhgxzio3eqxm | `consumer-prebuilt:v2` | running | - | 0 | - |
| evolution_evolution.1.l2g4vmsa9wm3u00ke3gmm3mlx | `evoapicloud/evolution-api` | running | - | 0 | healthy |
| fechamento-artes_web.1.0omnnfekagzb09ykol5l2im08 | `ghcr.io/tipromo/fechamento-artes:latest` | running | - | 0 | healthy |
| github-actions-runner_runner.1.pkkjs666t9y3r6sej3ctwa2hk | `myoung34/github-runner:latest` | exited | - | 0 | - |
| github-actions-runner_runner.1.q7jvjhhc3q4m1y2kq2f1vtvdk | `myoung34/github-runner:latest` | exited | - | 0 | - |
| github-actions-runner_runner.1.tiuagsndkssngkfmz6h4yaclb | `myoung34/github-runner:latest` | exited | - | 0 | - |
| github-actions-runner_runner.1.vrwwleq3xftka74qmgf4l3ltm | `myoung34/github-runner:latest` | exited | - | 0 | - |
| github-actions-runner_runner.1.yue7jhur78he8oo748bxdknve | `myoung34/github-runner:latest` | exited | - | 0 | - |
| github-actions-runner_runner.1.z8o7xozrpchrevwr8ir6dxnk8 | `myoung34/github-runner:latest` | exited | - | 0 | - |
| glitchtip_glitchtip-db.1.e5nht40wrhqab2q3gia2tyf05 | `postgres:16-alpine` | running | - | 0 | healthy |
| glitchtip_glitchtip-valkey.1.tq4oi7y8oi5yeualfbgqdemn6 | `valkey/valkey:8-alpine` | running | - | 0 | healthy |
| glitchtip_glitchtip-web.1.ljkkf3n98z4ffk9e9llyjxu2x | `glitchtip/glitchtip:latest` | running | - | 0 | - |
| glitchtip_glitchtip-worker.1.9oosvd60smliguliy2qi31ks1 | `glitchtip/glitchtip:latest` | running | - | 0 | - |
| gmaps_scraper.1.0ci0ybokctvincct0vtk3694f | `gosom/google-maps-scraper:latest-rod` | running | - | 0 | - |
| gotenberg_gotenberg.1.lc1iaq5ewgckt56mj6r1ea7hr | `gotenberg/gotenberg:8` | running | - | 0 | - |
| hermes-backup_backup.1.podce8pqfklp924ozdv6y4mjj | `alpine:3.19` | running | - | 0 | - |
| hermes-guard_guard.1.srezkfox635brso5gkmt8j3gp | `alpine:3.19` | running | - | 0 | - |
| host-disk-guard_disk-guard.1.mfic1wzna8jvtm7shkggt77ri | `postgres:15-alpine` | running | - | 0 | - |
| infra-boot-guard_boot-guard.1.ir1t2g35be4mvjyojku3tdwtr | `alpine:3.19` | running | - | 0 | - |
| kong-rl-test | `kong:3.9.3` | exited | - | 0 | - |
| mcp-health-monitor_mcp-health-monitor.1.ltqsyatz | `alpine:3.19` | running | - | 0 | - |
| metabase_metabase.1.yz07ayle80op552wnwx8ou0y3 | `metabase/metabase:v0.54.6` | running | - | 0 | - |
| minio_minio.1.yoeulgy46kts34yd11lgv2aj3 | `quay.io/minio/minio:latest` | running | - | 0 | healthy |
| n8n_n8n_editor.1.io8ty3i4spy5n5pu70fynxdnx | `n8nio/n8n:2.25.7` | running | - | 0 | - |
| n8n_n8n_webhook.1.ypx8ul3c0wgn5vbszsjjkakuy | `n8nio/n8n:2.25.7` | running | - | 0 | - |
| n8n_n8n_worker.1.ei57cgms97ua132vddtg3uo6h | `n8nio/n8n:2.25.7` | running | - | 0 | - |
| openclaw-backup-guard_guard.1.2gtn6onsrn9vjb1gv2k39exd1 | `alpine:3.19` | running | - | 0 | - |
| openclaw-backup_backup.1.eqdv50dhcgdc6z594ub4qnky7 | `ghcr.io/openclaw/openclaw:2026.7.1` | running | - | 0 | - |
| openclaw-brain-guard_guard.1.3rovdgwu38elf79kbtcf8etnv | `alpine:3.19` | running | - | 0 | - |
| openclaw-edge-guard_guard.1.6mek2u7ek4jacq8a2eo6d5wqr | `alpine:3.19` | created | - | 0 | - |
| openclaw_openclaw.1.0k3lmwoe4ixyfcsgx54ys85jf | `ghcr.io/openclaw/openclaw:2026.7.1` | running | - | 0 | healthy |
| openwebui_ollama.1.qlw6atacvfvkrkq5ne2pbcg4w | `ollama/ollama:latest` | running | - | 0 | - |
| openwebui_open-webui.1.vd8rvt34jjd2zj8nq1jv51s2z | `ghcr.io/open-webui/open-webui:main` | running | - | 0 | healthy |
| painel-compras_web.1.9c00dmbde6pcouoetmujsr35z | `ghcr.io/tipromo/painel-compras:latest` | running | - | 0 | healthy |
| painel-cotacoes_web.1.sf86mykxsphnganyagcuqijb1 | `ghcr.io/tipromo/painel-cotacoes:latest` | running | - | 0 | healthy |
| painel-financeiro_web.1.b1zpd7qq6k8lk2bf88hloim33 | `ghcr.io/tipromo/painel-financeiro:latest` | running | - | 0 | healthy |
| portainer-mcp-v2_portainer-mcp.1.x0e2xqroh5oa8bq1xc6tkcbve | `ghcr.io/adm01-debug/portainer-mcp-server:sha-8aa09f6` | running | - | 0 | healthy |
| portainer-state-backup_backup.1.pamwuv8aebquq3tfmab0hk2hh | `alpine:3.19` | running | - | 0 | - |
| portainer_agent.bsihx70cz2r0fxxg2e29t8ipe.q8ku7wrb37h3ro7x7ttzuloec | `portainer/agent:2.39.5` | running | - | 0 | - |
| portainer_portainer.1.vddauc0fmo5sw5jo9lxj8a9fv | `portainer/portainer-ce:2.39.5` | running | - | 0 | - |
| postgres-backup-daily_backup-daily.1.t4fo3we6r2u4duozk46i5ypmr | `eeshugerman/postgres-backup-s3:14` | running | - | 0 | - |
| postgres-backup-monthly_backup-monthly.1.qp62i7669m2gg6khlzyib743i | `eeshugerman/postgres-backup-s3:14` | running | - | 0 | - |
| postgres-backup-weekly_backup-weekly.1.1yf0drkoe2dpjaqqyeilipahl | `eeshugerman/postgres-backup-s3:14` | running | - | 0 | - |
| postgres_postgres.1.oygu2lxzl3rya1ah94jcropkt | `postgres:14` | running | - | 0 | healthy |
| promo-gifts-web_web.1.l00sxfs23ynb06umkw698w8l4 | `nginx:alpine` | running | - | 0 | healthy |
| rabbitmq_rabbitmq.1.kxrjiwf4m2fcalq5mw2b4d88r | `rabbitmq:3.13-management-alpine` | running | - | 0 | healthy |
| redis_redis.1.4jeaefbz011n1romctar47dvl | `redis:8.2-alpine` | running | - | 0 | healthy |
| schema-drift-guard_guard.1.zvc3hiuf | `postgres:15-alpine` | running | - | 0 | - |
| supabase-artes-mcp_supabase-artes-mcp.1.nmbfl1bg | `node:20-alpine` | running | - | 0 | healthy |
| supabase-backup_backup.1.oabjnke9 | `postgres:15-alpine` | running | - | 0 | - |
| supabase-config-backup_config-backup.1.htje5i8j | `alpine:3.19` | running | - | 0 | - |
| supabase-db-mcp_supabase-db-mcp.1.keendsl0 | `node:20-alpine` | running | - | 0 | healthy |
| supabase-pttz-mcp_supabase-pttz-mcp.1.t5w7dht4 | `node:22-alpine` | running | - | 0 | healthy |
| supabase_analytics.1.3vziba5l | `supabase/logflare:1.43.1` | running | - | 0 | - |
| supabase_auth.1.pjyi3fkh | `supabase/gotrue:v2.189.0` | running | - | 0 | - |
| supabase_db.1.k4nbk3pz | `supabase/postgres:15.8.1.085` | running | - | 0 | healthy |
| supabase_functions.1.nxe8laoy | `supabase/edge-runtime:v1.74.0` | running | - | 0 | - |
| supabase_imgproxy.1.yiru57vk | `darthsim/imgproxy:v3.30.1` | running | - | 0 | - |
| supabase_kong.1.zu6efhsk | `kong:3.9.3` | running | - | 0 | healthy |
| supabase_meta.1.zkj6618r | `supabase/postgres-meta:v0.96.6` | running | - | 0 | healthy |
| supabase_realtime.1.u817a4u1 | `supabase/realtime:v2.102.3` | running | - | 0 | - |
| supabase_rest.1.o7ey5u06 | `postgrest/postgrest:v14.12` | running | - | 0 | - |
| supabase_storage.1.4nrhdjhx | `supabase/storage-api:v1.60.4` | running | - | 0 | - |
| supabase_studio.1.xhmgi0qf | `supabase/studio:2026.06.29-sha-20290c7` | running | - | 0 | healthy |
| supabase_supavisor.1.myjdc6d9 | `supabase/supavisor:2.9.5` | running | - | 0 | - |
| supabase_vector.1.zbfe1pic | `timberio/vector:0.53.0-alpine` | running | - | 0 | - |
| swarm-task-guardian_swarm-task-guardian.1.dwm5rimhu2p408a03i5krd2yl | `alpine:3.19` | running | - | 0 | - |
| traefik-cert-backup_backup.1.zwv6hs2d8mj4appxub0g5fmvi | `alpine:3.19` | running | - | 0 | - |
| traefik-cert-guard_guard.1.jckvksmdr5jn62xk3x5mkt8p5 | `alpine:3.19` | running | - | 0 | - |
| traefik-log-rotate_log-rotate.1.rn3zss1y48u53gddlzwrnzhwo | `alpine:3.19` | running | - | 0 | - |
| traefik_traefik.1.mtnoecgbphcmukmxd2g7b15ek | `traefik:v2.11.2` | running | - | 0 | - |
| typebot_typebot-viewer.1.6117fdq7xgli614mdi8mf6k7x | `baptistearno/typebot-viewer:latest` | running | - | 0 | - |
| vscode-mcp_code-server.1.udsj03y3o06w6c6cay6hjiow9 | `lscr.io/linuxserver/code-server:latest` | running | - | 0 | - |
| wa-version-monitor_wa-version-monitor.1.vuld5eooqtor1f9wl56h829hv | `alpine:3.19` | running | - | 0 | - |
| wal-slot-guard_guard.1.ktc1zzasa9vxwua4nq4xipcak | `postgres:15-alpine` | running | - | 0 | - |
| watchdog-baileys_watchdog.1.ln25pbnughlxahbuxe46ox5d4 | `alpine:3.19` | running | - | 0 | - |
| watchdog-canary_canary.1.7hqwoji0lhnluh74wvmy212ch | `alpine:3.19` | running | - | 0 | - |
| watchtower_watchtower.1.qw8b5qlygtlfc5wvqg77hrwk6 | `containrrr/watchtower:latest` | running | - | 0 | healthy |
| zapp-health-guard_guard.1.xsayv7gd | `postgres:15-alpine` | created | - | 0 | - |
| zapp-web-prod_web.1.w52czlqk | `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-a1d01703d1ce` | running | - | 0 | healthy |

## 4. Env-names por container (stack supabase + auxiliares)

Valores sensíveis marcados `[redigido:fingerprint]`; valores não sensíveis mostrados quando relevantes. Segredos Docker Swarm referenciados via `/run/secrets/...` são listados por nome (o valor NUNCA é exposto).

### supabase_db

- **Imagem:** `supabase/postgres:15.8.1.085@sha256:af083e...`
- **Estado/Health:** running · health=healthy · RestartCount=0
- **Limites:** mem: 0 (ilimitado), cpu: 0
- **IP (AtomicaBRNet):** 10.0.1.44
- **Mounts:** binds /root/supabase/docker/volumes/db/*.sql (init) + /root/supabase/docker/volumes/db/data -> /var/lib/postgresql/data + volume supabase_db_config -> /etc/postgresql-custom
- **Cmd:** postgres -c config_file=/etc/postgresql/postgresql.conf
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `JWT_EXP`
  - `JWT_SECRET [redigido:b6177a99676f]`
  - `PGDATABASE`
  - `PGPORT`
  - `POSTGRES_DB`
  - `POSTGRES_HOST`
  - `POSTGRES_PASSWORD_FILE=/run/secrets/supabase_db_password_v1`
  - `POSTGRES_PORT`
  - `POSTGRES_USER`
  - `PATH`
  - `PGDATA`
  - `LANG`
  - `LANGUAGE`
  - `LC_ALL`
  - `LC_CTYPE`
  - `LC_COLLATE`
  - `LOCALE_ARCHIVE`

### supabase_rest

- **Imagem:** `postgrest/postgrest:v14.12`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.131
- **Mounts:** nenhum
- **Cmd:** postgrest
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `PGRST_APP_SETTINGS_JWT_EXP`
  - `PGRST_APP_SETTINGS_JWT_SECRET [redigido:b6177a99676f]`
  - `PGRST_DB_ANON_ROLE=anon`
  - `PGRST_DB_SCHEMAS=public,zapp,storage,graphql_public,artes,vendas,financeiro`
  - `PGRST_DB_URI [redigido:b0e6e79fbc9d (senha authenticator embutida)]`
  - `PGRST_DB_USE_LEGACY_GUCS`
  - `PGRST_JWT_SECRET [redigido:b6177a99676f]`

### supabase_auth

- **Imagem:** `supabase/gotrue:v2.189.0`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.241
- **Mounts:** nenhum
- **Cmd:** auth (secrets via /run/secrets)
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `API_EXTERNAL_URL`
  - `GOTRUE_API_HOST`
  - `GOTRUE_API_PORT`
  - `GOTRUE_DB_DRIVER`
  - `GOTRUE_DISABLE_SIGNUP`
  - `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED`
  - `GOTRUE_EXTERNAL_EMAIL_ENABLED`
  - `GOTRUE_EXTERNAL_PHONE_ENABLED`
  - `GOTRUE_JWT_ADMIN_ROLES`
  - `GOTRUE_JWT_AUD`
  - `GOTRUE_JWT_EXP`
  - `GOTRUE_JWT_ISSUER`
  - `GOTRUE_MAILER_AUTOCONFIRM`
  - `GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED`
  - `GOTRUE_MAILER_URLPATHS_CONFIRMATION`
  - `GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE`
  - `GOTRUE_MAILER_URLPATHS_INVITE`
  - `GOTRUE_MAILER_URLPATHS_RECOVERY`
  - `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL`
  - `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED`
  - `GOTRUE_SESSIONS_MAX_USER_SESSIONS`
  - `GOTRUE_SITE_URL`
  - `GOTRUE_SMS_AUTOCONFIRM`
  - `GOTRUE_SMTP_ADMIN_EMAIL`
  - `GOTRUE_SMTP_HOST`
  - `GOTRUE_SMTP_PORT`
  - `GOTRUE_SMTP_SENDER_NAME`
  - `GOTRUE_SMTP_USER`
  - `GOTRUE_URI_ALLOW_LIST`
  - `GOTRUE_DB_MIGRATIONS_PATH`
  - `PATH`
  - `(cmd) GOTRUE_DB_DATABASE_URL/GOTRUE_JWT_SECRET/GOTRUE_SMTP_PASS via secrets supabase_db_password_v1/supabase_jwt_secret_v1/gmail_smtp_password_v1`

### supabase_kong

- **Imagem:** `kong:3.9.3@sha256:62721e... (compose declara 3.9.1)`
- **Estado/Health:** running · health=healthy · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.18
- **Mounts:** bind /root/supabase/docker/volumes/api/kong.yml -> /home/kong/temp.yml:ro
- **Cmd:** kong docker-start (kong.yml gerado com secrets via eval)
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `KONG_DATABASE=off`
  - `KONG_DECLARATIVE_CONFIG=/tmp/kong.yml`
  - `KONG_DNS_ORDER`
  - `KONG_PLUGINS (runtime inclui rate-limiting; compose NAO)`
  - `SUPABASE_ANON_KEY [redigido:4a1e6ff19f60]`
  - `DASHBOARD_USERNAME=AtomicaBR`
  - `KONG_NGINX_PROXY_PROXY_BUFFERS`
  - `KONG_NGINX_PROXY_PROXY_BUFFER_SIZE`
  - `ASSET=ce`
  - `KONG_VERSION=3.9.3`
  - `PATH`
  - `(cmd) JWT_SECRET/SUPABASE_SERVICE_KEY/DASHBOARD_PASSWORD via secrets supabase_jwt_secret_v1/supabase_service_key_v1/kong_dashboard_password_v1`

### supabase_functions

- **Imagem:** `supabase/edge-runtime:v1.74.0`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** mem 1536M, cpu 1.0
- **IP (AtomicaBRNet):** 10.0.1.210
- **Mounts:** bind /root/supabase/docker/volumes/functions -> /home/deno/functions
- **Cmd:** edge-runtime start --main-service /home/deno/functions/main # secrets-v1
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `AI_BASE_URL`
  - `AI_ROUTER_URL`
  - `EVOLUTION_API_URL`
  - `PROMOGIFTS_SUPABASE_ANON_KEY [redigido:19f82dd74c4c]`
  - `PROMOGIFTS_SUPABASE_URL`
  - `SENTRY_DSN [redigido:74b4df7f7cc1]`
  - `SUPABASE_ANON_KEY [redigido:4a1e6ff19f60]`
  - `SUPABASE_URL=http://kong:8000`
  - `VERIFY_JWT=true`
  - `PATH`
  - `(cmd) JWT_SECRET/DB_PASS/SUPABASE_SERVICE_ROLE_KEY/EVOLUTION_WEBHOOK_SECRETS/SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY/DEEPSEEK_API_KEY/EVOLUTION_API_KEY via secrets supabase_jwt_secret_v1/supabase_db_password_v1/supabase_service_key_v1/supabase_evolution_webhook_secret_v1/deepseek_api_key_v2/evolution_api_key_v4_20260704`

### supabase_meta

- **Imagem:** `supabase/postgres-meta:v0.96.6`
- **Estado/Health:** running · health=healthy · RestartCount=0
- **Limites:** mem 512M, cpu 0.5
- **IP (AtomicaBRNet):** 10.0.1.37
- **Mounts:** nenhum
- **Cmd:** node dist/server/server.js
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `CRYPTO_KEY [redigido:52d4e8f5436d]`
  - `NODE_OPTIONS`
  - `PG_META_CRYPTO_KEY [redigido:52d4e8f5436d]`
  - `PG_META_DB_HOST=db`
  - `PG_META_DB_NAME=postgres`
  - `PG_META_DB_PORT=5432`
  - `PG_META_DB_USER=postgres`
  - `PG_META_PORT=8080`
  - `PATH`
  - `NODE_VERSION`
  - `YARN_VERSION`
  - `(cmd) PG_META_DB_PASSWORD via secret supabase_db_password_v1`

### supabase_storage

- **Imagem:** `supabase/storage-api:v1.60.4`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.246
- **Mounts:** bind /root/supabase/docker/volumes/storage -> /var/lib/storage
- **Cmd:** node dist/start/server.js
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `ANON_KEY [redigido:4a1e6ff19f60]`
  - `ENABLE_IMAGE_TRANSFORMATION`
  - `FILE_SIZE_LIMIT=52428800`
  - `FILE_STORAGE_BACKEND_PATH=/var/lib/storage`
  - `IMGPROXY_URL=http://imgproxy:5001`
  - `POSTGREST_URL=http://rest:3000`
  - `REGION=eu-south`
  - `STORAGE_BACKEND=file`
  - `TENANT_ID=stub`
  - `PATH`
  - `NODE_VERSION`
  - `YARN_VERSION`
  - `VERSION=1.60.4`
  - `(cmd) DATABASE_URL/PGRST_JWT_SECRET/SERVICE_KEY via secrets supabase_db_password_v1/supabase_jwt_secret_v1/supabase_service_key_v1`

### supabase_realtime

- **Imagem:** `supabase/realtime:v2.102.3`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.56
- **Mounts:** nenhum
- **Cmd:** /app/run.sh /app/bin/server (tini)
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `APP_NAME`
  - `DB_AFTER_CONNECT_QUERY`
  - `DB_ENC_KEY (default supabaserealtime)`
  - `DB_HOST=db`
  - `DB_NAME`
  - `DB_PORT`
  - `DB_USER`
  - `DNS_NODES`
  - `ERL_AFLAGS`
  - `METRICS_JWT_SECRET [redigido:b6177a99676f]`
  - `PORT=4000`
  - `RLIMIT_NOFILE`
  - `SECRET_KEY_BASE [redigido:0c58af4fa45a]`
  - `SEED_SELF_HOST`
  - `PATH`
  - `SLOT_NAME_SUFFIX`
  - `LANG`
  - `LANGUAGE`
  - `LC_ALL`
  - `MIX_ENV`
  - `ECTO_IPV6`
  - `(cmd) DB_PASSWORD/API_JWT_SECRET via secrets supabase_db_password_v1/supabase_jwt_secret_v1`

### supabase_analytics

- **Imagem:** `supabase/logflare:1.43.1`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.252
- **Mounts:** nenhum
- **Cmd:** sh run.sh
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `DB_DATABASE=_supabase`
  - `DB_HOSTNAME=db`
  - `DB_PORT`
  - `DB_SCHEMA=_analytics`
  - `DB_USERNAME=supabase_admin`
  - `LOGFLARE_API_KEY [redigido:bd16beb552ef]`
  - `LOGFLARE_FEATURE_FLAG_OVERRIDE`
  - `LOGFLARE_MIN_CLUSTER_SIZE`
  - `LOGFLARE_NODE_HOST`
  - `LOGFLARE_SINGLE_TENANT`
  - `LOGFLARE_SUPABASE_MODE`
  - `POSTGRES_BACKEND_SCHEMA`
  - `PATH`
  - `LANG`
  - `LANGUAGE`
  - `LC_ALL`
  - `(cmd) POSTGRES_BACKEND_URL via secret supabase_db_password_v1`

### supabase_vector

- **Imagem:** `timberio/vector:0.53.0-alpine`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.70
- **Mounts:** binds /root/supabase/docker/volumes/logs/vector.yml:ro + /var/run/docker.sock:ro
- **Cmd:** vector --config etc/vector/vector.yml
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `LOGFLARE_API_KEY [redigido:bd16beb552ef]`
  - `PATH`

### supabase_supavisor

- **Imagem:** `supabase/supavisor:2.9.5`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.240
- **Mounts:** bind /root/supabase/docker/volumes/pooler/pooler.exs:ro
- **Cmd:** migrate + supavisor eval pooler.exs + server
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `CLUSTER_POSTGRES`
  - `ERL_AFLAGS`
  - `POOLER_DEFAULT_POOL_SIZE=20`
  - `POOLER_MAX_CLIENT_CONN=100`
  - `POOLER_POOL_MODE=transaction`
  - `POOLER_TENANT_ID=1`
  - `PORT=4000`
  - `POSTGRES_DB`
  - `POSTGRES_HOST=db`
  - `POSTGRES_PORT`
  - `REGION=local`
  - `SECRET_KEY_BASE [redigido:0c58af4fa45a]`
  - `VAULT_ENC_KEY (default 'your-encryption-key-32-chars-min')`
  - `PATH`
  - `LANG`
  - `LANGUAGE`
  - `LC_ALL`
  - `MIX_ENV`
  - `RLIMIT_NOFILE`
  - `ECTO_IPV6`
  - `(cmd) POSTGRES_PASSWORD/DATABASE_URL/API_JWT_SECRET via secrets supabase_db_password_v1/supabase_jwt_secret_v1`

### supabase_imgproxy

- **Imagem:** `darthsim/imgproxy:v3.30.1@sha256:3b709e...`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** -
- **IP (AtomicaBRNet):** 10.0.1.129
- **Mounts:** bind /root/supabase/docker/volumes/storage -> /var/lib/storage
- **Cmd:** imgproxy
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `IMGPROXY_BIND=:5001`
  - `IMGPROXY_ENABLE_WEBP_DETECTION`
  - `IMGPROXY_LOCAL_FILESYSTEM_ROOT=/`
  - `IMGPROXY_USE_ETAG`
  - `PATH`
  - `VIPS_WARNING`
  - `MALLOC_ARENA_MAX`
  - `FONTCONFIG_PATH`
  - `IMGPROXY_MALLOC`
  - `AWS_LWA_READINESS_CHECK_PATH`
  - `AWS_LWA_INVOKE_MODE`
  - `AWS_LWA_ASYNC_INIT`
  - `VIPS_VECTOR`

### supabase_studio

- **Imagem:** `supabase/studio:2026.06.29-sha-20290c7`
- **Estado/Health:** running · health=healthy · RestartCount=0
- **Limites:** mem 1536M, cpu 0.5
- **IP (AtomicaBRNet):** 10.0.1.105
- **Mounts:** binds functions:ro + snippets
- **Cmd:** node apps/studio/server.js
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `AUTH_JWT_SECRET [redigido:b6177a99676f]`
  - `DEFAULT_ORGANIZATION_NAME`
  - `DEFAULT_PROJECT_NAME`
  - `EDGE_FUNCTIONS_MANAGEMENT_FOLDER`
  - `ENABLED_FEATURES_LOGS_ALL`
  - `HOSTNAME`
  - `LOGFLARE_API_KEY [redigido:bd16beb552ef]`
  - `LOGFLARE_URL`
  - `NEXT_ANALYTICS_BACKEND_PROVIDER`
  - `NEXT_PUBLIC_ENABLE_LOGS`
  - `PGRST_DB_EXTRA_SEARCH_PATH`
  - `PGRST_DB_MAX_ROWS`
  - `PGRST_DB_SCHEMAS`
  - `PG_META_CRYPTO_KEY [redigido:52d4e8f5436d]`
  - `POSTGRES_PASSWORD [redigido:b0e6e79fbc9d]`
  - `SNIPPETS_MANAGEMENT_FOLDER`
  - `STUDIO_PG_META_URL`
  - `SUPABASE_ANON_KEY [redigido:4a1e6ff19f60]`
  - `SUPABASE_PUBLIC_URL`
  - `SUPABASE_PUBLISHABLE_KEY [redigido:4a1e6ff19f60]`
  - `SUPABASE_SECRET_KEY [redigido:05300a2ae8d4]`
  - `SUPABASE_SERVICE_KEY [redigido:05300a2ae8d4]`
  - `SUPABASE_URL`
  - `PATH`
  - `NODE_VERSION`
  - `YARN_VERSION`
  - `PNPM_HOME`

### zapp-web-prod_web

- **Imagem:** `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-b58d2575f778@sha256:f6cec909...`
- **Estado/Health:** running · health=healthy · RestartCount=0
- **Limites:** mem 256M, cpu 0.5
- **IP (AtomicaBRNet):** 10.0.1.253
- **Mounts:** nenhum
- **Cmd:** nginx -g daemon off;
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `PATH`
  - `NGINX_VERSION`
  - `PKG_RELEASE`
  - `DYNPKG_RELEASE`
  - `NJS_VERSION`
  - `NJS_RELEASE`
  - `ACME_VERSION (env do app embutido na imagem; nenhuma var de app no runtime)`

### schema-drift-guard_guard

- **Imagem:** `postgres:15-alpine@sha256:cd17e2...`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** mem 128M
- **IP (AtomicaBRNet):** 10.0.1.168
- **Mounts:** volume anonimo a405eaf5... -> /var/lib/postgresql/data
- **Cmd:** loop psql check_schema_drift a cada 24h
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `TZ`
  - `PATH`
  - `GOSU_VERSION`
  - `LANG`
  - `PG_MAJOR`
  - `PG_VERSION`
  - `PG_SHA256`
  - `DOCKER_PG_LLVM_DEPS`
  - `PGDATA`
  - `(cmd) PGPASSWORD via secret supabase_db_password_v1; loop psql ops.check_schema_drift(false) a cada 86400s`

### supabase-config-backup_config-backup

- **Imagem:** `alpine:3.19@sha256:6baf43...`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** mem 64M
- **IP (AtomicaBRNet):** 10.0.1.115
- **Mounts:** volume supabase_db_config -> /src:ro
- **Cmd:** /backup.sh (intervalo 86400s -> R2)
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `INTERVAL=86400`
  - `R2_BUCKET`
  - `R2_ENDPOINT (R2 Cloudflare)`
  - `R2_PREFIX=backups/supabase-db/config`
  - `R2_RETENTION=30d`
  - `SRC=/src`
  - `TZ`
  - `PATH (creds R2 nao expostas em env - embutidas no script/imagem)`

### mcp-health-monitor_mcp-health-monitor

- **Imagem:** `alpine:3.19@sha256:6baf43...`
- **Estado/Health:** running · health=- (sem healthcheck) · RestartCount=0
- **Limites:** mem 96M, cpu 0.15
- **IP (AtomicaBRNet):** 10.0.1.148
- **Mounts:** nenhum
- **Cmd:** loop healthcheck 10 alvos, poll 120s
- **Env (nomes; sensíveis redigidos com fingerprint sha256-12):**
  - `ALERT_WEBHOOK_URL [redigido]`
  - `EVO_DEST`
  - `EVO_INSTANCE=wpp2`
  - `EVO_KEY_FILE=/run/secrets/evolution_api_key_v4_20260704`
  - `EVO_THROTTLE_MIN`
  - `EVO_URL=http://evolution:8080`
  - `FAIL_THRESHOLD=2`
  - `HTTP_TIMEOUT_SEC=15`
  - `PG_DB=evolution`
  - `PG_HOST=postgres`
  - `PG_PASS_FILE=/run/secrets/postgres_superadmin_password_v1`
  - `PG_USER=postgres`
  - `POLL_INTERVAL_SEC=120`
  - `REMINDER_EVERY=30`
  - `TARGETS (10 alvos: portainer-mcp/supabase-mcp/supabase-pttz-mcp/supabase-artes-mcp/portainer-core/n8n/redis/traefik-cert-backup/traefik-ping)`
  - `TZ`
  - `PATH`

## 5. Volumes / Mounts

**Total: 38 volumes (snapshot Portainer).**

**Named volumes relevantes (evidência `list_volumes`):**
  - evolution_instances (2024-12-10)
  - volume_swarm_certificates (2024-12-06)
  - portainer_data (2024-12-06)
  - redis_data (2024-12-10)
  - postgres_data (2024-12-10)
  - minio_data (2024-12-10)
  - supabase_db_config (2024-12-11)
  - traefik_traefik_logs (2026-07-15)
  - hermes_hermes_data (2026-07-21)
  - rabbitmq_data (2026-04-23)
  - supabase-backup_backup_data (2026-04-30)
  - clamav_clamav_db (2026-08-01)
  - openclaw_openclaw_auth/data (2026-06-10)
  - vscode-mcp_code-server-config/workspace (2026-07-14)
  - docuseal_docuseal_data (2026-04-14)
  - glitchtip_glitchtip-pg-data/uploads (2026-04-04)
  - crowdsec_crowdsec_config/data (2026-06-12)
  - metabase_metabase_data (2026-07-31)
  - gmaps_gmaps_data (2026-03-26)
  - openwebui_ollama-data/open-webui-data (2026-04-14)
  - claude-code_workspace/claude_npm/claude_home (2026-04-28)
  - github-actions-runner_runner-work (2026-08-01)
  - hermes-backup_hermes_backup_data (2026-07-21)
  - openclaw-backup_backup_data (2026-07-16)

**Volumes anônimos (lixo potencial):** 3f1f4e44..., efe787b0..., 315b2842..., c15a809d..., 2f5a05f4..., 831945ca..., a405eaf5... (schema-drift-guard pgdata), (+2)

**Mounts do stack supabase (evidência `get_container`):**
- `supabase_db` → bind `/root/supabase/docker/volumes/db/data` → `/var/lib/postgresql/data` (**PGDATA — bind mount do host, NÃO é named volume**); binds de init-scripts `/root/supabase/docker/volumes/db/*.sql`; volume `supabase_db_config` → `/etc/postgresql-custom`.
- `supabase_storage` / `supabase_imgproxy` → bind `/root/supabase/docker/volumes/storage` → `/var/lib/storage`.
- `supabase_functions` (e `supabase_studio` ro) → bind `/root/supabase/docker/volumes/functions` → `/home/deno/functions`.
- `supabase_studio` → bind `/root/supabase/docker/volumes/snippets`.
- `supabase_kong` → bind `/root/supabase/docker/volumes/api/kong.yml` → `/home/kong/temp.yml` (ro) — **kong.yml NÃO está embutido no compose**; vive no host e é expandido com secrets via `eval echo` no entrypoint.
- `supabase_vector` → binds `logs/vector.yml` (ro) + `/var/run/docker.sock` (ro).
- `supabase_supavisor` → bind `pooler/pooler.exs` (ro).
- `supabase-config-backup_config-backup` → volume `supabase_db_config` → `/src` (ro).
- `schema-drift-guard_guard` → volume anônimo `a405eaf5…` → `/var/lib/postgresql/data` (pgdata sem uso).

## 6. Rede

- **AtomicaBRNet** — overlay swarm · subnet 10.0.1.0/24 · id `40h0f38co6ow3kq3v80u0d5ke` — rede de TODOS os containers do stack supabase + zapp-web + auxiliares
- **ingress** — overlay swarm (ingress) · subnet 10.0.0.0/24 · id `en00xzpxshiiqwmopgsahmtuh` — routing mesh
- **clamav_default** — overlay swarm · subnet 10.0.2.0/24 · id `qslgl7j30zapr40ktpn62qe8r` — stack clamav
- **glitchtip_glitchtip-net** — overlay swarm · subnet 10.0.3.0/24 · id `rsrum650rmzrkxrx2ek5cufp1` — stack glitchtip
- **vscode-mcp_internal** — overlay swarm · subnet 10.0.4.0/24 · id `zn9djo333e6v83plswvhiok0s` — stack vscode-mcp
- **bridge/host/none/docker_gwbridge** — local · subnet - · id `-` — redes default do engine

Todos os containers do stack supabase, zapp-web e auxiliares estão na **AtomicaBRNet** (overlay, 10.0.1.0/24). IPs por container na seção 4.

## 7. Estado ruim (com evidência)

- **github-actions-runner_runner** — SERVICO SEM REPLICA ATIVA  
  Evidência: 6 tasks exited (Exit 1 x5, Exit 0 x1; ultima 35h atras) e NENHUMA running; list_services deseja replicas=1; imagem myoung34/github-runner:latest
- **openclaw-edge-guard_guard** — created (task nunca inicia)  
  Evidência: task 6mek2u7e... e depois ewx0iy8c... - churn de tasks 'Created' entre duas listagens (~15min); servico deseja 1 replica
- **zapp-health-guard_guard** — created (task nunca inicia)  
  Evidência: task xsayv7gd... e depois jiptcmm4... - churn de tasks 'Created'; servico deseja 1 replica
- **clamav_clamav** — exited (historico de rollover)  
  Evidência: 3 tasks antigas Exited (143): 3h/27h/2d atras; task atual running healthy
- **kong-rl-test** — exited (1) 31h  
  Evidência: container standalone (sem label de stack), imagem kong:3.9.3 - sobra de teste de rate-limit (plugin rate-limiting adicionado ao runtime do kong)

Observação: `clamav_clamav` exited (143) são tasks antigas de rollover (estado atual healthy) — não é incidente ativo.

## 8. Diff stack file × runtime (stack supabase, id 35)

- D1 kong: compose do stack supabase declara kong:3.9.1 e KONG_PLUGINS sem rate-limiting; runtime roda kong:3.9.3@sha256:62721e... com KONG_PLUGINS incluindo rate-limiting (service update 2026-08-03T14:14Z, versao 13049940) -> stack file desatualizado vs runtime.
- D2 functions: compose ainda contem EVOLUTION_API_KEY e DEEPSEEK_API_KEY em texto plano no environment (valores antigos, fps 94ffabbaf641/206566d603b4); runtime usa secrets evolution_api_key_v4_20260704 e deepseek_api_key_v2 via command (# secrets-v1) -> compose com segredos orfaos/antigos.
- D3 zapp-web-prod: durante a auditoria o servico fez rollover de imagem (a1d01703d1ce -> b58d2575f778); estado final bate com o stack file (b58d2575f778@sha256:f6cec909...), healthcheck /healthz healthy.
- D4 Segredos: compose declara 6 secrets externos; runtime do stack usa os 6 + deepseek_api_key_v2 + evolution_api_key_v4_20260704 (functions) -> secrets adicionais nao declarados no compose.
- D5 Volumes: compose declara apenas supabase_db_config (external) - confere. Dados do db (/root/supabase/docker/volumes/db/data), storage e functions sao BIND MOUNTS do host, nao named volumes gerenciados.
- D6 rest: PGRST_DB_URI com senha do authenticator em texto plano no env do container E no compose (mesmo valor, fp b0e6e79fbc9d) - exposicao em claro no runtime.
- D7 meta/studio: CRYPTO_KEY/PG_META_CRYPTO_KEY iguais (fp 52d4e8f5436d) entre compose e runtime - consistente, porem chave de criptografia estatica em claro.
- D8 Todos os 13 servicos declarados no compose do supabase estao presentes como containers running (sem servico faltante).
- D9 Nenhum servico do stack supabase em crash; o cenario historico 'supabase_meta Exited 137' NAO esta presente hoje - meta running healthy (recriado 2026-08-04T16:29Z).

## 9. Contagem total e resumo de saúde

- **Containers: 96** (84 running = 87.5% · 10 exited · 2 created).
- **Stack supabase: 13/13 running** · healthchecks ativos e **healthy**: supabase_db (pg_isready), supabase_kong (kong health), supabase_meta (/health), supabase_studio (/api/platform/profile), zapp-web-prod_web (/healthz).
- **Sem healthcheck definido** (running, porém sem sonda): rest, auth, functions, storage, realtime, analytics, vector, supavisor, imgproxy e os auxiliares schema-drift-guard / config-backup / mcp-health-monitor.
- **Serviços com problema:** github-actions-runner_runner (sem réplica ativa), openclaw-edge-guard_guard (created), zapp-health-guard_guard (created).

## Anexo A — Fingerprints de segredos observados (sha256|cut -c1-12, valores nunca impressos)

  - JWT_SECRET (supabase): `sha256:b6177a99676f`
  - POSTGRES_PASSWORD / senha authenticator (PGRST_DB_URI): `sha256:b0e6e79fbc9d`
  - SUPABASE_ANON_KEY: `sha256:4a1e6ff19f60`
  - SUPABASE_SERVICE_KEY / SECRET_KEY: `sha256:05300a2ae8d4`
  - CRYPTO_KEY / PG_META_CRYPTO_KEY (meta+studio): `sha256:52d4e8f5436d`
  - SECRET_KEY_BASE (realtime+supavisor): `sha256:0c58af4fa45a`
  - LOGFLARE_API_KEY (analytics+vector+studio): `sha256:bd16beb552ef`
  - PROMOGIFTS_SUPABASE_ANON_KEY (functions): `sha256:19f82dd74c4c`
  - EVOLUTION_API_KEY (compose antigo): `sha256:94ffabbaf641`
  - DEEPSEEK_API_KEY (compose antigo): `sha256:206566d603b4`
  - SENTRY_DSN (functions): `sha256:74b4df7f7cc1`

## Anexo B — Notas metodológicas

- Coleta em 2026-08-04 ~15:10–15:20 BRT (system_time docker info: 15:12:19-03:00). Durante a coleta, o serviço `zapp-web-prod_web` fez rollover (task `w52czlq…` → `dcspci16…`), o que foi registrado e reconciliado (estado final bate com o stack file).
- RestartCount=0 em todos os containers inspecionados do stack (sem crash loop no histórico Docker).
- `01_runtime.json` contém a mesma informação em formato estruturado (inventário completo dos 96 containers com image/mounts/networks/status).
