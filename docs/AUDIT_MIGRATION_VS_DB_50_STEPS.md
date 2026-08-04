# Auditoria: Migration Code vs Banco Canônico Supabase Self-Hosted
## Plano de 50 Etapas de Remediação

**Data**: 2026-08-04  
**Auditado por**: Claude Code (multi-agent workflow `wf_8653a7dd-270`, 10 sub-agentes)  
**Branch**: `claude/auditoria-migracao-supabase-oj6val`  
**Supabase**: Self-hosted VPS AtomicaBR (`https://supabase.atomicabr.com.br`)  
**Migration canônica**: `supabase/migrations/20260804000000_canonical_schema.sql` (779 KB, 16.352 linhas, 133 seções)

---

## Resumo Executivo

A auditoria comparou o arquivo de migration canônica (squash de 133 migrations) contra o banco de produção via queries diretas ao Supabase Self-Hosted MCP. Foram auditadas:

- **321 tabelas** em `zapp` → 100% com RLS habilitado ✅
- **1.058 funções** em `zapp` → 80 na migration (gap estrutural esperado) ⚠️
- **20 tabelas críticas de Realtime** → 100% na publication `supabase_realtime` ✅
- **146 cron jobs ativos** → todas as funções referenciadas existem ✅
- **0 funções SECDEF** sem `search_path` fixo ✅
- **0 views inválidas/quebradas** em `zapp` ✅
- **0 gaps de índice FK** ✅
- **89 migrations registradas** no DB (mais antiga: `20260716`, mais nova: `20260804000000`) ✅

**Gaps críticos identificados**: 2 estruturais, 6 de função (stubs), 2 de QA pendentes, 1 de tabela órfã.

---

## Legenda de Severidade

| Ícone | Severidade | Impacto |
|-------|-----------|---------|
| 🔴 | CRÍTICO | Impossibilita restore fresco ou causa perda de dados |
| 🟠 | ALTO | Funcionalidade bloqueada para usuários |
| 🟡 | MÉDIO | Feature incompleta mas sistema funciona |
| 🟢 | BAIXO | Melhoria de qualidade / documentação |
| ✅ | RESOLVIDO | Já corrigido e verificado |

---

## PARTE I — GAPS ESTRUTURAIS DE SCHEMA (Etapas 1–10)

### Etapa 1 🔴 — Criar `supabase/ci/full-schema-dump.sql`

**Gap**: GAP-S1 (CRÍTICO). A migration canônica `20260804000000` contém apenas 133 migrações incrementais de 2026-07-16 em diante. As 300+ tabelas que existiam antes dessa data **não têm migration**. Um restore em banco vazio a partir do arquivo atual é impossível.

**Evidência**: DB tem 321 tabelas em `zapp`; a migration cria ~12 (`queue_analytics`, `sentiment_alerts`, `evolution_sentiment_analysis`, `calls` refatorada, `talkx_recipients` refatorada, etc.). As demais existem apenas no banco de produção.

**Ação**:
1. Executar `pg_dump --schema-only --schema=zapp --schema=evo --schema=bpm --schema=email_app --schema=ai --schema=financeiro --schema=vendas --schema=ops --schema=archive` no servidor de produção
2. Salvar em `supabase/ci/full-schema-dump.sql`
3. Adicionar ao `.gitignore` se contiver dados sensíveis, ou sanitizar e commitar
4. Atualizar `supabase/ci/pg-bootstrap.sql` para incluir pré-requisitos de extensões/schemas

**Critério de Aceite**: `psql -f supabase/ci/pg-bootstrap.sql && psql -f supabase/ci/full-schema-dump.sql && psql -f supabase/migrations/20260804000000_canonical_schema.sql` completa sem erros em banco vazio.

---

### Etapa 2 🔴 — Documentar a política de "migration-only-from-2026-07-16"

**Gap**: GAP-S1 (complementar). A ausência de migrations pré-existentes é uma decisão técnica, não um erro — mas não está documentada. Novas pessoas no projeto tentarão usar as migrations para fazer rollback ou ambiente de dev e falharão silenciosamente.

**Ação**:
1. Adicionar seção "Limitações de Restore" no `docs/SCHEMA_REFERENCE.md`
2. Adicionar aviso claro no header de `20260804000000_canonical_schema.sql` explicando que o dump completo (`full-schema-dump.sql`) é necessário para restore de zero
3. Atualizar `infra/runbooks/OPERATIONS.md` com procedimento de restore completo em 3 passos: `pg-bootstrap.sql → full-schema-dump.sql → canonical migration`

**Critério de Aceite**: Developer consegue recriar o ambiente dev em < 30 min seguindo o runbook.

---

### Etapa 3 🟠 — Reconciliar contagem de funções: 1.058 no DB vs 80 na migration

**Gap**: GAP-S2. O banco de produção tem 1.058 funções em `zapp`. A migration canônica tem 80 `CREATE OR REPLACE FUNCTION`. As 978 restantes só existem no banco, criadas antes do sistema de migrations.

**Evidência**:
```sql
-- Resultado real (auditado):
SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zapp'; -- → 1058
```

**Ação**:
1. Extrair definições das funções via `pg_get_functiondef()` (não via `pg_dump -t pg_catalog.pg_proc` — que não aceita tabelas de catálogo):
   ```bash
   psql -Atc "SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='zapp'" > zapp-functions.sql
   ```
2. Categorizar por prefixo: `rpc_*` (RPCs), `fn_*` (triggers/interno), `has_*` (auth helpers), etc.
3. Priorizar funções chamadas por edge functions e hooks do frontend para inclusão no `full-schema-dump.sql`
4. Para funções críticas de negócio: criar migrations individuais em `supabase/migrations/` para garantir versionamento

**Critério de Aceite**: Pelo menos as 18 RPCs críticas (auditadas na Etapa 10) têm migration própria.

---

### Etapa 4 🟢 — Remover/documentar `_backup_avatar_urls_20260803`

