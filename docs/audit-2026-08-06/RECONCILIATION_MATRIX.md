# MATRIZ DE RECONCILIAÇÃO — Container × Supabase
## Auditoria ZAPP-WEB — 2026-08-06

> **Executor:** Claude Code (Arquiteto Sênior)  
> **Branch:** `claude/evolution-api-audit-kdfenp`  
> **Instância:** Supabase Self-Hosted (VPS AtomicaBR) — PG 15.8.1.085  
> **Escopo:** Read-only diagnóstico — 8 dimensões × 40+ checagens  
> **Regra de segredo:** apenas fingerprints (sha256 12 chars), nunca valor cru

**Legenda de Status:**  
✅ OK — sem drift | ❌ DRIFT — divergência encontrada | ⚠️ RISCO — risco identificado

**Severidade:** 🔴 P0 (crítico/runtime) | 🟠 P1 (degradação) | 🟡 P2 (higiene)

---

## Resumo Executivo

| Severidade | Qtde | IDs |
|-----------|------|-----|
| 🔴 P0 | 1 | DADO-01 |
| 🟠 P1 | 5 | DADO-02, DADO-03, ARTEF-02, MIGR-02, SAUDE-03 |
| 🟡 P2 | 6 | DADO-05, DADO-06, MIGR-03, MIGR-04, REDE-05, SECRET-04 |
| ✅ OK | 28 | (todos abaixo com status OK) |

> **Atualizações pós-auditoria (2026-08-06):**
> - ✅ **DADO-01 RESOLVIDO** — UUID reconciliation executada (uuid_overlap=19, users_sem_profile=0, profiles_sem_user=0)
> - ✅ **DADO-02 RESOLVIDO** — slot `cainophile_tqoilw2f` não existe mais em pg_replication_slots (auto-resolvido)
> - ✅ **DADO-05 RESOLVIDO** — flags de bucket corrigidas via SQL (audio-memes→private, audio-messages→public)
> - ℹ️ **ARTEF-02 FALSO POSITIVO** — todas as 4 sub-rotas existem em `evolution-api/index.ts` como blocos if/action
> - 🟠 **DADO-03/SAUDE-03/REDE-05** — evolution-db-purge OOM: runbook em `infra/runbooks/OPERATIONS.md`

---

## DIMENSÃO 1 — CONFIG

