# Validação Exaustiva — Plano de Melhorias 100 (2026-08-20)

> Análise de sistemas sênior sobre o `PLANO_MELHORIAS_100.md` (auditoria de
> 2026-08-20, commit auditado `52230a5ef962`). Cada etapa foi validada contra o
> **HEAD atual** (`7a63f35` + esta sessão) **e contra a infraestrutura viva** —
> Supabase self-hosted (SQL direto), Portainer/Swarm (stacks/containers/exec),
> bundles de produção dos 3 hosts (download + análise criptográfica das chaves),
> R2 (listagem de backups), Vercel (API) e Sentry.
>
> **Legenda:** ✅ implementado 100% · 🔧 implementado com correções/ajustes
> (resolvido por caminho diferente/melhor — explicado) · ▶️ implementado **nesta
> sessão** · 🟡 parcial (backlog claro) · N/A não se aplica mais.

## Placar geral

| Situação | Qtde |
|---|---|
| ✅ Já implementado 100% (validado ao vivo) | **47** |
| ▶️ Implementado **nesta sessão** | **15** |
| 🔧 Implementado com correções/ajustes | **21** |
| 🟡 Parcial — backlog objetivo registrado | **16** |
| N/A (deixou de existir o alvo) | **1** |
| ❌ Não implementado e sem ação | **0** |

**Resultado: 62/100 etapas concluídas (+ 1 N/A, alvo deixou de existir), 21
concluídas com ressalvas documentadas, 16 com pendência objetiva (dono/janela
definidos abaixo). Nenhuma etapa ficou sem tratamento.**

### 🔴 Achados NOVOS desta validação (fora do plano original)

1. **P0 — Offsite do backup do supabase-db parado desde 2026-08-10**
   (`OFFSITE_FAILED_20260810_211518` no stack 124; local saudável com dumps de
   hoje). Runbook com diagnóstico e conserto: `infra/runbooks/RESTORE_DRILL.md`.
   Suspeita nº 1: rotação R2 (stack 261, criado 08-13) sem atualizar o consumidor.
2. **P1 — Canal realtime silencioso em produção**: `zapp.failed_messages` e
   `zapp.dispatch_error_logs` estavam FORA da publication `supabase_realtime`
   (o hook `useFailedMessageAlerts` assinava um canal morto). **Corrigido** pela
   migration `20260821001000` (▶️).
3. **P1 — CLAUDE.md ensinava a topologia INVERTIDA**: afirmava tabelas físicas
   `evolution_*` em `zapp` e mandava assinar realtime em `zapp` — o banco vivo
   (pg_class/pg_publication_tables) e o próprio código de produção provam o
   contrário (físicas em `evo`; hooks assinam `evo`). Um agente que seguisse o
   CLAUDE.md criaria subscriptions silenciosas. **Corrigido** (▶️).
4. **P1 — Enforcement cego no smoke diário de auth**: `edge-auth-smoke.yml`
   avaliava `inputs.verify_jwt_enabled == true` → `false` em `schedule`; a
   rodada diária nunca falhava. **Corrigido** (▶️).
5. **P2 — Lacunas no daily do evolution-db no R2**: faltam 09, 11, 12, 13 e
   16/08 na janela de 14 dias (runs falharam nesses dias).
6. Drill de restore **já tinha sido executado** em 2026-08-17 (E93) com **19
   erros ignorados** — 2 causas reais catalogadas no runbook (FK órfã em
   `evolution_whatsapp_status`; `mv_system_status` ausente).

---

## Bloco A — Credenciais, chaves e segredos

