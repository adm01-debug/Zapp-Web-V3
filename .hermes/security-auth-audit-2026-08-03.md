# Security & Auth Audit — Edge Functions + DB RPCs (2026-08-03)

Escopo: 127 edge functions (volume `/root/supabase/docker/volumes/functions`, edge-runtime v1.74.0),
13 SECDEF expostas em `public`, allowlist do `main/index.ts`, segredos e `process.env`.

## Gateway (validado com probes ao vivo em supabase.atomicabr.com.br)
- `VERIFY_JWT=true` (env do serviço) + `JWT_SECRET` exportado no entrypoint a partir do Docker secret
  `supabase_jwt_secret_v1` (exec não vê exports do entrypoint — verificado via comportamento, não env).
- `/functions/v1/status` (allowlist, sem auth) → **200** ✓
- `/functions/v1/hello` (fora da allowlist, sem auth) → **401** ✓ (gate JWT funcionando)
- `/functions/v1/evolution-health` (allowlist mas com auth interna, sem auth) → **401** ✓ (fail-closed)
- `main/index.ts` no volume é **byte-idêntico** ao repo (md5 99ebd4da…); allowlist 32 funções,
  todas existentes no volume; nenhuma função perigosa (`external-db-*`, `mcp`, `metrics`, `hello`,
  `virustotal-test`, `gmail-tests.test.ts`) fora da allowlist. 7/8 arquivos críticos com md5 idêntico.

## 13 SECDEF em public (GRANT EXECUTE authenticated) — categorização
| Função | Risco | Classificação |
|---|---|---|
| rpc_get_contact (uuid) | **P1** | ACIDENTAL — sem auth.uid(), SECDEF bypassa RLS, retorna contato+deals+mensagens+tasks de QUALQUER id (dump do CRM). Front usa como fallback (useFallbackContact, v237Fallbacks) → MANTER+GUARD (workspace/visibility) ou migrar para caminho RLS-safe |
| rpc_get_contact (remote_jid, instance) | **P1** | ACIDENTAL — idem, leitura por JID sem guard |
| increment_webhook_rate_limit | **P2** | Semi-intencional (edges usam via _shared/rate-limiter.ts) — sem guard, autenticado manipula contadores de rate-limit de qualquer instância |
| log_rls_denied | **P2** | Helper de log usado por RLS — sem guard, qualquer autenticado insere linhas de log (spam) |
| generate_transfer_ticket | OK | Intencional — wrapper inofensivo (ticket sequencial), sem dado sensível |
| is_instance_paused | OK | Intencional — helper de policy RLS, boolean read-only |
| get_companies_by_phones_batch | OK | Guardado (workspace membership) ✓ |
| get_contact_intelligence_by_phone | OK | Guardado ✓ |
| rpc_app_bootstrap / rpc_dashboard_init | OK | auth.uid() requerido ✓ |
| handle_new_user_settings / on_role_change / trg_fn_set_transfer_ticket | OK | Triggers no-op, não chamáveis como RPC |

## Fail-open (allowlist sem auth interna)
- **NENHUMA função allowlisted está fail-open**: webhooks (HMAC timing-safe, *_STRICT default true),
  cron (requireServiceRoleOrCron: service_role OU x-cron-secret, timing-safe), service-to-service
  (Bearer), proxy (METRICS_SECRET), bitrix-api (requireUser + Origin), public-api (x-api-key),
  evolution-sync (ApiKey). `_shared/auth.ts` e `hmac-validation.ts` idênticos no volume.
- "Públicas por design" (sem auth, intencional): email-track-pixel/link (**P2** — escrevem via RPC
  rpc_email_register_open/click sem rate-limit → amplificação de escrita), health-check/status/
  db-health-monitor (P3, sem dado sensível), login-attempts (rota check com verificação de email), 
  whatsapp-cloud-webhook-verify (hub.challenge + verify_token).

## Segredos hardcoded
- **Código das edge functions: NENHUM** (só fixtures de teste com valores fake; .env gitignored ✓).
- **P1 — Service spec do `supabase_functions` expõe segredos reais em plaintext env** (visíveis em
  `docker service inspect` / Portainer): `DEEPSEEK_API_KEY=sk-a330…` (real), `EVOLUTION_API_KEY=2D10…`
  (real), `SENTRY_DSN`, `PROMOGIFTS_SUPABASE_ANON_KEY`+URL cloud antigo. O YAML reconciliado
  (docs/infra/supabase-functions.reconciled.yml) prevê `EVOLUTION_API_KEY` via Docker secret
  `evolution_api_key_v4_20260704` — o deploy NÃO usa (drift do spec vs config esperada). Fix:
  mover para secrets e rotacionar as chaves expostas.

## process.env (quebra no Deno)
- **P1 (funcional)** — `supabase/functions/mcp/index.ts` (auto-gerado @lovable.dev/mcp-js) usa
  `process.env.SUPABASE_URL` em 4 pontos → ReferenceError no Edge Runtime (Deno). Função `mcp`
  deployada e atrás de JWT → 500 para usuários autenticados que a chamarem. Fix: bundle manual
  com `Deno.env.get` ou remover.

## Drift volume vs repo
- **P2** — `external-db-proxy`: volume roda **v1.10-issuer-fastpath** (allowlist ~80 RPCs), repo tem
  **v1.11-selfhosted-only (2026-08-03, hardening de hoje)** não deployado. Ambos com requireUser +
  allowlists (sem regressão de segurança), mas volume ≠ estado esperado do repo.

## Positivos confirmados
- 100% das SECDEF expostas com `SET search_path` fixo; 0 SQL injection dinâmico.
- Auth interna sempre timing-safe (timingSafeStringEqual); HMAC com Web Crypto.
- Gate JWT fail-closed no gateway (prova ao vivo).
