# Configuração de variáveis de ambiente

Guia rápido para rodar o ZAPP Web em desenvolvimento e CI. O arquivo de
referência é [`.env.example`](../.env.example) — copie-o e preencha.

## TL;DR

```bash
cp .env.example .env.local
# edite .env.local com os valores reais
bun install
bun run dev
```

> ⚠️ **Nunca commite `.env.local`, `.env` ou qualquer arquivo com segredos reais.**
> O `.gitignore` já cobre, mas confira antes de subir.

---

## 1. Variáveis por categoria

### Frontend (prefixo `VITE_*` — vão pro bundle)

| Variável                                            | Obrigatório | Descrição                                                                                                                                                                                                   |
| --------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                                 | ✅          | https://supabase.atomicabr.com.br                                                                                                                                                                           |
| `VITE_SUPABASE_ANON_KEY`                            | ✅          | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.WZnW4uA9fWo-G4eOdcR1xUGZTY357tgfqD5B-OG93S0 |
| `VITE_SUPABASE_PROJECT_ID`                          | ✅          | Ref do projeto Supabase.                                                                                                                                                                                    |
| `VITE_EVOLUTION_API_URL` / `VITE_EVOLUTION_API_KEY` | opcional    | Adapter WhatsApp direto (fallback).                                                                                                                                                                         |
| `VITE_SENTRY_DSN`                                   | recomendado | Observabilidade frontend.                                                                                                                                                                                   |

### Backend / Edge Functions (sem prefixo — só servidor)

Configure como **secrets** no Lovable Cloud (Connectors → Secrets).
Eles ficam disponíveis automaticamente em todas as edge functions via
`Deno.env.get(...)`.

| Secret                                                              | Usado por                   | Descrição                    |
| ------------------------------------------------------------------- | --------------------------- | ---------------------------- |
| `EXTERNAL_SUPABASE_URL` / `EXTERNAL_SUPABASE_ANON_KEY`              | `external-db-proxy`, várias | Banco FATOR X.               |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`                           | `evolution-*`               | Servidor Evolution API.      |
| `EVOLUTION_WEBHOOK_SECRET[S]`                                       | `evolution-webhook`         | HMAC dos webhooks.           |
| `PROMOGIFTS_SUPABASE_URL` / `PROMOGIFTS_SUPABASE_ANON_KEY`          | `promogifts-catalog`        | Catálogo de brindes externo. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | `gmail-*`                   | OAuth Gmail.                 |
| `RESEND_API_KEY`                                                    | emails transacionais        | Provedor de email.           |
| `SIP_PASSWORD`                                                      | `get-sip-password`          | VoIP/SIP.                    |
| `ELEVENLABS_API_KEY`                                                | voz/transcrição             | Gerenciado por Connector.    |

> ✅ `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e
> `LOVABLE_API_KEY` são injetados automaticamente — **não precisa configurar**.

---

## 2. Onde obter cada valor

- **Lovable Cloud (auth/tabelas locais):** painel do projeto → Cloud → Overview.
- **FATOR X (`evolution_*`):** dashboard do Supabase self-hosted (URL e anon key).
- **Evolution API:** painel da sua instância Evolution (`/manager`).
- **PromoGifts:** dashboard do projeto Supabase do PromoGifts (mesmo padrão URL +
  anon key). Sem isso, `/promogifts-catalog/health` retorna **503** com a lista
  exata de secrets ausentes.
- **Gmail OAuth:** Google Cloud Console → APIs & Services → Credentials.
- **Sentry:** projeto Sentry → Settings → Client Keys (DSN).

---

## 3. Validar configuração local

```bash
# 1) Vite carrega .env.local automaticamente
bun run dev

# 2) Health checks rápidos
curl https://<project-ref>.supabase.co/functions/v1/promogifts-catalog/health
curl https://<project-ref>.supabase.co/functions/v1/external-db-proxy   # GET ping
```

Resposta esperada do health do PromoGifts:

```json
{ "status": "ok", "configured": true, "reachable": true, "duration_ms": 120 }
```

Se vier `503` com `code: "EXTERNAL_DB_NOT_CONFIGURED"`, leia o campo
`missing[]` — ele lista exatamente quais secrets faltam.

---

## 4. CI / GitHub Actions

O workflow já configurado (`.github/workflows/ci.yml`) precisa dos secrets
definidos em **Settings → Secrets and variables → Actions** do repositório.

### Secrets mínimos para CI

| Secret                                                     | Necessário para         |
| ---------------------------------------------------------- | ----------------------- |
| `VITE_SUPABASE_URL`                                        | build + Vitest          |
| `VITE_SUPABASE_PUBLISHABLE_KEY`                            | build + Vitest          |
| `VITE_SUPABASE_PROJECT_ID`                                 | build                   |
| `VITE_EXTERNAL_SUPABASE_URL`                               | testes de integração    |
| `VITE_EXTERNAL_SUPABASE_ANON_KEY`                          | testes de integração    |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`                  | testes de edge function |
| `PROMOGIFTS_SUPABASE_URL` / `PROMOGIFTS_SUPABASE_ANON_KEY` | testes do catálogo      |

### Como adicionar

```bash
gh secret set VITE_SUPABASE_URL --body "https://<ref>.supabase.co"
gh secret set PROMOGIFTS_SUPABASE_URL --body "https://<ref>.supabase.co"
# ...repita para cada secret
```

Ou pela UI: repo → **Settings → Secrets and variables → Actions → New repository secret**.

### Boas práticas de CI

- Use **Environments** (`production`, `staging`) para isolar secrets sensíveis.
- Marque jobs que usam secrets de produção com `environment: production` para
  exigir aprovação manual.
- Edge function tests no CI devem **degradar graciosamente** quando um secret
  está ausente (já implementado nos testes do `evolution-api`).

---

## 5. Troubleshooting

| Sintoma                                                  | Causa provável                             | Ação                                                    |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `Edge function returned 500: External DB not configured` | Secret faltando no Lovable Cloud           | Adicione em Connectors → Secrets. Sem redeploy manual.  |
| `503 EXTERNAL_DB_NOT_CONFIGURED`                         | Mesma causa, nova mensagem detalhada       | Veja `missing[]` na resposta.                           |
| `502 EXTERNAL_DB_UNREACHABLE`                            | Secrets presentes mas URL/anon key errados | Confira URL (sem `/`) e anon key no painel do Supabase. |
| Build do Vite ignora variáveis                           | Faltou prefixo `VITE_`                     | Apenas `VITE_*` chegam ao bundle.                       |
| CI falha com `undefined` em `import.meta.env.*`          | Secret não cadastrado em GitHub Actions    | Adicione com `gh secret set`.                           |