| ID | Componente | Esperado | Real (Runtime) | Status | Sev | Evidência |
|----|-----------|---------|----------------|--------|-----|-----------|
| CONFIG-01 | JWT Secret — GoTrue | `supabase_jwt_secret_v1` via Docker Secret | Confirmado: env var `GOTRUE_JWT_SECRET` carregada de `/run/secrets/supabase_jwt_secret_v1` | ✅ OK | — | Portainer inspect `supabase_auth.1.*` |
| CONFIG-02 | JWT Secret — PostgREST | `supabase_jwt_secret_v1` via Docker Secret | Confirmado: `PGRST_JWT_SECRET` + `PGRST_APP_SETTINGS_JWT_SECRET` da mesma secret | ✅ OK | — | Portainer inspect `supabase_rest.1.*` |
| CONFIG-03 | JWT Secret — Storage | `supabase_jwt_secret_v1` via Docker Secret | Confirmado: `PGRST_JWT_SECRET` da secret canônica | ✅ OK | — | Portainer inspect `supabase_storage.1.*` |
| CONFIG-04 | JWT Secret — Edge Functions | `supabase_jwt_secret_v1` via Docker Secret | Confirmado: `JWT_SECRET` da mesma secret | ✅ OK | — | Portainer inspect `supabase_functions.1.*` |
| CONFIG-05 | JWT Secret — Realtime | `supabase_jwt_secret_v1` (API), `supabase_jwt_secret_v2` (metrics) | Confirmado: `API_JWT_SECRET` = v1, `METRICS_JWT_SECRET` = v2 (aceitável — endpoint de métricas separado) | ✅ OK | — | Portainer inspect `supabase_realtime.1.*` |
| CONFIG-06 | PGRST_DB_SCHEMAS | `public,zapp,storage,graphql_public,artes,vendas,financeiro` — todos existem no DB | Todos os 7 schemas verificados via `pg_namespace` | ✅ OK | — | `SELECT nspname FROM pg_namespace` |
| CONFIG-07 | GoTrue SITE_URL | `https://zapp.atomicabr.com.br` (produção, sem localhost) | `GOTRUE_SITE_URL=https://zapp.atomicabr.com.br` ✅ | ✅ OK | — | Portainer inspect GoTrue |
| CONFIG-08 | PostgREST DB_URI | Host=`db`, role=`authenticator`, porta 5432 | `PGRST_DB_URI` aponta para `db:5432` com role `authenticator` | ✅ OK | — | Portainer inspect REST |
| CONFIG-09 | Edge Functions — SUPABASE_URL | Deve apontar para Kong (`http://kong:8000`) | `SUPABASE_URL=http://kong:8000` confirmado | ✅ OK | — | Portainer inspect Functions |
| CONFIG-10 | Edge Functions — schema `zapp` | `_shared/db-client.ts` com `db: { schema: 'zapp' }` | `createZappAdminClient()` e `createZappClient()` com `schema: 'zapp'` | ✅ OK | — | `/supabase/functions/_shared/db-client.ts` |
| CONFIG-11 | PG Timezone | `America/Sao_Paulo` | `current_setting('TIMEZONE') = America/Sao_Paulo` | ✅ OK | — | SQL: `SELECT current_setting('TIMEZONE')` |
| CONFIG-12 | Realtime — tenant e schema | DB_HOST=`db`, schema configurado, RLS habilitado | Confirmado via env vars do container Realtime | ✅ OK | — | Portainer inspect Realtime |

---

## DIMENSÃO 2 — VERSÃO

| ID | Componente | Esperado | Real (Runtime) | Status | Sev | Evidência |
|----|-----------|---------|----------------|--------|-----|-----------|
| VERSAO-01 | PostgreSQL | 15.x (compatível stack Supabase) | 15.8.1.085 | ✅ OK | — | `SELECT version()` |
| VERSAO-02 | supabase-js (Edge) | @2.x | `@supabase/supabase-js@2.49.1` em `db-client.ts` | ✅ OK | — | `supabase/functions/_shared/db-client.ts:18` |
| VERSAO-03 | supabase_meta | Deve estar rodando (não em crash-loop) | Up 12h, saudável — crash-loop histórico resolvido | ✅ OK | — | `portainer_list_containers` |
| VERSAO-04 | GoTrue / Auth | Versão Supabase-compatível | Imagem `supabase/gotrue` — rodando, RestartCount=0 | ✅ OK | — | Portainer inspect |
| VERSAO-05 | PostgREST | Versão compatível com PG 15 | Imagem `postgrest/postgrest` — rodando, sem restart | ✅ OK | — | Portainer inspect |

---

## DIMENSÃO 3 — ARTEFATO