| # | Status | Veredito e evidência |
|---|---|---|
| 1 | ✅ | Resolvido por caminho superior: **Vercel aposentada** — team `juca1` sem NENHUM projeto zapp (API Vercel, 2026-08-20). Bundle servido (VPS) contém só anon válida. |
| 2 | N/A | Não há mais env na Vercel para localizar — projeto não existe. |
| 3 | ✅ | Rotação do JWT secret invalida qualquer service_role antiga por assinatura; bundle dos 3 hosts baixado nesta sessão: **1 único JWT, `role=anon`**; `bundle-secret-guard` + gate pré-PUT barram regressão. |
| 4 | ✅ | **Prova criptográfica nesta sessão**: anon do bundle NÃO verifica contra o secret demo público do Supabase (`super-secret-jwt-token-with-at-least-32-characters-long`) — HMAC-SHA256 recalculado ≠ assinatura. Secret ativo: próprio, 40 caracteres, em `/run/secrets/supabase_jwt_secret_v1` (reconciliação 2026-08-20). |
| 5 | ✅ | anon v2 + service v3 assinadas pelo novo secret e propagadas (secrets Swarm `supabase_anon_key_v2`/`supabase_service_key_v3`; PID1 do edge-runtime conferido). |
| 6 | ✅ | Secret GitHub corrigido (incidente 2026-08-20) + blindagem tripla: preflight `check-deploy-secrets.mjs` (valida no Kong), gate pré-PUT, guard pós-deploy diário. ▶️ guard migrado de `ubuntu-latest` p/ runner `vps-zapp` (não fica preso em fila). |
| 7 | ✅ | `vault.supabase_service_role_key` atualizado 2026-08-10 (pós-rotação). |
| 8 | ✅ | Kong: anon canônica → `rest`=200/`auth`=200 (reproduzido nesta sessão); chaves de outro ambiente → 401 (reconciliação). A "inconsistência" era isso: o Kong valida assinatura — demo caiu. |
| 9 | 🔧 | `.gitleaks.toml` + `security.yml` (histórico completo `fetch-depth:0`, semanal, hard-gate). Pendente: rodar `git filter-repo` p/ limpar histórico e remover os 33 SHAs + regex de allowlist (TODO no próprio arquivo). |
| 10 | ✅ | PAT do stack 210 **saiu do compose**: Docker secret `gh_runner_pat_v2` (v4.7, 2026-08-18 — stack file conferido). |
| 11 | 🔧 | Implementada a opção "Swarm secret" (das duas propostas). GitHub App fica como evolução opcional. |
| 12 | ✅ | Vault ao vivo: **37 secrets, zero DEPRECATED/minio_*** (a faxina já ocorreu; plano citava 44). |
| 13 | 🔧 | TTL/rotação ativos **na infra** (fora do repo, por design): watchdog `creds-ttl-check` + `baileys-drop-check` (stack 232 v1.7), `evolution_api_key` sincronizada **hoje** via snapshot, snapshots de creds a cada 15min no R2. |
| 14 | ▶️ | Aliases legados **removidos**: `.env.example` (VITE_ANON_KEY, VITE_SUPABASE_PUBLIC_URL, VITE_VERSION) e fallbacks em `src/lib/env.ts`; `VITE_SUPABASE_PROJECT_ID` (lida pelo vite.config) **adicionada** ao exemplo. |
| 15 | ▶️ | **`docs/SECRETS_INVENTORY.md`** criado — inventário único (vault 37 + Swarm + GitHub + chaves públicas), com onde-vive/rotação e regras. |

## Bloco B — Edge Functions

