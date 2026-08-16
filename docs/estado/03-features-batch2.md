# Estado: features-batch2 — contacts, connections, sla

> Auditado em: 2026-08-09 | Runtime: NAO_VERIFICADO
>
> Arquivos lidos: 51 (incluindo testes) | Linhas totais de fonte: ~7.306

---

## 1. Módulo: `src/features/contacts/`

### Papel no sistema

Fornece todos os hooks React para operações em contatos: busca paginada com cursor, notas, campos customizados, enriquecimento de dados, inteligência (IA), indicador de digitação em tempo real, estatísticas, atribuição de agente/fila e conformidade LGPD (exportação e exclusão).

### Arquivos

| Arquivo | Linhas | Responsabilidade |
|---------|--------|-----------------|
| `index.ts` | 9 | Barrel — exporta 8 hooks (omite useCampaignContactOptions) |
| `hooks/useCampaignContactOptions.ts` | 33 | Opções de contato para dialogs de campanha |
| `hooks/useContactAssignment.ts` | 48 | Atualiza `assigned_to` e `queue_id` na tabela contacts; fire-and-forget |
| `hooks/useContactCustomFields.ts` | 86 | CRUD em `contact_custom_fields` via upsert/delete; guarda com `isValidUUID` |
| `hooks/useContactEnrichedData.ts` | 204 | Resolve JID→UUID via `resolveLocalContactId` e carrega 3 queries paralelas |
| `hooks/useContactIntelligence.ts` | 127 | Chama RPC `getContactIntelligenceByPhone` via `dbGet()`; staleTime 15 min |
| `hooks/useContactNotes.ts` | 273 | CRUD de notas via RPCs `add_contact_note`/`update_contact_note` + delete direto |
| `hooks/useContactStats.ts` | 67 | RPC `rpc_contact_stats`; deriva `hasDuplicates`, `hasLgpdPending`, `growthPct30d` |
| `hooks/useContactTyping.ts` | 197 | Subscribe canal broadcast `typing:{remoteJid}`; 2 exports; env vars configuráveis |
| `hooks/useContactsSearch.ts` | 323 | Busca cursor-based via RPC `search_contacts_cursor`; URL-synced; PAGE_SIZE=50 |
| `services/contactExportLogService.ts` | 26 | Insere em `contact_export_log` (trilha de auditoria LGPD) |
| `services/dataDeletionRequestService.ts` | 20 | Insere em `data_deletion_requests` (LGPD direito ao esquecimento) |
| `hooks/__tests__/useContactEnrichedData.test.tsx` | 170 | Testes de useContactEnrichedData |
| `hooks/__tests__/useContactNotes.test.tsx` | 245 | Testes de useContactNotes |

### Tabelas Supabase (`.from()`)

| Tabela | Schema | Hook(s) | Operação |
|--------|--------|---------|----------|
| `contacts` | zapp | useContactAssignment, useContactEnrichedData, useContactsSearch, useCampaignContactOptions | SELECT, UPDATE |
| `contact_custom_fields` | zapp | useContactCustomFields | SELECT, UPSERT, DELETE |
| `contact_notes` | zapp | useContactNotes | SELECT, DELETE |
| `ai_conversation_tags` | zapp | useContactEnrichedData | SELECT |
| `conversation_sla` | zapp | useContactEnrichedData | SELECT |
| `profiles` | zapp | useContactNotes | SELECT (autores das notas) |
| `contact_export_log` | zapp | contactExportLogService | INSERT |
| `data_deletion_requests` | zapp | dataDeletionRequestService | INSERT |
| `contacts_count_by_type` | zapp | useContactsSearch | SELECT (view — contagem por tipo) |

### RPCs (`.rpc()`)

| RPC | Hook | Via |
|-----|------|-----|
| `getContactIntelligenceByPhone` | useContactIntelligence | `dbGet()` (RPC catalog) |
| `search_contacts_cursor` | useContactsSearch | `safeClient.rpc()` — paginação cursor |
| `rpc_contact_stats` | useContactStats | `safeClient.rpc<ContactStatsData>()` |
| `add_contact_note` | useContactNotes | `supabase.rpc()` — resolve `auth.uid()` no servidor |
| `update_contact_note` | useContactNotes | `supabase.rpc()` — resolve `auth.uid()` no servidor |

### Exports públicos (`index.ts`)

`useContactAssignment`, `useContactCustomFields`, `useContactEnrichedData`, `useContactIntelligence`, `useContactNotes`, `useContactStats`, `useContactTyping`, `useContactsSearch`