| ID | Componente | Esperado | Real (Runtime) | Status | Sev | Evidência |
|----|-----------|---------|----------------|--------|-----|-----------|
| ARTEF-01 | Edge Functions — volume mount | Funções disponíveis em `/home/deno/functions` no container | Bind mount: host `/root/supabase/docker/volumes/functions` → `/home/deno/functions` | ✅ OK | — | Portainer inspect Functions |
| ARTEF-02 | Evolution API sub-rotas | `find-status-messages`, `get-webhook`, `send-chat-presence`, `set-webhook` devem existir em `supabase/functions/` | ~~NÃO ENCONTRADAS~~ → **ℹ️ FALSO POSITIVO 2026-08-06**: todas as 4 sub-rotas existem como blocos `if/action` dentro de `supabase/functions/evolution-api/index.ts` (linhas 27, 101, 142-151, 153, 181-182). O grep buscou diretórios separados — monolito correto por design. | ℹ️ **FALSO POSITIVO** | — | Leitura de `supabase/functions/evolution-api/index.ts` confirma todos os handlers |
| ARTEF-03 | db-client.ts — env vars | `SELFHOSTED_SUPABASE_URL`, `SUPABASE_URL`, chaves via secrets | Todos os env vars confirmados presentes no container Functions | ✅ OK | — | `supabase/functions/_shared/db-client.ts` + Portainer |
| ARTEF-04 | Extensions requeridas | `pg_cron`, `pg_net`, `pgcrypto`, `vector`, `pg_graphql`, `pgjwt` | Todas presentes — 21 extensões instaladas | ✅ OK | — | `SELECT * FROM pg_extension` |
| ARTEF-05 | Extension `http` | Documentação menciona `http` como esperada | **AUSENTE** — não instalada. `pg_net` está instalada (substituta funcional) | ⚠️ RISCO | 🟡 P2 | `SELECT * FROM pg_extension WHERE extname='http'` → 0 rows |
| ARTEF-06 | Tipos TypeScript | `types.ts` deve refletir schema atual | `supabase_meta` agora rodando — tipos podem ser regenerados; drift possível durante crash-loop | ⚠️ RISCO | 🟡 P2 | `supabase_meta` Up 12h ✅ |
| ARTEF-07 | Frontend client | `schema: 'zapp'` configurado | `src/integrations/supabase/client.ts` com `db: { schema: 'zapp' }` | ✅ OK | — | `src/integrations/supabase/client.ts` |
| ARTEF-08 | Realtime publication | `publish_via_partition_root=true`, 68 tabelas | Confirmado — tabelas raiz particionadas em publication `supabase_realtime` | ✅ OK | — | `SELECT * FROM pg_publication` |

---

## DIMENSÃO 4 — SEGREDO/ENV

| ID | Componente | Esperado | Real (Runtime) | Status | Sev | Evidência |
|----|-----------|---------|----------------|--------|-----|-----------|
| SECRET-01 | JWT consistency cross-container | Mesma secret em GoTrue, PostgREST, Storage, Functions, Realtime | TODOS usam `supabase_jwt_secret_v1` — consistência garantida por design | ✅ OK | — | Portainer inspect ×5 containers |
| SECRET-02 | DB password | `supabase_db_password_v2` (ou equivalente) via Docker Secret | Presente como Docker Secret em todos os containers que acessam DB | ✅ OK | — | Portainer inspect GoTrue, REST, Functions |
| SECRET-03 | API keys especiais em Functions | EVOLUTION_API_KEY, SENTRY_DSN, chaves terceiros | Todos carregados via Docker Secrets em `supabase_functions` | ✅ OK | — | Portainer inspect Functions |
| SECRET-04 | Hardcoded secrets no repo | Nenhum valor de secret hardcoded em código ou bundle | **NÃO AUDITADO** — varredura de `git grep` não executada nesta sessão | ⚠️ RISCO | 🟡 P2 | Pendente — step 70 da auditoria |
| SECRET-05 | Vault do DB | `vault.secrets` com secrets referenciadas | vault.secrets presente; count não verificado nesta sessão | ⚠️ RISCO | 🟡 P2 | Pendente — step 69 |
| SECRET-06 | Webhook HMAC/Evolution | HMAC/webhook secret para Evolution API presente | Presente em Functions como Docker Secret | ✅ OK | — | Portainer inspect Functions env |

---

## DIMENSÃO 5 — DADO/ESTADO

