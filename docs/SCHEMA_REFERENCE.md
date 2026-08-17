# 📐 Schema Reference — ZAPP WEB

> **Documento canônico** sobre a arquitetura de schemas do Supabase.
> Última atualização: **2026-08-15**. Auditado via `pg_catalog` + teste de penetração HTTP real.
> Qualquer doc que contradiga este está desatualizado.
> Regras de integração (schema canônico, Realtime, credenciais, guardrails): **[INTEGRATION_INVARIANTS.md](./INTEGRATION_INVARIANTS.md)**.
> Plano mestre de desacoplamento ZAPP×Evolution: **[decouple/DECOUPLING.md](./decouple/DECOUPLING.md)**.

---

## Status de Desacoplamento ZAPP×Evolution — T0 (2026-08-15)

> Score T0: **3/9 = 33% — Nota D** · Próxima medição: T1 (após E24 — Fase 1 completa)
> Plano completo em 100 etapas: [`docs/decouple/DECOUPLING.md`](./decouple/DECOUPLING.md)

### Regra de Ouro de Propriedade de Schema

| Schema | Quem **escreve** | Quem **lê** |
|--------|-----------------|-------------|
| `evo.*` | **Somente a Evolution API** (via consumer pipeline) | ZAPP web (via 12 views de contrato abaixo) |
| `zapp.*` | **Somente o ZAPP web** | Evolution API (somente monitoria — ADR-DB-002) |

**Egresso HTTP**: toda saída do ZAPP web para a Evolution API deve passar exclusivamente por
`supabase/functions/_shared/providers/evolution/client.ts` (12 verbos, zero bypasses).
Uso direto de `EVOLUTION_API_URL` ou `callEvolutionApi` é proibido (deprecated e bloqueado por CI guard).

### Score dos 9 Invariantes (T0)

| # | Invariante | Status T0 | Referência |
|---|-----------|-----------|------------|
| I1 | Zero funções `zapp.*` referenciam `evo.*` | 🔴 FAIL (20 funções, 82 refs) | E37–E42 |
| I2 | Zero funções `evo.*` referenciam `zapp.*` | 🔴 FAIL (96 funções) | E43–E48 |
| I3 | `supabase.yml` ausente do repo zapp | 🔴 FAIL (`e2e-evolution-vps.yml` presente) | E89 |
| I4 | Todo egresso HTTP via gateway único | 🔴 FAIL (5 cron + 16 pg_net) | E25–E35 |
| I5 | CI guard bloqueia recriação de infra evo | 🟢 PASS | `decouple-guard.yml` |
| I6 | Zero INSERT morto em `consumer.py` | 🟢 PASS (arquivo ausente) | — |
| I7 | `inventory.mjs` cobre todos `evolution-*` | 🟢 PASS | `scripts/decouple/inventory.mjs` |
| I8 | Fixture sql-gate sincronizado com prod | 🔴 FAIL (12 vs 25 entradas) | E18, E22 |
| I9 | Zero FKs cross-schema não documentadas | 🔴 FAIL (6 grupos, 24 linhas `evo→zapp`) | E49–E50 |

### As 12 Views de Contrato (`zapp.*` → `evo.*`)

Views auto-updatable no schema `zapp` que permitem ao ZAPP web ler dados da Evolution API
sem acesso direto ao schema `evo`. São a única ponte de leitura autorizada.

| View (`zapp.*`) | Tabela base (`evo.*`) | Descrição |
|---|---|---|
| `evolution_messages` | `evo.evolution_messages` | Mensagens WhatsApp (raiz particionada) |
| `evolution_conversations` | `evo.evolution_conversations` | Conversas (raiz particionada) |
| `evolution_contacts` | `evo.evolution_contacts` | Contatos da Evolution API |
| `evolution_media` | `evo.evolution_media` | Mídias (áudio, imagem, vídeo) |
| `evolution_whatsapp_status` | `evo.evolution_whatsapp_status` | Status de entrega WA |
| `evolution_webhook_events_v2` | `evo.evolution_webhook_events_v2` | Webhooks particionados |
| `evolution_instances` | `evo.evolution_instances` | Instâncias WA registradas |
| `evolution_sessions` | `evo.evolution_sessions` | Sessões ativas |
| `evolution_groups` | `evo.evolution_groups` | Grupos WhatsApp |
| `evolution_group_participants` | `evo.evolution_group_participants` | Participantes de grupos |
| `evolution_labels` | `evo.evolution_labels` | Labels/etiquetas |
| `evolution_chats` | `evo.evolution_chats` | Chats (cache de metadados) |

> **Realtime**: usar sempre `schema: 'evo'` com a tabela raiz (não as views `zapp.*`) —
> views não emitem WAL events. Ver seção "Realtime" abaixo.

### Infraestrutura de Observabilidade (criada em Fase 0)