**Fora do barrel:** `useCampaignContactOptions`, `contactExportLogService`, `dataDeletionRequestService`

### Chama (saída)

- `@/integrations/datasource/db` — `dbFrom()`, `dbGet()` (abstração sobre supabase client)
- `@/integrations/supabase/safeClient` — `safeClient`, `safeFrom`
- `@/integrations/supabase/client` — `supabase` (direto)
- `@/utils/uuid` — `isValidUUID`, `resolveLocalContactId`
- Realtime Supabase: canal broadcast `typing:{remoteJid}` via `supabase.channel()`
- Env vars: `VITE_TYPING_AUTO_CLEAR_MS`, `VITE_TYPING_STOP_DEBOUNCE_MS`

### Chamado por (entrada)

NAO_VERIFICADO_CALLER — inferido por convenção:
- Página/componente de contatos → `useContactsSearch`, `useContactStats`
- Painel de conversa → `useContactEnrichedData`, `useContactTyping`, `useContactNotes`
- Dialog de criação de campanha → `useCampaignContactOptions` (import direto, fora do barrel)
- Exportação CSV → `contactExportLogService`
- Exclusão LGPD → `dataDeletionRequestService`

### Implementação

**COMPLETA** — todos os hooks têm `queryFn` e/ou `mutationFn` implementados com lógica real. Sem stubs. Sem handlers vazios.

Evidências:
- `useContactsSearch` (323L) — paginação cursor + sincronização URL completa
- `useContactNotes` (273L) — CRUD completo com RPCs de servidor
- `useContactTyping` (197L) — subscription broadcast com cleanup correto e 2 variantes de export

### Achados

1. `useCampaignContactOptions` não está no barrel `index.ts` — consumidores externos precisam de import direto do caminho interno.
2. `dataDeletionRequestService` não está no barrel — possível esquecimento de exportação.
3. `useContactAssignment` não invalida cache React Query após mutação (fire-and-forget) — pode causar stale data na UI se outros hooks dependem de `contacts`.
4. `useContactEnrichedData` usa dois clientes diferentes no mesmo hook: `dbFrom` (para `contacts`) e `supabase.from` (para `ai_conversation_tags` e `conversation_sla`) — pode causar divergência de schema se `dbFrom` operar em schema diferente do default.
5. `useContactTyping` aceita env vars opcionais; se ausentes, usa defaults hardcoded sem aviso — comportamento silencioso.

**Runtime: NAO_VERIFICADO**

---

## 2. Módulo: `src/features/connections/`

### Papel no sistema

Gerencia conexões WhatsApp (tabela `whatsapp_connections`): criação de instância Evolution API, geração de QR code com TTL detectado, pairing code, desconexão com audit log, reconexão, sincronização de histórico e status em tempo real via Realtime Supabase.

### Arquivos

| Arquivo | Linhas | Responsabilidade |
|---------|--------|-----------------|
| `index.ts` | 6 | Barrel — re-exporta components, hooks, services, data-access |
| `hooks/index.ts` | 2 | Exporta apenas `useConnectionsManager` |
| `hooks/types.ts` | 48 | Interfaces: `WhatsAppApiType`, `WhatsAppConnection`, `QrTtlSource`, `QrCodeDialogState` |
| `hooks/useConnectionsManager.ts` | 411 | Orquestrador: compõe state + actions + realtime; QR flow; audit no disconnect |
| `hooks/parts/useConnectionsState.ts` | 101 | Estado local + rehydration do sessionStorage (QR dialog com TTL) |
| `hooks/parts/useConnectionsActions.ts` | 256 | `handleAddConnection`, `handleSetDefault`, `handleDelete` (retry + `delete_pending`) |
| `hooks/parts/useConnectionsRealtime.ts` | 98 | Realtime: `postgres_changes` em `zapp.whatsapp_connections`; tópico com sufixo aleatório |
| `data-access/index.ts` | 2 | Exporta `whatsappConnectionRepository` |
| `data-access/whatsappConnectionRepository.ts` | 97 | `columnMap`, `fetchConnections` (cache 30s), `callEvolutionApi`, `callEvolutionApiV2` |
| `services/index.ts` | 2 | Exporta `whatsappConnectionService` |
| `services/whatsappConnectionService.ts` | 181 | `generateInstanceName`, `detectQrTtlMs` (clamp 15s-300s), `requestQrCode`, `createInstance`, `requestPairingCode` |
| `components/index.ts` | 2 | Exporta `WhatsAppConnectionStatus` |
| `components/WhatsAppConnectionStatus.tsx` | 62 | Badge UI: contagem connected/total com indicador de status |
| `hooks/parts/__tests__/useConnectionsActions.test.tsx` | 698 | Testes de useConnectionsActions |
| `hooks/parts/__tests__/useConnectionsRealtime.test.tsx` | 266 | Testes de useConnectionsRealtime |
| `hooks/parts/__tests__/useConnectionsState.test.ts` | 329 | Testes de useConnectionsState |
| `data-access/__tests__/whatsappConnectionRepository.test.ts` | 204 | Testes de whatsappConnectionRepository |
| `services/__tests__/whatsappConnectionService.test.ts` | 458 | Testes de whatsappConnectionService |
| `components/__tests__/WhatsAppConnectionStatus.test.tsx` | 105 | Testes de WhatsAppConnectionStatus |

