# Estado: Hooks — Testes (src/hooks/__tests__/) — parte 1/2

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 57/57

## 1. Visao Geral

Primeira metade do diretório `src/hooks/__tests__/`, cobrindo os 57 arquivos de A a N. O conjunto testa quase integralmente a biblioteca de hooks: utilitários de UI, hooks de dados Supabase, CRM, Evolution API, atalhos de teclado, importação/exportação e integrações externas. Taxa de COMPLETA: 84% (48/57). Nenhum arquivo de teste é "órfão de importador" no sentido usual — testes são invocados pelo runner. A análise de órfão aqui verifica se o ALVO testado ainda existe em `src/`.

### Tabela de Arquivos

| arquivo | linhas | o que faz em 1 linha | EM_USO ou ORFAO |
|---|---|---|---|
| contactIntelligence.schema-guard.test.ts | 78 | Guard de tipo: verifica que `ContactIntelligenceRow` expõe as 15 colunas reais do banco | EM_USO |
| contratoF4.simulacao.test.tsx | 196 | Contrato de payload para `useCSAT`, `upsertConnectionAlertPrefs` e `useBulkActions` vs NOT NULL | EM_USO |
| normalizeSearchInsights.test.ts | 51 | Testa função pura `normalizeSearchInsights` exportada de `useSearchManagement` | EM_USO |
| useActionFeedback.test.ts | 127 | Testa `useActionFeedback` (toast wrappers + `withFeedback`) mockando `sonner` | EM_USO |
| useAgents.test.tsx | 357 | Testa `useAgents` e inclui prova de regressão do bug de canal Realtime com topic estático | EM_USO |
| useAmbientColor.test.ts | 91 | Testa `useAmbientColor` — mapeamento sentimento→cores CSS + memoização de referência | EM_USO |
| useApplicableSLA.test.ts | 276 | Testa `resolveApplicableSLA` inline no arquivo — sem import do hook real (`src/features/sla/`) | ORFAO* |
| useAriaAnnouncer.test.ts | 79 | Testa `useAriaAnnouncer` — criação/remoção de região ARIA + `announce()` via rAF | EM_USO |
| useAudioRecorder.cleanup.test.ts | 147 | Testa cleanup de recursos `useAudioRecorder` — usa Deno runner, incompatível com Vitest/bun | EM_USO |
| useAudioRecorder.test.ts | 107 | Testa API pública de `useAudioRecorder` via `useAudioManagement` (state + formatDuration) | EM_USO |
| useAuth.test.tsx | 99 | Testa `useAuth`/`AuthProvider` — init loading, signIn e signOut com mock Supabase | EM_USO |
| useAutoCloseConversations.test.tsx | 122 | Testa `useAutoCloseConversations` (de `useAutomationManagement`) — fetch, erro, bounds | EM_USO |
| useBitrixApi.test.ts | 176 | Testa integração Bitrix24 via Edge Function `bitrix-api` (leads, contatos, deals, calls) | EM_USO |
| useBulkActions.test.tsx | 179 | Testa seleção múltipla (toggle, selectAll, deselectAll, execute) com tableName genérico | EM_USO |
| useBusinessHours.test.tsx | 86 | Testa fetch/geração de horários de atendimento por connection e detecção de dias fechados | EM_USO |
| useCRMManagement.simulacao.test.tsx | 343 | Testa contratos de banco (contact_intelligence, notes, assignments, custom_fields) com spy de baixo nível | EM_USO |
| useCRMManagement.test.tsx | 252 | Testa dedupe/lazy/single-flight de `useContactAssignmentManagement` com QueryClient real | EM_USO |
| useCSAT.test.tsx | 116 | Testa fetch de surveys CSAT, loading state e lista vazia | EM_USO |
| useCampaigns.test.tsx | 78 | Testa listagem, criação e loading de campanhas via Supabase | EM_USO |
| useChatSearch.test.ts | 260 | Testa busca com debounce, filtros por tipo, navegação, accent-insensitive e filterCounts | EM_USO |
| useChatbotFlows.test.tsx | 104 | Testa CRUD de flows e validação de node/trigger types via `chatbot_flows` | EM_USO |
| useConnectionQueues.test.tsx | 60 | Testa fetch de filas por connectionId em `whatsapp_connection_queues` | EM_USO |
| useContactCustomFields.test.tsx | 67 | Testa fetch e guard sem contactId para `contact_custom_fields` | EM_USO |
| useContactIntelligence.simulacao.test.ts | 704 | Testa guards LID, fallbacks e mapeamento de colunas de `useContactIntelligence` via mock detalhado | EM_USO |
| useContactNotes.test.tsx | 184 | Testa fetch/erro/auth de `useContactNotes` contra tabela `contact_notes` | EM_USO |
| useConversationAnalyses.test.tsx | 161 | Testa `useConversationAnalyses` (de `useConversationManagement`) — fetch, saveAnalysis, sentimento | EM_USO |
| useCurrentModule.test.ts | 125 | Testa resolução de label/icon/group por viewId em todos os navs de `useCurrentModule` | EM_USO |
| useCustomShortcuts.test.ts | 90 | Testa init, update, reset e detecção de conflitos de `useCustomShortcuts` | EM_USO |
| useDashboardData.test.tsx | 103 | Testa fetch de stats com filtros padrão/customizados e refetch de `useDashboardData` | EM_USO |
| useDashboardWidgets.test.ts | 217 | Testa visibilidade, tamanho, reorder, localStorage e editMode de `useDashboardWidgets` | EM_USO |
| useDebounce.test.ts | 108 | Testa delay, timer reset, args passados e última chamada em sequências rápidas | EM_USO |
| useDemandPrediction.test.ts | 160 | Testa cálculo de insights (trend, peak, capacityRisk) de `useDemandPrediction` com dados externos | EM_USO |
| useDensity.test.ts | 91 | Testa leitura/escrita em localStorage e setAttribute no `<html>` de `useDensity` | EM_USO |
| useDeviceDetection.test.tsx | 126 | Testa fetch de sessões via `user_sessions` e funções expostas de `useDeviceDetection` | EM_USO |
| useDocumentTitle.test.ts | 54 | Testa set/restore/update de `document.title` via `useDocumentTitle` | EM_USO |
| useDownloadPermission.test.ts | 111 | Testa `useDownloadPermission` — campo `can_download` na tabela `profiles` | EM_USO |
| useEvolutionApi.test.ts | 848 | Suite exaustiva de `useEvolutionApi` — 60+ funções via Edge Function `evolution-api/*` | EM_USO |
| useExportData.test.tsx | 126 | Testa `useExportData` — exportCSV/Excel/PDF e aplicação de colunas | EM_USO |
| useExternalCatalog.test.ts | 1341 | Testa `useExternalCatalog` (de `useExternalApiManagement`) — Edge Fn `promogifts-catalog`, tipos e contratos | EM_USO |
| useExternalContact360Batch.test.ts | 220 | Testa parse defensivo do Map e RPC `get_contact_360_by_phone` (BUG #9) | EM_USO |
| useExternalContact360Single.test.ts | 169 | Testa gate de phone, staleTime, cache hit e placeholderData de `useExternalContact360` single | EM_USO |
| useExternalEvolution.reconcile.test.ts | 338 | Testa funções puras `reconcileOptimistic`/`applyReconciliation` de `evolutionReconcile.ts` | EM_USO |
| useGlobalSearchShortcut.test.ts | 53 | Testa `useGlobalSearchShortcut` — atalho Ctrl/Cmd+K e cleanup de listener | EM_USO |
| useGlobalSettings.test.tsx | 73 | Testa `useGlobalSettings` — `global_settings`, getSetting/updateSetting/addSetting | EM_USO |
| useGoalNotifications.test.ts | 110 | Testa `useGoalNotifications` — checkGoalProgress, intervalo periódico e unmount | EM_USO |
| useGoalsDashboard.colors.test.ts | 77 | Testa funções puras `getProgressColor`/`getProgressBgColor` de `useGoalsDashboard` | EM_USO |
| useImportData.test.ts | 114 | Testa `useImportDataTyped` — parse CSV/Excel com Zod, validação de linha, estado idle/processing | EM_USO |
| useInViewport.test.ts | 155 | Testa `useInViewport` — IntersectionObserver mock, sticky timeout, SSR fallback, cleanup | EM_USO |
| useIndexKeyboardShortcuts.test.ts | 206 | Testa `useIndexKeyboardShortcuts` — atalhos Alt+Arrow/Home/Escape com guards para input/textarea | EM_USO |
| useIsMobile.test.ts | 87 | Testa `useIsMobile` — breakpoint 768px, matchMedia, listener mount/unmount | EM_USO |
| useKeyboardHeight.test.ts | 185 | Testa `useKeyboardHeight` — visualViewport resize, limiar 50px para `isKeyboardOpen`, cleanup | EM_USO |
| useMFA.test.tsx | 100 | Testa `useMFA` — enroll/verify/unenroll/listFactors via `supabase.auth.mfa.*` | EM_USO |
| useMarketingBudgets.test.tsx | 52 | Testa `useMarketingBudgets` — query na tabela `budgets`, ordena por `created_at desc` | EM_USO |
| useMessageReactions.test.tsx | 171 | Testa `useMessageReactions` — fetch/Realtime de `message_reactions` + `profiles`, auth guard | EM_USO |
| useMountedRef.test.ts | 29 | Testa `useMountedRef` — ref true durante mount, false após unmount, identidade estável | EM_USO |
| useNavigationHistory.test.ts | 160 | Testa `useNavigationHistory` — stack, goBack/goForward, breadcrumbTrail cap=4, hash sync | EM_USO |
| useNotificationSettings.test.tsx | 133 | Testa `useNotificationSettings` — quiet hours, tipos de som, estado sem usuário | EM_USO |

## 2. Fluxos funcionais

### Auth / Segurança
`useAuth.test.tsx` → `useAuth` / `AuthProvider` → `supabase.auth.signIn/signOut`
`useMFA.test.tsx` → `useMFA` → `supabase.auth.mfa.*` (enroll, challenge, verify, unenroll)
`useDownloadPermission.test.ts` → `useDownloadPermission` → tabela `profiles` (campo `can_download`)

### CRM / Contatos
`useCRMManagement.simulacao.test.tsx` + `useCRMManagement.test.tsx` → `useCRMManagement` (5 sub-hooks) → tabelas `contact_intelligence`, `contact_notes`, `contact_assignments`, `contact_custom_fields`
`useContactIntelligence.simulacao.test.ts` → `useContactIntelligence` → tabelas `contact_intelligence`, `evo.evolution_messages`
`useContactNotes.test.tsx` → `useContactNotes` → tabela `contact_notes`
`useContactCustomFields.test.tsx` → `useContactCustomFields` → tabela `contact_custom_fields`
`useConversationAnalyses.test.tsx` → `useConversationManagement` (export `useConversationAnalyses`) → tabela `conversation_analyses`
`contactIntelligence.schema-guard.test.ts` → tipo `ContactIntelligenceRow` de `@/integrations/supabase/schema`
`contratoF4.simulacao.test.tsx` → `useCSAT`, `useConnectionAlertPreferences`, `useBulkActions` → tabelas `csat_surveys`, `connection_alert_preferences`

### Evolution API / Realtime
`useEvolutionApi.test.ts` → `useEvolutionApi` → Edge Function `evolution-api/*` (60+ endpoints)
`useExternalEvolution.reconcile.test.ts` → `evolutionReconcile.ts` (funções puras `reconcileOptimistic`, `applyReconciliation`)
`useAgents.test.tsx` → `useAgents` (de `src/features/admin/`) → Realtime channel `agent_presence` + tabela `profiles`
`useMessageReactions.test.tsx` → `useMessageReactions` → tabela `message_reactions` + Realtime channel + tabela `profiles`

### Integrações Externas
`useBitrixApi.test.ts` → `useBitrixApi` → Edge Function `bitrix-api`
`useExternalCatalog.test.ts` → `useExternalApiManagement` (export `useExternalCatalog`) → Edge Function `promogifts-catalog`
`useExternalContact360Batch/Single.test.ts` → `useExternalApiManagement` (exports Contact360) → RPC `get_contact_360_by_phone`

### Automação / Configuração
`useAutoCloseConversations.test.tsx` → `useAutomationManagement` → tabela (NAO_VERIFICADO)
`useBusinessHours.test.tsx` → `useBusinessHoursManagement` → tabelas `business_hours`, `away_messages`, RPC `is_within_business_hours`
`useChatbotFlows.test.tsx` → `useChatbotFlows` → tabela `chatbot_flows`
`useConnectionQueues.test.tsx` → `useConnectionManagement` → tabela `whatsapp_connection_queues`
`useCampaigns.test.tsx` → `useCampaigns` → tabela `campaigns`
`useCSAT.test.tsx` → `useCSAT` → tabela `csat_surveys`
`useGlobalSettings.test.tsx` → `useGlobalSettings` → tabela `global_settings`
`useNotificationSettings.test.tsx` → `useNotificationSettings` → tabela (via mockFrom sem nome literal)

### UI / Utilitários
`useDebounce.test.ts` → `useDebounce` (puro, sem IO)
`useDensity.test.ts` → `useDensity` (localStorage + DOM)
`useDashboardWidgets.test.ts` → `useDashboardWidgets` (localStorage + estado local)
`useAmbientColor.test.ts` → `useAmbientColor` (puro mapeamento sentimento→cores)
`useAriaAnnouncer.test.ts` → `useAriaAnnouncer` (DOM + rAF)
`useDocumentTitle.test.ts` → `useDocumentTitle` (DOM)
`useInViewport.test.ts` → `useInViewport` (IntersectionObserver)
`useMountedRef.test.ts` → `useMountedRef` (ref de mount)
`useIsMobile.test.ts` → `useIsMobile` (matchMedia)
`useKeyboardHeight.test.ts` → `useKeyboardHeight` (visualViewport)
`useDeviceDetection.test.tsx` → `useDeviceDetection` → tabela `user_sessions`
`useDemandPrediction.test.ts` → `useDemandPrediction` (cálculo puro de dados externos)
`useDashboardData.test.tsx` → `useDashboardData` → mock de `supabase.from`
`useGoalNotifications.test.ts` → `useGoalNotifications` (intervalo + verificação)
`useGoalsDashboard.colors.test.ts` → funções puras de `useGoalsDashboard`
`useMarketingBudgets.test.tsx` → `useMarketingBudgets` → tabela `budgets`

### Navegação / Atalhos
`useCurrentModule.test.ts` → `useCurrentModule` (resolução de rota→módulo)
`useGlobalSearchShortcut.test.ts` → `useGlobalSearchShortcut` (Ctrl+K)
`useIndexKeyboardShortcuts.test.ts` → `useIndexKeyboardShortcuts` (Alt+Arrow/Home/Escape)
`useNavigationHistory.test.ts` → `useNavigationHistory` (stack + hash)
`useCustomShortcuts.test.ts` → `useCustomShortcuts` (init/update/conflito)

### Dados / IO
`useChatSearch.test.ts` → `useChatSearch` (busca local em mensagens)
`normalizeSearchInsights.test.ts` → `useSearchManagement` (função pura export)
`useExportData.test.tsx` → `useExportData` (CSV/Excel/PDF)
`useImportData.test.ts` → `useImportData` (CSV/Excel + Zod)
`useActionFeedback.test.ts` → `useActionFeedback` (toast + withFeedback)
`useBulkActions.test.tsx` → `useBulkActions` (seleção múltipla genérica)
`useAudioRecorder.test.ts` → `useAudioManagement` (init state + formatDuration)
`useAudioRecorder.cleanup.test.ts` → `useAudioRecorder` (cleanup de recursos via Deno)

## 3. Tabelas, RPCs, canais realtime e edge functions

### Tabelas (`zapp` salvo indicação)
| tabela | arquivos que tocam |
|---|---|
| `profiles` | useAgents, useDeviceDetection, useDownloadPermission, useMessageReactions |
| `contact_intelligence` | useCRMManagement.simulacao, useContactIntelligence.simulacao |
| `contact_notes` | useCRMManagement.simulacao, useContactNotes |
| `contact_assignments` | useCRMManagement.simulacao |
| `contact_custom_fields` | useCRMManagement.simulacao, useContactCustomFields |
| `csat_surveys` | contratoF4.simulacao, useCSAT |
| `connection_alert_preferences` | contratoF4.simulacao |
| `campaign_contacts`, `tasks` | contratoF4.simulacao (useBulkActions) |
| `agent_presence` | useAgents |
| `business_hours`, `away_messages` | useBusinessHours |
| `campaigns` | useCampaigns |
| `chatbot_flows` | useChatbotFlows |
| `whatsapp_connection_queues` | useConnectionQueues |
| `conversation_analyses` | useConversationAnalyses |
| `user_sessions` | useDeviceDetection |
| `global_settings` | useGlobalSettings |
| `message_reactions` | useMessageReactions |
| `budgets` | useMarketingBudgets |
| `evo.evolution_messages` | useContactIntelligence.simulacao |

### RPCs
| rpc | arquivo |
|---|---|
| `is_within_business_hours` | useBusinessHours.test.tsx |
| `enrich_contact` | useCRMManagement.simulacao.test.tsx |
| `get_contact_360_by_phone` | useExternalContact360Batch.test.ts |

### Canais Realtime
| canal | arquivo |
|---|---|
| channel de `agent_presence` | useAgents.test.tsx |
| channel de `message_reactions` | useMessageReactions.test.tsx |

### Edge Functions
| função | arquivo |
|---|---|
| `bitrix-api` | useBitrixApi.test.ts |
| `evolution-api/*` (60+ endpoints) | useEvolutionApi.test.ts |
| `promogifts-catalog` | useExternalCatalog.test.ts |

### Auth MFA
`supabase.auth.mfa.*` (enroll, challenge, verify, unenroll, listFactors, getAssuranceLevel) — useMFA.test.tsx

## 4. Exports Publicos por categoria

Arquivos de teste não têm exports públicos. Esta seção lista os **hooks/módulos testados** agrupados por natureza:

- **Hooks de UI/DOM**: useAmbientColor, useAriaAnnouncer, useDebounce, useDensity, useDocumentTitle, useInViewport, useIsMobile, useKeyboardHeight, useMountedRef
- **Hooks de dados Supabase**: useAgents, useAuth, useCampaigns, useCSAT, useDashboardData, useDeviceDetection, useDownloadPermission, useGlobalSettings, useMarketingBudgets, useMessageReactions, useNotificationSettings
- **Hooks de CRM/Contato**: useCRMManagement (5 sub-hooks), useContactIntelligence, useContactNotes, useContactCustomFields, useConversationAnalyses
- **Hooks de integração externa**: useBitrixApi, useEvolutionApi, useExternalCatalog, useExternalContact360 (batch+single)
- **Hooks de automação**: useAutoCloseConversations, useBusinessHours, useChatbotFlows, useConnectionQueues
- **Hooks de navegação/atalhos**: useCurrentModule, useCustomShortcuts, useGlobalSearchShortcut, useIndexKeyboardShortcuts, useNavigationHistory
- **Hooks de IO**: useExportData, useImportData, useAudioRecorder (via useAudioManagement), useBulkActions, useActionFeedback, useChatSearch
- **Funções puras testadas isoladamente**: normalizeSearchInsights, resolveApplicableSLA (inlined — ORFAO*), reconcileOptimistic/applyReconciliation, getProgressColor/BgColor
- **Guards/contratos**: ContactIntelligenceRow schema-guard, contratoF4.simulacao, useExternalContact360 (BUG #9 parse)

## 5. Chama (Saida)

Hooks e módulos externos a `__tests__/` referenciados pelos testes:

| módulo externo | arquivos que importam |
|---|---|
| `@/hooks/useActionFeedback` | useActionFeedback.test.ts |
| `@/hooks/useAudioManagement` | useAudioRecorder.test.ts |
| `@/hooks/useAutomationManagement` | useAutoCloseConversations.test.tsx |
| `@/hooks/useBitrixApi` | useBitrixApi.test.ts |
| `@/hooks/useBulkActions` | useBulkActions.test.tsx, contratoF4.simulacao.test.tsx |
| `@/hooks/useCampaigns` | useCampaigns.test.tsx |
| `@/hooks/useChatbotFlows` | useChatbotFlows.test.tsx |
| `@/hooks/useConnectionManagement` | useConnectionQueues.test.tsx |
| `@/hooks/useContactCustomFields` | useContactCustomFields.test.tsx |
| `@/hooks/useContactIntelligence` | useContactIntelligence.simulacao.test.ts |
| `@/hooks/useCSAT` | useCSAT.test.tsx, contratoF4.simulacao.test.tsx |
| `@/hooks/useCRMManagement` | useCRMManagement.simulacao, useCRMManagement.test |
| `@/hooks/useDashboardData` | useDashboardData.test.tsx |
| `@/hooks/useDashboardWidgets` | useDashboardWidgets.test.ts |
| `@/hooks/useEvolutionApi` | useEvolutionApi.test.ts |
| `@/hooks/useExportData` | useExportData.test.tsx |
| `@/hooks/useExternalApiManagement` | useExternalCatalog, Contact360Batch, Contact360Single |
| `@/hooks/useGlobalSettings` | useGlobalSettings.test.tsx |
| `@/hooks/useGlobalSearchShortcut` | useGlobalSearchShortcut.test.ts |
| `@/hooks/useGoalNotifications` | useGoalNotifications.test.ts |
| `@/hooks/useImportData` | useImportData.test.ts |
| `@/hooks/useMFA` | useMFA.test.tsx |
| `@/hooks/useMarketingBudgets` | useMarketingBudgets.test.tsx |
| `@/hooks/useMessageReactions` | useMessageReactions.test.tsx |
| `@/hooks/useNotificationSettings` | useNotificationSettings.test.tsx |
| `@/hooks/useSearchManagement` | normalizeSearchInsights.test.ts |
| `@/hooks/useAuth` | useAuth.test.tsx, useDownloadPermission, useExportData, useNotificationSettings |
| `@/hooks/use-mobile` | useIsMobile.test.ts |
| `@/hooks/useConversationManagement` | useConversationAnalyses.test.tsx |
| `@/hooks/useBusinessHoursManagement` | useBusinessHours.test.tsx |
| `@/features/admin/hooks/useAgents` | useAgents.test.tsx |
| `@/features/inbox` (tipo `RealtimeMessage`) | useExternalEvolution.reconcile.test.ts |
| `@/features/auth/hooks/useAuth` | useNotificationSettings.test.tsx (import duplicado) |
| `@/integrations/supabase/client` | useAgents, useAuth, useCRMManagement.simulacao, useContactNotes, useConversationAnalyses, useDashboardData, useDeviceDetection, useDownloadPermission, useEvolutionApi, useExternalContact360*, useGlobalSettings, useMFA |
| `@/integrations/supabase/schema` | contactIntelligence.schema-guard.test.ts |
| `@/lib/logger` | useExternalContact360Batch.test.ts |
| `@/types/chat` | useChatSearch.test.ts |
| `@tanstack/react-query` | maioria dos hooks com dados assíncronos |
| `@testing-library/react` | todos exceto useChatSearch.test.ts, useDebounce.test.ts, useDemandPrediction.test.ts |
| `sonner` | useActionFeedback.test.ts (mockado) |
| `https://deno.land/std@0.224.0/assert/mod.ts` | useAudioRecorder.cleanup.test.ts |

Imports relativos (`../`):
`../useAmbientColor`, `../useAriaAnnouncer`, `../useAuth`, `../useChatSearch`, `../useCurrentModule`, `../useDebounce`, `../useDemandPrediction`, `../useDensity`, `../useDocumentTitle`, `../evolutionReconcile`, `../useGoalsDashboard`, `../useInViewport`, `../useIndexKeyboardShortcuts`, `../useKeyboardHeight`, `../useMountedRef`, `../useNavigationHistory`

## 6. Chamado Por (Entrada)

Arquivos de teste nunca são importados por código de aplicação — são invocados diretamente pelo runner (Vitest / `bun run test`). Nenhum arquivo deste conjunto tem importadores fora de `__tests__/`.

| arquivo | importadores externos | contagem |
|---|---|---|
| (todos os 57) | nenhum | 0 |

> `useAudioRecorder.cleanup.test.ts` usa runner Deno (`deno test`), não Vitest — provavelmente não é executado por `bun run test`.

## 7. Orfaos

### Critério aplicado
Teste é ORFAO se o arquivo/módulo que ele testa não existe em `src/` (função removida ou teste sem import real do alvo).

---

**`useApplicableSLA.test.ts`** (276 linhas) — ORFAO* — **VERIFICAR**

O teste não importa `src/features/sla/hooks/useApplicableSLA.ts` (que existe). Em vez disso, a função `resolveApplicableSLA` está **duplicada/inlined** no arquivo de teste (~linha 44). Consequência: o teste pode divergir silenciosamente do hook real. Qualquer mudança na lógica de `useApplicableSLA.ts` não quebrará este teste.

- Tamanho: 276 linhas
- Veredito: **VERIFICAR** — o hook alvo existe mas o teste não o valida; risco de cobertura fantasma

---

### Outros arquivos com ressalvas (EM_USO mas com anomalia)

**`useAudioRecorder.cleanup.test.ts`** (147 linhas) — EM_USO / STUB — **VERIFICAR**

Usa `https://deno.land/std@0.224.0/assert/mod.ts` (runtime Deno), incompatível com Vitest/bun. O hook alvo existe (`useAudioManagement`), mas este teste quase certamente **não é executado** no CI padrão (`bun run test`). É letra morta na suite atual.

- Tamanho: 147 linhas
- Veredito: **VERIFICAR** — migrá-lo para Vitest ou excluí-lo; não fornece cobertura no CI

## 8. Implementacao por Arquivo

| arquivo | COMPLETA\|PARCIAL\|STUB\|MORTA | o que falta |
|---|---|---|
| contactIntelligence.schema-guard.test.ts | COMPLETA | — |
| contratoF4.simulacao.test.tsx | COMPLETA | — |
| normalizeSearchInsights.test.ts | COMPLETA | — |
| useActionFeedback.test.ts | COMPLETA | — |
| useAgents.test.tsx | COMPLETA | — |
| useAmbientColor.test.ts | COMPLETA | — |
| useApplicableSLA.test.ts | PARCIAL | Não importa o hook real; divergência possível |
| useAriaAnnouncer.test.ts | COMPLETA | — |
| useAudioRecorder.cleanup.test.ts | STUB | Runner Deno — não roda em Vitest; não testa API pública |
| useAudioRecorder.test.ts | COMPLETA | — |
| useAuth.test.tsx | COMPLETA | — |
| useAutoCloseConversations.test.tsx | COMPLETA | — |
| useBitrixApi.test.ts | COMPLETA | — |
| useBulkActions.test.tsx | COMPLETA | — |
| useBusinessHours.test.tsx | PARCIAL | Sem testes de RPC `is_within_business_hours`, update/delete |
| useCRMManagement.simulacao.test.tsx | COMPLETA | — |
| useCRMManagement.test.tsx | COMPLETA | — |
| useCSAT.test.tsx | PARCIAL | Sem testes de stats e mutations |
| useCampaigns.test.tsx | PARCIAL | Sem testes de update/delete |
| useChatSearch.test.ts | COMPLETA | — |
| useChatbotFlows.test.tsx | PARCIAL | Sem testes de update/delete de flows |
| useConnectionQueues.test.tsx | PARCIAL | Sem testes de addQueue/removeQueue |
| useContactCustomFields.test.tsx | PARCIAL | Sem testes de mutações reais |
| useContactIntelligence.simulacao.test.ts | COMPLETA | — |
| useContactNotes.test.tsx | COMPLETA | — |
| useConversationAnalyses.test.tsx | COMPLETA | — |
| useCurrentModule.test.ts | COMPLETA | — |
| useCustomShortcuts.test.ts | COMPLETA | — |
| useDashboardData.test.tsx | COMPLETA | — |
| useDashboardWidgets.test.ts | COMPLETA | — |
| useDebounce.test.ts | COMPLETA | — |
| useDemandPrediction.test.ts | COMPLETA | — |
| useDensity.test.ts | COMPLETA | — |
| useDeviceDetection.test.tsx | COMPLETA | — |
| useDocumentTitle.test.ts | COMPLETA | — |
| useDownloadPermission.test.ts | COMPLETA | — |
| useEvolutionApi.test.ts | COMPLETA | — |
| useExportData.test.tsx | COMPLETA | — |
| useExternalCatalog.test.ts | COMPLETA | — |
| useExternalContact360Batch.test.ts | COMPLETA | — |
| useExternalContact360Single.test.ts | COMPLETA | — |
| useExternalEvolution.reconcile.test.ts | COMPLETA | — |
| useGlobalSearchShortcut.test.ts | COMPLETA | — |
| useGlobalSettings.test.tsx | COMPLETA | — |
| useGoalNotifications.test.ts | COMPLETA | — |
| useGoalsDashboard.colors.test.ts | COMPLETA | — |
| useImportData.test.ts | COMPLETA | — |
| useInViewport.test.ts | COMPLETA | — |
| useIndexKeyboardShortcuts.test.ts | COMPLETA | — |
| useIsMobile.test.ts | COMPLETA | — |
| useKeyboardHeight.test.ts | COMPLETA | — |
| useMFA.test.tsx | COMPLETA | — |
| useMarketingBudgets.test.tsx | PARCIAL | Só 2 testes (happy path + error); sem mutação |
| useMessageReactions.test.tsx | COMPLETA | — |
| useMountedRef.test.ts | COMPLETA | — |
| useNavigationHistory.test.ts | COMPLETA | — |
| useNotificationSettings.test.tsx | COMPLETA | — |

## 9. Achados

### A1 — `useApplicableSLA.test.ts` copia função inline em vez de importar o hook real
`useApplicableSLA.test.ts:44-123` — `resolveApplicableSLA` duplicada no arquivo de teste; hook real existe em `src/features/sla/hooks/useApplicableSLA.ts` mas não é importado. Qualquer mudança no hook não quebrará este teste — cobertura fantasma.

### A2 — `useAudioRecorder.cleanup.test.ts` usa runner Deno e não roda em Vitest
`useAudioRecorder.cleanup.test.ts:11` — importa `https://deno.land/std@0.224.0/assert/mod.ts`. Incompatível com `bun run test`/Vitest. Provavelmente letra morta no CI atual.

### A3 — Bug documentado: canal Realtime com topic estático duplicado (`useAgents`)
`useAgents.test.tsx:311-357` — teste reproduz crash ao montar o hook uma segunda vez com mesmo topic estático no `RealtimeClient`. Prova de regressão ativa de bug de arquitetura Realtime.

### A4 — Import duplicado de `useAuth` em `useNotificationSettings`
`useNotificationSettings.test.tsx:26-28` — mock de dois caminhos distintos para o mesmo hook: `@/hooks/useAuth` e `@/features/auth/hooks/useAuth`. Indica duas fontes do hook no codebase; risco de inconsistência se divergirem.

### A5 — `useExternalCatalog.test.ts` (1341 linhas) documenta ausência de rate limiting
`useExternalCatalog.test.ts:636` — comentário de auditoria inline: "no rate limiting on edge function `promogifts-catalog`". Achado de segurança registrado no próprio teste.

### A6 — `useEvolutionApi.test.ts` valida superfície pública com assert explícito
`useEvolutionApi.test.ts:40` — assert `exposes all 60+ functions` verifica explicitamente que o hook exporta todas as funções. Teste de contrato da API pública do hook mais pesado da suite.

### A7 — `useDashboardWidgets.test.ts` usa chave de localStorage hardcoded
`useDashboardWidgets.test.ts:166` — chave `'dashboard-widgets-config-v3'` hardcoded no teste. Mudança de versão no hook quebraria o teste de forma silenciosa (sem TypeScript guard).

### A8 — Naming inconsistente: `useIsMobile` importa de `use-mobile.tsx` (kebab-case)
`useIsMobile.test.ts:3` — importa de `@/hooks/use-mobile`, único hook em kebab-case no projeto (todos os demais usam camelCase). Inconsistência de convenção.

### A9 — `useExternalContact360Batch.test.ts` documenta BUG #9 explicitamente
`useExternalContact360Batch.test.ts:89` — teste marcado como prova de correção do BUG #9 (parse defensivo do Map retornado por RPC `get_contact_360_by_phone`). Teste de regressão de bug rastreado.

### A10 — `useCRMManagement.test.tsx` proíbe `select("*")` via assertion
`useCRMManagement.test.tsx:186` — verifica explicitamente que o hook nunca usa `select("*")`; obriga select mínimo explícito. Teste de contrato de performance.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