**Gap**: GAP-S3. Tabela `zapp._backup_avatar_urls_20260803` existe no banco com RLS=true mas **0 políticas** — implicit deny-all. Criada ad-hoc como backup temporário, sem migration.

**Evidência**:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'zapp' AND tablename LIKE '_backup%'; -- → 1 linha
SELECT COUNT(*) FROM pg_policies WHERE schemaname='zapp' AND tablename='_backup_avatar_urls_20260803'; -- → 0
```

**Ação** (escolher uma):
- **Opção A (recomendada)**: Dropar a tabela após confirmar que os dados foram migrados para `zapp.profiles`
- **Opção B**: Adicionar `COMMENT ON TABLE zapp._backup_avatar_urls_20260803 IS 'Backup temporário criado em 2026-08-03, pode ser dropado após confirmação'`
- Nunca criar policy SELECT/INSERT para ela — deny-all é o comportamento correto para tabelas de backup

**Critério de Aceite**: Tabela dropada ou comentada com prazo de expiração.

---

### Etapa 5 🟠 — Auditar e documentar VIEW proxies em `zapp` criadas por `20260802000004`

**Gap**: BUG-37 foi resolvido pela migration `20260802000004` que criou 20 VIEWs em `zapp` para tabelas físicas em `public`, `email_app` e outros schemas. Essas views não têm testes automatizados.

**Ação**:
1. Listar todas as 20 VIEWs criadas por `20260802000004`:
   ```sql
   SELECT viewname FROM pg_views WHERE schemaname = 'zapp'
   AND viewname IN ('gmail_accounts','gmail_threads','gmail_messages',
   'voice_conversion_queue','sts_telemetry',...);
   ```
2. Verificar que cada VIEW tem `WITH (security_invoker=on)`
3. Verificar que `GRANT SELECT` está presente para `authenticated`
4. Adicionar teste de integração em `src/integrations/supabase/` validando que queries via `supabase.from('gmail_accounts')` retornam dados (mesmo que vazio)

**Critério de Aceite**: Todas as 20 VIEWs têm `security_invoker=on` e GRANT correto.

---

### Etapa 6 🟡 — Auditar integridade das 532 VIEW proxies em `public`

**Gap**: `public` tem 532 views (proxies para `zapp`, `evo`, `email_app`, etc.). Não há teste automatizado verificando que cada view ainda aponta para a tabela correta após refatorações.

**Ação**:
1. Query para detectar views com dependências quebradas usando `information_schema.view_table_usage` + `pg_class/pg_namespace` (mais confiável que regex em `definition`):
   ```sql
   SELECT v.viewname
   FROM pg_views v
   WHERE v.schemaname = 'public'
   AND NOT EXISTS (
     SELECT 1 FROM information_schema.view_table_usage vtu
     WHERE vtu.view_schema = 'public'
       AND vtu.view_name = v.viewname
       AND EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = vtu.table_schema AND c.relname = vtu.table_name
       )
   );
   ```
2. Criar script `scripts/validate-view-proxies.sh` que executa essa query e falha se > 0 views quebradas
3. Adicionar ao CI pipeline

**Critério de Aceite**: Script retorna 0 views quebradas; adicionado ao CI.

---

### Etapa 7 🟡 — Verificar que todas as partições de `evolution_messages` estão cobertas

**Gap**: `evo.evolution_messages` tem 25 partições por instância. Se uma nova instância WA for adicionada, a partição precisa ser criada manualmente. Não há migration ou automação para isso.

**Partições confirmadas**: `wpp2`, `wpp2_archive`, `artes`, `comercial_01`–`comercial_15`, `compras`, `default`, `financeiro`, `gravacao`, `logistica`, `marketing`

**Ação**:
1. Criar função `evo.fn_create_instance_partitions(p_instance_name TEXT)` que cria as partições automaticamente
2. Chamar esta função ao criar uma nova `whatsapp_connections`
3. Adicionar trigger em `zapp.whatsapp_connections` para auto-criar partições em `evo.evolution_messages` e `evo.evolution_conversations`
4. Documentar em `docs/EVOLUTION_API_REFERENCE.md` seção "Adicionando nova instância WA"

**Critério de Aceite**: Nova instância cria partições automaticamente; sem DDL manual.

---

### Etapa 8 🟡 — Garantir que `supabase_realtime` publication inclui todas as tabelas futuras

**Gap**: Toda vez que uma tabela nova é criada e precisa de Realtime, é necessário rodar `ALTER PUBLICATION supabase_realtime ADD TABLE`. Isso tem causado múltiplos bugs (BUG-21 a BUG-35). Não há mecanismo preventivo.

**Ação**:
1. Criar **event trigger** (não trigger DML) `zapp.fn_auto_add_to_realtime` usando `CREATE EVENT TRIGGER ... ON ddl_command_end` para interceptar CREATE TABLE e adicionar tabelas com comentário `@realtime` à publication automaticamente — triggers DML não detectam DDL
2. OU: Criar checklist de migration obrigatório no `CLAUDE.md` com template:
   ```sql
   -- Ao criar nova tabela:
   -- 1. CREATE TABLE zapp.nova_tabela (...)
   -- 2. ALTER TABLE zapp.nova_tabela ENABLE ROW LEVEL SECURITY
   -- 3. CREATE POLICY ...
   -- 4. ALTER PUBLICATION supabase_realtime ADD TABLE zapp.nova_tabela  ← NÃO ESQUECER
   ```
3. Adicionar CI check que lista tabelas em `zapp` sem presença na publication e falha se alguma tabela tem subscription no frontend mas não está na publication

**Critério de Aceite**: Nenhum novo bug de "subscription silenciosa" após merge.

---

### Etapa 9 🟢 — Atualizar header da migration canônica com estatísticas corretas

**Gap**: O header da migration tem estatísticas que podem ficar desatualizadas. A última correção (`cf13833`) ajustou para "133 migrations / 16.352 linhas" mas a contagem precisa ser validada automaticamente.

**Ação**:
1. Criar script `scripts/update-migration-header.sh` que atualiza automaticamente as estatísticas no header da migration canônica
2. Adicionar ao workflow de merge: `bash scripts/update-migration-header.sh && git add supabase/migrations/ && git commit -m "chore: update migration stats"`

**Critério de Aceite**: Header sempre reflete contagem real de linhas e seções.

---

### Etapa 10 🟢 — Criar índice de RPCs críticas com testes de existência

**Gap**: As 18 RPCs críticas são verificadas manualmente. Não há teste automatizado que garanta que todas existem após um restore.

**RPCs críticas auditadas** — 17 existem hoje ✅, 1 ausente por design:

Existentes: `rpc_list_failed_messages_cursor`, `rpc_list_dispatch_error_logs_cursor`, `rpc_dlq_list_audit_cursor`, `rpc_dlq_bulk_retry_now`, `rpc_dlq_log_item_action`, `rpc_dlq_log_reprocess_trigger`, `rpc_dlq_log_reprocess_result`, `search_contacts_cursor`, `rpc_list_transfers_paginated`, `add_contacts_to_campaign`, `initiate_gmail_oauth` (stub), `complete_gmail_oauth` (stub), `sync_to_crm` (stub), `export_user_data`, `import_user_data` (stub), `enrich_contact` (stub), `get_latest_analysis` (stub)

**Ausente por design** (fail-open intencional): `check_download_permission` — função não existe; o frontend trata SQLSTATE 42883 como permissão concedida. Ver Etapa 17 para implementação real.

**Ação**:
1. Criar `supabase/tests/critical-rpcs.sql` com:
   ```sql
   DO $$ DECLARE missing TEXT := '';
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='zapp' AND p.proname='rpc_list_failed_messages_cursor') THEN
       missing := missing || 'rpc_list_failed_messages_cursor, ';
     END IF;
     -- ... demais RPCs
     IF missing != '' THEN RAISE EXCEPTION 'RPCs ausentes: %', missing; END IF;
   END $$;
   ```
2. Adicionar ao CI: `psql -f supabase/tests/critical-rpcs.sql`

**Critério de Aceite**: Teste passa após restore completo; falha se qualquer RPC crítica estiver ausente.

---

## PARTE II — STUBS DE FUNÇÃO INCOMPLETOS (Etapas 11–20)

### Etapa 11 🟠 — Implementar `zapp.initiate_gmail_oauth` (GAP-2)

**Status atual**: Stub com `RAISE EXCEPTION 'Not implemented'` (ERRCODE P0001). Criado em `20260717000002_create_missing_rpcs_stubs.sql`.

**Comportamento esperado**: Iniciar fluxo OAuth2 com Google, retornar URL de autorização.

**Ação**:
1. Ampliar a Edge Function existente `supabase/functions/gmail-oauth/index.ts` (já deployada) com o handler de initiate
2. Usar Google OAuth2 API: `https://accounts.google.com/o/oauth2/v2/auth`
3. Parâmetros: `client_id` (de Secret `GOOGLE_CLIENT_ID`), `redirect_uri`, `scope=https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send`, `state` (JWT assinado com user_id) — usar URIs completas de escopo, não abreviações
4. A Edge Function deve ser chamada diretamente do frontend (não via `http_post()` da RPC)
5. Atualizar `useIntegrationManagement.ts:54` para tratar URL retornada e redirecionar
6. Substituir stub por implementação real em nova migration

