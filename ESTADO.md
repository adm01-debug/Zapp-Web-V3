# ESTADO.md — Registro do que esta LIGADO

> Fonte unica de verdade sobre **estado operacional**, nao sobre arquitetura.
> Uma pergunta por componente: **esta ligado? quem chama?**
> Nao adicione secao de arquitetura, plano ou roadmap aqui. Isso morre em `docs/`.

Ultima verificacao: **2026-08-08**

## Como foi medido

Chamador = invocacao real: `invoke('nome')` ou `functions/v1/nome`.
Mencao em teste, doc ou migration historica **nao** conta como chamador.

Fontes cruzadas nesta verificacao:

| Fonte | Resultado |
|---|---|
| Arquivos do repo escaneados | 2.911 |
| Edge functions encontradas | 107 |
| pg_cron jobs no banco | 162 (apenas `nps-daily-trigger` chama edge fn) |
| Workflows N8N | 254 (138 ativos) — **nenhum** chama edge fn |
| Cloudflare Workers | nao verificado nesta rodada |

## Resumo

| Grupo | Qtd | Acao |
|---|---|---|
| A — chamada pelo front | 72 | manter |
| B — chamada por outra edge fn | 3 | manter |
| C — chamada por cron ativo | 0 | manter |
| D — infra/chamador externo por design | 10 | manter |
| E — VERIFICAR antes de decidir | 4 | investigar |
| F — SEM CHAMADOR identificado | 18 | candidata a arquivar |

**22 de 107 funcoes sem chamador confirmado.**

---

## F — SEM CHAMADOR identificado (candidatas a arquivar)

Nenhum chamador em: front, outra edge function, cron ativo, N8N.
Decisao de arquivar e do responsavel — esta lista e diagnostico, nao sentenca.

| Funcao | Mencoes em teste | Mencoes em doc |
|---|---|---|
| `ai-auto-tag` | 0 | 0 |
| `auto-close-conversations` | 0 | 0 |
| `cleanup-rate-limit-logs` | 0 | 0 |
| `client-observability` | 0 | 0 |
| `contact-media` | 0 | 0 |
| `db-health-monitor` | 0 | 0 |
| `email-health` | 0 | 1 |
| `evolution-bitrix-sync` | 0 | 0 |
| `evolution-retry-metrics` | 0 | 0 |
| `fetch-whatsapp-avatar` | 0 | 0 |
| `file-security-scanner` | 0 | 0 |
| `followup-bridge` | 0 | 0 |
| `lgpd-scheduled-jobs` | 0 | 0 |
| `login-attempts` | 1 | 0 |
| `provider-router` | 0 | 0 |
| `recover-corrupted-audios` | 0 | 0 |
| `send-rate-limit-alert` | 0 | 0 |
| `send-scheduled-report` | 0 | 0 |

## E — VERIFICAR

Referenciadas no squash canonico de migrations, mas **nenhum pg_cron ativo as chama**.
Verificar se ha trigger SQL, chamada externa ou se o agendamento foi perdido.

- `auto-escalate-sla`
- `cleanup-storage-orphans`
- `queue-rebalance`
- `sicoob-outbox-consumer`

## D — Infra / chamador externo por design

**Nao arquivar.** Ausencia de chamador no codigo e esperada.
`main` e o router interno do Supabase Edge Runtime.

- `evolution-webhook`
- `health`
- `health-check`
- `main`
- `mcp`
- `mcp-query`
- `mcp-server`
- `metrics`
- `public-api`
- `status`

## C — Chamada por cron ativo


## B — Chamada por outra edge function

- `email-track-link` <- supabase/functions/gmail-send/index.ts
- `email-track-pixel` <- supabase/functions/gmail-send/index.ts
- `talkx-send` <- supabase/functions/talkx-control/index.ts, supabase/functions/talkx-scheduler/index.ts

## A — Chamada pelo front

<details><summary>72 funcoes</summary>

- `ai-churn-analysis`
- `ai-classify-tickets`
- `ai-conversation-analysis`
- `ai-conversation-summary`
- `ai-enhance-message`
- `ai-proxy`
- `ai-router`
- `ai-suggest-reply`
- `ai-transcribe-audio`
- `approve-password-reset`
- `automation-suggest-reply`
- `batch-fetch-avatars`
- `bitrix-api`
- `chatbot-l1`
- `classify-audio-meme`
- `classify-sticker`
- `connection-health-check`
- `connection-test`
- `contacts-import`
- `create-user`
- `csat-auto-send`
- `detect-new-device`
- `elevenlabs-dialogue`
- `elevenlabs-scribe-token`
- `elevenlabs-sfx`
- `elevenlabs-tts`
- `elevenlabs-tts-stream`
- `elevenlabs-voice`
- `email-imap-bridge`
- `evolution-api`
- `evolution-credentials`
- `evolution-sync`
- `evolution-templates`
- `get-mapbox-token`
- `get-sip-password`
- `gmail-oauth`
- `gmail-send`
- `gmail-sync`
- `gmail-token-refresh`
- `gmail-webhook`
- `instance-pause-control`
- `migrate-media-storage`
- `nps-scheduler`
- `promogifts-catalog`
- `provider-healthcheck`
- `recheck-webhook-signature`
- `reprocess-failed-messages`
- `secure-upload`
- `send-email`
- `sentiment-alert`
- `sicoob-bridge`
- `sicoob-bridge-reply`
- `sla-alert-forward`
- `sla-alert-log-failure`
- `speech-to-text`
- `talkx-add-recipients`
- `talkx-control`
- `talkx-scheduler`
- `ticket-router`
- `virustotal-test`
- `voice-agent`
- `voice-changer`
- `voice-copilot-action`
- `webauthn`
- `webhook-diagnostic`
- `webhook-hmac-selftest`
- `webhook-secret-status`
- `whatsapp-cloud-api`
- `whatsapp-cloud-secrets-status`
- `whatsapp-cloud-send`
- `whatsapp-cloud-webhook`
- `whatsapp-cloud-webhook-verify`

</details>

---

## Regra permanente

Toda edge function nova declara seu chamador neste arquivo no mesmo commit que a cria.
Sem chamador declarado, a funcao nao entra.

`pronto` = **ligado em producao com trafego real**. Codigo existir nao e pronto.

Reexecutar a medicao: `node /workspace/scripts/audit-edge-callers.mjs`
