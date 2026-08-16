# 1B - Features: módulos pequenos

> Auditado em 2026-08-09. Repo: `zapp-web-v3`. Arquivos lidos: 10. Linhas totais: 3 101.

---

## features/business-logic

**Papel no sistema:** Centraliza lógica de negócio reutilizável para três domínios: A/B testing de campanhas, envio de produtos do catálogo via WhatsApp e pipeline de vendas. Mantém todas as operações de BD fora dos componentes de UI, servindo como camada de dados para os respectivos dialogs/views.

**Arquivos:**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `hooks/useBusinessLogicManagement.ts` | 629 | Três hooks: A/B variants (`useBusinessLogicCampaignsManagement`), catalog send (`useBusinessLogicCatalogManagement`), sales pipeline (`useBusinessLogicPipelineManagement`) |

**Tabelas Supabase:**
- `campaign_ab_variants` (read/write — CRUD de variantes A/B)
- `contacts` (read — busca de contatos p/ catálogo e pipeline)
- `whatsapp_connections` (read — obtém instância Evolution ativa)
- `sales_pipeline_stages` (read)
- `sales_deals` (read/write — via `supabase.from` e `safeClient.from`)
- `deal_activities` (write — log de movimentações de stage)
- `profiles` (read — agentes do pipeline)
- `messages` (write — via `dbFrom('messages')`)

**RPCs:** nenhum

**Exports públicos:**
- `useBusinessLogicCampaignsManagement` — hook A/B
- `useBusinessLogicCatalogManagement` — hook catalog send
- `useBusinessLogicPipelineManagement` — hook pipeline
- Interfaces: `ABVariant`, `ContactResult`, `PipelineStage`, `UseBusinessLogicCampaignsParams`, `UseBusinessLogicCampaignsResult`, `UseBusinessLogicCatalogParams`, `UseBusinessLogicCatalogResult`, `UseBusinessLogicPipelineParams`, `UseBusinessLogicPipelineResult`

**Chama (saída):**
- `supabase.functions.invoke('evolution-api')` — envia imagem e texto via WhatsApp
- `dbFrom('messages')` — abstração de datasource para `messages`
- `dbFrom('contacts')` — abstração de datasource para `contacts`
- `safeClient.from('sales_deals', ...)` — client alternativo com type-narrowing
- `evolutionInstanceName()` de `@/lib/evolutionInstance`
- `extractEvolutionMessageId()` de `@/lib/evolutionMessageId`
- `sanitizePostgrestFilter()` de `@/lib/sanitize`
- `useDebouncedValue()` de `@/hooks/useDebounce`

**Chamado por (entrada):** Não visível nestes arquivos — esperado: componentes de campanha A/B, dialog de catálogo, views do pipeline de vendas

**Implementação:** COMPLETA

**Achados:**
- Realtime subscription do pipeline usa `Math.random()` para nome do canal (l.461) — mesmo padrão do resto da codebase, mas potencial memory leak em re-renders frequentes
- `supabase`, `safeClient` e `dbFrom` coexistem no mesmo arquivo — três clientes distintos sem abstração uniforme
- `sendProductToContact` não possui timeout de proteção na chain de Edge Function + DB inserts

**Runtime:** NAO_VERIFICADO

---

## features/dashboard

### dashboardTypes.ts

**Papel no sistema:** Arquivo de tipos puros sem lógica — define as quatro interfaces principais (`DashboardFilters`, `QueueStats`, `RecentActivity`, `DashboardStats`) compartilhadas entre os hooks do módulo dashboard.

**Arquivos:**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `hooks/dashboardTypes.ts` | 41 | Definições de interface — sem imports de runtime |

**Tabelas Supabase:** nenhuma (arquivo de tipos)

**RPCs:** nenhum

**Exports públicos:** `DashboardFilters`, `QueueStats`, `RecentActivity`, `DashboardStats`

**Chama (saída):** nada

**Chamado por (entrada):** `useDashboardVisualizationManagement.ts` (import direto)

**Implementação:** COMPLETA (arquivo de tipos)

**Achados:** nenhum

**Runtime:** NAO_VERIFICADO

---

### useDailyMetricsKpis.ts

**Papel no sistema:** Busca os últimos N dias de métricas diárias via view `evolution_daily_metrics` para exibição como KPI cards. Hook de domínio isolado — componente de UI não acessa Supabase diretamente (padrão documentado no JSDoc do próprio arquivo).

**Arquivos:**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `hooks/useDailyMetricsKpis.ts` | 45 | Query dos últimos N dias de métricas diárias |

**Tabelas Supabase:**
- `evolution_daily_metrics` (view, read — agrega mensagens, contatos, conversas por dia)

**RPCs:** nenhum

**Exports públicos:**
- `useDailyMetricsKpis` — hook
- `DailyMetricRow` — interface
- `DAILY_KPIS_DEFAULT_DAYS` — constante (7)

**Chama (saída):** `supabase.from('evolution_daily_metrics')`

**Chamado por (entrada):** Não visível nestes arquivos — provavelmente componente de KPI cards do dashboard

