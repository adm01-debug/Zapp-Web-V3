# Estado: src/integrations — supabase client/safe/pool/columnMap/ai-router/datasource/zappweb/lovable

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 31/31 (+1 GERADO excluído)

## 1. Visao Geral

Camada de integração do frontend com Supabase, Evolution API e serviços externos. Divide-se em 4 módulos: **datasource** (gateway abstrato de DB + catálogo de RPCs), **supabase** (cliente canônico, safe wrapper, tipos, monitoramento), **zappweb** (hooks e cliente Evolution API para demo WhatsApp) e **lovable** (OAuth social wrapper).

`src/integrations/supabase/types.ts` — **GERADO** (69 k linhas, auto-gerado via `curl supabase_meta`; não auditar manualmente).

### Tabela de Arquivos

| arquivo | linhas | o que faz | EM_USO/ORFAO | status |
|---|---|---|---|---|
| `datasource/db.ts` | 191 | Gateway único de DB: `dbFrom`, `dbRpc`, `dbList/Get/Insert`; roteia entre clientes | EM_USO | COMPLETA |
| `datasource/registry.ts` | 108 | `ENTITY_MAP` entidade → schema/tabela/client; tipos `LogicalEntity`, `DatasourceClient` | EM_USO | COMPLETA |
| `datasource/rpcCatalog.ts` | 705 | Catálogo tipado de ~40 RPCs com interfaces params/row | EM_USO | COMPLETA |
| `datasource/sentinel.ts` | 38 | Guard de acesso: `validateEntityAccess` / `validateRpcAccess` (no-op em v6.1) | EM_USO | PARCIAL |
| `lovable/index.ts` | 41 | Wrapper OAuth social: `lovable.signIn/Out` para Google/Apple/Microsoft | EM_USO | COMPLETA |
| `supabase/ai-router.ts` | 223 | Roteador central para 9 ações IA via Edge Function `ai-router` | EM_USO | COMPLETA |
| `supabase/channelErrorLogging.ts` | 80 | Classifica e loga erros Realtime; distingue transitórios de reais | EM_USO | COMPLETA |
| `supabase/client.retry.test.ts` | 127 | Testes Vitest de `retryFetch` — 6 cenários cobrindo retries/não-retry | EM_USO | COMPLETA |
| `supabase/client.ts` | 631 | Instância Supabase canônica, semáforo MAX_CONCURRENT=6, `retryFetch` | EM_USO | COMPLETA |
| `supabase/columnMap.ts` | 339 | Mapeia colunas físicas → canônicas para 6 entidades | EM_USO | COMPLETA |
| `supabase/connectionPool.ts` | 407 | ConnectionPoolManager: métricas de concorrência e memory pressure | EM_USO | COMPLETA |
| `supabase/connectivityMonitor.ts` | 275 | Ping heartbeat 60s `/auth/v1/health`; status online/offline/backend-down | EM_USO | COMPLETA |
| `supabase/cookieStorage.ts` | 101 | StorageAdapter: localStorage com fallback in-memory para SSR | EM_USO | COMPLETA |
| `supabase/externalClient.ts` | 74 | Shim pós-consolidação: `externalSupabase === supabase` (alias no-op) | EM_USO | MORTA |
| `supabase/externalSessionBridge.ts` | 66 | Bridge pós-consolidação: `mirrorExternalSignIn/Out` são no-ops permanentes | EM_USO | MORTA |
| `supabase/gmailHealthRLS.test.ts` | 34 | Testa strings hardcoded de políticas RLS sem importar código real | ORFAO | STUB |
| `supabase/rowNormalizers.ts` | 135 | Normaliza rows DB → tipos canônicos (Connection, Contact, Message) | EM_USO | COMPLETA |
| `supabase/safe-queries.ts` | 292 | Query builders para `whatsapp_connections` e `channel_connections` com guards | EM_USO | COMPLETA |
| `supabase/safeClient.test.ts` | 66 | Testes unitários de `safeClient` (circuit breaker, telemetria) | EM_USO | COMPLETA |
| `supabase/safeClient.ts` | 413 | Cliente com circuit breaker, cache TTL, telemetria, validação de recursos | EM_USO | COMPLETA |
| `supabase/safeClientMasking.ts` | 64 | Mascaramento de dados sensíveis: email, tokens longos, chaves PII | EM_USO | COMPLETA |
| `supabase/safeClientTypes.ts` | 55 | Tipos compartilhados: `SafeResponse`, `OperationFailure`, `ClientTelemetry` | EM_USO | COMPLETA |
| `supabase/schema.ts` | 58 | Barrel de tipos: `Database`, `Tables<T>`, `Views<T>`, `EvoTable<T>`, `ContactRow` | EM_USO | COMPLETA |
| `supabase/types-manual.ts` | 196 | Tipos manuais: `ExtendedDatabase`, `ContactIntelligenceRow`, `ManualUserSettings` | EM_USO | COMPLETA |
| `zappweb/evolutionClient.ts` | 388 | Cliente HTTP Evolution API: sendText/Media/Audio, circuit breaker, cache TTL | EM_USO | COMPLETA |
| `zappweb/hooks/useZappContactSearch.ts` | 32 | Hook busca em `evolution_contacts` | EM_USO | COMPLETA |
| `zappweb/hooks/useZappConversations.ts` | 84 | Hook lista/assina `evolution_conversations` via Realtime | EM_USO | PARCIAL |
| `zappweb/hooks/useZappMessages.ts` | 122 | Hook busca mensagens + Realtime de `evolution_messages` | EM_USO | PARCIAL |
| `zappweb/index.ts` | 39 | Barrel: re-exporta supabaseClient, hooks, evolutionClient, tipos | EM_USO | COMPLETA |
| `zappweb/supabaseClient.ts` | 34 | Re-exporta `supabase` com alias `zappSupabase` + constantes de instância | EM_USO | COMPLETA |
| `zappweb/types.ts` | 108 | Tipos locais: `WhatsAppMessageType`, `EvolutionContact`, `EvolutionMessage` | EM_USO | COMPLETA |