### Tabelas Supabase (`.from()`)

| Tabela | Schema | Arquivo | Operação |
|--------|--------|---------|----------|
| `whatsapp_connections` | zapp | whatsappConnectionRepository | SELECT, INSERT, UPDATE |
| `qr_attempts` | zapp | whatsappConnectionRepository | INSERT, UPDATE |

### RPCs (`.rpc()`)

| RPC | Arquivo | Uso |
|-----|---------|-----|
| `fn_safe_audit_log` | useConnectionsManager | Registra audit log no disconnect |

### Edge Functions

| Edge Function | Arquivo | Uso |
|---------------|---------|-----|
| `evolution-api` | whatsappConnectionRepository | Proxy para todas as chamadas à Evolution API (via `callEvolutionApi` / `callEvolutionApiV2`) |

### Exports públicos

`useConnectionsManager` (hooks), `WhatsAppConnectionStatus` (components), `whatsappConnectionService` (services), `whatsappConnectionRepository` (data-access)

**Fora do barrel:** `types.ts` — consumidores importam tipos diretamente do caminho interno

### Chama (saída)

- `@/integrations/supabase/safeClient` — `safeClient`
- `@/integrations/supabase/client` — `supabase` (Realtime + `supabase.rpc`)
- Edge Function `evolution-api` (proxy REST para Evolution API)
- `useEvolutionApi` hook (chamado dentro de useConnectionsManager)
- `@/utils/validation` — `validatePhoneDetailed`
- `@/lib/evolutionInstanceName` — `evolutionInstanceName`
- React Query invalidations: `queryKeys.connections.all()`, `queryKeys.talkx.waConnections()`
- `sessionStorage` — persistência do estado do QR dialog entre page refreshes

### Chamado por (entrada)

NAO_VERIFICADO_CALLER — inferido:
- Página de configurações de conexões WhatsApp → `useConnectionsManager`
- Header/sidebar de status → `WhatsAppConnectionStatus`

### Implementação

**COMPLETA** — orquestrador e todas as partes implementados. Retry logic no delete, sessionStorage persistence no QR dialog, audit log no disconnect, tópico único por montagem para evitar crash do Realtime.

Evidências:
- `useConnectionsActions.ts` (256L): retry loop com `retriableErrors`, marca `delete_pending` em `settings` antes do retry
- `useConnectionsRealtime.ts` (98L): sufixo aleatório no tópico evita "cannot add callbacks after subscribe"
- `whatsappConnectionService.ts` (181L): `detectQrTtlMs` com clamp real 15s-300s; `requestQrCode` usa `logQrAttempt` para auditoria

### Achados

1. **CRÍTICO (arquitetura):** `instance_name` = nome de rota na Evolution API; `instance_id` = UUID interno. Comentário em `types.ts` avisa explicitamente: "NEVER use instance_id in API routes → 404". Risco de confusão para novos contribuidores.
2. `handleAddConnection` cria instância Evolution API PRIMEIRO, depois faz INSERT no DB — se o INSERT falhar, a instância fica órfã na Evolution sem rollback automático.
3. Sufixo aleatório no tópico Realtime é correto para evitar crash, mas gera um novo canal a cada remontagem do componente — pode acumular subscrições em componentes com ciclo de vida instável.
4. `columnMap.whatsapp_connections` define o shape canônico das colunas mas não é exportado pelo barrel — apenas usado internamente no repository.

**Runtime: NAO_VERIFICADO**

---

## 3. Módulo: `src/features/sla/`

### Papel no sistema