| # | Status | Veredito e evidência |
|---|---|---|
| 16 | ✅ | Mecanismo provado: service_role vem **exclusivamente de env** (`SELFHOSTED_…` → `SUPABASE_…` → throw lazy em `db-client.ts`); o Vault **consome** a service_role. O suposto "Vault quebrado" (RPC em schema errado) era leitura só do repo: `zapp.fn_get_vault_secret` **existe em produção** com GRANT a service_role (drift das 684) — ▶️ materializada no repo (`20260821001500`). |
| 17 | ✅ | **Falso alarme confirmado por medição própria**: `/proc/1/environ` do `supabase_functions` tem `SUPABASE_SERVICE_ROLE_KEY` (207c), `ANON` (211c), `DB_URL`, `JWT_SECRET` (40c). `exec` abre shell novo sem os exports do entrypoint. |
| 18 | N/A→✅ | Nenhuma injeção necessária (consequência do 17). |
| 19 | ✅ | `edge-drift-check.yml` ativo (diário): probe HTTP por função + completude de env + hash-drift repo×volume. |
| 20 | ✅ | Diff exato refeito nesta sessão: volume=122 funções, repo=122 — **zero órfãs nos dois sentidos** (sobram no repo apenas `deno.json`/`gmail-tests.test.ts`, que não são funções). |
| 21 | 🔧 | `PROMOGIFTS_SUPABASE_URL`: **manter** — usada exclusivamente por `promogifts-catalog` (grupo A do ESTADO.md), integração com projeto Supabase externo do catálogo. Não é resíduo do banco antigo do zapp. |
| 22 | 🔧 | Zero URL cloud em runtime de produção; `client.ts` **rejeita ativamente** `.supabase.co`. Restam fixtures de teste + 1 anon key literal em doc espelho (falso-positivo classificado). Backlog: `cors.ts:14` allowlista `*.supabase.co` p/ 63 funções (apertar). |
| 23 | 🔧▶️ | Gate valida a fonte de verdade (allowlist `PUBLIC_FNS`). ▶️ Nesta sessão: **paridade `config.toml` × PUBLIC_FNS** adicionada ao `edge-schema-parity.yml` (falha em divergência) + drift real corrigido (`zapp-crm-sync` false→true). |
| 24 | 🔧▶️ | Roda diário contra produção. ▶️ Corrigido o defeito que anulava o enforcement no `schedule` (P1 acima). |
| 25 | 🟡▶️ | `_shared`: 49 módulos mapeados com matriz de importadores. ▶️ Removidos os 3 mortos (`criticalPayloadSchemas.ts`, `mode.ts`, `db-columns.ts`+teste). Backlog: unificar os **2 CORS** e desfazer o diamante `contract-schemas*`. |
| 26 | 🟡▶️ | 4/4 críticas existem; ▶️ smoke real em produção: `status` 200 · `evolution-webhook` POST sem HMAC → **401** · `public-api` sem key → **401** · `health` → 401 (interno por design, `x-health-secret`; comentário órfão no `main/index.ts` corrigido). Backlog: `health` sem teste unitário; cobertura 45/122. |
| 27 | 🟡 | Números exatos: 63 usam `cors.ts` · 54 usam o CORS do `validation.ts` · 3 wildcard `*` (`mcp-query`, `transcribe-audio-internal`, `download-wa-status-media`) · 2 sem CORS. Unificação altera comportamento de 54 funções → janela própria (mapa completo entregue). |
| 28 | 🔧 | `hmac-validation.ts` maduro (rotação multi-secret); gate validado ponta-a-ponta no smoke (401). 8 funções com HMAC ad-hoc (migração p/ o módulo = backlog; `zapp-email-inbound-webhook` prioriza — segredos via vault). |
| 29 | 🟡 | Rate-limit DB-atômico só no `evolution-webhook`; 58 usam o in-memory por-isolate; **19/26 públicas sem limiter**. Tabela completa entregue; rollout do limiter DB nas públicas = mudança de comportamento → janela. |
| 30 | 🔧 | Contract-kit consolidado: **108/122 (88,5%)** com `parseOrReject`. Drift fino no registro (124 CONTRACTS × 125 SCHEMAS × 117 imports × 108 usos) — reconciliar. |

## Bloco C — Schemas e resíduos de DB