---

## 2. Fluxos funcionais

### Acesso ao banco (fluxo principal)
`client.ts` (createClient, schema=zapp, semáforo MAX_CONCURRENT=6) → `safeClient.ts` (circuit breaker + cache TTL + telemetria) → `datasource/db.ts` (dbFrom/dbRpc — gateway abstrato) → repositórios/hooks → tabelas `zapp.*` via PostgREST

### RPCs tipadas
`datasource/rpcCatalog.ts` (~40 RPCs tipadas) → `datasource/db.ts:dbRpc()` → `safeClient.ts` → Supabase RPC endpoint

### IA (roteador)
`supabase/ai-router.ts` (9 ações: autoTag, summary, enhanceMessage, classifyEmoji/Sticker, churnAnalysis, conversationAnalysis, suggestReply, transcribeAudio) → Edge Function `ai-router`

### WhatsApp via zappweb (escopo demo)
`zappweb/hooks/useZapp*` (SELECT + Realtime schema `evo`) + `zappweb/evolutionClient.ts` (HTTP REST Evolution API) → `ZappWebbDemoPage.tsx`

### Monitoramento de conectividade
`connectivityMonitor.ts` (heartbeat 60s → `/auth/v1/health`) + `channelErrorLogging.ts` (classifica erros Realtime) → AuthProvider, hooks de inbox

### Legado / dead code
`externalClient.ts` (alias `externalSupabase = supabase`) + `externalSessionBridge.ts` (no-ops) → chamados ainda por 15 importadores, mas sem efeito funcional

---

## 3. Tabelas, RPCs, canais realtime e edge functions

| categoria | itens |
|---|---|
| **Tabelas SELECT** | `whatsapp_connections`, `channel_connections`, `contatos`, `profiles`, `evolution_messages`, `failed_messages`, `queue_members`, `evolution_contacts`, `evolution_conversations`, `evolution_instances` |
| **Partições (BUG em zappweb)** | `evolution_messages_wpp2`, `evolution_conversations_wpp2` (SELECT incorreto — deveria ser raiz) |
| **RPCs (~40)** | `rpc_list_contacts`, `rpc_list_messages`, `rpc_list_messages_lite`, `rpc_list_conversations`, `rpc_app_bootstrap`, `rpc_dashboard_home`, `rpc_global_search`, `rpc_inbox_preview_batch`, `rpc_insert_message`, `rpc_log_outbound_event`, `rpc_log_service_event`, `merge_contacts`, `bulk_auto_merge_duplicates`, `bulk_soft_delete_contacts`, `bulk_add_tag`, `grant_lgpd_consent`, `revoke_lgpd_consent`, `get_lgpd_compliance_stats`, `get_contact_stats`, `get_contact_conversations`, `get_contact_notes`, `rpc_update_email_health_state`, `rpc_log_email_health` (+ ~17 outros em rpcCatalog) |
| **Realtime (raiz correta)** | `evo.evolution_messages`, `evo.evolution_conversations` |
| **Edge Functions** | `ai-router` (único ponto de entrada das 9 ações IA) |
| **Endpoint HTTP externo** | `/auth/v1/health` (connectivityMonitor ping) |

