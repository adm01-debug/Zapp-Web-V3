# Auditoria de BD/Schema — 2026-07-15

**Instância única**: `https://supabase.atomicabr.com.br` (Self-Hosted, VPS AtomicaBR)
**Schema canônico**: `zapp` (app) + `evo` (Evolution API/WhatsApp)
**Schema `public`**: 0 tabelas — não usar.

## 1. Cliente frontend

- `src/integrations/supabase/client.ts` — `createClient<ExtendedDatabase>` com `db: { schema: 'zapp' }`. ✅ Correto.
- URL/anon key: hardcoded fallback para o self-hosted; `VITE_SUPABASE_URL` sobrescreve. ✅
- Nenhuma ocorrência de `.schema('public')` em `src/` ou `supabase/functions/`. ✅

## 2. Cliente externo (legado)

`src/integrations/supabase/externalClient.ts` já delega para o `supabase` principal quando `VITE_EXTERNAL_SUPABASE_*` não está definido (single-database FATOR X v6.1). Nesta auditoria foi transformado em **shim puro**:

- `getExternalSupabase() → supabase`
- `isExternalConfigured = true` sempre
- `updateRuntimeExternalConfig()` mantida como no-op com aviso de deprecação
- Consumidores (~37 arquivos) continuam funcionando sem alteração

## 3. Edge Functions (130 `createClient`)

Amostragem confirma padrão `db: { schema: "zapp" }` inline (ex.: `whatsapp-webhook/index.ts:80`). Duas funções sem schema explícito, ambas usam apenas leitura de metadados / passam por `_shared`:

- `supabase/functions/whatsapp-cloud-send/index.ts`
- `supabase/functions/_shared/evolution-webhook-handlers.ts`

Recomendação registrada no guardrail (não bloqueante — o `_shared/db-client.ts::createZappAdminClient()` deve ser adotado incrementalmente).

## 4. Realtime (`postgres_changes`)

Todas as ~40 subscriptions auditadas usam `schema` correto:

| Schema | Tabelas |
|--------|---------|
| `zapp` | `profiles`, `user_roles`, `whatsapp_connections`, `notifications`, `warroom_alerts`, `sentiment_alerts`, `team_messages`, `team_conversations`, `team_conversation_members`, `team_message_reactions`, `whisper_messages`, `message_reactions`, `failed_messages`, `security_alerts`, `password_reset_requests`, `rate_limit_logs`, `qr_attempts`, `connection_health_logs`, `audio_memes`, `audio_meme_favorites`, `automation_executions`, `sales_deals`, `agent_stats`, `talkx_campaigns`, `talkx_recipients`, `conversation_sla`, `voice_conversion_queue` |
| `evo`  | `evolution_messages`, `evolution_contacts`, `evolution_retry_metrics` |
| `email_app` | `email_threads`, `email_accounts` |
| `financeiro` | `payment_links` |

Nenhum uso de `schema: 'public'` em subscription. ✅

## 5. URLs `*.supabase.co`

Somente em fixtures de teste (Deno/Vitest). Substituídas para `https://test.local` a fim de eliminar ruído em auditorias:

- `src/utils/__tests__/normalizeMediaUrl.test.ts`
- `src/test/stress-test.test.ts`
- `supabase/functions/evolution-api/index.test.ts`
- `supabase/functions/bitrix-api/__tests__/security.test.ts`
- `supabase/functions/_shared/__tests__/require-user-fast-path.test.ts`
- `supabase/functions/public-api/__tests__/e2e-send.test.ts`

## 6. `.env.example`

Header limpo: `VITE_SUPABASE_URL=https://supabase.atomicabr.com.br` (URL única).
`VITE_EXTERNAL_SUPABASE_*` mantidas comentadas + marcadas `# DEPRECATED`.

## 7. Guardrails no CI

Novo script `scripts/check-schema-usage.mjs` falha o build se detectar:

- `createClient(` em código de produção sem `db: { schema: 'zapp' | 'evo' | ... }` ou `.schema(...)` no mesmo arquivo
- `.schema('public')` em qualquer arquivo de `src/` ou `supabase/functions/`
- URLs `*.supabase.co` fora de `**/*.test.*` e `**/__tests__/**`

Integrado ao workflow `.github/workflows/quality-gate.yml`.

## 8. Docs

- `docs/DATABASE_ARCHITECTURE.md` arquivado em `docs/_archive/` (mantendo o banner de desatualizado).
- `docs/SCHEMA_REFERENCE.md` permanece canônico.

## Resumo Executivo

| Item | Status |
|------|--------|
| Cliente frontend em schema `zapp` | ✅ |
| Edge Functions em schema `zapp/evo` | ✅ (2 gaps não-bloqueantes) |
| Realtime schemas corretos | ✅ |
| Cliente externo consolidado em shim | ✅ |
| Testes / env limpos de URLs Cloud legadas | ✅ |
| Guardrail CI ativo | ✅ |