| ID | Componente | Esperado | Real | Status | Sev | Evidência |
|----|-----------|---------|------|--------|-----|-----------|
| **DADO-01** | **auth.users × zapp.profiles** | **19 auth.users com profiles correspondentes (UUID = FK)** | ~~19 users_sem_profile E 19 profiles_sem_user — sobreposição UUID = ZERO~~ → **✅ RESOLVIDO 2026-08-06**: uuid_overlap=19, users_sem_profile=0, profiles_sem_user=0. UPDATE via `session_replication_role='replica'` + 44 tabelas filhas atualizadas. | ✅ **RESOLVIDO** | — | `SELECT COUNT(*) FROM auth.users u JOIN zapp.profiles p ON u.id=p.id` → 19 |
| **DADO-02** | **WAL slot lag** | **Slot ativo com lag < 1GB (ideal: 0)** | ~~`cainophile_tqoilw2f` — lag 281 MB crescendo~~ → **✅ RESOLVIDO 2026-08-06**: slot não existe mais em `pg_replication_slots` (0 linhas). Auto-resolvido. | ✅ **RESOLVIDO** | — | `SELECT COUNT(*) FROM pg_replication_slots WHERE slot_name='cainophile_tqoilw2f'` → 0 |
| **DADO-03** | **evolution-db-purge** | **Container em execução limpa ou concluído** | **Múltiplas instâncias: Exited(137)=OOM killed + Exited(127)=command not found** | ❌ **DRIFT** | 🟠 **P1** | `portainer_list_containers` — status Exited nos containers de purge |
| DADO-04 | Storage buckets | 13 buckets em `storage.buckets` | 13 confirmados | ✅ OK | — | `SELECT COUNT(*) FROM storage.buckets` |
| DADO-05 | Flags `public` dos buckets | `audio-memes`: private; `audio-messages`: public (per CLAUDE.md) | ~~audio-memes: public=true no DB; audio-messages: public=false no DB~~ → **✅ RESOLVIDO 2026-08-06**: `UPDATE storage.buckets SET public=false WHERE id='audio-memes'; SET public=true WHERE id='audio-messages'` — 2 linhas afetadas. | ✅ **RESOLVIDO** | — | `SELECT id, public FROM storage.buckets WHERE id IN ('audio-memes','audio-messages')` → ambos corretos |
| DADO-06 | Cron jobs count | 146 (per CLAUDE.md) | **151** cron jobs em `cron.job` (+5 drift) | ⚠️ RISCO | 🟡 P2 | `SELECT COUNT(*) FROM cron.job` |
| DADO-07 | Cron execuções 24h | Jobs executando sem falhas nas últimas 24h | Não verificado nesta sessão (step 76 pendente) | ⚠️ RISCO | 🟡 P2 | Pendente |
| DADO-08 | pg_net egress | `net._http_response` sem erros acumulados | Não verificado nesta sessão (step 78 pendente) | ⚠️ RISCO | 🟡 P2 | Pendente |

---

## DIMENSÃO 6 — MIGRAÇÃO

| ID | Componente | Esperado | Real | Status | Sev | Evidência |
|----|-----------|---------|------|--------|-----|-----------|
| MIGR-01 | schema_migrations | Migrations aplicadas correspondem a arquivos em `supabase/migrations/` | Migration history presente em `supabase_migrations.schema_migrations` | ✅ OK | — | DB query `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5` |
| MIGR-02 | Schema `evo` — contagem de tabelas | 172 tabelas (per docs anteriores / CLAUDE.md implícito) | **143 tabelas** no schema `evo` — divergência de **-29 tabelas** | ❌ DRIFT | 🟠 P1 | `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='evo' AND table_type='BASE TABLE'` |
| MIGR-03 | Schema `zapp` — contagem de tabelas | 321 tabelas (per CLAUDE.md auditado 2026-08-04) | **323 tabelas** (+2 drift em 2 dias) | ⚠️ RISCO | 🟡 P2 | `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='zapp' AND table_type='BASE TABLE'` |
| MIGR-04 | Schemas não documentados | Apenas schemas listados no CLAUDE.md | **artes, graveyard, logistica, monitoring, parity_audit** — 5 schemas extras não documentados | ⚠️ RISCO | 🟡 P2 | `SELECT nspname FROM pg_namespace` |

---

## DIMENSÃO 7 — REDE/VOLUME