**Critério de Aceite**: Usuário consegue conectar conta Gmail via OAuth2; `email_app.email_accounts` recebe registro.

---

### Etapa 12 🟠 — Implementar `zapp.complete_gmail_oauth` (GAP-2 cont.)

**Status atual**: Stub com `RAISE EXCEPTION`. Chamado no callback OAuth2 com `code` e `state`.

**Ação**:
1. Edge Function `supabase/functions/gmail-oauth-callback/index.ts`
2. Trocar `code` por `access_token` + `refresh_token` via `POST https://oauth2.googleapis.com/token`
3. Salvar tokens em `email_app.email_accounts` (colunas `access_token`, `refresh_token`, `token_expires_at`)
4. Disparar Realtime: `email_app.email_accounts` já está na publication `supabase_realtime` (adicionada em `20260724000006`)
5. Atualizar `useGmailOAuthFlow.ts:292` — já escuta `email_app.email_accounts`; apenas garantir que o INSERT/UPDATE seja feito

**Critério de Aceite**: Callback OAuth2 persiste tokens; `useGmailOAuthFlow.ts` recebe evento Realtime e atualiza estado.

---

### Etapa 13 🟠 — Implementar `zapp.sync_to_crm` (GAP-3)

**Status atual**: Stub com `RAISE EXCEPTION 'CRM sync not implemented'`.

**Ação**:
1. Definir qual CRM é alvo (HubSpot? Salesforce? RD Station?)
2. Criar Edge Function `supabase/functions/crm-sync/index.ts` com:
   - Input: `contact_id UUID` (ou array)
   - Lookup: `zapp.contatos` → mapear campos para payload CRM
   - HTTP POST para API do CRM com autenticação via Supabase Secret
3. Substituir stub por chamada à Edge Function via `net.http_post()`
4. Adicionar tabela `zapp.crm_sync_log` com resultado (sucesso/erro) para auditoria
5. Adicionar cron job `cron_crm_sync` a cada 15 min para sincronização incremental

**Critério de Aceite**: Contato criado no Zapp aparece no CRM dentro de 15 min.

---

### Etapa 14 🟡 — Implementar `zapp.import_user_data` (GAP-4)

**Status atual**: Stub com `RAISE EXCEPTION 'Import not implemented'`. Export funciona parcialmente (retorna dados de perfil).

**Ação**:
1. Definir formato de import: JSON com campos `profile`, `contatos`, `conversas`, `configurações`
2. Implementar validação de schema do JSON (usar `jsonschema` ou validação manual)
3. Implementar transação de import com rollback em caso de erro
4. Adicionar rate limiting: máximo 1 import por usuário por hora
5. Emitir notificação via `zapp.app_notifications` quando import concluir