| Objeto SQL | Migration | Descrição |
|---|---|---|
| `ops.pgnet_egress_log` | E8 (`20260815010000`) | Log de chamadas pg_net — mede violações I4 |
| `ops.i4_violation_baseline` | E8 (`20260815010000`) | Baseline T0 de 14 violadores pg_net conhecidos |
| `ops.log_pgnet_call()` | E8 (`20260815010000`) | Função auxiliar para instrumentação manual |
| `ops.v_i4_violations_summary` | E8 (`20260815010000`) | View resumo de violações I4 ativas |
| `ops.v_i4_correction_progress` | E8 (`20260815010000`) | View de progresso de correção (meta: pendentes=0) |
| `ops.decouple_preflight_runs` | E10 (`20260815020000`) | Histórico de execuções do pre-flight checklist |
| `ops.fn_decouple_preflight()` | E10 (`20260815020000`) | Checklist pré-deploy com 8 verificações automáticas |
| `ops.v_preflight_history` | E10 (`20260815020000`) | View do histórico de runs do checklist |

---

## Arquitetura Atual (pós-consolidação)

O ZAPP Web usa **um único Supabase Self-Hosted** (`supabase.atomicabr.com.br`) com **múltiplos schemas PostgreSQL**:

| Schema | Conteúdo | Quem acessa | Exemplos |
|--------|----------|-------------|----------|
| **`zapp`** | Todas as tabelas do app (**323** base tables + **359** views + **5** matviews), RPCs | Frontend (client.ts), Edge Functions, n8n | `profiles`, `queues`, `contatos`, `whatsapp_connections`, `empresas`, `webhook_audit_log` |
| **`evo`** | Tabelas-fonte da Evolution API (**193 tabelas**); tabelas raiz particionadas (`evolution_messages`, `evolution_conversations`) com **23 partições** cada | Realtime subscriptions, Edge Functions que fazem `.schema('evo')` | `evolution_messages` (raiz), `evolution_contacts`, `evolution_webhook_events_v2` |
| **`public`** | **1 tabela interna Supabase** (`_wal_slot_guard_events`) + **535 views** proxy para zapp/evo/email_app | Não usar diretamente | views proxy |
| **`auth`** | Auth do Supabase (GoTrue) | `supabase.auth.*` | `auth.users` |

### Regras de Ouro

1. **`schema: 'zapp'`** é obrigatório em todo `createClient()` que faça `.from()` ou `.rpc()`.
   O `client.ts` do frontend já tem `db: { schema: 'zapp' }` configurado.
   Edge Functions devem usar `createZappAdminClient()` de `_shared/db-client.ts`.

2. **Realtime** subscriptions devem usar o schema da **tabela base** (não views):
   - Tabelas `zapp.*` → `schema: 'zapp'`
   - Tabelas `evo.*` → `schema: 'evo'`
   - Views **nunca emitem** WAL events — não usar em Realtime.
   - **CRÍTICO (`publish_via_partition_root=true`)**: para tabelas particionadas no schema `evo` (`evolution_messages`, `evolution_conversations`), o evento CDC é publicado pela **tabela raiz**, NUNCA pela partição. Usar `table: 'evolution_messages'` (raiz), não `table: 'evolution_messages_wpp2'` (partição). Assinar a partição resulta em silêncio total — zero eventos.

3. **Imports de tipos**: sempre via barrel `@/integrations/supabase/schema`, nunca de `types.ts` direto.

4. **PostgREST** (`PGRST_DB_SCHEMAS`): `public`, `zapp`, `storage`, `graphql_public`, `artes`, `vendas`, `financeiro`. `evo` e `email_app` **nunca** entram na lista. Sem o header `Accept-Profile: zapp`, queries a tabelas `zapp` falham com `PGRST205`.

## Estrutura de Arquivos

```
src/integrations/supabase/
├── types.ts          # Auto-gerado (38K linhas). NÃO editar. Regenerar com:
│                     #   curl -s "http://supabase_meta:8080/generators/typescript
│                     #     ?included_schemas=public,zapp
│                     #     &detect_one_to_one_relationships=true"
│                     #     > src/integrations/supabase/types.ts
├── types-manual.ts   # Extensões manuais (vazio desde 2026-07-14)
├── schema.ts         # BARREL CANÔNICO — importar tipos daqui
├── client.ts         # createClient com schema: 'zapp'
├── safe-queries.ts   # Queries RLS-safe
├── safeClient.ts     # Safe client wrapper
└── db-client.ts      # (Edge Functions) Factory: createZappAdminClient()

supabase/functions/_shared/
├── db-client.ts      # createZappAdminClient() / createZappClient(req)
├── auth.ts           # requireUser() / requireAdminOrSupervisor()
└── validation.ts     # requireAuth() com schema: 'zapp'
```

## Contagem de Tabelas por Schema (auditado 2026-08-06 via MCP — valores definitivos)

| Schema | Base Tables | Views | RLS ativo |
|--------|-------------|-------|-----------|
| `zapp` | **323** | **359** | 100% |
| `evo` | **193** | — | 100% |
| `auth` | 21 | — | — |
| `bpm` | 41 | — | — |
| `email_app` | 33 | — | — |
| `ai` | 31 | — | — |
| `archive` | 25 | — | — |
| `financeiro` | 16 | — | — |
| `vendas` | 14 | — | — |
| `ops` | 20 | — | — |
| `public` | 1¹ | 535² | — |

