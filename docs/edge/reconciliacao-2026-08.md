# Reconciliação Edge Functions main ↔ Produção — 2026-08-01
> **Fase E2 do plano** — decisão consciente sobre as 127+ funções, função a função.
> Insumos: `prod-snapshot` (espelho byte-a-byte, commit e31ad4d8), diff canônico `docs/edge/drift-2026-08-01.diff`.
> Método: 26 agentes paralelos classificaram cada função com evidência (diff + código bilateral + schema real do DB + probes ao vivo).

## Resumo
| Balde | Qtd | Ação |
|---|---|---|
| **A — Produção vence** | 5 | Merge prod-snapshot → main |
| **B — Repo vence** | 112 | Deploy do main na Fase E3 |
| **C — Merge manual** | 3 | Resolução manual com teste |
| **D — Ruído/remover** | 11 | Normalizar, remover artefatos |

**Total: 131 entradas classificadas.**

## A — Produção vence (merge prod→main)
| Função | Justificativa |
|---|---|
| ai-classify-tickets |  |
| backfill-messages |  |
| evolution-api | PRODUÇÃO VENCE: 820 vs 147 linhas, +51KB, ~100 actions, auth dual-backend, anti-instância-fantasma. Promover para main como base + re-adicionar Sentry |
| lgpd-scheduled-jobs |  |
| migrate-helper | produção já deletou; repo main AINDA TEM ACCESS_KEY commitada → remover do repo + rotacionar |

## B — Repo vence (deploy do main na E3)
| Função | Nota |
|---|---|
| _shared |  |
| ai-auto-tag |  |
| ai-churn-analysis |  |
| ai-conversation-analysis |  |
| ai-conversation-summary |  |
| ai-enhance-message |  |
| ai-proxy |  |
| ai-router | produção escreve em notifications (errada; canônica zapp.app_notifications); main com auth |
| ai-suggest-reply |  |
| ai-transcribe-audio |  |
| analyze-external-db | sem auth + amostra de 3 linhas por tabela (vaza conteúdo); main v2.0 fail-closed |
| approve-password-reset |  |
| audio-transcribe |  |
| auto-close-conversations |  |
| auto-escalate-sla |  |
| automation-suggest-reply |  |
| batch-fetch-avatars |  |
| bitrix-api |  |
| chatbot-l1 |  |
| classify-audio-meme |  |
| classify-emoji |  |
| classify-sticker |  |
| cleanup-rate-limit-logs |  |
| cleanup-storage-orphans |  |
| client-observability |  |
| connection-health-check | probe ao vivo: deployada quebrada; main com auth |
| connection-test |  |
| contact-media |  |
| contacts-import |  |
| create-user | produção QUEBRADA em runtime (ReferenceError authorizeRoles); main upsert+rollback |
| detect-new-device |  |
| elevenlabs-agent-token |  |
| elevenlabs-dialogue |  |
| elevenlabs-scribe-token |  |
| elevenlabs-sfx |  |
| elevenlabs-sts |  |
| elevenlabs-tts-stream |  |
| elevenlabs-voice |  |
| elevenlabs-voice-design |  |
| elevenlabs-webhook | produção fail-open sem secret + comparação não timing-safe |
| email-imap-bridge |  |
| email-track-link |  |
| email-track-pixel |  |
| evolution-bitrix-sync |  |
| evolution-chatbot |  |
| evolution-credentials |  |
| evolution-followup |  |
| evolution-health |  |
| evolution-retry-metrics |  |
| evolution-sender | produção v6.0 sem auth: qualquer request processa a fila! |
| evolution-sentiment |  |
| evolution-sync |  |
| evolution-templates |  |
| external-db-bridge | service_role sem allowlist: qualquer usuário escreve em qualquer tabela; main: RLS + allowlist 8 RPCs |
| external-db-proxy | v1.5 sem requireUser, exploit 62.577 msgs confirmado; Kong bloqueado; deploy v1.10 na E3 |
| fetch-whatsapp-avatar |  |
| file-security-scanner |  |
| get-mapbox-token |  |
| get-sip-password |  |
| gmail-health |  |
| gmail-oauth |  |
| gmail-send |  |
| gmail-sync |  |
| gmail-token-refresh |  |
| health-check | deployada QUEBRADA (probe 200 sem auth); main é a versão moderna (Deno.serve, erro genérico) — nota: sem requireUser, público por design; divergência é de qualidade, não de gate |
| hello |  |
| instance-pause-control |  |
| login-attempts | produção roda bug de lock que nunca escala (brute-force); main corrigiu 2026-07-16 |
| main | CRÍTICA: produção roda template vanilla sem allowlist; E24 aplica allowlist no main/index.ts |
| mcp-server |  |
| migrate-media-storage |  |
| outlook-oauth |  |
| promogifts-catalog |  |
| provider-healthcheck |  |
| provider-router |  |
| proxy-health |  |
| proxy-metrics |  |
| public-api |  |
| queue-rebalance |  |
| recheck-webhook-signature |  |
| recover-corrupted-audios |  |
| reprocess-failed-messages |  |
| secure-upload |  |
| seed-teams-users |  |
| send-email |  |
| send-rate-limit-alert |  |
| send-scheduled-report |  |
| sentiment-alert |  |
| sicoob-bridge |  |
| sicoob-bridge-reply |  |
| sicoob-outbox-consumer | não deployada no self-hosted mas legítima; deploy na E4 + CRON_SECRET |
| sla-alert-forward | HMAC SLA_ALERT_WEBHOOK_SECRET; produção sem auth |
| sla-alert-log-failure |  |
| speech-to-text |  |
| talkx-add-recipients |  |
| talkx-control |  |
| talkx-scheduler | usa CRON_SECRET (ausente); provisionar na E3 |
| talkx-send |  |
| ticket-router |  |
| virustotal-test |  |
| voice-agent | produção removeu bloco de auth inteiro |
| voice-changer | produção removeu TODA autenticação |
| webauthn | produção usa getClaims (decode client-side) + removeu rate limit |
| webhook-diagnostic |  |
| webhook-hmac-selftest |  |
| webhook-secret-status |  |
| whatsapp-cloud-api |  |
| whatsapp-cloud-secrets-status |  |
| whatsapp-cloud-send |  |
| whatsapp-cloud-webhook | produção: token não timing-safe, strict fail-open, perdeu statuses |
| whatsapp-cloud-webhook-verify |  |
| whatsapp-webhook | produção removeu HMAC X-Hub-Signature-256 (fail-closed) |

