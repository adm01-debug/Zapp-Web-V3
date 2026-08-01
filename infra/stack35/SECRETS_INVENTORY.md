# Inventário de Secrets — Edge Runtime (stack 35)

**Data:** 2026-08-01 · **Origem:** auditoria ZAPP self-hosted (etapa 32) + verificação real do container `supabase_functions` (`/proc/1/environ` + compose stack 35)

## Status dos secrets (verificado no container em 2026-08-01)

### ✅ Já presentes no container (via entrypoint/secrets da stack 35)
| Variável | Origem |
|---|---|
| `JWT_SECRET` | secret `supabase_jwt_secret_v1` (md5 bate com GoTrue: `2f18eb68...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret `supabase_service_key_v1` |
| `EVOLUTION_WEBHOOK_SECRETS` | secret `supabase_evolution_webhook_secret_v1` |
| `SELFHOSTED_SUPABASE_URL` | env fixo `https://supabase.atomicabr.com.br` |
| `SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY` | secret `supabase_service_key_v1` |
| `SELFHOSTED_SUPABASE_ANON_KEY` | env fixo (anon key) |
| `SUPABASE_DB_URL` | derivado do secret db password |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | env fixo |
| `PROMOGIFTS_SUPABASE_URL` / `_ANON_KEY` | env fixo |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | env fixo |
| `DEEPSEEK_API_KEY` / `AI_BASE_URL` / `AI_ROUTER_URL` | env fixo |

### 🟡 Geráveis localmente (openssl rand) — exigem atualizar o EMISSOR antes de ativar
| Variável | Ação | Observação |
|---|---|---|
| `EVOLUTION_WEBHOOK_SECRET` | gerar + rotacionar | usar `EVOLUTION_WEBHOOK_SECRETS=novo,antigo`; `_STRICT=false` até validar HMAC |
| `WEBHOOK_SECRET` | gerar | validar callers antes de ativar |
| `CRON_SECRET` | gerar | usado por crons com `x-cron-secret` |
| `SLA_ALERT_WEBHOOK_SECRET` | gerar | |
| `WHATSAPP_VERIFY_TOKEN` | gerar | colar no painel Meta |
| `WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN` | gerar | colar no painel Meta |
| `PROXY_METRICS_TOKEN` / `PROXY_HEALTH_TOKEN` | gerar | |
| `SICOOB_BRIDGE_SECRET` | gerar | precisa ser aceito pelo bridge SICOOB |

### 🔒 Bloqueado — credencial de terceiro (requer o Joaquim)
| Variável | Módulo travado |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GMAIL_PUBSUB_TOPIC` | Gmail (7 edge functions) |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook |
| `WHATSAPP_CLOUD_APP_SECRET` / `WHATSAPP_CLOUD_ACCESS_TOKEN` / `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | WhatsApp Cloud |
| `BITRIX_WEBHOOK_URL` / `BITRIX_PORTAL` | CRM Bitrix24 |
| `SICOOB_GIFTS_URL` / `SICOOB_GIFTS_BRIDGE_SECRET` | **fluxo SICOOB (P0-5)** |
| `RESEND_API_KEY` | e-mail transacional |
| `VIRUSTOTAL_API_KEY` | scan de mídia |
| `ELEVENLABS_WEBHOOK_SECRET` | webhook ElevenLabs |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | IA (DeepSeek já presente — validar fallback) |
| `SENTRY_DSN` | observabilidade (GlitchTip) |
| `LOVABLE_API_KEY` | bridge Lovable |
| `QR_ALERT_WEBHOOK_URL` / `QR_ALERT_WEBHOOK_TOKEN` | alerta de QR |
| `FATOR_X_SERVICE_ROLE_KEY` | integração Fator X |

### ⚙️ Config (não são secrets) — valores no compose
`EVOLUTION_INSTANCE`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_DEFAULT_INSTANCE`, `EVOLUTION_SEND_RATE_PER_INSTANCE`, `EVOLUTION_WEBHOOK_STRICT`, `WHATSAPP_CLOUD_WEBHOOK_STRICT`, `BITRIX_ALLOW_NO_ORIGIN`, `DEBUG_SENTRY`, `FUNCTION_NAME`, `PROXY_*` (8), `WEBHOOK_AUTH_*` (3), `BACKFILL_*` (2), `EXTERNAL_SUPABASE_*` (3), `GMAIL_REDIRECT_URI`, `MICROSOFT_REDIRECT_URI`, `SENTRY_RELEASE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `TEST_BASE*_SECRET*` (4)

## Estratégia para bloqueados
1. Criar secret com placeholder `MISSING__<NOME>` (fail alto: guard no boot retorna 503 descritivo)
2. Registrar dono + prazo em issue no GitHub
3. Não deixar string vazia (falha silenciosa)