> ¹ `_wal_slot_guard_events` — tabela interna do Supabase, não é dado de aplicação.
> ² Views em `public` são proxies que redirecionam para tabelas em `zapp`, `evo`, `email_app`, etc.
> ³ Matviews em `zapp`: **5** (auditoria 2026-08-04).

## RPCs de Integração (2026-08-04)

Padrão aplicado em 2026-08-04 (migrations F-01/F-02/F-03/F-06): **o frontend chama RPCs via client fixado em `zapp`** — nunca `public.*` direto.

### Wrappers SECURITY DEFINER (F-01/F-02)

| RPC (`zapp.*`) | Assinatura | Papel |
|---|---|---|
| `zapp.rpc_app_bootstrap()` | `()` | Wrapper SECURITY DEFINER → `public.rpc_app_bootstrap()`. Bootstrap do app (perfis, roles, permissões, contadores de notificações). |
| `zapp.rpc_dashboard_init()` | `(uuid, uuid, timestamptz, timestamptz)` | Wrapper SECURITY DEFINER → `public.rpc_dashboard_init()`. Dados agregados do dashboard. |

- As originais `public.rpc_app_bootstrap()` e `public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz)` tiveram `EXECUTE` **REVOGADO de `authenticated`** — agora são **`service_role` only**.
- Wrappers com `search_path` fixo e `REVOKE ALL FROM PUBLIC` obrigatório (risco P0: `anon` executar bootstrap e vazar profiles/roles/permissions).
- Consumidores: `src/hooks/useAppBootstrap.ts`, `src/hooks/useDashboardDataBatch.ts`.

### Introspecção de schema via pg_catalog (F-06)

| RPC (`zapp.*`) | Assinatura | Papel |
|---|---|---|
| `zapp.rpc_schema_columns` | `(text)` | Colunas de uma tabela/view via `pg_catalog`. |
| `zapp.rpc_schema_tables` | `(text)` | Tabelas/views de um schema via `pg_catalog`. |

- **Whitelist de schemas**: `zapp`, `evo`, `public` — qualquer outro schema é recusado/retorna vazio.
- Usado por `src/lib/schemaDrift.ts` (detecção de drift). Nunca via OpenAPI do PostgREST.

### Grants F-03 — EXECUTE para `authenticated`

O conjunto F-03 avalia **6 signatures**; **5 receberam** `GRANT EXECUTE ... TO authenticated` (revogado de `PUBLIC`/`anon`):

1. `zapp.fn_increment_meme_use(uuid)`
2. `zapp.fn_toggle_user_meme_favorite(uuid)` — overload de 1 arg (com guard `auth.uid`)
3. `zapp.import_user_data(jsonb)`
4. `zapp.rpc_list_failed_messages(text[], text, text, timestamptz, timestamptz, integer, integer)`
5. `zapp.fn_safe_audit_log(text, text, uuid, text, text, jsonb, jsonb, jsonb, text)`

> ⚠️ A 6ª signature, `zapp.fn_toggle_user_meme_favorite(uuid, uuid)`, **NÃO foi grantada**: sem guard interno, aceitaria `p_user_id` arbitrário (favorecer como outro usuário).

### `fn_safe_audit_log` — guard interno (GAP-H)

Antes do grant, o corpo ganhou guard: `auth.uid() IS NULL` → `RAISE`; `performed_by` ≠ `auth.uid()` e usuário **não** admin/supervisor → `RAISE`. Sem o guard, o grant seria P0 (qualquer `authenticated` gravaria audit log em nome de terceiros).

### Tabelas `zapp` com mais dados (>1k linhas)
| Tabela | Linhas estimadas | Tamanho |
|--------|-----------------|---------|
| `empresas` | 51.688 | 14 MB |
| `webhook_audit_log` | 58.232 | 19 MB |
| `webhook_events_processed` | 58.076 | 31 MB |
| `app_notifications` | 14.283 | 10 MB |
| `audit_logs` | 4.356 | 1,9 MB |
| `warroom_alerts` | 1.675 | 872 kB |
| `vault_healthcheck_log` | 2.961 | 1,3 MB |
| `query_telemetry` | 767 | 272 kB |

### Tabelas `evo` com mais dados (>1k linhas)
| Tabela | Linhas estimadas | Tamanho |
|--------|-----------------|---------|
| `evolution_messages_wpp2` | 41.045 | 51 MB |
| `evolution_webhook_events_v2_2026_07` | 24.368 | 14 MB |
| `evolution_contacts` | 20.563 | 18 MB |
| `evolution_whatsapp_status` | 14.789 | 10 MB |
| `evolution_media` | 23.366 | 10 MB |
| `evolution_conversations_wpp2` | 12.525 | 8,9 MB |
| `evolution_connection_history` | 5.223 | 2,0 MB |
| `evolution_reconcile_jobs` | 1.311 | 768 kB |

