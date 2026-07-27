# Ambiente de Staging — Configuração e Uso

## Por que precisamos de staging

- Testar migrations Supabase antes de produção
- Validar Edge Functions contra dados reais sem risco
- Executar E2E contra banco isolado
- Aprovar features com cliente antes de produção

## Topologia

```
[Feature Branch] → PR → [Preview Vercel] → merge → [Staging Branch] → [Staging Vercel]
                                                                         ↓ aprovado
                                                                   [main] → [Produção]
```

## Setup Inicial (one-time)

### 1. Supabase Staging

```bash
# Criar projeto Supabase para staging na conta VPS ou usar branch feature da Supabase
# (Supabase branching — docs: https://supabase.com/docs/guides/platform/branching)

# Opção A: Docker Compose local (recomendado para dev)
docker-compose -f infra/docker/supabase-staging.yml up -d

# Opção B: Supabase branching (requer Pro plan)
# supabase branches create staging
```

### 2. Variáveis Vercel (Preview Environment)

No Vercel Dashboard → Settings → Environment Variables:

| Variável | Valor | Ambientes |
|----------|-------|-----------|
| `VITE_SUPABASE_URL` | `https://supabase-staging.atomicabr.com.br` | Preview |
| `VITE_SUPABASE_ANON_KEY` | `<staging anon key>` | Preview |
| `VITE_APP_ENV` | `staging` | Preview |
| `VITE_ENABLE_DEBUG` | `true` | Preview |
| `VITE_APP_NAME` | `ZAPP-WEB [STAGING]` | Preview |

### 3. Migrations em Staging

```bash
# Aplicar todas as migrations em staging antes de produção
SUPABASE_DB_URL="postgresql://postgres:senha@supabase-staging.atomicabr.com.br:5432/postgres" \
  bun run db:migrate

# Ou via supabase CLI
supabase db push --db-url "$SUPABASE_DB_URL"
```

## Fluxo de Deploy

1. **Feature branch** → PR para `main` → Preview Vercel automático
2. **PRs com migrations** → aplicar em staging via CI antes de merge
3. **Merge para main** → deploy automático em produção

## CI: Teste de Migrations em Staging

O workflow `.github/workflows/ci.yml` já suporta a variável
`STAGING_SUPABASE_DB_URL` como secret opcional. Quando configurado:
- PRs com arquivos em `supabase/migrations/` executam as migrations
  contra staging e falham se houver erro de SQL.

```yaml
# Adicionar no GitHub Settings → Secrets → STAGING_SUPABASE_DB_URL
# postgresql://postgres:SENHA@supabase-staging.atomicabr.com.br:5432/postgres
```

## .env.staging

Ver `.env.staging` na raiz do projeto como template.
Copiar para `.env.local` e preencher com valores reais para desenvolvimento local.

## Smoke Test Pós-Deploy em Staging

```bash
# Verificar que a API responde
curl -I https://staging.zapp.atomicabr.com.br

# Testar autenticação
curl -H "apikey: $STAGING_ANON_KEY" \
     https://supabase-staging.atomicabr.com.br/rest/v1/ -I

# Rodar E2E contra staging
VITE_APP_ENV=staging bun run test:e2e
```