---

## 4. Exports Públicos por categoria

**Acesso ao DB (datasource):** `dbClient`, `dbFrom`, `dbChannel`, `dbRpc`, `dbList`, `dbGet`, `dbInsert`, `ENTITY_MAP`, `LogicalEntity`, `DatasourceClient`, `validateEntityAccess`

**Core Supabase:** `supabase` (canônico), `acquireSupabaseSlot`, `retryFetch`, `warnSupabaseUnconfigured`

**Safe layer:** `safeClient`, `maskValue`, `maskPII`, `SafeResponse`, `OperationFailure`, `ClientTelemetry`, `SafeQueryBuilder` (any — degenerado)

**Tipos:** `Database`, `Tables<T>`, `Views<T>`, `Enums<T>`, `EvoTable<T>`, `ContactRow`, `ExtendedDatabase`, `ContactIntelligenceRow`, `ManualUserSettings`, `ManualWorkspaceSettings`

**Normalização/mapeamento:** `normalizeConnection`, `normalizeContact`, `normalizeMessage`, `mapColumn`, `COLUMN_MAP`

**Monitoramento:** `connectivityMonitor`, `ConnectionPoolManager`, `classifyChannelError`, `logChannelError`

**Safe queries:** `safeQueryWhatsappConnections`, `safeQueryChannelConnections`, `enforceViewUsage`

**IA:** `aiRouter` (9 ações encapsuladas)

**Zappweb:** `evolutionClient`, `useZappContactSearch`, `useZappConversations`, `useZappMessages`, `zappSupabase`, `ZAPPWEB_INSTANCE`, `ZAPPWEB_CONFIG`

**OAuth:** `lovable.signIn`, `lovable.signOut`

**Dead (no-ops):** `externalSupabase`, `callExtRpc`, `extRpcBuilder`, `registerExternalSessionBridge`, `mirrorExternalSignIn`, `mirrorExternalSignOut`

---

## 5. Chama (Saida)