## Histórico

| Data | Evento |
|------|--------|
| 2026-07-14 | types.ts regenerado (9K→38K linhas, 57%→100% cobertura) |
| 2026-07-14 | DefaultSchema corrigido `"public"` → `"zapp"` |
| 2026-07-14 | 24 imports frontend migrados types.ts → schema.ts |
| 2026-07-15 | 105 edge functions migradas para `schema: 'zapp'` |
| 2026-07-15 | `_shared/db-client.ts` factory criada |
| 2026-07-15 | 17 syntax issues (}} malformado) corrigidos |
| 2026-07-15 | **Auditoria MCP**: contagem corrigida 294→315 (zapp), 193 confirmados (evo) |
| 2026-07-16 | **Auditoria exaustiva**: contagem definitiva 315→312 (zapp), public = 1+535 (não zero), 23 partições confirmadas (não 25), 12 RPCs ausentes identificados, Realtime corrigido para usar raiz particionada |
| 2026-08-04 | **Integração schema zapp × front**: inventário pg_catalog atualizado (zapp: **323** tabelas, **359** views, **5** matviews, **1077** funções, **759** policies, **144** cron jobs); wrappers `zapp.rpc_app_bootstrap`/`zapp.rpc_dashboard_init` (SECURITY DEFINER; `public.*` → service_role only); `rpc_schema_columns`/`rpc_schema_tables` (whitelist zapp/evo/public); grants F-03; guard em `fn_safe_audit_log` |
| 2026-08-05 | **Fechamento plano 100 etapas**: inventário pg_catalog revalidado (323/359/5/1077/759/144); grants `fn_system_health_score`/`reassign_absent_agents`/`reassign_overloaded_agents` com guarda `is_admin_or_supervisor` (migration `20260805183000`); types.ts regenerado via postgres-meta (sync com DB) |
| 2026-08-06 | **Plano 30 etapas — integridade de referências**: fix DB-01 — `zapp.fn_enqueue_message_dispatch(uuid,text)` criada (enqueue canônico; SECURITY DEFINER `search_path=zapp,evo,public`; EXECUTE p/ `service_role`; índice único parcial `idx_outbound_queue_source_message_id` como guard anti-duplicata) — cron `retry-stuck-messages` deixa de ser no-op; fix DB-02 — `fn_purge_api_key_from_logs` sem o UPDATE na tabela morta `evo.evolution_webhook_events` (o parent real `_v2` já era coberto); fix DB-03 — `fn_register_instance` insere em `zapp.instance_registry` e não cria mais partição de `evo.evolution_webhook_events` (parent real `_v2`, RANGE por `created_at`, partições mensais via cron jobid 64); 3 CHECKs `NOT VALID` validados (`chk_ncm_formato` em `vendas.ordens_compra`; `chk_tipo_nota_v2`/`chk_status_v2` em `financeiro.notas_fiscais`); guardrail de integridade de referências ativo (Q-1/Q-2 em CI + `ops.fn_check_reference_integrity()` → `ops._infra_check_log`); `GRANT SELECT ON cron.job, cron.job_run_details TO supabase_read_only_user`; re-auditoria: zapp **323** tabelas / **359** views / **5** matviews / **1077** funções / **759** policies (baseline do plano — 380 views/1075 funções/729 policies — defasado, pré-sprint 2026-08-05) |
| 2026-08-15 | **Desacoplamento ZAPP×Evolution — Fase 0 concluída**: separação física completa entre repos (zapp-web-v3 / evolution-stack); auditoria dos 9 invariantes de independência (score T0: 3/9 = 33% — Nota D); migrations de observabilidade (`ops.pgnet_egress_log`, `ops.i4_violation_baseline`, `ops.fn_decouple_preflight`); CI guard `decouple-guard.yml` ativo; gateway único obrigatório (`supabase/functions/_shared/providers/evolution/client.ts`); plano mestre em 100 etapas documentado em `docs/decouple/DECOUPLING.md`; tag `decouple-t0-20260815` criada; seção de status de desacoplamento adicionada a este documento |

---

## Como escrever queries corretas (2026-07-15)

### Regra de ouro
- Cliente `supabase` importado de `@/integrations/supabase/client` **já está fixado em `zapp`**.
- Para tabelas fora de `zapp`, use `.schema('<schema>')` explicitamente.

### Frontend — leituras `zapp.*` (default)
```ts
import { supabase } from '@/integrations/supabase/client';

const { data } = await supabase
  .from('contacts')                // ← zapp.contacts (implícito)
  .select('id, name, phone')
  .eq('assigned_to', userId);
```

### Frontend — leituras de dados Evolution (via views `zapp.*`)