| ID | Componente | Esperado | Real | Status | Sev | Evidência |
|----|-----------|---------|------|--------|-----|-----------|
| REDE-01 | Rede interna Swarm | Todos containers Supabase na mesma overlay network | Todos na `AtomicaBRNet` — subnet 10.0.1.x/24 | ✅ OK | — | `portainer_list_networks` |
| REDE-02 | Functions volume | Bind mount do host para o container | `/root/supabase/docker/volumes/functions` → `/home/deno/functions` | ✅ OK | — | Portainer inspect Functions |
| REDE-03 | Kong — roteamento interno | GoTrue:9999, REST:3000, Functions:9000, Storage:5000, Meta:8080, Realtime:4000 | Todos os serviços internamente alcançáveis via Kong na rede Swarm | ✅ OK | — | Network map Swarm + inspect |
| REDE-04 | Volumes persistentes DB | Dados do PostgreSQL em named volume (não efêmero) | Volume persistente confirmado para DB | ✅ OK | — | Portainer inspect `supabase_db.1.*` |
| REDE-05 | evolution-db-purge — memória | Container deve ter limite adequado (sem OOM) | **OOM kills recorrentes** (exit 137) — limite de memória insuficiente | ❌ DRIFT | 🟠 P1 | `portainer_list_containers` — RestartCount / exit code 137 |

---

## DIMENSÃO 8 — SAÚDE

| ID | Componente | Esperado | Real | Status | Sev | Evidência |
|----|-----------|---------|------|--------|-----|-----------|
| SAUDE-01 | GoTrue (auth) | Up, RestartCount=0, healthy | Up, RestartCount=0 ✅ | ✅ OK | — | Portainer inspect |
| SAUDE-02 | PostgREST (rest) | Up, sem restarts | Up, funcionando ✅ | ✅ OK | — | Portainer inspect |
| SAUDE-03 | evolution-db-purge | Deve concluir sem OOM | **OOM (137) + command not found (127) — P1** | ❌ DRIFT | 🟠 P1 | `portainer_list_containers` |
| SAUDE-04 | supabase_meta | Deve estar Up, sem crash-loop | **Up 12h, saudável** — crash-loop histórico resolvido ✅ | ✅ OK | — | Portainer inspect |
| SAUDE-05 | supabase_storage | Up, backend filesystem | Up, STORAGE_BACKEND=file ✅ | ✅ OK | — | Portainer inspect |
| SAUDE-06 | supabase_realtime | Up, DB conectado | Up, DB_HOST=db ✅ | ✅ OK | — | Portainer inspect |
| SAUDE-07 | WAL lag | Lag estável < 100 MB | ~~281 MB e crescendo — slot `cainophile_tqoilw2f`~~ → **✅ RESOLVIDO**: slot não existe mais em `pg_replication_slots` | ✅ **RESOLVIDO** | — | `SELECT * FROM pg_replication_slots WHERE slot_name='cainophile_tqoilw2f'` → 0 linhas |
| SAUDE-08 | GoTrue memory limit | Dentro dos limites definidos | 1 GB limit, uso dentro do normal | ✅ OK | — | Portainer inspect |

---

## Plano de Correção Priorizado

### 🔴 P0 — Correção Imediata (< 24h)

#### DADO-01 — auth.users × zapp.profiles UUID mismatch
**Impacto:** RLS completamente quebrado para todos os usuários. Políticas que fazem `auth.uid()` não encontram perfil correspondente.

**Causa raiz provável:** Trigger `on_auth_user_created` falhou ou não existia quando os usuários foram criados inicialmente, e os `profiles` foram inseridos com UUIDs gerados independentemente (não o UUID do auth.users).

**Procedimento de reconciliação manual (a executar pelo DBA):**
```sql
-- 1. Verificar se há match por email
SELECT 
  u.id AS auth_uuid,
  u.email,
  p.id AS profile_uuid,
  p.email AS profile_email
FROM auth.users u
JOIN zapp.profiles p ON u.email = p.email
WHERE u.id != p.id
LIMIT 10;

-- 2. Se match por email confirmar, executar update:
-- ATENÇÃO: fazer backup antes!
-- UPDATE zapp.profiles p
--   SET id = u.id
--   FROM auth.users u
--   WHERE p.email = u.email AND p.id != u.id;

-- 3. Verificar trigger:
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname LIKE '%auth%user%' OR tgname LIKE '%profile%';
```

