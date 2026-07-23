# 🎭 Testes E2E com Playwright

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


## Visão geral

Cobrimos os fluxos críticos do ZAPP Web com Playwright:

| Spec | Fluxo |
|------|-------|
| `e2e/auth.spec.ts` | Login, logout, proteção de rota |
| `e2e/whatsapp-connection.spec.ts` | Criar instância, exibir QR code |
| `e2e/send-message.spec.ts` | Envio otimista, fallback Eco offline |
| `e2e/inbox-realtime.spec.ts` | Lista, abrir conversa, contador zero |
| `e2e/evolution-retry-failure.spec.ts` | Falhas intermitentes Evolution: marca `failed` só após esgotar retries; recupera no meio sem marcar |
| `e2e/admin-webhook-filters.spec.ts` | Filtros estruturados (remote_jid, push_name, message_type, status) em `/admin/webhook-events`. Garante ortogonalidade com a busca textual: filtros e busca operam por interseção, nunca união. Skip se bot não for admin. |
| `e2e/admin-failed-messages-filters.spec.ts` | Filtros estruturados (status, search) em `/admin/failed-messages`. Mesma garantia de ortogonalidade. Skip se bot não for admin. |
| `e2e/navigation.spec.ts` | Navegação pós-login: home, deep-link `/sla`, NotFound, role gating em `/admin/roles`, sidebar best-effort. |
| `e2e/contacts-crud.spec.ts` | CRM: criar contato via "Nova Conversa", detectar duplicidade de telefone, busca rápida (<2.5s). Mocks Evolution. |
| `e2e/admin-queues.spec.ts` | Admin → Filas: render, abrir formulário, validação de nome obrigatório. Skip se não-admin. |
| `e2e/admin-channels.spec.ts` | Admin → Canais: lista renderiza, toggle de status com feedback. Skip se não-admin. |
| `e2e/error-handling.spec.ts` | Edge function 500/timeout, rede offline — app não crasha, feedback ao usuário. |
| `e2e/auth-extended.spec.ts` | Credenciais inválidas, /forgot-password, expiração de sessão força redirect /auth. |
| `e2e/admin-evolution-api-smoke.spec.ts` + `evolution-*retry-failure` + `whatsapp-connection` + `whatsapp-reactions-*` | Suite **Evolution** rodável na VPS via workflow `E2E Evolution (VPS)`. |
| `e2e/inbox-*.spec.ts` + `chat-*.spec.ts` + `send-message*.spec.ts` + `conversations-routing.spec.ts` + `connection-to-inbox-inbound.spec.ts` | Suite **Inbox** rodável na VPS via workflow `E2E Inbox (VPS)` (dispatch manual ou cron diário 06:00 BRT). |

## Execução contra a VPS (workflow manual)

Workflow `.github/workflows/e2e-evolution-vps.yml` — dispatch manual no GitHub Actions:

1. Actions → **E2E Evolution (VPS)** → Run workflow.
2. Inputs: `base_url` (default `https://zapp.atomicabr.com.br`), `include_webhook_parity` (default `false`), `include_voice_changer` (default `false`).
3. Secrets exigidos: `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` (usuário com role admin/supervisor). Opcional: backend precisa de `EVOLUTION_WEBHOOK_SECRET` para paridade.
4. Artefatos: `playwright-report-e2e-evolution` (HTML), `test-results-e2e-evolution` (traces/screenshots/vídeos), `e2e-evolution-vps-report` (resumo Markdown).

Alternativa via SSH na VPS:

```bash
E2E_USER_EMAIL=... E2E_USER_PASSWORD=... ./scripts/run-e2e-evolution-vps.sh
```

## Rodando local

```bash
# Build de produção (Playwright sobe `vite preview` na 4173 automaticamente)
npm run build

# Todos os specs em chromium headless
npm run test:e2e

# Modo UI interativo
npm run test:e2e:ui

# Debug step-by-step
npm run test:e2e:debug

# Ver relatório HTML após run
npm run test:e2e:report
```

### Variáveis de ambiente

Crie `.env.test.local` (já no `.gitignore`):