**Implementação:** COMPLETA

**Achados:** nenhum

**Runtime:** NAO_VERIFICADO

---

### useDashboardVisualizationManagement.ts

**Papel no sistema:** Consolida cinco hooks de domínio do dashboard (dados filtrados, widgets, metas, leaderboard, war room) num único arquivo de 829 linhas. Gerencia visibilidade e ordem de widgets via `localStorage` e provê dados de KPI via Supabase com Realtime para leaderboard.

**Arquivos:**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `hooks/useDashboardVisualizationManagement.ts` | 829 | Consolida: `useDashboardDataManagement`, `useDashboardWidgetsManagement`, `useGoalsDashboardManagement`, `useLeaderboardManagement`, `useWarRoomDataManagement` |

**Tabelas Supabase:**
- `profiles` (read — agentes online/total, leaderboard, war room)
- `contacts` (read, via `dbFrom` — conversas abertas, pendentes, resolvidas)
- `queues` (read — status de filas com membros)
- `messages` (read, via `dbFrom` — contagem de mensagens enviadas para metas)
- `goals_configurations` (read — metas customizadas por agente)
- `agent_stats` (read + Realtime — leaderboard com XP, level, streak)

**RPCs:** nenhum

**Exports públicos:**
- `useDashboardDataManagement`
- `useDashboardWidgetsManagement`
- `useGoalsDashboardManagement`
- `useLeaderboardManagement`
- `useWarRoomDataManagement`
- Interfaces: `DashboardWidget`, `Goal`, `LeaderboardAgent`, `WarRoomAgent`, `WarRoomQueue`
- Re-exports de `dashboardTypes.ts`: `DashboardFilters`, `DashboardStats`, `QueueStats`, `RecentActivity`

**Chama (saída):**
- `supabase.from(...)` — múltiplas tabelas
- `dbFrom('contacts')`, `dbFrom('messages')` — abstração de datasource
- `useAuth()` de `@/features/auth`
- `queryKeys` de `@/services/api/queryKeys`

**Chamado por (entrada):** Não visível nestes arquivos — provavelmente página do Dashboard

**Implementação:** PARCIAL

**Achados:**
- `avgResponseTime: null` hardcoded em `useDashboardDataManagement` (l.378) — campo nunca calculado
- `refetch: () => {}` retorna função vazia (l.386) — refetch manual do dashboard não funciona
- `messagesHandled: 0` no leaderboard hardcoded (l.712) — coluna ausente em `agent_stats`
- `resolvedToday: 0`, `satisfaction: 0`, `avgResponseTime: 0` no war room hardcoded (l.786-790)
- `recentActivity` usa `contactName: 'Contact'` e `contactPhone: ''` sem busca real (l.359-368)
- Realtime usa `Math.random()` para nome do canal do leaderboard (l.739) — mesmo padrão da codebase
- `_previousCompletedGoals` prefixado com `_` (l.517) — variável de ref declarada mas não utilizada

**Runtime:** NAO_VERIFICADO

---

## features/email

**Papel no sistema:** Módulo de gerenciamento de templates de email com UI CRUD completa (tabela + dialog de criação/edição + confirmação de exclusão). Delega toda a persistência para o hook `useEmailTemplates` em `@/hooks/` — sem chamadas diretas ao Supabase neste módulo.

**Arquivos:**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `components/EmailTemplatesManager.tsx` | 438 | CRUD UI para `email_templates`: listagem, dialog criar/editar, alertdialog excluir |

**Tabelas Supabase:** nenhuma direta — delegadas integralmente a `useEmailTemplates`

**RPCs:** nenhum

**Exports públicos:**
- `EmailTemplatesManager` — componente React

**Chama (saída):**
- `useEmailTemplates` de `@/hooks/useEmailTemplates` (CRUD: `templates`, `loading`, `error`, `fetchTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`)
- `toast` de `sonner`

**Chamado por (entrada):** Não visível nestes arquivos — provavelmente página de configurações de email ou settings

**Implementação:** COMPLETA

**Achados:** nenhum (componente limpo, sem handlers vazios ou TODOs)

**Runtime:** NAO_VERIFICADO

---

## features/emojis

**Papel no sistema:** Gerencia a biblioteca de emojis customizados da plataforma — lista, upload para Storage (bucket `custom-emojis`), favoritos, troca de categoria e contador de uso. Serve de camada de dados para o `CustomEmojiPicker` (mencionado no JSDoc).

**Arquivos:**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `hooks/useCustomEmojis.ts` | 268 | CRUD de emojis + upload Storage + favoritos + use_count |
| `index.ts` | 3 | Barrel export do módulo |

**Tabelas Supabase:**
- `custom_emojis` (read/write — lista, insert, update favorito, update categoria, update use_count, delete)

**Storage Supabase:**
- bucket `custom-emojis` (upload de arquivo de imagem)

**RPCs:** nenhum

**Exports públicos** (via `index.ts`):
- `useCustomEmojis` — hook
- `CustomEmoji` — interface
- `PendingEmojiUpload` — interface

