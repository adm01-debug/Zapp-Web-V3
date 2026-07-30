# 🔴 Simulação de Falhas de Segurança — Relatório Consolidado

**Data:** 2026-07-30  
**Escopo:** zapp-web-v3 / Supabase self-hosted (AtomicaBR)  
**Schemas auditados:** `zapp`, `public`, `evo`  
**Ferramentas:** Supabase MCP (Advisors, pg_policies, pg_proc), Git log, grep no código-fonte, docker-compose review

---

## Resumo Executivo

| Cenário | Status | Gravidade |
|---------|--------|-----------|
| 1. JWT_SECRET vazado | 🔴 **Vazado em 33+ commits do git** | **CRÍTICO** |
| 2. ANON_KEY no código-fonte | 🟢 Removido do `client.ts` (commit 3938b8f34) | ✅ Resolvido |
| 3. Senha PostgreSQL no docker-compose | 🟢 Docker secrets (`external: true`) | ✅ Seguro |
| 4. API key Evolution exposta | 🟢 Docker secrets + .env.example placeholder | ✅ Seguro |
| 5. RLS bypass via SECURITY DEFINER | 🟡 492 funções FIXADAS (2026-06-30). 1131 ainda expostas p/ authenticated | ⚠️ WARN |
| 6. SQL injection via RPC | 🟢 FIXADO (search_contacts_cursor). Validação atual via parâmetros | ✅ Resolvido |
| 7. Token service_role vazado | 🟢 Não encontrado no código | ✅ Seguro |

---

## 1. 🔴 JWT_SECRET vazado — HISTÓRICO DO GIT

**Evidência:** `.gitleaks.toml` linhas 6-56

> "JWT histórico: anon key self-hosted presente em 33 commits anteriores à remoção (2026-07-27)"

**33 commits allowlistados** no `.gitleaks.toml` com a anon key JWT do Supabase self-hosted embutida.

**O que contém o vazamento:**
```json
{
  "role": "anon",
  "iat": 1715050800
}
```
Assinatura: `rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk`

**Risco:** Qualquer pessoa com acesso ao repositório pode forjar JWTs com role `anon`. Se o JWT_SECRET for o mesmo usado para service_role, pode permitir escalonamento de privilégio.

**Mitigação:** 
- Rotacionar JWT_SECRET no Supabase self-hosted IMEDIATAMENTE (ver RUNBOOK_ROTACAO_SEGREDOS_ZAPP.md)
- Executar `git filter-repo` para remover o histórico dos commits contaminados
- Remover os commits da allowlist do `.gitleaks.toml`

---

## 2. 🟢 ANON_KEY no código-fonte — RESOLVIDO

**Status:** Removida.

- **Antes:** Hardcoded em `src/` (commit histórico)
- **Depois (commit 3938b8f34):** Removida. Agora carregada exclusivamente via `import.meta.env.VITE_SUPABASE_ANON_KEY`
- **client.ts atual:** Placeholder detection robusta com `isValidSupabaseKey()` — rejeita tokens como `undefined`, `null`, `changeme`
- **Nenhum `.env` com valores reais** no repositório (apenas `.env.example` com placeholders)

---

## 3. 🟢 Senha PostgreSQL — SEGURA

**Infra usa Docker secrets** em todos os composables:
```yaml
secrets:
  supabase_db_url_v1:
    external: true
  evolution_db_uri_v1:
    external: true
```

- `docker-compose.evolution.yml`: senha lida de `/run/secrets/*` — nunca em texto puro
- `supabase-db-mcp.yml`: `DATABASE_URL` lida de `/run/secrets/supabase_db_url_v1`
- `glitchtip.yml`: `POSTGRES_PASSWORD_FILE` de `/run/secrets/glitchtip_db_password_v1`
- `backup_v4.sh`: `PGPASSWORD` de `/run/secrets/supabase_db_password_v1`

**✅ Boa prática:** Credenciais injetadas via Docker Swarm secrets, nunca versionadas.

---

## 4. 🟢 API Key Evolution — SEGURA

- **Código:** Não hardcoded. Referenciada como `EVOLUTION_API_KEY` de env vars
- **Infra:** `evolution_api_key_v4_20260704` — Docker secret externo
- **.env.example:** placeholder `sua-evolution-api-key`
- **Frontend:** `VITE_EVOLUTION_API_KEY` também via env var

**✅ Sem exposição detectada.**

---

## 5. 🟡 RLS Bypass via SECURITY DEFINER

### 🔴 Histórico (FIXADO em 2026-06-30)
- **492** funções SECURITY DEFINER em `public` eram EXECUTABLE por `anon`
- `anon` podia invocar `rpc_list_messages()`, `rpc_insert_message()` sem autenticação
- FIX: Revogado EXECUTE de PUBLIC + anon, concedido apenas para authenticated + service_role
- **3 funções mantidas** para anon (login flow): `record_failed_login`, `clear_login_attempts`, `sync_perfil_on_login`

### 🟡 Situação ATUAL — 1.476 warnings