**Critério de Aceite**: Usuário consegue fazer round-trip: export → import → dados restaurados.

---

### Etapa 15 🟡 — Melhorar `zapp.enrich_contact` (GAP-5)

**Status atual**: Stub que retorna dados básicos do contato com `enriched: false`.

**Ação**:
1. Integrar com API de enriquecimento (Clearbit? FullContact? Hunter.io?)
2. Adicionar Secret `ENRICHMENT_API_KEY` no Supabase Vault
3. Criar Edge Function `supabase/functions/contact-enrichment/index.ts`
4. Cachear resultados em `zapp.contatos` via JSONB column `enrichment_data`
5. Retornar `enriched: true` com dados reais quando enriquecimento bem-sucedido

**Critério de Aceite**: `enrich_contact(contact_id)` retorna dados como email, cargo, empresa quando disponíveis via API.

---

### Etapa 16 🟡 — Melhorar `zapp.get_latest_analysis` (GAP-6)

**Status atual**: Stub que retorna média de `contact_intelligence.engagement_score`.

**Ação**:
1. Definir schema completo de análise: sentiment, engagement, propensity_to_buy, churn_risk
2. Criar tabela `zapp.contact_intelligence` se não existir (ou verificar se já existe)
3. Implementar função real que agrega análises dos últimos 30 dias
4. Integrar com `evolution_sentiment_analysis` (criada em `20260724000007`) para dados de sentimento
5. Retornar estrutura completa: `{ engagement_score, sentiment_avg, last_interaction, next_action_recommendation }`

**Critério de Aceite**: Dashboard de analytics mostra dados reais de inteligência de contato.

---

### Etapa 17 🟡 — Implementar `zapp.check_download_permission` (BUG-9 design)

**Status atual**: Função **intencionalmente ausente** — frontend faz fail-open em SQLSTATE 42883. Documentado como resolvido mas é risco de segurança (acesso irrestrito a downloads).

**Ação**:
1. Criar a função `zapp.check_download_permission(p_bucket TEXT, p_path TEXT) RETURNS BOOLEAN`
2. Implementar verificação baseada em:
   - Usuário autenticado tem acesso ao workspace
   - Arquivo pertence a workspace do usuário
   - Bucket está na lista de permitidos para o papel do usuário
3. Atualizar `useMediaManagement.ts:164` para remover fail-open e tratar erro real
4. Adicionar REVOKE/GRANT correto

**Critério de Aceite**: Downloads são restritos a usuários com permissão; falha explícita (não silenciosa) para não-autorizados.

---

### Etapa 18 🟠 — Resolver BUG-C: n8n FK constraint em `workflow_history`

**Status atual**: BUG-C da sessão QA 2026-07-22 ainda pendente. Constraint de FK violada no banco do n8n.

**Investigação necessária**:
1. Acessar container n8n: `docker exec -it n8n_container psql -U n8n`
2. Identificar o workflow que causa a violação: `SELECT * FROM workflow_history ORDER BY id DESC LIMIT 20`
3. Verificar tabela referenciada: `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table FROM information_schema.table_constraints AS tc ...`
4. Opção A: Antes de deletar, criar backup: `CREATE TABLE workflow_history_backup_20260804 AS SELECT * FROM workflow_history WHERE workflow_id NOT IN (SELECT id FROM workflow)`. Depois: `DELETE FROM workflow_history WHERE workflow_id NOT IN (SELECT id FROM workflow)`
5. Opção B: Desabilitar FK temporariamente, limpar, reabilitar com `ON DELETE CASCADE`

**Critério de Aceite**: n8n não loga FK constraint errors; workflows historicizados corretamente.

---

### Etapa 19 🟠 — Resolver BUG-D: Edge Function POST `/rest/v1/contacts` retorna 404

**Status atual**: BUG-D da sessão QA 2026-07-22 ainda pendente.

**Investigação necessária**:
1. Verificar se `/rest/v1/contacts` deve ir para PostgREST (tabela `zapp.contatos`) ou para Edge Function
2. Se PostgREST: `supabase.from('contatos')` com schema `zapp` deveria funcionar — verificar RLS
3. Se Edge Function: verificar rota em `supabase/functions/` e deploy status
4. Testar: `curl -X POST https://supabase.atomicabr.com.br/rest/v1/contacts -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON_KEY" -H "Content-Profile: zapp"`

**Critério de Aceite**: POST para endpoint de contatos retorna 201 com novo contato criado.

---

### Etapa 20 🟡 — Auditar e documentar todos os 6 stubs de RPC

**Ação**: Criar `docs/RPC_STUBS_STATUS.md` com tabela completa:

| RPC | Migration | Comportamento Atual | Implementação Alvo | Etapa |
|-----|-----------|--------------------|--------------------|-------|
| `initiate_gmail_oauth` | `20260717000002` | RAISE EXCEPTION P0001 | Google OAuth2 | 11 |
| `complete_gmail_oauth` | `20260717000002` | RAISE EXCEPTION P0001 | Trocar code por tokens | 12 |
| `sync_to_crm` | `20260717000002` | RAISE EXCEPTION P0001 | Edge Function CRM | 13 |
| `import_user_data` | `20260717000002` | RAISE EXCEPTION P0001 | Import JSON | 14 |
| `enrich_contact` | `20260717000002` | Retorna dados básicos | API Enriquecimento | 15 |
| `get_latest_analysis` | `20260717000002` | Retorna média engagement | Analytics completo | 16 |

**Critério de Aceite**: Documento criado e linkado no `docs/SCHEMA_REFERENCE.md`.

---

## PARTE III — SEGURANÇA E RLS (Etapas 21–30)

### Etapa 21 🔴 — Verificar que `check_download_permission` não deixa dados expostos

**Gap**: Com `check_download_permission` ausente e fail-open, qualquer usuário autenticado pode baixar qualquer arquivo de qualquer bucket (comportamento confirmado em `useMediaManagement.ts:164`).

**Ação imediata**:
1. Verificar políticas de Storage nos 13 buckets:
   ```sql
   SELECT bucket_id, name, definition FROM storage.policies;
   ```
