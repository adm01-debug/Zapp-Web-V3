# zapp-crm-sync · Security Hardening

Edge de sync de conversa para o CRM plugável (Etapa 66, SIM-CRM F1). Roteia o
payload validado para o provider habilitado em `zapp.crm_sync_config`.

## Modelo de autenticação

- `requireUser` (`_shared/auth.ts`): exige JWT de usuário autenticado — rejeita
  `anon`, service-role e chamadas sem `Authorization: Bearer` (401).
- Rate limit por usuário: `checkRateLimit('zapp-crm-sync:<uid>', 30, 60_000)`
  → 429 (padrão `bitrix-api`).
- CORS: `handleCors` + `getCorsHeaders` (padrão da casa).

## Segredos NUNCA em `zapp.crm_sync_config.settings`

Regra de ouro (SIM-CRM (b)): `settings` só carrega config **não-secreta**
(label, mapeamento de campos, base_url pública, dry_run). O `CHECK
(jsonb_typeof(settings)='object')` + a política `auth_secure_56` (somente
admin/supervisor) limitam o vetor, mas a defesa real é a convenção: secrets
vivem em env da edge (`BITRIX_WEBHOOK_URL`) ou vault.

- `BITRIX_WEBHOOK_URL` contém token — já coberto pelo `redactSecrets()` do
  `Logger` (`_shared/validation.ts`), e este handler **nunca** loga a URL.
- Respostas de erro do provider carregam apenas `provider_error` truncado
  (300 chars) — nunca stack, nunca headers, nunca credenciais.

## Invariantes de resposta (SIM-CRM (e))

- 200 para fluxos de negócio: `not_configured` / `not_implemented` /
  `duplicate` / `contact_not_found` / `error` / `dry_run`.
- 4xx só para auth / rate-limit / contrato inválido / provider sem env
  (`provider_not_configured`, `invalid_config`).
- `reason` é sempre string do enum fechado — o front nunca parseia mensagem livre.

## Retry e timeout (F4)

- 2 tentativas de retry com backoff 300ms/900ms em falha de rede/timeout.
- Timeout de 10s por tentativa (`AbortSignal.timeout`).
- Falha total → `{ synced:false, reason:'error', provider, provider_error }`.

## Testes adversariais (sandbox-only)

`__tests__/contract.test.ts` cobre: registro de contrato, zod strict (uuid,
enum direction, phone vazio, message_count negativo, chave extra), helpers de
dispatch (mapeamento de campos Bitrix, fallbacks, tradução DUPLICATE →
`duplicate`, 5xx → `error`).

Rodar: `supabase functions test zapp-crm-sync` (ou via tooling do repo).