| # | Status | Veredito e evidência |
|---|---|---|
| 31 | ✅ | Ao vivo: **36 schemas** (não 259 — a poluição era `pg_temp_*`, já limpa). Inventário com tamanhos por schema levantado nesta sessão. |
| 32 | ✅ | Núcleo classificado: `zapp` 386t/257v/670MB/992fn · `evo` 74t/33v/549MB/104fn · auth/storage/realtime. |
| 33 | 🔧 | Avaliação (era "avaliar"): `archive` = 36 tabelas / **7,6 MB** — custo de manutenção ~zero; **manter** até auditoria de conteúdo; drop não destrava nada. |
| 34 | 🔧 | `_backups` = 10 tabelas / 17 MB (artefatos de DR) — **manter**; mesmo racional. |
| 35 | ✅ | Decisão documentada (ARQUITETURA_CANONICA §3): **multi-app por design** — `financeiro`/`artes`/`bpm`/`vendas`/`email_app` são os outros painéis da casa (stacks 140/139/169/182 rodando). |
| 36 | ✅ | Ownership confirmado: apps distintos no mesmo Postgres com RLS próprio. |
| 37 | ✅ | 1 único `pg_temp` ao vivo (sessão ativa) — órfãos já limpos. |
| 38 | 🟡 | 992 fns em `zapp` confirmadas. Auditoria de mortas exige telemetria (`track_functions`) — metodologia registrada; execução em janela (ligar telemetria 7d → colher → podar). |
| 39 | 🟡 | 401 fns em `extensions` = majoritariamente das extensões instaladas; separação padrão×custom na mesma janela do 38. |
| 40 | ✅ | Mapa completo levantado: 83 FKs cross-schema no perímetro — 40+ `zapp→evo.evolution_contacts`, 25 `zapp→auth.users`, 6 `email_app→evo/zapp`, 3 `evo→ops` (vps_*), 1 `zapp→vault`. **Zero FK de negócio `evo→zapp`.** |
| 41 | ✅ | 10 `rpc_boundary_*` existentes e enumeradas (apply_lid_mappings, insert_consumer_stats, log_audit, normalize_send_jid, raise/resolve_alert, register_media, system_health_score, touch_contact, upsert_status). |
| 42 | ✅ | Drift fechado em 2026-08-20 (`MIGRATION_DRIFT_2026-08-20.md` + stamps): 0 pendentes de apply. |
| 43 | ✅ | `executed_at` existe no runtime (`supabase_migrations.schema_migrations`: version/name/statements/hash/applied_at/executed_at) — tooling atual funciona. |
| 44 | ✅ | **RLS 100%**: zero tabelas sem RLS em `zapp` e `evo` (query ao vivo). |
| 45 | ▶️ | Auditoria achou exatamente 2 pares duplicados. `zapp.idx_contact_tags_contact` **removido por migration** (`20260821002000`). O par em `evo.recon_coverage_daily` fica p/ o repo evolution-stack (fronteira de DDL — evo-ddl-gate). |
| 46 | ✅ | Bloat saudável: única tabela >5k dead tuples é `cron.job_run_details` (12k, autovacuum de hoje + cleanup diário). |
| 47 | ✅ | Retenção de webhooks **funcionando de fato**: `webhook_events_processed` com `min(processed_at)` = exatamente hoje−7d; 4 camadas de purge no cron (7d semanal + consolidado 14d diário + partições mensais + vacuum semanal). |
| 48 | 🔧 | Schema `ai`: 30 tabelas somando **616 KB** (≈vazio) — sem uso relevante; candidato a consolidação futura, sem urgência. |

## Bloco D — Infra, Docker e Swarm

| # | Status | Veredito e evidência |
|---|---|---|
| 49 | ▶️ | **Executado**: `buildx_buildkit_builder-45df83d7…` (5 dias, órfão do setup-buildx antigo) removido do host. |
| 50 | ▶️ | **Executado**: `buildx_buildkit_hk-builder0` (2 dias) removido. Mantidos: `atomica-zapp0` (builder nomeado ativo do CI) e `b4b9a290…` (recente — reavaliar no próximo housekeeping). |
| 51 | 🟡 | Avaliação entregue: 5 runners zapp (3×4G/2cpu + 2×2G/1cpu) + 1 evo — justificados pela concorrência atual de CI (e2e + deploy + gates). Reduzir p/ 4 é seguro se aceitar fila em pico; decisão do dono. |
| 52 | ▶️ | **Investigado** (o que a etapa pedia): projeto docker-compose local `redelab` (7 containers, 4 dias, imagens locais pc1/pc2/er605/modem/internet claro+vero) = laboratório de simulação de rede coabitando o host de produção. Recomendação: mover p/ máquina de lab ou `docker compose down` quando ocioso — consome CPU/RAM do host crítico. |
| 53 | 🟡 | Spot-check: serviços críticos (web, supabase core, evolution, consumer, grafana…) com `(healthy)`; watchdogs alpine sem HC por design (sleep-loop). Padronizar HC nos watchdogs = cosmético. |
| 54 | 🔧 | 256M/0.5cpu p/ nginx estático é adequado; monitorado por cadvisor — painel novo (etapa 92) inclui gráfico com threshold em 200/250MB. |
| 55 | 🟡 | Inventário dos ~30 watchdogs entregue (ag6 w1–w9 + evolution-watchdogs + guards + obs-*). Consolidação num serviço único = projeto de infra (recomendação: 1 scheduler + config declarativa, manter isolamento de secrets por probe). |
| 56 | ▶️🔴 | **Validação executada** — resultado misto: evolution-db diário no R2 ✅ (dump de hoje 02:00, 81MB) **mas com 5 dias faltando**; supabase-db local ✅ (2 dumps hoje, sha256, 33 cópias) **offsite R2 PARADO desde 08-10** (P0 — runbook com diagnóstico). |
| 57 | 🔧 | **Drill de restore já executado em 2026-08-17** (E93; descoberto nesta validação) — completou com 19 erros ignorados; 2 causas reais catalogadas. `infra/runbooks/RESTORE_DRILL.md` (▶️) define o ciclo trimestral e o critério de 0 erros. |
| 58 | 🟡 | crowdsec-bouncer ativo nos 3 routers (stack file conferido); auditoria da allowlist do crowdsec não coube nesta sessão — pendência anotada. |
| 59 | 🔧▶️ | NNP presente no stack 210; ▶️ adicionado ao compose inline do deploy e ao versionado do 157 (o serviço web não tinha). |
| 60 | ✅ | Certificados LE verificados de dentro da VPS: zapp 23/10 · apex 05/11 · www 18/11 · supabase 23/10 — renovação automática funcionando (www emitido hoje). |
| 61 | ✅ | Pressão de disco gerenciada: housekeeping/deep-clean/actioner + prune pós-deploy + retenção GHCR; sem incidente ativo. |
| 62 | ✅ | `stack-change-alert` (stack 269) rodando. |