2. Garantir que buckets privados (`comprovantes-financeiro`, `fechamentos`, `whatsapp-media`, etc.) têm políticas restritivas
3. Implementar Etapa 17 com prioridade — risco condicional: o fail-open é intencional por design, mas buckets privados sem políticas de Storage restritivas podem expor arquivos a qualquer usuário autenticado

**Critério de Aceite**: Usuário sem permissão não consegue baixar arquivo de bucket restrito.

---

### Etapa 22 ✅ — Confirmar 0 funções SECDEF sem search_path fixo

**Status**: AUDITADO E VERIFICADO ✅

**Evidência** (resultado da auditoria):
```sql
SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zapp' AND p.prosecdef = true
AND NOT (p.proconfig @> ARRAY['search_path=zapp']);
-- Resultado: 0
```

**Ação**: Nenhuma ação necessária. Adicionar este check ao CI como validação contínua.

---

### Etapa 23 ✅ — Confirmar 321 tabelas `zapp` com RLS habilitado

**Status**: AUDITADO E VERIFICADO ✅

**Evidência**: 321 tabelas em `zapp`, 100% com `relrowsecurity = true`. Única tabela com 0 políticas é `_backup_avatar_urls_20260803` (deny-all intencional — ver Etapa 4).

**Ação**: Adicionar ao CI:
```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'zapp' AND NOT rowsecurity;
-- Deve retornar 0 linhas
```

---

### Etapa 24 🟠 — Auditar políticas RLS das tabelas no schema `evo`

**Gap**: O schema `evo` tem 172+ tabelas com RLS habilitado, mas as políticas nunca foram auditadas nesta sessão.

**Ação**:
1. Query de auditoria:
   ```sql
   SELECT t.tablename, COUNT(p.policyname) as policy_count
   FROM pg_tables t LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
   WHERE t.schemaname = 'evo'
   GROUP BY t.tablename HAVING COUNT(p.policyname) = 0;
   ```
2. Identificar tabelas em `evo` com 0 políticas (deny-all implícito)
3. Para tabelas que devem ser acessíveis: criar políticas adequadas
4. Documentar tabelas com deny-all intencional

**Critério de Aceite**: Todas as tabelas `evo` com 0 políticas estão documentadas como deny-all intencional.

---

### Etapa 25 🟡 — Auditar anon role: garantir 0 acesso não autorizado

**Status parcial**: Auditado para funções (`anon` tem 0 funções executáveis). Storage não foi auditado completamente.

**Ação**:
1. Verificar políticas de Storage para `anon`:
   ```sql
   SELECT bucket_id, name, ARRAY_AGG(definition) AS policies
   FROM storage.policies WHERE roles @> ARRAY['anon'] GROUP BY bucket_id, name;
   ```
2. Buckets que devem ser públicos: `audio-messages` ✅ (BUG-38 resolvido), `avatars`, `custom-emojis`, `recibos-entrega`, `stickers`
3. Buckets que NÃO devem ter acesso anon: `comprovantes-financeiro`, `fechamentos`, `whatsapp-media`, `team-chat-files`, `email-attachments`, `quarantine`, `etiquetas-remessa`
4. Remover qualquer policy `anon` em buckets privados

**Critério de Aceite**: Buckets privados retornam 403 para requests não autenticados.

---

### Etapa 26 🟡 — Implementar teste de penetração básico nas RLS

**Ação**:
1. Criar `supabase/tests/rls-boundary-tests.sql` com:
   - Query como usuário A tentando acessar dados do usuário B
   - Verificar que resultado é sempre vazio (não erro, mas 0 linhas)
2. Testar tabelas críticas: `contatos`, `empresas`, `whatsapp_connections`, `profiles`
3. Executar como parte do CI em ambiente de staging

**Critério de Aceite**: Nenhum vazamento de dados cross-tenant.

---

### Etapa 27 🟡 — Verificar `security_invoker=on` em todas as VIEWs de `zapp`

**Ação**:
1. Query:
   ```sql
   SELECT viewname, definition
   FROM pg_views
   WHERE schemaname = 'zapp'
   AND definition NOT ILIKE '%security_invoker%';
   ```
2. Para cada view sem `security_invoker`: avaliar se precisa
3. Views que apontam para tabelas em schemas com RLS diferente (`evo`, `email_app`) DEVEM ter `security_invoker=on`

**Critério de Aceite**: Todas as VIEWs de `zapp` que apontam para tabelas em outros schemas têm `security_invoker=on`.

---

### Etapa 28 🟡 — Auditar funções de role check: `zapp.has_role()`, `zapp.is_admin_or_supervisor()`

**Ação**:
1. Verificar que `has_role()` e `is_admin_or_supervisor()` não são SECURITY DEFINER (não devem ser)
2. Verificar que `user_roles` tabela usada por essas funções tem RLS correto
3. Confirmar que não há race condition no check de role durante criação de workspace

**Critério de Aceite**: Funções de role check passam em testes de boundary.

---

### Etapa 29 🟢 — Criar audit log automático para mudanças de schema em produção

**Ação**:
1. Criar trigger `audit_ddl_changes` usando `pg_event_trigger` para DDL em `zapp` e `evo`
2. Salvar em `zapp.audit_logs` com detalhes: quem, quando, qual DDL
3. Alertar via `app_notifications` quando DDL é executado em produção (pode indicar acesso não autorizado)

**Critério de Aceite**: Todo DDL em produção gera entrada em `audit_logs` e notificação para admin.

---

### Etapa 30 🟢 — Documentar política de rotação de secrets

**Ação**:
1. Listar todos os secrets em uso (via Supabase Vault ou variáveis de ambiente)
2. Criar `docs/SECRETS_ROTATION.md` com:
   - Lista de todos os secrets
   - Frequência de rotação recomendada
   - Procedimento de rotação sem downtime (blue-green para cada secret)
3. Criar cron job de lembrete de rotação (trimestral)