```
E2E_USER_EMAIL=e2e-bot@zappweb.test
E2E_USER_PASSWORD=sua-senha-aqui
E2E_BASE_URL=http://localhost:4173
```

> O usuário `e2e-bot@zappweb.test` deve existir como **admin** no Lovable Cloud para
> que os specs de `/admin/connections` rodem. Caso contrário esses testes são `skip`.

## Estratégia de mock

- **Evolution API:** interceptada com `page.route('**/functions/v1/evolution-api**', ...)` retornando fixtures de `e2e/fixtures/test-data.ts`. Nenhuma chamada real à Eco.
- **Supabase Realtime:** os specs validam estado da UI; eventos podem ser simulados via insert direto no DB de teste se necessário.
- **Auth:** login real via UI contra Lovable Cloud com conta de teste dedicada.

## CI

Job `e2e` em `.github/workflows/ci.yml`:

- Roda após `build` (consome o `dist/` artifact).
- 2 shards paralelos (`--shard=1/2` e `2/2`) → tempo total ≤ 10 min.
- Apenas chromium em PRs; chromium + webkit em push para `main`.
- Artifacts `playwright-report-shard-N` retidos por 7 dias.

### Secrets necessários no GitHub

| Secret | Origem |
|--------|--------|
| `E2E_USER_EMAIL` | Conta de bot criada no Lovable Cloud |
| `E2E_USER_PASSWORD` | Senha do bot |
| `VITE_SUPABASE_URL` | Já existe |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Já existe |

## Lidando com flakiness

- Use `expect.poll()` com timeout 10s para estados realtime.
- Retries em CI: 2 (configurado em `playwright.config.ts`).
- Capture trace em primeira retentativa: `trace: 'on-first-retry'`.
- Para logs detalhados local: `DEBUG=pw:api npm run test:e2e`.

## Cleanup

`e2e/utils/supabase.ts` chama RPC opcional `rpc_e2e_cleanup` (best-effort).
Todos os JIDs/instâncias de teste são prefixados com `*-test` para facilitar limpeza manual se necessário.

## Adicionando novo spec

1. Crie `e2e/<nome>.spec.ts`.
2. Importe `test, expect` de `./fixtures/auth` se precisar de sessão autenticada.
3. Use mocks de `page.route` para Evolution/serviços externos.
4. Adicione `test.afterAll(() => cleanupTestData())` se criar dados.
5. Rode local antes de abrir PR.

## Paridade de provedores (webhook → inbox)

`e2e/webhook-providers-parity.spec.ts` envia eventos sintéticos de webhook
para **ambos** os provedores (`evolution-webhook` e `whatsapp-cloud-webhook`)
e valida que cada evento aterrissa em `evolution_messages` com o mesmo
`remote_jid` normalizado, mesmo `content`, `from_me=false` e `direction`
inbound. Garante paridade absoluta da pipeline `webhook → unified inbox`.

### Como funciona

A spec **não assina nada no cliente** — assinaturas HMAC ficam server-side.
Tudo passa pela Edge Function `e2e-webhook-fixture` (admin-only), que:

1. `seed-cloud-creds` cria temporariamente uma `whatsapp_connections` +
   `whatsapp_official_credentials` com `phone_number_id` prefixado por `e2e-`.
2. `send-evolution` monta o payload `messages.upsert`, assina com
   `EVOLUTION_WEBHOOK_SECRET` e faz POST em `/functions/v1/evolution-webhook`.
3. `send-cloud` monta o payload Meta, assina com o `app_secret` da credencial
   seedada e faz POST em `/functions/v1/whatsapp-cloud-webhook`.
4. `cleanup` remove credencial, conexão e linhas em `evolution_messages` /
   `evolution_contacts` cujo `remote_jid`/`instance_name` carregam o prefixo
   `e2e-` daquele `runId`. Recusa qualquer alvo sem o prefixo.

### Como rodar

```bash
E2E_WEBHOOK_PARITY=1 bunx playwright test webhook-providers-parity
```

Sem a flag, a spec é skipada — assim CI default não falha em ambientes que
não têm `EVOLUTION_WEBHOOK_SECRET` configurado.