> ⚠️ **2026-08-04 (Invariante 1)** — leituras PostgREST de dados Evolution devem usar as **views `zapp.*`** (ex.: `zapp.evolution_messages_wpp2`). `.schema('evo')`/`.schema('email_app')` em `.from()`/`.rpc()` é proibido (guardrail ESLint). Exceção única: **Realtime** em tabelas físicas da publicação `supabase_realtime`. Ver [INTEGRATION_INVARIANTS.md](./INTEGRATION_INVARIANTS.md).

```ts
const { data } = await supabase
  .from('evolution_messages_wpp2') // ← view zapp (sem .schema('evo'))
  .select('id, remote_jid, content, timestamp')
  .order('timestamp', { ascending: false });
```

### Realtime — sempre com `schema` explícito e tabela **raiz**
```ts
supabase
  .channel('inbox-messages')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'evo', table: 'evolution_messages' },  // ← raiz, NÃO a partição
      handler)
  .subscribe();
```

Realtime **não segue o default** do cliente — o `schema` precisa aparecer no config.

> **ATENÇÃO**: a publicação `supabase_realtime` tem `publish_via_partition_root = true`.
> Isso significa que o evento CDC é publicado pela **tabela raiz** (`evolution_messages`),
> **nunca pela partição** (`evolution_messages_wpp2`). Assinar a partição resulta em silêncio
> total — zero eventos recebidos.

### Edge Functions — factories obrigatórias
```ts
// ✅ correto
import { createZappAdminClient } from '../_shared/db-client.ts';
const admin = createZappAdminClient();

// ❌ evitar (sem schema explícito)
const admin = createClient(url, key);

// ✅ alternativa válida (schema inline)
const admin = createClient(url, key, { db: { schema: 'zapp' } });
```

### Anti-patterns proibidos
| Padrão | Motivo |
|--------|--------|
| `.schema('public')` | schema `public` tem apenas 1 tabela interna Supabase (`_wal_slot_guard_events`) + 535 views proxy — não é schema de aplicação |
| `.schema('evo')` / `.schema('email_app')` em `.from()`/`.rpc()` | schema canônico é `zapp`; leituras via views `zapp.*` (Invariante 1). Exceção única: Realtime em tabelas físicas da publicação `supabase_realtime` |
| `createClient` sem `db:{schema}` fora de factories | rota para o schema errado |
| URL `*.supabase.co` em código | projeto usa self-hosted `supabase.atomicabr.com.br` |
| Realtime sem `schema:` no config | canal sobe mas não recebe eventos |

Guardrail: `scripts/check-schema-usage.mjs` (bloqueante no CI) barra todos os itens acima.

## Checklist — Consultando tabelas `evo` no frontend

> ⚠️ **ATUALIZADO 2026-08-04 (Invariante 1):** leituras PostgREST de dados Evolution usam as **views `zapp.*`** (`evolution_messages_wpp2`, `evolution_conversations_wpp2`, `evolution_retry_metrics`, `evolution_instances`, `evolution_contacts`, ...). `.schema('evo')` em `.from()`/`.rpc()` é **proibido** por guardrail ESLint. A exceção única é **Realtime** (item 3): tabelas físicas `evo.*` da publicação `supabase_realtime`. Detalhes em [INTEGRATION_INVARIANTS.md](./INTEGRATION_INVARIANTS.md).

O cliente principal (`src/integrations/supabase/client.ts`) está fixado em
`db: { schema: 'zapp' }`. Para tocar em tabelas do schema `evo` (mensagens,
conversas, contatos da Evolution API):

1. **Leituras**: use as views `zapp.*` (client fixado em `zapp`; ex.: `.from('evolution_messages_wpp2')` lê a view `zapp.evolution_messages_wpp2`).
2. **Não use `.schema('evo')` em `.from()`/`.rpc()`** — proibido por guardrail ESLint. Bridges `zapp` cobrem: `evolution_health_logs`, `evolution_instance_credentials`, `evolution_retry_metrics`, `evolution_instances`, `evolution_contacts`, `evolution_messages_wpp2`, `evolution_conversations_wpp2`.
3. **Realtime**: no `channel.on('postgres_changes', ...)` passe
   `schema: 'evo'` e a **tabela raiz** (`evolution_messages`,
   `evolution_conversations`) — **NUNCA a partição**. A publicação
   `supabase_realtime` tem `publish_via_partition_root = true`, então eventos
   chegam pela raiz; assinar a partição resulta em zero eventos.
4. **Bridges em `zapp`** já existem para: `evolution_health_logs`,
   `evolution_instance_credentials`, `evolution_retry_metrics`,
   `evolution_instances`, `evolution_contacts`. Essas podem ser lidas via
   client `zapp` normal (sem `.schema('evo')`).

Exemplo canônico (leitura via view `zapp`):

```ts
const { data } = await supabase
  .from('evolution_messages_wpp2') // ← view zapp (client fixado em zapp)
  .select('id, remote_jid, content, created_at')
  .eq('instance_name', 'wpp2')
  .order('created_at', { ascending: false })
  .limit(50);
```


---

## ⚠️ Governança de migrations — LEIA ANTES DE RODAR QUALQUER COISA