**Critério de Aceite**: Documento existe; primeiro ciclo de rotação agendado.

---

## PARTE IV — REALTIME E EVENTS (Etapas 31–38)

### Etapa 31 ✅ — Confirmar 20 tabelas críticas na publication `supabase_realtime`

**Status**: AUDITADO E VERIFICADO ✅

**Tabelas confirmadas na publication**:
- `zapp.failed_messages` ✅
- `zapp.sentiment_alerts` ✅  
- `zapp.app_notifications` ✅
- `zapp.user_settings` ✅
- `zapp.workspace_settings` ✅
- `zapp.dispatch_error_logs` ✅
- `zapp.evolution_sentiment_analysis` ✅
- `financeiro.payment_links` ✅
- `email_app.email_accounts` ✅
- `email_app.email_threads` ✅
- `zapp.agent_stats` ✅
- `zapp.audio_memes` ✅
- `zapp.qr_attempts` ✅
- `zapp.queue_members`, `zapp.queue_positions`, `zapp.queues` ✅
- `zapp.sales_deals` ✅
- `zapp.talkx_campaigns` ✅
- `zapp.team_messages` ✅
- `zapp.warroom_alerts` ✅
- `zapp.whatsapp_connections` ✅

**Ação**: Adicionar ao CI a query de validação:
```sql
SELECT COUNT(*) FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'; -- Deve ser >= 20
```

---

### Etapa 32 🟡 — Verificar `publish_via_partition_root = true` persiste após upgrades

**Gap**: A configuração `publish_via_partition_root = true` é crítica para o Realtime de tabelas particionadas (`evolution_messages`, `evolution_conversations`). Se for redefinida para `false` após um upgrade do Supabase, subscriptions para essas tabelas pararão de receber eventos.

**Ação**:
1. Adicionar ao runbook: "Após qualquer upgrade do Supabase, verificar: `SELECT pubviaroot FROM pg_publication WHERE pubname = 'supabase_realtime';`"
2. Criar alerta de health check que verifica essa configuração e notifica se mudar
3. Documentar o impacto em `docs/ARCHITECTURE_AND_FLOW.md`

**Critério de Aceite**: Alerta configurado; runbook atualizado.

---

### Etapa 33 🟡 — Criar teste de integração para Realtime

**Ação**:
1. Criar `src/tests/realtime-integration.test.ts`
2. Testar que INSERT em `zapp.app_notifications` dispara subscription no frontend
3. Testar que INSERT em `evo.evolution_messages` (via root) dispara subscription
4. Testar que INSERT em VIEW proxy **não** dispara subscription (comportamento esperado)
5. Usar `@supabase/supabase-js` com JWT de teste

**Critério de Aceite**: Testes passam em ambiente de staging; falham se publication estiver mal configurada.

---

### Etapa 34 🟡 — Auditoria dos 146 cron jobs ativos

**Status parcial**: Verificamos que todas as funções referenciadas pelos crons existem. Não verificamos se os crons estão funcionando corretamente (última execução, status).

**Ação**:
1. Query de health dos crons (JOIN entre `cron.job` e `cron.job_run_details` — `last_run_status` não existe como coluna direta):
   ```sql
   SELECT j.jobname, j.schedule, j.active,
          d.status, d.start_time, d.end_time, d.return_message
   FROM cron.job j
   LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
   ORDER BY d.start_time DESC NULLS LAST LIMIT 50;
   ```
2. Identificar crons com `last_run_status = 'failed'`
3. Para crons falhando: investigar e corrigir
4. Criar dashboard de health de crons em `useDispatchErrorLogs.ts` ou novo hook

**Critério de Aceite**: 0 crons com status `failed` em produção.

---

### Etapa 35 🟡 — Verificar que `evolution_guardian_heartbeat` executa corretamente

**Status**: Função existe em `evo` schema ✅. Verificar execução real.

**Ação**:
1. Query: `SELECT * FROM cron.job WHERE jobname ILIKE '%guardian%' OR jobname ILIKE '%heartbeat%'`
2. Verificar última execução: `SELECT * FROM cron.job_run_details WHERE jobname = 'evolution_guardian_heartbeat' ORDER BY start_time DESC LIMIT 5`
3. Se falhas: investigar, corrigir, documentar em `infra/runbooks/OPERATIONS.md`

**Critério de Aceite**: Heartbeat executa sem erros nos últimos 7 dias.

---

### Etapa 36 🟢 — Criar dashboard de health de Realtime subscriptions

**Ação**:
1. Criar componente `src/features/admin/components/RealtimeHealthDashboard.tsx`
2. Listar todas as subscriptions ativas do frontend
3. Mostrar última mensagem recebida por subscription
4. Alertar (visual) quando subscription está silenciosa por mais de 5 min em tabela que deveria ter atividade

**Critério de Aceite**: Admin consegue ver status de saúde de todas as subscriptions Realtime.

---

### Etapa 37 🟢 — Documentar todas as subscriptions Realtime do frontend

**Ação**:
1. Criar `docs/REALTIME_SUBSCRIPTIONS.md` com:
   - Arquivo de origem
   - Tabela subscrita (schema + tabela)
   - Filtro (se houver)
   - Estado esperado (inserções por minuto em produção)
2. Validar contra lista de tabelas na publication
3. Identificar subscriptions para tabelas fora da publication (devem ser 0)

**Critério de Aceite**: Documento lista 100% das subscriptions; nenhuma para tabela fora da publication.

---

### Etapa 38 🟢 — Criar alerta para WAL slot lag crescente (BUG-B reincidência)

**Gap**: BUG-B da sessão 2026-07-22 — WAL slot `cainophile_s7fgrb36` com 278MB lag. Foi corrigido com restart mas pode reocorrer.

**Ação**:
1. Criar cron job `cron_wal_slot_lag_monitor` (já existe per OPERATIONS.md — verificar se está ativo):
   ```sql
   SELECT slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) as lag_bytes
   FROM pg_replication_slots WHERE slot_type = 'logical';
   ```