| Schema | SECURITY DEFINER exposto p/ authenticated | Permissive Policies (USING true) |
|--------|-------------------------------------------|----------------------------------|
| `zapp` | **1.131** funções | **272** políticas com `USING(true)` |
| `public` | **22** funções | 0 |
| `evo` | **Destacado abaixo** | **141+** políticas com `USING(true)` |

### ⚠️ Exemplos de políticas permissivas para `authenticated`

No schema `evo`, **qualquer usuário autenticado** pode:

- **`evolution_contacts`** — SELECT + UPDATE de **todos** os contatos (USING true)
- **`evolution_conversations`** — SELECT de **todas** as conversas (USING true)
- **`evolution_campaigns`** — ALL operations (CRUD) em **todas** as campanhas
- **`evolution_messages_*`** (15 schemas de partitions) — SELECT + INSERT em **todas** as mensagens
- **`evolution_groups`** — SELECT de **todos** os grupos
- **`evolution_webhook_events_*`** — SELECT de **todos** os webhooks

No schema `zapp`:
- **`whatsapp_connections`** — SELECT, UPDATE, DELETE de **todas** as conexões
- **`n8n_variables`** — ALL operations (policy `service_role_all` mas assignada a `authenticated`!)
- **`system_settings`** — ALL operations
- **`audit_logs`** — ALL operations (qualquer user autenticado lê/escreve audit log)
- **`blocked_ips`**, **`blocked_countries`** — ALL operations

### 🔴 Políticas PUBLIC (sem autenticação)

- **`zapp_audit_log`** — INSERT permitido para PUBLIC
- **`conversation_audit_logs`** — INSERT permitido para PUBLIC
- **`quick_replies`** — SELECT permitido para PUBLIC (com filtro de is_global/owner_id)
- **`feature_flags`** — SELECT permitido para `anon`

---

## 6. 🟢 SQL Injection — RESOLVIDO

### Histórico (FIXADO)
- **`search_contacts_cursor`** — SQL injection via `sort_direction` (SECURITY.md linha 116)
  - ✅ Corrigido em commits diretos

### Defesas atuais
1. **`safeClient.ts`** — `validateTableName()` com regex `^[a-zA-Z_][a-zA-Z0-9_.]*$`
2. **Todas as RPCs** usam argumentos tipados (p_*), não concatenam SQL
3. **SECURITY DEFINER** com `SET search_path = ''` (fixado em `20260716_harden_security_definer_search_path.sql`)
4. **Migrations usam `format(%I)`** para identificadores — prevenção de injection

---

## 7. 🟢 Token service_role — NÃO ENCONTRADO

- **Código-fonte:** Nenhum `service_role` hardcoded encontrado em `src/`
- **Edge Functions:** Usam `service_role` via env var `SUPABASE_SERVICE_ROLE_KEY`, não hardcoded
- **`safe-queries.ts`:** Tem `serviceRoleOnlyQueries` wrapper — documentado como "Use only in edge functions with backend"
- **Docker:** Todos os secrets são Docker Swarm externos

---

## 📊 Matriz de Risco Final

| # | Vulnerabilidade | Risco | Remediation |
|---|----------------|-------|-------------|
| 1 | JWT_SECRET em 33 commits históricos | **CRÍTICO** | Rotacionar JWT_SECRET + git filter-repo |
| 2 | 1131 SECURITY DEFINER p/ authenticated | **ALTO** | Auditar cada função: se precisa ser SECURITY DEFINER ou pode ser SECURITY INVOKER |
| 3 | Políticas USING(true) com ALL operations | **ALTO** | Implementar RLS baseado em tenant/user: `auth.uid()` ou `auth.jwt() ->> 'role'` |
| 4 | PUBLIC INSERT em audit_logs | **MÉDIO** | REVOKE INSERT FROM PUBLIC ou adicionar restrição |
| 5 | feature_flags anon-accessible | **MÉDIO** | Confirmar se feature flags precisam ser públicas |
| 6 | n8n_variables acessível p/ authenticated | **MÉDIO** | Verificar se `service_role_all` está corretamente isolada |
| 7 | GitHub Secret Scanning desabilitado | **MÉDIO** | Habilitar em Settings > Security (conforme SECURITY.md) |
| 8 | PAT embutido na URL git da workspace | **MÉDIO** | Revogar PAT, usar GH_TOKEN via ~/.netrc (issue #168) |
| 9 | Sentry DSN exposto no compose | **BAIXO** | Sentry DSN é público por design |
| 10 | CORS_ORIGIN=* no supabase-db-mcp | **BAIXO** | Restringir ao domínio do app |

---

## Ações Imediatas Recomendadas

1. **🔴 Rotacionar JWT_SECRET** do Supabase self-hosted HOJE
2. **🔴 git filter-repo** para remover histórico de secrets
3. **🟡 Auditoria** das 272 políticas `USING(true)` — implementar RLS tenant-aware
4. **🟡 Auditoria** das 1131 funções SECURITY DEFINER — converter para SECURITY INVOKER quando possível
5. **🟡 REVOKE INSERT FROM PUBLIC** em `zapp_audit_log` e `conversation_audit_logs`
6. **🟡 Habilitar** GitHub Secret Scanning (conforme SECURITY.md)
7. **🟡 Remover** PAT da URL git da workspace
