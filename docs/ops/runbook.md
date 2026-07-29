# ZAPP Web v3 — Runbook de Operações

> **Manutenção:** Hermes AtomicaBR | **Última atualização:** 2026-07-28
> **Repositório:** https://github.com/adm01-debug/zapp-web-v3

---

## 1. Health Check Rápido

```bash
# Supabase self-hosted
curl -s -o /dev/null -w "%{http_code}" https://supabase.atomicabr.com.br/auth/v1/health
curl -s -o /dev/null -w "%{http_code}" https://supabase.atomicabr.com.br/rest/v1/

# Evolution WhatsApp (wpp2)
curl -s https://wpp2.atomicabr.com.br/ping

# Deploy Vercel
curl -s -o /dev/null -w "%{http_code}" https://zapp-web-v3.vercel.app
```

---

## 2. Deploy em Produção

```bash
# Vercel (automático via git push na main)
git push origin main

# VPS (Docker Swarm)
docker stack deploy -c docker-compose.yml zapp-web
```

---

## 3. Banco de Dados

### Schemas
| Schema | Uso | Tabelas |
|--------|-----|---------|
| `zapp` | Aplicação principal | ~300 |
| `evo` | Evolution API (WhatsApp) | ~15 |
| `public` | API views (security_invoker) | ~10 |
| `auth` | Autenticação Supabase | ~10 |

### Regenerar types.ts
```bash
META_URL=https://supabase.atomicabr.com.br/pg \
META_TOKEN=<service_role_key> \
node scripts/gen-types-zapp.mjs
```

### Migrations
```bash
# Criar nova migration
supabase migration new <nome>

# Aplicar migrations pendentes
supabase db push
```

---

## 4. Edge Functions (132)

### Deploy de função
```bash
supabase functions deploy <nome-da-funcao>
```

### Verificar logs
```bash
supabase functions logs <nome-da-funcao> --tail
```

### Health check das Edge Functions
```bash
curl -s https://supabase.atomicabr.com.br/functions/v1/hello
curl -s https://supabase.atomicabr.com.br/functions/v1/ai-router
```

---

## 5. Troubleshooting Comum

### Auth: login travado
1. Verificar `detectSessionInUrl: false` em `src/integrations/supabase/client.ts`
2. Verificar CORS: `curl -X OPTIONS https://supabase.atomicabr.com.br/auth/v1/user`
3. Verificar token localStorage: `sb-*-auth-token`

### WhatsApp: mensagem não enviada
1. Verificar instância: `curl https://wpp2.atomicabr.com.br/instance/connectionState/wpp2`
2. Verificar webhook: logs da função `whatsapp-cloud-webhook`

### Deploy quebrado
1. Verificar build logs no Vercel Dashboard
2. Verificar `vercel.json` syntax
3. Verificar env vars no Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## 6. Segurança

### Secrets expostos no histórico
- `.env` commitado 4× — chave Supabase exposta. **Rotacionar imediatamente.**
- Credenciais Lalamove em texto plano — **Rotacionar.**

### Verificação de segurança
```bash
# Verificar secrets no código atual
gitleaks detect --source .

# Verificar .env NÃO está no repo
git ls-files .env
```

---

## 7. Limpeza do Repositório

### Remover blobs grandes do histórico (BFG)
```bash
# Remover .dist-backups/ do histórico
java -jar bfg.jar --delete-folders .dist-backups

# Remover lalamove data files
java -jar bfg.jar --delete-files "lalamove_*"

# Compactar
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

---

## 8. Métricas do Projeto

| Métrica | Valor |
|---------|-------|
| Commits totais | 19,140 |
| Arquivos fonte | 2,058 (1,083 .ts + 975 .tsx) |
| Edge Functions | 132 |
| SQL Migrations | 1,018 |
| GitHub Actions | 37 |
| LOC total | ~383K |
| Cobertura de testes | 20.3% |
| PRs | 619 |