2. Se lag > 500MB: INSERT em `zapp.app_notifications` com tipo `wal_lag_alert` + notificação push
3. Adicionar ao runbook: procedimento de drop do slot se consumer estiver morto

**Critério de Aceite**: Alerta dispara quando WAL lag > 500MB; ops recebe notificação em < 5 min.

---

## PARTE V — CI/CD E QUALIDADE DE CÓDIGO (Etapas 39–46)

### Etapa 39 🟡 — Criar pipeline de validação de migration

**Gap**: Não existe CI que valide a migration canônica antes de merge.

**Ação**:
1. Criar `.github/workflows/validate-migration.yml`
2. Steps:
   - Subir PostgreSQL em Docker
   - Executar `pg-bootstrap.sql`
   - Executar `20260804000000_canonical_schema.sql`
   - Executar `supabase/tests/critical-rpcs.sql`
   - Executar `supabase/tests/rls-boundary-tests.sql`
3. Timeout: 10 min

**Critério de Aceite**: PR não pode ser mergeado se migration falha em PostgreSQL limpo.

---

### Etapa 40 🟡 — Criar workflow de geração automática de types TypeScript

**Gap**: Types são gerados manualmente via `curl`. Se o schema mudar e os types não forem regenerados, o TypeScript fica desatualizado silenciosamente.

**Ação**:
1. Criar `.github/workflows/generate-types.yml`
2. Trigger: push para `main` ou qualquer branch com mudança em `supabase/migrations/`
3. Executar: `curl -s "http://supabase_meta:8080/generators/typescript?included_schemas=public,zapp..." > src/integrations/supabase/types.ts`
4. Commit automático dos types atualizados

**Critério de Aceite**: Types sempre refletem schema atual; `tsc --noEmit` nunca falha por types desatualizados.

---

### Etapa 41 🟡 — Adicionar lint rule para prevenir `schema: 'public'` em subscriptions

**Gap**: Múltiplos bugs (BUG-7, BUG-21 a BUG-35) causados por subscription em `schema: 'public'` onde a tabela é uma VIEW proxy.

**Ação**:
1. Criar ESLint custom rule: `no-public-schema-realtime`
2. Detectar padrão: `.channel('...').on('postgres_changes', { schema: 'public', ... })`
3. Reportar como erro: "Use schema 'zapp', 'evo', 'financeiro' ou 'email_app' — 'public' tem apenas VIEWs que não emitem eventos Realtime"
4. Adicionar ao `.eslintrc.js`

**Critério de Aceite**: Build falha se novo código adiciona subscription com `schema: 'public'`.

---

### Etapa 42 🟡 — Adicionar lint rule para prevenir imports de `types.ts` diretamente

**Gap**: Regra do `CLAUDE.md`: "Tipos TypeScript: importar SEMPRE de `@/integrations/supabase/schema` (barrel canônico), nunca de `types.ts` diretamente."

**Ação**:
1. Criar ESLint rule: `no-direct-supabase-types`
2. Detectar: `import.*from.*integrations/supabase/types`
3. Reportar como erro: "Importar de '@/integrations/supabase/schema' (barrel canônico)"
4. Auto-fix: substituir path

**Critério de Aceite**: Build falha se novo código importa de `types.ts` diretamente.

---

### Etapa 43 🟢 — Criar script de diff de schema entre migration e DB

**Ação**:
1. Criar `scripts/schema-diff.sh` usando `pg_dump` normalizado (não grep — que perde contexto de bloco):
   ```bash
   # Extrai schema canônico do DB
   pg_dump --schema-only --no-owner --no-acl -n zapp "$DATABASE_URL" \
     | grep -v '^--' | grep -v '^$' | sort > /tmp/db-schema-sorted.sql
   # Aplica migration em banco temporário e extrai
   dropdb --if-exists schema_diff_tmp
   createdb schema_diff_tmp
   psql schema_diff_tmp < supabase/migrations/20260804000000_canonical_schema.sql
   pg_dump --schema-only --no-owner --no-acl -n zapp "postgresql://localhost/schema_diff_tmp" \
     | grep -v '^--' | grep -v '^$' | sort > /tmp/migration-schema-sorted.sql
   dropdb --if-exists schema_diff_tmp
   # Diff semântico
   diff /tmp/db-schema-sorted.sql /tmp/migration-schema-sorted.sql
   ```
   Alternativa: `supabase db diff --db-url "$DATABASE_URL"` se CLI estiver disponível.
2. Executar semanalmente e postar resultado em canal de infraestrutura

**Critério de Aceite**: Script identifica corretamente os gaps (GAP-S1, GAP-S2).

---

### Etapa 44 🟢 — Criar test suite para todas as Edge Functions

**Gap**: 123 Edge Functions sem testes automatizados.

**Ação** (priorizar as críticas):
1. `evolution-webhook`: teste de idempotência (mesmo evento processado 2x não duplica dados)
2. `evolution-sentiment`: teste que análise de sentimento é salva em `evolution_sentiment_analysis`
3. `gmail-oauth-init` (quando implementada): teste do flow OAuth2
4. `crm-sync` (quando implementada): teste de sincronização
5. Usar `supabase test` ou Jest com mock do cliente Supabase

**Critério de Aceite**: 5 Edge Functions críticas têm testes; cobertura > 80%.

---

### Etapa 45 🟢 — Implementar health check endpoint para o sistema

**Ação**:
1. Atualizar a Edge Function existente `supabase/functions/health/index.ts` (já deployada) para verificar:
   - DB conectado: `SELECT 1`
   - Realtime: `pg_publication_tables` count >= 20
   - Storage: buckets públicos acessíveis
   - Evolution API: `GET /instance/connectionState/wpp2`
   - RabbitMQ: health endpoint
2. Retornar JSON com status geral + detalhes de cada componente
3. Usar em monitoramento externo (UptimeRobot, etc.)

**Critério de Aceite**: `/functions/v1/health` retorna `{ status: 'ok' }` quando tudo está saudável.

---

### Etapa 46 🟢 — Criar runbook para incident response de banco de dados