Sistema completo de SLA para conversas: resolve regra aplicável por hierarquia de 6 níveis (contact > company > job_title > contact_type > queue > agent > global_default > system_default), calcula timer em tempo real (cliente puro), dispara alertas toast com dedupe em 3 camadas (in-memory + localStorage + DB), gerencia regras e configurações com CRUD, e exibe dashboards históricos com métricas por agente.

### Arquivos

| Arquivo | Linhas | Responsabilidade |
|---------|--------|-----------------|
| `index.ts` | 4 | Barrel — re-exporta components, `SLADeliveryHistoryDashboard`, hooks |
| `hooks/index.ts` | 11 | Exporta 10 hooks |
| `hooks/useApplicableSLA.ts` | 200 | Resolve SLA aplicável; shared queries `sla_rules` + `sla_configurations` deduplicadas pelo React Query |
| `hooks/useSLAAlertHistory.ts` | 113 | Lê `sla_history` com join `conversation_threads+contacts`; `resolveMutation` |
| `hooks/useSLAAlertPreferences.ts` | 116 | Preferências per-user em `sla_alert_preferences`; upsert; fail-open com defaults |
| `hooks/useSLAAlerts.ts` | 321 | Dispara alertas toast; 3-layer dedupe com preservação de timestamp original; invoca 2 Edge Functions |
| `hooks/useSLACalculation.ts` | 132 | Timer puramente cliente (1s interval); warning threshold 30%; export `formatTimeRemaining` |
| `hooks/useSLAConfigurations.ts` | 175 | CRUD `sla_configurations`; optimistic toggle + delete; `staleTime: Infinity` |
| `hooks/useSLAHistory.ts` | 172 | Agrega `conversation_sla` por dia; calcula trend por half-period; `worstDays`/`bestDays` |
| `hooks/useSLAMetrics.ts` | 143 | Métricas globais e por agente; join `contacts+profiles`; `refetchInterval` 60s |
| `hooks/useSLANotifications.ts` | 178 | Realtime `postgres_changes` em `conversation_sla` (INSERT+UPDATE); toast + sound + browser notification |
| `hooks/useSLARules.ts` | 193 | CRUD `sla_rules` com filtro por scope; optimistic delete + toggle; invalida `rulesActive` em cada mutação |
| `components/index.ts` | 3 | Exporta `SLACharts` + `SLAHistoryDashboard` |
| `components/SLACharts.tsx` | 228 | Componentes de gráfico (Recharts) para visualização SLA |
| `components/SLADeliveryHistoryDashboard.tsx` | 222 | Dashboard de histórico de delivery |
| `components/SLAHistoryDashboard.tsx` | 220 | Dashboard de histórico SLA com seletor de período (7d/14d/30d/90d) |
| `hooks/__tests__/useSLANotifications.test.tsx` | 115 | Testes de useSLANotifications |
| `hooks/__tests__/useSLACalculation.test.ts` | 274 | Testes de useSLACalculation |

### Tabelas Supabase (`.from()`)

| Tabela | Schema | Hook(s) | Operação |
|--------|--------|---------|----------|
| `sla_rules` | zapp | useApplicableSLA, useSLARules | SELECT, INSERT, UPDATE, DELETE |
| `sla_configurations` | zapp | useApplicableSLA, useSLAConfigurations | SELECT, INSERT, UPDATE, DELETE |
| `sla_history` | zapp | useSLAAlertHistory | SELECT, UPDATE |
| `sla_alert_preferences` | zapp | useSLAAlertPreferences | SELECT, UPSERT |
| `conversation_sla` | zapp | useSLAHistory, useSLAMetrics, useSLANotifications (Realtime) | SELECT, Realtime |
| `conversation_events` | zapp | useSLAAlerts | SELECT (layer 3 dedupe — verifica alertas já disparados) |
| `contacts` | zapp | useSLAMetrics | SELECT (join `contacts!inner(assigned_to)`) |
| `profiles` | zapp | useSLAMetrics | SELECT |
| `conversation_threads` | zapp | useSLAAlertHistory | SELECT (join via `sla_history`) |

### RPCs (`.rpc()`)

Nenhuma RPC identificada no módulo sla.

### Edge Functions

| Edge Function | Hook | Uso |
|---------------|------|-----|
| `sla-alert-log-failure` | useSLAAlerts | Persiste evento `sla_alert` em `conversation_events` (service role, contorna RLS) |
| `sla-alert-forward` | useSLAAlerts | Encaminha alerta para webhook externo (fire-and-forget, best-effort) |

