# Execução das Correções — Auditoria de Reconciliação (2026-08-04)

> Registro de execução da fase de correção P0→P1 (sequência validada por Claude Code).
> Ferramentas: Portainer MCP (service update/exec), Supabase MCP (SQL), GitHub MCP.

## Executado (com evidência)

| ID | Item | Ação | Evidência | Rollback |
|---|---|---|---|---|
| P1-02 | supabase_meta memória 512MB→1GB + heap 768 | `update_service` (Version.Index 12994710) | container `Up 6 min (healthy)`, limite 1073741824 | `--limit-memory 536870912 --env-rm NODE_OPTIONS` |
| P1-07 | Registrar 4 migrations em `schema_migrations` | INSERT transacional ON CONFLICT DO NOTHING | committed, 4 rows verificadas | DELETE das 4 versões |
| P1-05 | REVOKE `financeiro.apagar_nota_fiscal(uuid)` de authenticated | REVOKE EXECUTE | `auth_after=false`, `srole_after=true` | GRANT EXECUTE |
| P1-06 | Rename migration `20260804150000`→`20260804150001` | git mv | PR #794 (R100) | git mv de volta |
| P1-09 | evolution-api: handlers `find-status-messages` + `send-chat-presence` | patch index.ts + validação E.164/enum | testes 2/2 + 5/5 OK; PR #794 | reverter diff |
| P2-03 | evolution-media: Content-Type sem parâmetros | patch `split(';')[0].trim()` | testes OK; PR #794 | reverter diff |
| P0-02 | Política DB-as-source documentada | supabase/ci/README.md | PR #794 | reverter |
| P1-04a | HEALTH_SECRET + METRICS_SCRAPE_TOKEN injetados | `docker service update --env-add` (2×) | `/proc/1/environ` 2 envs OK; functions ping 401(auth) | `--env-rm` |
| P0-01 | Guardrail contínuo G1–G6 | Hermes cron `guardrail-reconciliacao-atomicabr` (1h, read-only, silencioso) | EXIT=0 em teste real | desativar cron |
| P1-08 | Realtime `messages` — **REFUTADO** | verificação independente | `evo.evolution_messages` JÁ publicado em `supabase_realtime`; front assina tabela-fonte correta (src: messageRepository.ts:103-135, ChatMessagesArea.tsx:170-190) | — |
| P1-01 | Schema evo (406 PGRST106) — **decisão: NÃO expor** | abordagem B (views zapp) adotada; evo tem 169/169 RLS mas exposição global contraria invariantes do repo (CLAUDE.md, evolution-credentials.ts:14-46) | pendente de onda dedicada (refactor `_shared` + redeploy) | — |
| P1-11 | anon search_path — **DEFERIDO** | risco de ambiguidade public.* vs zapp.* (511 views duplicadas); verificar RPCs anon antes | atual: `evo, public, extensions` | — |

## Bloqueado por credencial externa (não executável sem Joaquim)

- **P1-03** Google OAuth (client id/secret + redirect URI no GoTrue)
- **P1-04** restante: GOOGLE_CLIENT_*, GMAIL_PUBSUB_*, WHATSAPP_CLOUD_* (3), WHATSAPP_VERIFY_TOKEN/APP_SECRET, RESEND_API_KEY, BITRIX_WEBHOOK_URL/PORTAL, SICOOB_GIFTS_*, MICROSOFT_*, LOVABLE_API_KEY, OPENROUTER/IA keys (algumas podem vir do vault)
- **P2-05** vault secrets (openai_api_key, anthropic_api_key, hf_api_token, bitrix_webhook_url)

## Recomendado p/ próxima onda

1. Refactor `.schema('evo')` → views zapp (10 call sites em 4 arquivos: evolution-webhook-messages.ts ×3, evolution-webhook-handlers.ts ×3, evolution-sentiment ×2, connection-health-check ×1) + redeploy das funções afetadas
2. Reconciliar 5 edges STALE (ai-suggest-reply, elevenlabs-sts, elevenlabs-voice, gmail-token-refresh, public-api) — diff por função antes
3. P1-12 trailing newline nos secrets (sequência off-peak) · P1-13 compose alinhado ao runtime (P0-03) · P2-01 purge media_download_queue (com backup) · P2-06 VAULT_ENC_KEY · P2-13 swap 4GB

## Correção de laudo (QA): P1-08 realtime

A auditoria (07_dados) marcou P1 "messages subscrita não publicada". Verificação com evidência direta:
- `pg_publication_tables`: **evo.evolution_messages ✓ publicado** (+ email_app.email_messages, zapp.message_reactions, zapp.team_messages, etc.)
- Front (`messageRepository.ts:103-135`) assina `evo.evolution_messages` (tabela-fonte) — corretamente publicado
- `zapp.messages` é VIEW (não publicável por design); duplicidade `public.messages` vs `zapp.messages` documentada como P2 (auditar)
→ **Nenhuma ação necessária no realtime**; guardrail G4 cobre regressão de crons.