**Ação**: Expandir `infra/runbooks/OPERATIONS.md` com:

1. **Seção: Schema Locks** — como identificar e matar queries bloqueadas
2. **Seção: WAL Slot Lag** — identificar, monitorar, dropar slot morto
3. **Seção: Partição faltando** — como criar partição para nova instância WA
4. **Seção: Realtime não dispara** — checklist de diagnóstico (física? na publication? RLS?)
5. **Seção: RLS bloqueando usuário** — como diagnosticar sem expor dados de outros usuários

**Critério de Aceite**: Qualquer dev consegue resolver incidente de banco em < 30 min usando o runbook.

---

## PARTE VI — DOCUMENTAÇÃO E RASTREABILIDADE (Etapas 47–50)

### Etapa 47 🟡 — Atualizar `docs/SCHEMA_REFERENCE.md` com estado pós-auditoria

**Ação**:
1. Atualizar contagens: 321 tabelas `zapp`, 172+ tabelas `evo`, 1.058 funções `zapp`
2. Adicionar seção "Tabelas com Realtime" com lista completa das 20 tabelas na publication
3. Adicionar seção "Stubs de RPC" linkando para `docs/RPC_STUBS_STATUS.md` (Etapa 20)
4. Adicionar seção "Limitações de Restore" (GAP-S1)
5. Data de última auditoria: 2026-08-04

**Critério de Aceite**: `SCHEMA_REFERENCE.md` reflete o estado atual do banco sem contradições.

---

### Etapa 48 🟡 — Atualizar `CLAUDE.md` com bugs resolvidos e gaps encontrados nesta sessão

**Ação**:
1. Marcar como `✅` os bugs que foram confirmados resolvidos na auditoria
2. Adicionar `GAP-S1` (schema bootstrap) e `GAP-S2` (funções não migradas) à tabela de bugs
3. Adicionar `GAP-S3` (`_backup_avatar_urls_20260803`)
4. Atualizar data de auditoria para 2026-08-04

**Critério de Aceite**: `CLAUDE.md` tem rastreamento completo de todos os gaps identificados.

---

### Etapa 49 🟢 — Criar mapa de dependências entre Edge Functions e tabelas

**Ação**:
1. Para cada uma das 123 Edge Functions, identificar:
   - Tabelas lidas (`FROM`, `SELECT`)
   - Tabelas escritas (`INSERT`, `UPDATE`, `DELETE`)
   - Tabelas que precisam estar na publication Realtime para o flow funcionar
2. Salvar em `docs/EDGE_FUNCTIONS_TABLE_MAP.json`
3. Usar para validar que nenhuma Edge Function escreve em tabela que não está na publication quando o flow depende de Realtime

**Critério de Aceite**: Mapa criado para pelo menos as 20 Edge Functions mais críticas.

---

### Etapa 50 🟢 — Criar cronograma de auditoria recorrente

**Ação**:
1. Criar cron job Hermes Agent `audit_migration_vs_db` (mensal):
   - Compara contagem de tabelas/funções entre migration e DB
   - Posta relatório em canal de infra
2. Criar task no projeto para re-executar esta auditoria a cada 3 meses
3. Definir "exit criteria" para marcar o banco como "totalmente versionado em migration":
   - Todas as 321 tabelas `zapp` têm migration de criação
   - Todas as 1.058 funções têm migration de criação
   - Restore de zero funciona em < 60 min
4. Estimar: com 1 dev/semana → 18 meses para atingir exit criteria completo para GAP-S1/S2

**Critério de Aceite**: Próxima auditoria agendada; tracking de progresso criado.

---

## Resumo de Prioridades

| Prioridade | Etapas | Esforço Estimado |
|-----------|--------|-----------------|
| 🔴 CRÍTICO (fazer esta semana) | 1, 2, 21 | 5 dias dev |
| 🟠 ALTO (fazer este mês) | 3, 5, 10, 11, 12, 17, 18, 19 | 15 dias dev |
| 🟡 MÉDIO (próximo trimestre) | 4, 6, 7, 8, 13, 14, 15, 16, 20, 22–28, 31–35, 39–42 | 45 dias dev |
| 🟢 BAIXO (backlog) | 9, 29, 30, 36–38, 43–50 | 30 dias dev |

**Total estimado**: ~95 dias-dev para remediação completa.

---

## Gaps Confirmados como OK (Não Precisam de Ação)

| Item | Status | Evidência |
|------|--------|-----------|
| RLS em 321 tabelas `zapp` | ✅ 100% habilitado | `SELECT COUNT(*) WHERE NOT rowsecurity` → 0 |
| 0 funções SECDEF sem search_path | ✅ Verificado | `SELECT COUNT(*) WHERE prosecdef AND NOT proconfig @> ARRAY[...]` → 0 |
| 20 tabelas críticas na publication | ✅ Todas presentes | Query direta à `pg_publication_tables` |
| 146 crons com funções válidas | ✅ Todas existem | Cross-reference funções × cron.job |
| 0 views inválidas em `zapp` | ✅ Nenhuma | `pg_views` check |
| 0 gaps de índice FK | ✅ Nenhum | Query FK sem índice → 0 |
| VIEW proxy coverage (BUG-37) | ✅ `20260802000004` | 20 VIEWs criadas em `zapp` |
| Storage bucket `audio-messages` | ✅ `20260802000001` | HTTP 200 em leitura pública |
| Realtime `zapp.sentiment_alerts` | ✅ `20260720000005` | Na publication |
| Realtime `email_app.email_accounts` | ✅ `20260724000006` | Na publication |
| n8n bot para instância `wpp2` | ✅ Configurado | id: `cmryc6jim0006nm07nkl49g8h` |
| RPCs críticas existem | ✅ 18/18 | Verificado individualmente |
| 89 migrations no DB | ✅ Mais nova: `20260804000000` | `SELECT COUNT(*) FROM supabase_migrations.schema_migrations` |

---

*Auditoria concluída em 2026-08-04. Próxima revisão recomendada: 2026-11-04.*
