# 🚀 Guia de Deploy - ZAPP-WEB

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


Este documento descreve o processo de deploy e configuração do ZAPP-WEB.

## 📋 Índice

- [Ambientes](#ambientes)
- [Pré-requisitos](#pré-requisitos)
- [Deploy (Vercel)](#deploy-vercel)
- [Deploy Manual](#deploy-manual)
- [Configuração do Supabase](#configuração-do-supabase)
- [Edge Functions](#edge-functions)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Domínio Customizado](#domínio-customizado)
- [Rollback](#rollback)
- [Monitoramento](#monitoramento)

---

## Ambientes

| Ambiente | URL | Branch |
|----------|-----|--------|
| **Produção** | Vercel (vercel.com) | `main` |
| **Staging** | (interno) | `develop` |
| **Local** | localhost:5173 | qualquer |

---

## Pré-requisitos

### Ferramentas
- Node.js 20+ (use `.nvmrc`: `nvm use`)
- Bun 1.0+
- Supabase CLI
- Git

### Acessos necessários
- GitHub (repo privado)
- Supabase Dashboard
- Vercel Dashboard
- Evolution API (WhatsApp)

---

## Deploy (Vercel)

O deploy é **automático** via Vercel (conectado ao GitHub):

1. **Push/merge na main** → Build e deploy automáticos
2. **Edge Functions** → Deploy separado via `supabase functions deploy` no self-hosted
3. **Assets** → CDN global da Vercel

### Tempo médio de deploy
- Build: ~2 minutos
- Edge Functions: ~30 segundos
- Propagação CDN: ~1 minuto

---

## Deploy Manual

Para casos especiais onde o deploy automático não é suficiente:

### 1. Build local

```bash
# Instalar dependências
bun install

# Build de produção
bun run build

# Preview local
bun run preview
```

### 2. Deploy de Edge Functions

> **Self-hosted**: requer `supabase/config.toml` com a URL do projeto ou `SUPABASE_ACCESS_TOKEN`.
> O `--project-ref` NÃO é usado em self-hosted — a CLI resolve pelo config local.

```bash
# Deploy de todas as funções (self-hosted)
supabase functions deploy

# Deploy de função específica (self-hosted)
supabase functions deploy evolution-api
```

### 3. Aplicar migrations

```bash
# Aplicar migrations pendentes (self-hosted)
supabase db push

# Ver status das migrations
supabase migration list
```

---

## Configuração do Supabase

### Projeto Principal (Self-Hosted)
- **Tipo**: Self-Hosted (VPS AtomicaBR)
- **URL**: https://supabase.atomicabr.com.br
- **Schema principal**: `zapp`
- **Schema Evolution API**: `evo`

### Banco de Dados Externo (CRM)
- **URL**: https://supabase.atomicabr.com.br (mesmo host, schema `evo`)
- **Uso**: RPCs de inteligência e enriquecimento de contatos

### Configurações Obrigatórias

#### 1. Auth
- Email/password habilitado
- MFA (TOTP) habilitado
- Redirect URLs configurados

#### 2. RLS
- Todas as tabelas com RLS habilitado
- 181+ policies configuradas

#### 3. Realtime
- 16 tabelas com Realtime ativo
- Broadcast habilitado

#### 4. Storage
- Buckets: `avatars`, `media`, `documents`
- Policies de acesso configuradas

---

## Edge Functions

### Lista de funções

| Função | Descrição | Secrets |
|--------|-----------|---------|
| `evolution-api` | Proxy WhatsApp | `EVOLUTION_API_KEY` |
| `evolution-webhook` | Webhook WhatsApp | `EVOLUTION_API_KEY` |
| `ai-suggest-reply` | IA sugestão | `OPENAI_API_KEY` |
| `ai-conversation-summary` | IA resumo | `OPENAI_API_KEY` |
| `elevenlabs-tts` | Text-to-speech | `ELEVENLABS_API_KEY` |
| `send-email` | Envio email | `RESEND_API_KEY` |
| `gmail-oauth` | OAuth Gmail | `GMAIL_CLIENT_*` |

### Configurar secrets

```bash
# Via CLI
supabase secrets set EVOLUTION_API_KEY=xxx

# Listar secrets
supabase secrets list
```

---

## Variáveis de Ambiente

### Frontend (Vite)

```env
# .env.local
VITE_SUPABASE_URL=https://supabase.atomicabr.com.br
VITE_SUPABASE_ANON_KEY=xxx

# Externo (mesmo host self-hosted, schema evo)
VITE_EXTERNAL_SUPABASE_URL=https://supabase.atomicabr.com.br
VITE_EXTERNAL_SUPABASE_ANON_KEY=xxx

# Sentry
VITE_SENTRY_DSN=xxx
```

### Edge Functions (Supabase Secrets)

```bash
# WhatsApp
EVOLUTION_API_URL=https://evolution.atomicabr.com.br
EVOLUTION_API_KEY=xxx

# IA
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx

# Email
RESEND_API_KEY=re_xxx

# Áudio
ELEVENLABS_API_KEY=xxx

# Gmail
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxx
```

---

## Domínio Customizado

### Via Vercel
1. Dashboard > Settings > Domains
2. Adicionar domínio customizado
3. Configurar DNS (CNAME ou A record)
4. Aguardar propagação e SSL

### DNS Records
```
CNAME: app.seudominio.com.br → cname.vercel-dns.com
```

---

## Rollback

### Via Vercel
1. Dashboard > Deployments
2. Selecionar deploy anterior
3. Clicar em "Redeploy"

### Via Git
```bash
# Reverter para commit anterior
git revert HEAD
git push origin main

# Ou forçar para commit específico
git reset --hard <commit-sha>
git push origin main --force
```

### Migration Rollback
```bash
# Ver histórico
supabase migration list

# Rollback manual (criar migration de reversão)
# NÃO há comando automático de rollback
```

---

## Monitoramento

### Logs do Supabase
- Edge Functions: Dashboard > Edge Functions > Logs
- Database: Dashboard > Database > Query Performance
- Auth: Dashboard > Auth > Logs

### Sentry
- Erros de frontend
- Performance monitoring
- Release tracking

### Uptime
- Vercel: Built-in monitoring + Sentry
- Edge Functions: Supabase monitoring

### Alertas
- Configurar alertas no Supabase Dashboard
- Integrar com Slack/Discord se necessário

---

## Checklist de Deploy

- [ ] Testes passando (`bun test`)
- [ ] Build sem erros (`bun run build`)
- [ ] Typecheck sem erros (`bun run typecheck`)
- [ ] Lint sem erros (`bun run lint`)
- [ ] Migrations aplicadas
- [ ] Edge Functions deployadas
- [ ] Secrets configurados
- [ ] Verificar logs após deploy
- [ ] Testar fluxos críticos em produção

---

## Troubleshooting

### Build falha
```bash
# Limpar cache
rm -rf node_modules .vite dist
bun install
bun run build
```

### Edge Function não funciona
1. Verificar logs no Dashboard
2. Verificar secrets configurados
3. Testar localmente: `supabase functions serve`

### Migration falha
1. Verificar SQL syntax
2. Verificar dependências entre migrations
3. Rodar em staging primeiro

---

## Contatos

- **DevOps**: ti@promobrindes.com.br
- **Emergências**: ti@promobrindes.com.br

---

*Última atualização: 2026-04-12*