**Auditoria 2026-07-17.** Este banco **não usa o ledger padrão do Supabase CLI**.

| Fato | Medição |
|---|---|
| `supabase_migrations.schema_migrations` | **NÃO EXISTE** |
| Ledger real em uso | `zapp.schema_migrations` — **39 registros** (2021-07-06 → 2026-07-12) |
| Arquivos em `supabase/migrations/` | **828** |
| Workflows/scripts que rodam `db push`/`db reset` | **0** (verificado) |

### O que isso significa

O schema canônico foi construído por **execução direta de SQL** (via MCP/psql), não por
`supabase db push`. A pasta `supabase/migrations/` é **registro histórico**, não fonte da
verdade aplicada. Os 789 arquivos fora do ledger **não são drift** — nunca foram destinados
ao CLI.

### Regras

1. **NUNCA** rodar `supabase db push`, `db reset` ou `supabase link` contra
   `supabase.atomicabr.com.br`. Sem ledger, o CLI tentaria aplicar as 828 do zero.
2. Mudança de schema = SQL direto + `gen-types-zapp.yml` no **mesmo PR**.
3. A fonte da verdade de schema é **`pg_catalog`** — nunca o OpenAPI do PostgREST
   (não enxerga trigger, policy, cron, nem distingue view de tabela: foi exatamente
   o erro que produziu o GAP REPORT de 16/07 com 6 dos 8 números errados).
4. Migration com `DO $$ IF NOT EXISTS` no repo **não implica** coluna no banco.
   Caso concreto: `onboarding_status` (Sprint 2) existe no arquivo e **não** no banco.

---

## 🔐 Postura de `anon` — baseline 2026-07-17

Após a contenção de 16/07 (`security_invoker=true` em 535/535 views) e o REVOKE de 17/07:

| Superfície | Antes (16/07) | Depois (17/07) |
|---|---:|---:|
| GRANTs de `anon` em `public` | 329 (INSERT/UPDATE/DELETE) | **0** |
| GRANTs de `anon` em `zapp` | 0 | **0** |
| GRANTs de `anon` em `evo` | 0 | **0** |
| Funções executáveis por `anon` | 0 | **0** |
| Views `public` sem `security_invoker` | 0 | **0** |

`authenticated` (717 zapp / 203 evo / 536 public) e `service_role` permanecem intactos.
Schema `evo` **não é exposto** pelo PostgREST (PGRST106). `PGRST_DB_SCHEMAS` atual: `public`, `zapp`, `storage`, `graphql_public`, `artes`, `vendas`, `financeiro` — `evo`/`email_app` **nunca** adicionar.

> **Recomendação 2026-08-05 (I-02):** `artes`/`vendas`/`financeiro` permanecem expostos no mesmo PostgREST — superfície cross-tenant. Decisão: segregar para PostgREST/rota dedicada em janela agendada com aprovação do dono; **NÃO alterado em produção** neste ciclo.

**Teste autoritativo de vazamento** (o único que vale):

```bash
curl "$BASE/rest/v1/<obj>?select=*&limit=1" -H "apikey: $ANON" -H "Accept-Profile: public"
# resposta iniciando com [{  → VAZAMENTO REAL
# 42501 permission denied    → contido
```

`SET LOCAL ROLE anon` em bloco `DO` **não vale** — não persiste no `EXECUTE` dinâmico e
produz falso negativo.

---

## RPCs de batch do inbox (adicionado 2026-08-05)

As 4 RPCs batch usadas pelo inbox/CRM (substituem padrões N+1). Todas vivem no schema `zapp` e são
executadas no **único client self-hosted** (`src/integrations/supabase/client.ts`). Shapes abaixo são os
**reais** — da produção/`types.ts` e dos contratos dos hooks consumidores.