## Bloco E — CI/CD e deploy

| # | Status | Veredito e evidência |
|---|---|---|
| 63 | 🔧▶️ | Draft com `push` desativado (só dispatch); ▶️ concurrency unificado (`deploy-vps-v3`) — fecha o último vetor de double-deploy (dispatch paralelo). |
| 64 | ✅ | `paths-ignore` (`**.md`, `docs/**`) desde `e1d1756` — push docs-only não deploya. |
| 65 | 🟡▶️ | Arquivo versionado existe e ▶️ agora **espelha produção** (zapp-net adicionada; cap_drop inviável removido; NNP). Falta a unificação de fonte (deploy ler o arquivo em vez do heredoc) — follow-up de baixo risco. |
| 66 | ▶️ | **Convergência verificada portada ao canônico**: aguarda `UpdateStatus=completed` (timeout 300s), detecta `rollback_completed/paused`, confere imagem SHA e replicas N/N; escape `ENFORCE_CONVERGENCE=0`. |
| 67 | 🔧▶️ | Triagem concluída: 5 removidos, 2 mitigados, 1 pendente (`migration-smoke-test`). ▶️ Doc atualizado e movido p/ `docs/ci/`. |
| 68 | 🟡▶️ | ▶️ `post-deploy-check.yml` **removido** (duplicava 100% o job do deploy). Restantes mapeadas: parse-gate×edge-deploy, PUBLIC_FNS em 2 gates, schema-drift×zapp-schema-drift-gate. |
| 69 | ✅ | `branch-protection-sentinel` ativo (PR quality + auditoria diária; modo forte requer `BRANCH_PROT_PAT`). |
| 70 | 🟡 | Gate existe (pós-facto em push na main). Endurecimento especificado (rodar em PR, checar trailers `Co-Authored-By`, allowlist p/ fluxo gen-types) — mudança de governança de bots → decisão do dono antes de aplicar. |
| 71 | ▶️ | Retenção GHCR **coerente**: valor 30 + título + comentários + draft alinhados (antes: código 30, docs "9", draft 9). |
| 72 | ✅ | `check-deploy-secrets.mjs` cobre os 4 críticos + 3 validações semânticas (anti-cloud, anti-service_role, aceitação no Kong). `PORTAINER_*` verificado no job de deploy. Sem validação: `ALERT_WEBHOOK_URL`/`GH_TOKEN_ACTIONS` (anotado). |
| 73 | 🔧 | Proteção de tags robusta (normalização fail-closed) + rollback via dispatch `image_tag`. Sem workflow dedicado de rollback; lista congelada desde 08-07 → recomendação: invocar `update-rollback-protection.sh` no pós-deploy verde. |
| 74 | ✅ | `post-deploy-health` determinístico e fail-closed (TTM/PostgREST/edge), `if: always()`. |
| 75 | ✅ | Concurrency `deploy-vps-v3` + `cancel-in-progress: false`; draft agora no mesmo grupo. |
| 76 | ✅▶️ | 46/49 workflows em `vps-zapp`; ▶️ `bundle-secret-guard` migrado. Exceção restante consciente: `gen-types-zapp` (dispatch manual). |

## Bloco F — Vercel × VPS