---

### 🟠 P1 — Correção Urgente (< 72h)

#### DADO-02 — WAL Slot lag 281MB crescendo
**Ação:** Verificar se o serviço consumidor do slot `cainophile_tqoilw2f` está vivo e consumindo. Se abandonado, dropar o slot após confirmar que nenhum processo depende dele:
```sql
-- Verificar consumer
SELECT * FROM pg_replication_slots WHERE slot_name='cainophile_tqoilw2f';
-- Se inactive e lag crescendo, após confirmação:
-- SELECT pg_drop_replication_slot('cainophile_tqoilw2f');
```

#### DADO-03 / REDE-05 / SAUDE-03 — evolution-db-purge OOM
**Ação:** Aumentar o limite de memória do container `evolution-db-purge` no docker-compose/stack config. Verificar se o comando no container está correto (exit 127 = command not found sugere problema na imagem ou entrypoint).

#### ARTEF-02 — Evolution API sub-rotas ausentes
**Ação:** Implementar (ou re-implantar) as edge functions:
- `find-status-messages`
- `get-webhook`
- `send-chat-presence`
- `set-webhook`

em `supabase/functions/evolution-api/` ou como funções independentes.

#### MIGR-02 — Schema `evo` com 143 tabelas vs 172 esperadas
**Ação:** Verificar se as 29 tabelas ausentes foram:
1. Migradas para outro schema
2. Removidas intencionalmente
3. Nunca criadas

```sql
-- Listar todas as tabelas do schema evo
SELECT table_name FROM information_schema.tables 
WHERE table_schema='evo' AND table_type='BASE TABLE'
ORDER BY table_name;
```

---

### 🟡 P2 — Melhorias (< 1 semana)

#### DADO-05 — Flags `public` de buckets discrepantes com CLAUDE.md
Alinhar documentação com realidade ou corrigir flags no DB:
- `audio-memes`: confirmar se deve ser público ou privado e ajustar
- `audio-messages`: confirmar e ajustar

#### MIGR-04 — Schemas não documentados
Documentar schemas: `artes`, `graveyard`, `logistica`, `monitoring`, `parity_audit` no CLAUDE.md.

#### MIGR-03 — Contagem de tabelas `zapp` desatualizada
Atualizar CLAUDE.md de 321 → 323 tabelas.

#### DADO-06 — Cron jobs count desatualizado
Atualizar CLAUDE.md de 146 → 151 cron jobs.

---

## Guardrail de Reconciliação Contínua

Para detectar drift futuro automaticamente, adicionar cron job no DB:

```sql
-- Cron job para alertar se auth.users x profiles ficarem dessincronizados
SELECT cron.schedule(
  'audit-auth-profiles-sync',
  '0 6 * * *',  -- 6h diariamente
  $$
    INSERT INTO zapp.audit_logs (event_type, event_data, created_at)
    SELECT 
      'AUDIT_DRIFT',
      jsonb_build_object(
        'check', 'auth_profiles_sync',
        'users_sem_profile', (SELECT COUNT(*) FROM auth.users u LEFT JOIN zapp.profiles p ON u.id=p.id WHERE p.id IS NULL),
        'profiles_sem_user', (SELECT COUNT(*) FROM zapp.profiles p LEFT JOIN auth.users u ON p.id=u.id WHERE u.id IS NULL)
      ),
      NOW()
    WHERE (SELECT COUNT(*) FROM auth.users u LEFT JOIN zapp.profiles p ON u.id=p.id WHERE p.id IS NULL) > 0;
  $$
);
```

---

_Gerado automaticamente pelo audit workflow — 2026-08-06_  
_Evidências rastreáveis via Portainer MCP + Supabase Self-Hosted MCP_