## C — Merge manual
| Função | Justificativa |
|---|---|
| elevenlabs-tts | MERGE: main requireUser quebraria frontend (chama fetch cru com Bearer) — validar fluxo antes |
| gmail-webhook | MERGE: segurança do main (push token, ownership) sobre contrato gmail_accounts de produção |
| voice-copilot-action | MERGE: main tem requireUser+rate limit mas precisa adaptar ownership a workspace_id; prod sem auth |

## D — Ruído / remover
| Função | Nota |
|---|---|
| _test | artefato de teste puro; remover do repo |
| deno.json | órfão só em produção; remover |
| e2e-fixtures | bloqueada no Kong; remover |
| e2e-webhook-fixture | bloqueada no Kong; remover |
| evolution-webhook |  |
| gmail-tests.test.ts | arquivo de teste solto; remover |
| health | exclusiva cloud (gatekeeper Prometheus planejado); não deployar no self-hosted por ora |
| mcp | AUTO-GERADO @lovable.dev/mcp-js, exclusiva cloud; manter só no cloud ou remover |
| metrics | exclusiva cloud; health-check do self-hosted cobre |
| nps-scheduler | exclusiva cloud (CRON_SECRET); decidir em E4 se deploya no self-hosted |
| tests | artefato de teste (webhook-fuzzer); remover |

## Decisões especiais
- **evolution-api (A)**: promover versão de produção como base do main; re-adicionar `initSentry` e body-array check. Tratar como projeto próprio (E17).
- **gmail-webhook (C)**: portar do main auth fail-closed do push Pub/Sub + ownership registerWatch SOBRE o contrato `gmail_accounts` de produção (colunas watch_expiry/watch_resource/history_id/token_expiry/is_active).
- **migrate-helper (A-remoção)**: produção já deletou; **remover do repo main AGORA** (ACCESS_KEY `7bdebc20...` commitada) + rotacionar SERVICE_ROLE_KEY.
- **_shared (B)**: resolver primeiro (E19) — adições `*-legacy.ts` + README + teste são ruído; core `auth.ts`/`db-client.ts`/`validation.ts` idênticos nos dois lados.
- **`.bak` (E20)**: 20 arquivos em produção, nenhum importado — remover do snapshot.
- **main (B-CRÍTICO)**: produção roda template vanilla; a allowlist E24 já está aplicada em `supabase/functions/main/index.ts`.

---

## Adendo — validação de segunda sessão (01/08/2026 ~16:30 UTC)

Executado em paralelo pela sessão de orquestração; **complementa e REVISA parcialmente** as seções acima (as revisões de classificação estão marcadas como propostas — as tabelas A/B/C/D da seção 2 permanecem a fonte até decisão na E3).

### Gate de autenticação — suíte real (E28, parcial)
| Teste | Resultado | Evidência |
|---|---|---|
| Fora da allowlist, sem token | **401** | `evolution-api`, `ai-router` → 401 |
| Token inválido | **401** `Invalid JWT` | `ai-router` com `Bearer token-invalido` |
| Allowlist sem token | **≠401** | `status` → 200; `evolution-webhook` GET → 405; `login-attempts` → 400 |
| Webhook sem HMAC | **fail-closed** | `evolution-webhook` → 401 `Missing webhook signature`; `whatsapp-cloud-webhook` → 503 `webhook_not_configured`; `gmail/elevenlabs-webhook` → 500 (nenhum devolve dado). Nota `elevenlabs-webhook`: a seção C acima descreve produção como fail-open sem secret; o 500 observado (exceção por secret ausente) na prática não processa o payload — provisionar `ELEVENLABS_WEBHOOK_SECRET` (E25) elimina o comportamento indeterminado. |
| JWT válido em função protegida | passa o gate | `connection-health-check` com JWT service_role → 401 da função (`user session required` = requireUser ativo) |