| # | Status | Veredito e evidência |
|---|---|---|
| 77 | ✅ | Decisão tomada e executada: **VPS única**. Vercel sem projetos zapp (verificado por API). |
| 78 | ✅ | 3 domínios servidos pela VPS (routers no stack 157; DNS migrado; cert www emitido). |
| 79 | ✅▶️ | Resolvido por eliminação (`vercel.json` removido; CSP única = `nginx.conf`/`docs/csp.md`). ▶️ `manifest-src` sem `https://vercel.com` (resíduo) + comentário órfão em `linkPreviewUtils.ts` corrigido. |
| 80 | ✅ | Rewrite SPA único: `try_files … /index.html` no nginx. |
| 81 | ▶️ | Node alinhado: `.nvmrc` 20→**22** + 6 workflows 20→22 (todos os 30 usos agora em 22; `engines >=20` mantido como piso; build usa Bun). |
| 82 | ✅ | Headers de segurança únicos no nginx.conf (HSTS/XFO/nosniff/Referrer/Permissions + CSP v10) — a divergência tripla morreu com a Vercel. |
| 83 | ✅ | **Mesmo bundle nos 3 hosts** — verificado nesta sessão (mesmo asset `index-CtCUX9jA.js`, mesmos bytes, mesma anon `sha256 4a1e6ff1…`). |
| 84 | ▶️ | Domínio canônico **documentado**: `zapp.atomicabr.com.br` (rel=canonical) + aliases `zappweb.app.br`/`www` — CLAUDE.md e `docs/ARQUITETURA_CANONICA.md` (resolve a contradição interna do CLAUDE.md). |

## Bloco G — Observabilidade

| # | Status | Veredito e evidência |
|---|---|---|
| 85 | ✅ | Sentry ativo de ponta a ponta: DSN presente nos 3 bundles (verificado); eventos fluindo na org `promobrindes` (últimos há ~5h — reconexões AMQP do consumer na janela de redeploy + erros SSL p/ `evolution-webhook`; são do evolution-stack, registrados como observação). |
| 86 | ✅ | Release = git SHA: cadeia completa `deploy-vps.yml` → `Dockerfile` → `sentry.ts` conferida. |
| 87 | 🔧 | Stacks obs rodando (prometheus/cadvisor/loki/grafana + 4 pg-exporters). Validação fina de scrape-targets pendente — o dashboard novo torna isso visual. |
| 88 | 🟡 | `w5-401-flapping` ativo (stack 232). Revisão de threshold pendente; sem flapping ativo observado. |
| 89 | ✅ | `check-realtime-dead-channels` em PR+push (bloqueia subscription em view `public.*`). |
| 90 | ✅ | `health-score-anti-drift` ativo e preciso (detecção real de `CREATE OR REPLACE`, skips legítimos). |
| 91 | ▶️ | **Ligado**: `VITE_ENABLE_CLIENT_OBSERVABILITY=true` injetada no build (deploy-vps + Dockerfile). O código já estava pronto (`main.tsx`/`webVitals.ts` com circuit-breaker) mas a flag nunca chegava ao bundle. ESTADO.md atualizado (client-observability F→A com chamador declarado). |
| 92 | ▶️ | Dashboard único provisionável criado: `infra/observability/grafana/zapp-health-dashboard.json` (web+edge+evo+DB) + README de provisioning. |

## Bloco H — Higiene de repositório e documentação

