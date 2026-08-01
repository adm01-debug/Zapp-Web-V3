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