### Exports públicos

`useApplicableSLA`, `useActiveSLARules`, `useSLADefaultConfig`, `useSLAAlertHistory`, `useSLAAlertPreferences`, `useSLAAlerts`, `SLAStatus` (type), `formatTimeRemaining`, `useSLACalculation`, `SLATimerState` (type), `useSLAConfigurations`, `SLAConfig` (type), `PRIORITY_CONFIG`, `SLAForm` (type), `useSLAHistory`, `HistoryPeriod` (type), `useSLAMetrics`, `SLADashboardData` (type), `PeriodFilter` (type), `useSLANotifications`, `useSLARules`, `SLARule` (type), `SLARuleScope` (type), `SLARuleForm` (type), `SLACharts`, `SLAHistoryDashboard`, `SLADeliveryHistoryDashboard`

### Chama (saída)

- `@/integrations/supabase/client` — `supabase` (queries + Realtime + `supabase.functions.invoke`)
- `@/integrations/supabase/safeClient` — `safeClient` (queries type-safe)
- Edge Functions: `sla-alert-log-failure`, `sla-alert-forward`
- `localStorage` — chave `zappweb:sla-alert-dedupe:v1` (TTL 24h; limpeza automática de entradas expiradas)
- `@/services/api/queryKeys` — `queryKeys.sla.*`
- `useSLAAlertPreferences` — chamado internamente por `useSLAAlerts`
- `sonner` toast (toast.error / toast.warning / toast.success)
- `@/hooks/use-toast` — useSLANotifications
- `@/utils/notificationSounds` — `playNotificationSound`, `showBrowserNotification`
- `@/hooks/useNotificationSettings`
- `@/lib/queryStaleTimes` — `QUERY_STALE_TIMES`, `QUERY_GC_TIMES`
- `@/shared/webhookEventSchemas` — `conversationSlaRowSchema`, `safeParseEvent` (validação de payload Realtime)

### Chamado por (entrada)

NAO_VERIFICADO_CALLER — inferido:
- Painel de conversa → `useApplicableSLA`, `useSLACalculation`, `useSLAAlerts`
- Componente de app-level → `useSLANotifications` (subscription global de alertas)
- Página de configurações SLA → `useSLARules`, `useSLAConfigurations`
- Dashboard de SLA → `useSLAMetrics`, `useSLAHistory`, `SLAHistoryDashboard`, `SLACharts`
- Modal/histórico de alertas → `useSLAAlertHistory`
- Settings de usuário → `useSLAAlertPreferences`

### Implementação

**COMPLETA** — todos os hooks têm `queryFn`/`mutationFn` implementados. Realtime funcional com validação de schema de payload. 3-layer dedupe documentado e implementado com preservação de timestamp.

Evidências notáveis:
- `useSLAAlerts.ts` (321L): preserva `firedAt` original do DB ao hidratar localStorage — evita extensão inadvertida do TTL de 24h.
- `useApplicableSLA.ts` (200L): `resolveHierarchy` single-pass com 6 variáveis de match; React Query deduplica a query `rulesActive` entre todos os callers simultâneos (evita N+1 em listas virtualizadas).
- `useSLANotifications.ts` (178L): valida payload Realtime com `safeParseEvent`/`conversationSlaRowSchema` antes de processar — rejeita payloads mal-formados com log warning.

### Achados

1. `useSLAAlertPreferences`: tabela `sla_alert_preferences` pode não existir em ambientes Lovable/preview — tratado com fail-open para defaults (todos os alertas ligados). Correto como fallback, mas implica ausência de controle granular nesses ambientes.
2. `useSLAHistory` usa `new Date()` dentro do `queryFn` (linha ~70-71) — a data atual não faz parte da `queryKey`, portanto a query não invalida automaticamente por mudança de dia enquanto o cliente está aberto.
3. `useSLAMetrics`: join `contacts!inner(assigned_to)` exclui SLAs de conversas sem contato vinculado — pode subreportar métricas globais.
4. `useSLAConfigurations`: `staleTime: Infinity` — configurações nunca são revalidadas automaticamente; mudanças externas ao cliente (outro usuário ou administrador) não são refletidas até reload de página.
5. `SLADeliveryHistoryDashboard` é exportado DIRETAMENTE em `sla/index.ts` (linha 3) E via `components/index.ts` — dupla rota de importação para o mesmo componente. Não é bug, mas inconsistência de API pública.

**Runtime: NAO_VERIFICADO**