| # | Status | Veredito e evidência |
|---|---|---|
| 93 | 🔧▶️ | `estado_atualizado.md` já removido (23bb8f6); ▶️ `PLANO-ESTADO.md` (plano já executado) movido p/ `docs/_archive/estado/`. Restam ESTADO.md (operacional) + ARQUITETURA_CANONICA (arquitetura) com papéis distintos e declarados. |
| 94 | ✅ | `FEATURE_REGISTRY.md` canônico; `.csv`/`.json` removidos (8d1a4f0). |
| 95 | ✅▶️ | `.hermes-pr-body.md` removido (0ea06c6); ▶️ `test.txt` (resíduo do commit "test") removido. |
| 96 | 🔧▶️ | Auditoria refeita nesta sessão: 36 vars conferidas contra o código; ▶️ `.env.example` corrigido (aliases fora; `VITE_SUPABASE_PROJECT_ID` dentro). Recomendação: gate de CI validando `.env.example`×código (não criado — evitar mais um workflow sem decisão do dono; ver etapa 68). |
| 97 | ▶️ | CLAUDE.md **corrigido contra o banco vivo** (topologia/realtime estavam invertidos — achado nº 3); contagens atualizadas (cron 239, vault 37); IPs reais → `<IP-VPS>` no CLAUDE.md e ESTADO.md (conformidade com a regra do AGENTS.md:66); contradição de domínio canônico resolvida. HERMES/AGENTS sem mudanças necessárias além disso. |
| 98 | 🟡 | Grafo stale (construído em `3fcc322`; HEAD avançou). Rebuild só roda no container claude-code da VPS (comando no CLAUDE.md, ~2,5min) — pendência operacional pós-merge (o grafo deve ser rebuildado APÓS este PR, senão fica stale de novo). |
| 99 | 🟡▶️ | ▶️ Raiz reduzida nesta sessão (test.txt, PLANO-ESTADO, zero-success → docs/ci, QUALITY-GATE-FIX-PLAN → docs/ci): 53→49 itens visíveis. Follow-up: mover os 4 relatórios de auditoria restantes (`REGRESSION_SIMULATION_REPORT`, `VALIDATION_REPORT_PHD`, `VALIDATION_PLAN_50_STEPS`, `RLS_AUDIT_REPORT`) atualizando os links que apontam para eles. |
| 100 | ▶️ | **`docs/ARQUITETURA_CANONICA.md`** criado — hosting, DB, edge, secrets, deploy, observabilidade e regras permanentes, com estado verificado ao vivo. |

---

## Execuções nesta sessão (fora do repo)

| Ação | Resultado |
|---|---|
| Remoção dos builders buildx órfãos (`hk-builder0`, `builder-45df83d7…`) | ✅ removidos; restam os 2 legítimos |
| Investigação `redelab-*` | ✅ identificado (compose local de laboratório de rede) + recomendação |
| Probes ao vivo: publication realtime, RLS, FKs, vault, cron, bloat, índices, migrations, schemas | ✅ base de evidência da matriz |
| Bundles dos 3 hosts + verificação criptográfica anti-demo-secret + smoke Kong/edge | ✅ |
| Certificados TLS dos 4 hosts (openssl de dentro da VPS) | ✅ válidos |
| Backups: listagem R2 (evolution/supabase) + inspeção do container de backup | 🔴 achou o P0 do offsite + lacunas do daily |

## Pendências priorizadas (dono/janela)

| Prioridade | Item | Ação objetiva |
|---|---|---|
| **P0** | Offsite supabase-db parado desde 08-10 | Runbook `RESTORE_DRILL.md` §2 — verificar credencial R2 (suspeita: rotação do stack 261), religar, backfill, remover marcador |
| **P1** | Lacunas no daily evolution-db (5 dias) | Ver logs do `postgres-backup-daily` nos dias falhos; avaliar retry/alerta de ausência |
| **P1** | Restore com 19 erros ignorados | Limpar FK órfã de `evolution_whatsapp_status`; tratar `mv_system_status` no fluxo de dump/restore |
| P2 | `migration-smoke-test` zero-success ativo em PR | ✅ Causa raiz consertada neste PR (PEP 668 no runner: pip global/--user recusado e erro engolido por `2>/dev/null` — o job morria no gate de sintaxe antes de aplicar qualquer migration). Fix: venv + `--break-system-packages` + erro visível |
| P2 | `zapp-schema-drift-gate` (job `drift-check`) **vermelho na `main` em todos os runs de 2026-08-20** (pré-existente a este PR) | O snapshot versionado nunca foi regenerado após o fechamento do drift das 684 migrations — 11.995 linhas divergem (ex.: funções de sentinela FDW aplicadas direto no banco). Remédio desenhado pelo próprio workflow: `workflow_dispatch` com regen do snapshot — **decisão do dono** (aceita o estado atual do banco como novo baseline versionado) |
| P2 | Rate-limit nas 19 públicas sem limiter / unificação CORS / HMAC ad-hoc ×8 | Janela de edge functions (mapas prontos nas etapas 27–29) |
| P2 | `evo.idx_recon_coverage_daily_snapshot_date` duplicado | DROP no repo **evolution-stack** (fronteira de DDL) |
| P2 | Rebuild do graphify pós-merge | Comando no CLAUDE.md (container claude-code) |
| P3 | Consolidação de watchdogs (55) · redução de runners (51) · filter-repo do histórico (9) · endurecer ai-agent-pr-policy (70) · mover 4 relatórios da raiz (99) | Decisões do dono com desenho registrado nesta matriz |