| RPC (schema `zapp`) | Assinatura | Shape real do retorno | Consumidor | Migration |
|---|---|---|---|---|
| `rpc_get_contact_summary_batch` | `p_contact_ids uuid[]` | `TABLE(contact_id uuid, unread_whispers integer, pending_tasks integer)` — no PostgREST/types.ts:75865 tipado como `Json`; contrato TS: `ContactSummary[] { contact_id, unread_whispers, pending_tasks }` | `useContactSummaryBatch` (`src/features/inbox/hooks/useContactSummaryBatch.ts:41-44`), ligado em `useRealtimeInbox.ts:235` | `20260806090000_capture_rpc_get_contact_summary_batch.sql` (CAPTURA — antes **sem** migration versionada; `SECURITY DEFINER`, `search_path zapp`) |
| `rpc_get_reactions_batch` | `p_message_ids string[]` | Array JSONB de reações; contrato TS: `MessageReaction[] { id, message_id, user_id, contact_id, emoji, created_at, user_name? }` (`src/features/inbox/hooks/reactions/types.ts:2-10`); types.ts:75869 tipado como `Json` | `usePreloadConversationReactions` (`src/features/inbox/hooks/reactions/usePreloadConversationReactions.ts:37-39`) | **Nenhuma** (aplicada direto em produção — dívida, mesmo tratamento de captura pendente) |
| `get_companies_by_phones_batch` | `p_phones TEXT[]` | **Produção**: array de `{ phone, company, full_name, lead_status }` (types.ts:75139-75147; confirmado pelo fix BUG #9 em `useExternalApiManagement.ts:118-123`) — `SECURITY DEFINER`, `REVOKE` de `anon`/`authenticated`, `GRANT service_role` apenas | `useExternalContact360Batch` (`src/hooks/useExternalApiManagement.ts:108`) via `RPC.getCompaniesByPhonesBatch` (`rpcCatalog.ts:500-503`, client `'lovable'` → self-hosted) | `20260804000000_canonical_schema.sql:13416` (definição arquivada difere da produção: `RETURNS JSONB` com `{ phone, company_id, company_name, cnpj, email }` — drift archive × prod) |
| `get_contacts_360_batch` | `p_phones text[]` | JSONB: `{ results: [{ contact (row_to_json \| null), conversation_id (evo.evolution_conversations.id \| null), phone, found }] }` | `RPC.getContacts360Batch` (`rpcCatalog.ts:490-493`, client `'lovable'` → self-hosted); consumido em `useExternalApiManagement.ts` | `20260804000000_canonical_schema.sql:15859+` (origem `20260803213510_get_contacts_360_batch.sql`; `SECURITY DEFINER`, guard de workspace) |

Notas:
- `rpc_get_contact_summary_batch` e `rpc_get_reactions_batch` **não estão no catálogo** (`rpcCatalog.ts`) — são chamadas diretas `supabase.rpc(...)` nos hooks (sem roteamento por rótulo).
- As duas RPCs de telefone (`get_companies_by_phones_batch`, `get_contacts_360_batch`) têm guard de isolamento de workspace (`workspace_members`) e `SECURITY DEFINER` com `search_path` restrito.

---

## 🛡️ Guardrail de integridade de referências (2026-08-06)

Mecanismo (etapa 29 do plano de correção em 30 etapas) que impede o retorno de **referências penduradas** no banco — função → objeto inexistente (Q-1) e cron → função inexistente (Q-2). Resposta aos achados DB-01/02/03 da auditoria 2026-08-04 (funções `zapp` apontando para objetos que não existem mais).

| Componente | Papel |
|---|---|
| `scripts/sql/check-reference-integrity.sql` | SQL read-only (Q-1 + Q-2): parseia `pg_proc.prosrc` das funções `zapp`/`public`/`evo`/`email_app`/`auth` atrás de chamadas `schema.objeto(` e valida a existência do alvo em `pg_proc`/`pg_class`; varre `cron.job.command` contra funções inexistentes. `RAISE EXCEPTION` (fail-closed) se `count > 0`; imprime `REFERENCE_INTEGRITY_OK` quando limpo. Comentários `--` são removidos antes do match (evita falso positivo com documentação de bugs antigos). Custo medido: Q-1 ≈ 35 ms, Q-2 ≈ 5 ms. |
| `.github/workflows/db-reference-integrity.yml` | Gate de CI (molde INV-6 de `db-invariants.yml`): `schedule` diário (`0 8 * * *`) + `workflow_dispatch` + push em `supabase/**`; instala `postgresql-client` (fail-closed) e roda `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/check-reference-integrity.sql`; sem secret → `::notice` + exit 0 (separa falha de infra de falha de invariante). |
| `ops.fn_check_reference_integrity()` | Função read-only em `ops` com as mesmas queries Q-1/Q-2; registra o resultado em `ops._infra_check_log` (`score = 100 - issues`, `issues = n_fn_obj + n_cron_fn`, `detail` = jsonb das pendências) — histórico contínuo entre runs do GH Actions. |
| `ops._infra_check_log` | Tabela de observabilidade em `ops` (colunas `id, score, max_score, issues, detail, checked_at`) — shape pré-existente, zero DDL novo. |
| `GRANT SELECT ON cron.job, cron.job_run_details TO supabase_read_only_user` | Observabilidade de cron para o role de auditoria (USAGE já existia; SELECT aplicado na migration `20260806124000_db05_grants_cron_observability.sql`). |

- **Baseline 2026-08-05:** Q-1 = 3 pendências (exatamente DB-01/02/03), Q-2 = 0. Após os fixes e a re-varredura (etapa 26): **0 referências penduradas** — guardrail ativo em modo fail-closed.
- **Re-auditoria 2026-08-06 (pg_catalog):** zapp **323** tabelas / **359** views / **5** matviews / **1077** funções / **759** policies — os números do plano (380 views / 1075 funções / 729 policies) estavam **defasados** (pré-sprint 2026-08-05) e **não** devem ser usados como verdade.

---

## Funções Adicionadas em 2026-08-05 (Bug Fix Sprint)

Sprint de correção de bugs (30 etapas — `PLANO_CORRECAO_ZAPPWEB_30_ETAPAS.md`). Assinaturas abaixo **auditadas via `pg_catalog` em produção** em 2026-08-05 (`pg_get_functiondef` + `pg_index`).

### `zapp.get_companies_by_phones_batch(p_phones text[])`

| Atributo | Valor |
|---|---|
| Tipo | FUNCTION, `LANGUAGE sql`, **STABLE**, **SECURITY DEFINER** |
| `search_path` | `zapp, evo, monitoring` (fixo) |
| Retorna | `TABLE(phone text, company text, full_name text, lead_status text)` |
| Permissões | `service_role` apenas (`REVOKE` de `anon`/`authenticated`) |
| Índice de suporte | **`idx_ec_phone_norm_batch`** em `evo.evolution_contacts` (btree em `regexp_replace(COALESCE(phone_number,''), '\D','','g')`, parcial `WHERE deleted_at IS NULL` — 648 kB) |
| Consumidor | `useExternalContact360Batch` (`src/hooks/useExternalApiManagement.ts:108`) via `RPC.getCompaniesByPhonesBatch` (`src/integrations/datasource/rpcCatalog.ts:500-503`) |

- **Propósito**: batch lookup de empresa/contato por telefone normalizado (dígitos apenas, `>= 8` dígitos). Normaliza `p_phones` com `regexp_replace(... '\D','','g')` e faz JOIN com `evo.evolution_contacts` pelo mesmo padrão, filtrando `deleted_at IS NULL`.
- **Otimização anti Seq Scan**: antes do índice, o JOIN por expressão (`regexp_replace`) forçava **Seq Scan** em `evo.evolution_contacts` (20.563 linhas) — a RPC levava **4–6.5s**. O índice funcional `idx_ec_phone_norm_batch` (mesma expressão + parcial `deleted_at IS NULL`) permite **Index Scan** no lookup por telefone.
- **Roteamento**: fix do Bug #3 consolidou o roteamento no **único client self-hosted** (sem dual-client Lovable/self-hosted).

### `zapp.rpc_get_contact_summary_batch(p_contact_ids uuid[])`

| Atributo | Valor |
|---|---|
| Tipo | FUNCTION, `LANGUAGE sql`, **STABLE**, **SECURITY DEFINER** |
| `search_path` | `zapp` (fixo) |
| Retorna | `TABLE(contact_id uuid, unread_whispers integer, pending_tasks integer)` |
| Permissões | `authenticated` (via grant) |
| Migration | `20260806090000_capture_rpc_get_contact_summary_batch.sql` (CAPTURA — registra definição viva via `pg_get_functiondef`; antes **sem** migration versionada) |
| Consumidor | `useContactSummaryBatch` (`src/features/inbox/hooks/useContactSummaryBatch.ts:41-44`), ligado em `useRealtimeInbox.ts:235` |

- **Propósito**: batch de `unread_whispers` (COUNT de `zapp.whisper_messages` com `is_read = false`) + `pending_tasks` (COUNT de `zapp.conversation_tasks` com `status = 'pending'`) **por `contact_id`**, via `unnest(p_contact_ids)` + `LEFT JOIN` (todo id de entrada retorna linha; zero vira `COALESCE(..., 0)`).
- **Substitui**: N+1 HEAD requests para `/rest/v1/whisper_messages?contact_id=eq.<uuid>&is_read=eq.false` — 1 request HEAD por contato vira **1 chamada batch** (Bug #2).

### Bugs Corrigidos em 2026-08-05

| Bug | Descrição | Fix aplicado |
|-----|-----------|--------------|
| #1 | Realtime race condition em `agent-presence-realtime` (múltiplos channels por mount, subscribe antes do `.on()`) | Tópico único por mount + `.on()` **antes** de `.subscribe()` |
| #2 | N+1 HEAD `whisper_messages` (1 request HEAD por contato no inbox) | `rpc_get_contact_summary_batch` — 1 chamada batch para todos os `contact_ids` |
| #3 | `get_companies_by_phones_batch` 4–6.5s (Seq Scan em `evo.evolution_contacts`) | Índice `idx_ec_phone_norm_batch` (btree em `regexp_replace` de `phone_number`, parcial `deleted_at IS NULL`) + roteamento único self-hosted |
| #4 | N+1 PATCH `mark-as-read` (1 PATCH por contato ao ler conversa) | Flush **coalescido** `.in('contact_id', ids)` em `useRealtimeMessages.ts` — 1 PATCH batch |
| #5 | `RetryUtil` retentava `AbortError` (retries desnecessários em aborts) | Guard `isIntentionalAbort` em `src/lib/retry.ts` |
| #6 | `useMediaUrl` falhando no unload (estado atualizado após unmount) | Guard `mountedRef` |
| #7 | TTM pós-deploy 1154ms (forced refresh imediato após deploy) | Grace window 60s + banner `zapp-update-required` (`src/lib/buildVersion.ts`) |
| #8 | `rpc_get_contact_summary_batch` abortado no unload (erro falso no console) | `AbortError` silencioso (guard `isIntentionalAbort` — sem log de erro) |