**Chama (saída):**
- `supabase.from('custom_emojis')` — CRUD
- `supabase.storage.from('custom-emojis')` — upload
- `supabase.auth.getUser()` — obtém `uploaded_by`
- `resolvePublicStorageUrl()` de `@/lib/mediaUrl`

**Chamado por (entrada):** `CustomEmojiPicker` (referenciado no JSDoc do hook)

**Implementação:** COMPLETA

**Achados:**
- `aiCategory` no `PendingEmojiUpload` é inicializado como `DEFAULT_CATEGORY` ('outros') e nunca alterado (l.90) — campo morto, integração com IA ausente
- Upload gera path `${crypto.randomUUID()}.${ext}` sem prefixo de usuário — arquivos não agrupados por usuário no bucket, dificultando auditoria de ownership
- `progressTimerRef` usa `setInterval` simulando progresso (l.119) — progress bar é fake, não reflete upload real

**Runtime:** NAO_VERIFICADO

---

## features/integrations

**Papel no sistema:** Gerencia credenciais de instâncias da Evolution API (WhatsApp), testes de conectividade e logs de health check. Segue arquitetura de separação de leitura/escrita: leitura via view `zapp.evolution_instance_credentials` (sem expor `api_key`), escrita via Edge Function `evolution-credentials` com `service_role`.

**Arquivos:**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `hooks/useEvolutionApiIntegration.ts` | 269 | Credenciais, health check e testes de conexão Evolution |
| `hooks/__tests__/useEvolutionApiIntegration.test.tsx` | 216 | Testes vitest: leitura sem api_key, save, delete, erro, test connection |

**Tabelas Supabase:**
- `evolution_instance_credentials` (view `zapp`, read — sem coluna `api_key` por segurança)
- `evolution_health_logs` (view `zapp`, read/write — INSERT de resultados de health check)

**RPCs:** nenhum

**Edge Functions chamadas:**
- `supabase.functions.invoke('evolution-api')` — proxy de test connection (action: `list-instances`)
- `supabase.functions.invoke('evolution-credentials')` — save/delete de credenciais (actions: `save`, `delete`)

**Exports públicos:**
- `useEvolutionApiIntegration` — hook
- `EvolutionInstanceCredential` — interface (sem `api_key` na listagem)
- `HealthLog` — interface
- `DEFAULT_URL` — constante (`https://evolution.atomicabr.com.br`)

**Chama (saída):**
- `supabase.from('evolution_instance_credentials')` — read
- `supabase.from('evolution_health_logs')` — read/write
- `supabase.functions.invoke('evolution-api')` e `'evolution-credentials'`

**Chamado por (entrada):** `EvolutionApiIntegrationView` (mencionado no JSDoc do arquivo)

**Implementação:** COMPLETA

**Achados:**
- `window.confirm()` usado para confirmação de delete (l.239) — bloqueante, incompatível com UI moderna; testes precisam de mock de `window.confirm` (feito no test, l.77)
- `health_status` e `last_health_check` não são atualizados após teste de conexão (comentário l.163) — view não aceita `api_key`, atualização falha silenciosamente
- `handleSave` executa auto-teste antes de salvar mas continua mesmo com teste falhado (l.204) — apenas emite warning via `toast.warning`

**Runtime:** NAO_VERIFICADO

---

## features/queues

**Papel no sistema:** Componente de UI para gerenciar regras de roteamento (`queue_routing_rules`) de uma fila específica. Suporta cinco tipos de regra (keyword, contact_tag, department, time_based, round_robin), prioridade numérica e condição em JSON livre editável. Delega persistência ao hook `useQueueRoutingRules`.

**Arquivos:**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `components/QueueRoutingRules.tsx` | 363 | CRUD de `queue_routing_rules`: lista com switch inline, dialog criar/editar, delete direto |

**Tabelas Supabase:** nenhuma direta — delegadas a `useQueueRoutingRules` de `@/hooks/useQueueRoutingRules`

**RPCs:** nenhum

**Exports públicos:**
- `QueueRoutingRules` — componente React (recebe `queueId: string`)

**Chama (saída):**
- `useQueueRoutingRules(queueId)` de `@/hooks/useQueueRoutingRules` (`rules`, `isLoading`, `createRule`, `updateRule`, `deleteRule`)
- Tipos: `QueueRoutingRule`, `QueueRoutingRuleInsert`, `Json` de `@/integrations/supabase/schema`

**Chamado por (entrada):** Não visível nestes arquivos — provavelmente painel de configuração de fila

**Implementação:** COMPLETA

**Achados:**
- Delete sem confirmação — botão de lixeira chama `deleteRule.mutate(rule.id)` diretamente (l.340) sem `window.confirm` ou dialog de confirmação
- Condição armazenada como JSON livre editável sem validação de esquema por `rule_type` — um `keyword` sem campo `keyword` passa a validação JSON e é salvo
- `conditionPreview` trunca em 70 chars com `…` (l.81-83) — funcional mas não renderiza JSON de forma estruturada

**Runtime:** NAO_VERIFICADO