| destino | chamado por |
|---|---|
| `@supabase/supabase-js` | `client.ts`, `externalClient.ts`, `safeClientTypes.ts`, `cookieStorage.ts` |
| `@/lib/logger` / `@/lib/clientTelemetry` | `db.ts`, `sentinel.ts`, `safeClient.ts`, `zappweb/evolutionClient.ts` |
| `@/lib/correlationId` | `db.ts` |
| `@/lib/constants/whatsappInstances` | `zappweb/supabaseClient.ts` |
| `@/shared/webhookEventSchemas` | `zappweb/evolutionClient.ts` |
| Edge Function `ai-router` | `ai-router.ts` |
| Evolution API (HTTP REST) | `zappweb/evolutionClient.ts` |
| `/auth/v1/health` (fetch) | `connectivityMonitor.ts` |

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa | contagem |
|---|---|---|
| `supabase/client.ts` | src/ (global) | ~413 |
| `supabase/safeClient.ts` | hooks, repositórios, services, components | ~100 |
| `supabase/schema.ts` | componentes, hooks, services | 44 |
| `datasource/db.ts` | features/*, hooks/*, pages/* | 68 |
| `supabase/channelErrorLogging.ts` | AuthProvider, ChatMessagesArea, useRealtimeInbox, useMessagesCursor, useTypingPresence + 9 outros | 14 |
| `datasource/rpcCatalog.ts` | messageRepository, contactFormV3, conversationManagement, externalAudioSender + 8 outros | 12 |
| `supabase/externalClient.ts` | lib/externalProxy, lib/contactsDB, features/inbox, services/connections + 9 outros | 13 |
| `supabase/safeClientMasking.ts` | structuredErrorLogging, QrCodeDialog, ConnectionsView, emailHealthRepository + 5 outros | 9 |
| `supabase/safe-queries.ts` | evolutionInstance, whatsappConnectionRepository, messageRepository, DegradedConnectionsBanner + 4 outros | 8 |
| `supabase/types-manual.ts` | schema.ts, client.ts, externalClient.ts, useContactIntelligence + 4 outros | 8 |
| `supabase/connectivityMonitor.ts` | useSupabaseConnectivity, useAudioManagement, channelErrorLogging + 4 outros | 7 |
| `supabase/columnMap.ts` | lib/evolutionInstance, features/connections, rowNormalizers + 3 outros | 6 |
| `lovable/index.ts` | lib/mcp/index.ts, mcp/tools/*.ts, supabase/functions/mcp | 5 |
| `supabase/rowNormalizers.ts` | evolutionInstance, whatsappConnectionRepository, messageRepository + 2 outros | 5 |
| `supabase/externalSessionBridge.ts` | features/auth/authService, main.tsx | 2 |
| `datasource/sentinel.ts` | useExternalApiManagement, useExternalDB | 2 |
| `supabase/ai-router.ts` | AIConversationAssistant, useAIAutoTags | 2 |
| `supabase/connectionPool.ts` | hooks/useConnectionManagement.ts | 1 |
| `supabase/cookieStorage.ts` | client.ts, AuthProvider, lib/storageSignedUrls | 3 |
| `zappweb/index.ts` | ZappWebbDemoPage.tsx (admin) | 1 |
| `supabase/gmailHealthRLS.test.ts` | nenhum | 0 |

---

## 7. Orfaos

| arquivo | linhas | veredito | motivo |
|---|---|---|---|
| `supabase/gmailHealthRLS.test.ts` | 34 | **VERIFICAR** | Zero importadores externos; importa apenas `vitest`; testa strings hardcoded de políticas RLS sem conectar a código de produção real. Candidato a remoção ou reescrita como integration test real. |

**Observação sobre arquivos de teste:** `client.retry.test.ts` e `safeClient.test.ts` têm zero importadores externos por natureza de arquivos de teste (executados pelo runner, não importados). Ambos testam código de produção amplamente usado (413 e 100+ importadores, respectivamente) — classificados como EM_USO via runner, não como órfãos.

**Observação sobre `datasource/registry.ts`:** consumido exclusivamente dentro de `datasource/` (por `db.ts`, `rpcCatalog.ts`, `sentinel.ts`) — sem importadores externos. É componente interno do módulo, não órfão independente; classificado EM_USO.

---

## 8. Implementacao por Arquivo

| arquivo | status | o que falta |
|---|---|---|
| `datasource/db.ts` | COMPLETA | — |
| `datasource/registry.ts` | COMPLETA | — |
| `datasource/rpcCatalog.ts` | COMPLETA | — |
| `datasource/sentinel.ts` | PARCIAL | `validateRpcAccess` é no-op documentado ("v6.1") sem implementação real de política por client |
| `lovable/index.ts` | COMPLETA | — |
| `supabase/ai-router.ts` | COMPLETA | — |
| `supabase/channelErrorLogging.ts` | COMPLETA | — |
| `supabase/client.retry.test.ts` | COMPLETA | — |
| `supabase/client.ts` | COMPLETA | — |
| `supabase/columnMap.ts` | COMPLETA | — |
| `supabase/connectionPool.ts` | COMPLETA | `initializeConnectionPool()` nunca chamado; pool consultado apenas via telemetria |
| `supabase/connectivityMonitor.ts` | COMPLETA | — |
| `supabase/cookieStorage.ts` | COMPLETA | — |
| `supabase/externalClient.ts` | MORTA | Migrar 13 importadores para `client.ts` e remover |
| `supabase/externalSessionBridge.ts` | MORTA | Remover após confirmar que main.tsx não depende do cleanup retornado |
| `supabase/gmailHealthRLS.test.ts` | STUB | Reescrever como integration test real ou remover |
| `supabase/rowNormalizers.ts` | COMPLETA | — |
| `supabase/safe-queries.ts` | COMPLETA | — |
| `supabase/safeClient.test.ts` | COMPLETA | — |
| `supabase/safeClient.ts` | COMPLETA | — |
| `supabase/safeClientMasking.ts` | COMPLETA | — |
| `supabase/safeClientTypes.ts` | COMPLETA | `SafeQueryBuilder = any` é tipo degenerado |
| `supabase/schema.ts` | COMPLETA | — |
| `supabase/types-manual.ts` | COMPLETA | — |
| `zappweb/evolutionClient.ts` | COMPLETA | — |
| `zappweb/hooks/useZappContactSearch.ts` | COMPLETA | — |
| `zappweb/hooks/useZappConversations.ts` | PARCIAL | SELECT linha 30 e 78 em partição `_wpp2`; deve usar tabela raiz `evolution_conversations` |
| `zappweb/hooks/useZappMessages.ts` | PARCIAL | SELECT linha 32 em partição `_wpp2`; deve usar tabela raiz `evolution_messages` |
| `zappweb/index.ts` | COMPLETA | — |
| `zappweb/supabaseClient.ts` | COMPLETA | Type cast `as unknown as SupabaseClient` smell documentado em comentário |
| `zappweb/types.ts` | COMPLETA | Potencial duplicação com tipos em `@/integrations/supabase/schema` (NAO_VERIFICADO) |

---

## 9. Achados

### A1 — BUG: useZappConversations e useZappMessages fazem SELECT em partição em vez da tabela raiz
`zappweb/hooks/useZappConversations.ts:30,78` e `zappweb/hooks/useZappMessages.ts:32` — SELECT em `evolution_conversations_wpp2` e `evolution_messages_wpp2` (partições). Retorna apenas dados da instância wpp2; dados das demais 12–13 instâncias ficam invisíveis. O Realtime dos mesmos hooks já usa a raiz correta (`evo.evolution_conversations`, `evo.evolution_messages`). Inconsistência query/Realtime = estado divergente silencioso.

### A2 — Dead code: externalClient.ts e externalSessionBridge.ts são no-ops com importadores ativos
`supabase/externalClient.ts:29` — `externalSupabase = supabase as unknown as SupabaseClient` (alias puro). `supabase/externalSessionBridge.ts:33-41` — `mirrorExternalSignIn/Out` são funções vazias. Juntos têm 15 importadores que poderiam usar `client.ts` diretamente. Débito de migração pós-consolidação single-DB.

### A3 — connectionPool.ts nunca inicializado em produção
`supabase/connectionPool.ts:370` — `initializeConnectionPool()` existe mas não é chamado fora do próprio módulo. O pool é consultado apenas via telemetria bridge em `useConnectionManagement`. Feature essencialmente inerte em produção.

### A4 — sentinel.ts: validateRpcAccess é no-op documentado como débito
`datasource/sentinel.ts:32-37` — comentário indica "v6.1 — sem warnings, sem throws". Qualquer client pode chamar qualquer RPC sem validação real. Risco de acesso indevido a RPCs privilegiadas via `DatasourceClient.external` ou `DatasourceClient.serviceRole` não bloqueado.

### A5 — safeClientTypes.ts: SafeQueryBuilder = any degenera o sistema de tipos
`supabase/safeClientTypes.ts:13` — `export type SafeQueryBuilder = any`. Tipo sem constraint; elimina o valor do sistema de tipos para qualquer código que use `SafeQueryBuilder` como anotação.

### A6 — gmailHealthRLS.test.ts: STUB inútil sem conexão com código real
`supabase/gmailHealthRLS.test.ts` — importa apenas `vitest` e valida strings hardcoded de SQL de políticas RLS. Não testa nenhuma função do projeto, não executa queries. Passa sempre independentemente de mudanças no banco.

### A7 — ai-router.ts: 7 das 9 ações IA sem importadores no frontend
`supabase/ai-router.ts` — 2 importadores frontend (`AIConversationAssistant` e `useAIAutoTags`). As ações `conversationSummary`, `enhanceMessage`, `classifyEmoji`, `classifySticker`, `churnAnalysis`, `conversationAnalysis`, `suggestReply` têm zero uso direto no frontend; potencialmente só invocadas por Edge Functions ou feature flags desabilitadas.

### A8 — client.ts: 631 linhas com semáforo inline de alta complexidade
`supabase/client.ts:153` — semáforo `MAX_CONCURRENT=6` com fila de drenagem implementado inline no módulo principal. Alta complexidade ciclomática para arquivo que deveria ser apenas configuração de cliente. Ponto de risco para manutenção.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