**Contagem real da allowlist: 31 funções** (`PUBLIC_FNS` em `main/index.ts`, linhas 18–52). Nenhuma função perigosa presente (`external-db-*`, `mcp`, `metrics`, `hello`, `virustotal-test`, `gmail-tests.test.ts` fora).

### Regressão da allowlist (E24-b) — SEM regressão encontrada
`approve-password-reset` (painel admin logado), `detect-new-device` (hook só roda com `access_token`), `webauthn` (registration exige user; login passkey é action-based no mesmo endpoint), `create-user` (admin): todos os fluxos do frontend enviam JWT via `supabase.functions.invoke`. O 401 sem token é o gate funcionando como projetado.

### Reteste das funções de dados com JWT válido (F1.5) — REVISÃO PROPOSTA
> As tabelas acima classificam `external-db-proxy` como B (deploy v1.10 na E3). O reteste abaixo **propõe** balde D (remoção) para as três, com base em 0 consumidores no frontend (`src/` não chama nenhuma) — a decisão final pertence à E3, não está tomada por este adendo.

| Função | Sem token | Com JWT authenticated | Proposta |
|---|---|---|---|
| `external-db-proxy` | 404 (Kong) | **401 interno** (`User from sub claim does not exist`) | D (remover) — viva, protegida, 0 consumidores |
| `external-db-bridge` | 404 (Kong) | **404** | D (remover) — morta |
| `analyze-external-db` | 404 (Kong) | **401 interno** (`Invalid or expired token`) | D (remover) — viva, protegida, 0 consumidores |

### E20 executado — `.bak` movidos
Os **20 `.bak`** foram movidos do diretório servido para `/home/deno/functions/.backups/shared-bak-20260801/` (grep prévio: 0 imports). Fora do `.backups`: **0**.

### F0 — artefatos imutáveis
- Tarball: `/home/deno/functions/.backups/prod-functions-20260801.tgz` (sha256 `28d4cedbe62f11f70b158030c33a642b7ba18642b729ede25b27b1059961cb14`)
- Manifesto: `docs/edge/manifest-prod-20260801.md5` (124 index.ts + 49 `_shared`)
- **Volume: 124 funções com `index.ts`** (127 entradas de diretório − 3 sem index.ts: `_shared/`, `auth-email-hook/` [só testes], `gmail-tests.test.ts` [arquivo solto]). `hello/` TEM index.ts (balde B, alinhado com a CSV).

### F6.6 — gate spec viva ≡ YAML ✅
`docker service inspect supabase_functions` → `Mounts: [{Source: /root/supabase/docker/volumes/functions, Target: /home/deno/functions, Type: bind}]`, `VERIFY_JWT=true`, 4 secrets — idêntico ao YAML versionado. Qualquer `docker stack deploy` com YAML divergente destrói a allowlist (risco documentado no plano).

### E26 — secrets ausentes no env do container (amostra crítica)
`CRON_SECRET`, `WHATSAPP_CLOUD_APP_SECRET`, `WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `ELEVENLABS_WEBHOOK_SECRET`, `WEBHOOK_SECRET`, `GMAIL_PUBSUB_TOKEN`, `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_*`, `BITRIX_WEBHOOK_URL`, `RESEND_API_KEY`, `VIRUSTOTAL_API_KEY`, `SICOOB_GIFTS_URL`, `SICOOB_GIFTS_BRIDGE_SECRET` (88 candidatas no grep bruto; triagem fina em `env-gap.md`). **Nenhuma causa fail-open** (webhooks 401/503/500 sem HMAC).

### Achados novos (fora do escopo E0–E5, registrar)
1. **Bug latente de criação de usuário**: `POST /auth/v1/admin/users` falha com `23503 agent_stats_profile_id_fkey` — trigger `artes.handle_new_auth_user()` roda antes da criação do profile para users criados via admin API. Fluxo de signup do frontend pode estar usando caminho alternativo; investigar separadamente.
2. **Secret scanning do GitHub: 0 alertas** — a `ACCESS_KEY` do migrate-helper não foi detectada automaticamente; a remoção do repo (PR #666) + rotação pendente são a única mitigação.
3. **Cloud cron**: apenas `purge_query_telemetry_daily` (jobid 1) — bate com relatorio-e0.

### E32-complete (PR complementar)
A suíte E2E ainda continha código apontando para as fixtures removidas (morto, mas quebrado por design): `e2e/utils/seed.ts` (0 imports) e `e2e/webhook-providers-parity.spec.ts` (descontinuada no workflow, chamava `e2e-webhook-fixture`) + `cleanupWebhookProviderE2E`. **Removidos** neste PR. `cleanupTestData` preservado (usa `rpc_e2e_cleanup`, sem edge function).

> Nota: `docs/edge/inventario-109.csv` (E15) — as colunas `decisao` e `responsavel` estão vazias por design; preenchimento é a fase seguinte (E3), após ground truth das críticas.

