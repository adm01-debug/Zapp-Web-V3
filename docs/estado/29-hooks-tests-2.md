# Estado: src/hooks/__tests__ — Testes de Hooks (Metade 2/2)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 56/56

## 1. Visao Geral

56 arquivos de teste cobrindo hooks React em `src/hooks/__tests__/` e subdiretórios (`connections/`, `dashboard/`, `evolution/`, `gmail/`, `media-library/`, `shortcuts/`). Todos os hooks testados têm pelo menos 1 importador fora de `__tests__` — nenhum é órfão. Destaques estruturais: dois hooks com **dois arquivos de teste paralelos** (`useTheme`, `useUrlFilters`), um arquivo com nome enganoso (`gmailUtils.test.ts`), e duas suítes com cobertura quase nula de comportamento real (`usePushNotifications`, `useTextToSpeech` — ambos STUB).

### Tabela de Arquivos

| arquivo | linhas | o que faz em 1 linha | EM_USO/ORFAO |
|---------|--------|----------------------|--------------|
| useOfflineCache.test.ts | 156 | Cache localStorage de conversas com fallback offline/online, trimming e TTL | EM_USO |
| useOnboarding.test.tsx | 114 | Leitura de flag `onboarding_completed` via localStorage e `user_settings` no DB | EM_USO |
| useOnboardingChecklist.test.tsx | 152 | Checklist de onboarding (perfil, quick_replies, whatsapp_connections) | EM_USO |
| usePermissions.test.tsx | 204 | Fetch de permissões via `permissions`/`user_roles`/`role_permissions` e métodos `has*` | EM_USO |
| usePullToRefresh.test.ts | 237 | Estado PTR, handlers de touch, damping, clamp e callback `onRefresh` | EM_USO |
| usePushNotifications.test.ts | 55 | Expõe shape (5 funções + 3 props) — zero comportamento real testado | EM_USO |
| useQueueAnalytics.test.tsx | 162 | Fetch de analytics de fila (daily, hourly, status, agentes) com mocks de contacts/messages/profiles | EM_USO |
| useQueueGoals.test.tsx | 132 | Fetch e realtime de `queue_goals` com subscribe/unsubscribe | EM_USO |
| useQueueManagement.test.tsx | 404 | Teste dos 4 sub-hooks do façade: CRUD, analytics, goals, SLA, rebalance | EM_USO |
| useQueues.test.tsx | 117 | Fetch de filas com membros e contadores de espera via `queue_positions` | EM_USO |
| useQueuesComparison.test.tsx | 119 | Comparação de métricas entre filas com `queue_analytics` embutido | EM_USO |
| useRealtimeMessages.test.tsx | 304 | Merge de contatos/conversas via realtime e API shape do hook | EM_USO |
| useRealtimeSentimentAlerts.test.ts | 101 | Subscribe/cleanup de canal realtime `sentiment-alerts-realtime` | EM_USO |
| useReauthentication.test.tsx | 159 | Fluxo de reautenticação (senha, estados, ações pendentes) | EM_USO |
| useRetryOperation.test.ts | 157 | Retry com backoff, erros fatais (PGRST116, 23505), reset de estado | EM_USO |
| useSLACalculation.test.ts | 167 | Testa funções puras locais extraídas do arquivo — não instancia o hook real | EM_USO |
| useSLAHistory.test.tsx | 141 | Fetch de histórico SLA por período (7d/30d/90d), erros e derivações | EM_USO |
| useSLAMetrics.test.tsx | 119 | Fetch de métricas SLA + estado de loading/erro | EM_USO |
| useScanResponseHandler.test.ts | 206 | Mapeamento ScanCode → outcome + toast para todos os códigos de varredura | EM_USO |
| useScheduledMessages.test.tsx | 128 | Fetch de mensagens agendadas por contactId e sem filtro (calendar view) | EM_USO |
| useScreenProtection.test.tsx | 62 | Bloqueio de PrintScreen, Ctrl+P, Ctrl+S, context menu e exceção em inputs | EM_USO |
| useSearchHistory.test.ts | 162 | CRUD em histórico de busca com localStorage (dedup, limite 10, trim) | EM_USO |
| useSentimentAlerts.test.ts | 174 | Threshold/consecutivos, invocação da edge fn `sentiment-alert` e `audit_logs` | EM_USO |
| useServiceWorker.test.ts | 146 | Registro de SW, limpeza de caches legados, controller ativo, ausência de crash | EM_USO |
| useSidebarCollapse.test.ts | 104 | Estado colapsado em localStorage e evento DOM `toggle-sidebar` (via useSidebarState) | EM_USO |
| useSidebarFavorites.test.ts | 129 | Lista de favoritos em localStorage CRUD + limite de 6 (via useSidebarState) | EM_USO |
| useSpeechToText.test.ts | 133 | SpeechRecognition: suporte, start/stop, transcript, haptic feedback, cleanup | EM_USO |
| useSupabaseConnectivity.test.ts | 66 | Monitor singleton (online/backend-down/retry) via `fetch` stubado | EM_USO |
| useSwipeGesture.test.ts | 221 | Handlers de touch (offsetX, isSwiping, direção, clamping) via useSwipeControl | EM_USO |
| useSwipeNavigation.test.ts | 200 | Back/forward via touch em bordas de tela, flick rápido, cancelamento vertical | EM_USO |
| useTags.test.tsx | 113 | Fetch da tabela `tags` via react-query | EM_USO |
| useTextToSpeech.test.ts | 41 | Apenas verifica shape da API (isPlaying, error, speak, stop) | EM_USO |
| useTheme.test.ts | 249 | Ciclo completo: localStorage, matchMedia, setTheme, toggle, cycle, sync cross-instância | EM_USO |
| useTheme.test.tsx | 83 | Variante menor de teste do mesmo hook de tema (localStorage e classList) | EM_USO |
| useToast.reducer.test.ts | 155 | Função pura `reducer` de `use-toast.ts` (ADD/UPDATE/DISMISS/REMOVE) | EM_USO |
| useTranscriptionNotifications.test.ts | 118 | Subscribe/unsubscribe em canal realtime de transcrições (`evo.evolution_messages`) | EM_USO |
| useTypingPresence.test.tsx | 92 | Presença de digitação via Supabase Realtime (presence channel) | EM_USO |
| useUndoableAction.test.ts | 79 | Ação com janela de undo (sonner + timer) | EM_USO |
| useUrlFilters.test.ts | 291 | Parseamento/setFilters/clearFilters/hasActiveFilters com MemoryRouter | EM_USO |
| useUrlFilters.test.tsx | 99 | Variante com mock direto de `useSearchParams` (duplicata parcial do .test.ts) | EM_USO |
| useUserRole.test.tsx | 147 | Roles (admin/supervisor/isAdmin) lendo de `useAuth` | EM_USO |
| useUserSettings.test.tsx | 153 | Carregamento/atualização de settings do usuário com defaults | EM_USO |
| useVersions.test.tsx | 131 | CRUD de versões de entidade via `entity_versions` (re-export de features/admin) | EM_USO |
| useViewTransition.test.ts | 98 | Fallback e API nativa de `startViewTransition` com AbortError swallowed | EM_USO |
| useVoiceActionHandler.test.ts | 189 | Dispatcher de ações de voz (navigate/search/filter/sort/clear/answer) | EM_USO |
| useWarRoomAlerts.integration.test.tsx | 157 | Fluxo Realtime → push-notification de `warroom_alerts`, validação de enum `alert_type` | EM_USO |
| useWarRoomAlerts.test.tsx | 113 | Carregamento inicial de alertas e assinatura Realtime com mocks | EM_USO |
| useWebAuthn.test.tsx | 214 | CRUD de passkeys (register/auth/delete/rename/fetch) com supabase.from e functions.invoke | EM_USO |
| useWebhookViewPreferences.test.ts | 213 | Preferências de view em localStorage: defaults, merge, JSON inválido, activeFilterCount | EM_USO |
| useZenMode.test.ts | 124 | toggleZen, exitZen, leitura/escrita em localStorage e listener de tecla Escape | EM_USO |
| connections/__tests__/useHubTabNavigation.test.tsx | 126 | Resolução de tab via URLSearchParams (connections/integrations/bridge) | EM_USO |
| dashboard/__tests__/useSentimentData.pure.test.ts | 132 | 3 helpers puros: getSentimentColor, getSentimentBg, getSentimentLabel (boundary testing) | EM_USO |
| evolution/__tests__/v237Fallbacks.test.ts | 218 | isEndpointUnavailable, withV237Fallback e 3 RPCs de fallback da Evolution API | EM_USO |
| gmail/__tests__/gmailUtils.test.ts | 338 | 6 funções puras de `gmailTypes.ts` e `gmailApi.ts` (nome de arquivo enganoso) | EM_USO |
| media-library/__tests__/useMediaLibrary.utils.test.ts | 149 | 4 helpers puros de useMediaLibrary: getCategoriesForType, getBucket, extractStoragePath | EM_USO |
| shortcuts/__tests__/defaultShortcuts.test.ts | 175 | Estrutura do array DEFAULT_SHORTCUTS: shape, unicidade de IDs, categorias, key bindings | EM_USO |

---

## 2. Fluxos funcionais

### Filas e Atendimento
`useQueues` → `useQueueManagement` (façade) → `useQueueGoals`, `useQueueAnalytics`, `useQueuesComparison` → tabelas `queues`, `queue_members`, `queue_positions`, `queue_goals`, `queue_analytics`, `audit_logs` → RPCs `rpc_queue_sla_panel`, `rpc_queue_rebalance_candidates`

### WhatsApp / Realtime
`useRealtimeMessages` → canal realtime `messages`/`conversations` (merge) → `evolution_messages`
`useRealtimeSentimentAlerts` → canal `sentiment-alerts-realtime`
`useWarRoomAlerts` → tabela `warroom_alerts` + canal `postgres_changes`
`useTranscriptionNotifications` → canal realtime UPDATE em `evo.evolution_messages`
`useTypingPresence` → presence channel `typing-presence-{conversationId}`

### SLA
`useSLACalculation` (funções puras locais, não instancia o hook) → `useSLAHistory`, `useSLAMetrics` → tabela `conversation_sla`

### Autenticação e Segurança
`useReauthentication` → `supabase.auth.signInWithPassword`
`usePermissions` → `permissions` / `user_roles` / `role_permissions`
`useWebAuthn` → `user_passkeys` + Edge Function (`functions.invoke`)
`useScreenProtection` → keyboard/contextmenu events DOM

### Onboarding
`useOnboarding` → `user_settings` (upsert) + localStorage
`useOnboardingChecklist` → `profiles`, `quick_replies`, `whatsapp_connections`

### Configurações e Preferências
`useUserSettings` → `user_settings`
`useWebhookViewPreferences` → localStorage
`useSearchHistory` → localStorage
`useOfflineCache` → localStorage

### Navegação e Filtros
`useUrlFilters` → URL SearchParams / MemoryRouter
`useHubTabNavigation` → URLSearchParams (connections/integrations/bridge)
`useVoiceActionHandler` → dispatcher de ações de voz para navigate/search/filter

### Evolution API Fallbacks
`v237Fallbacks` → `rpc_list_conversations`, `rpc_list_contacts`, `rpc_get_contact` (RPCs de fallback v2.37)

### Gmail
`gmailUtils.test.ts` → `gmailTypes.ts` (type guards, token status) + `gmailApi.ts` (buildMimeMessage, isAuthError)

### Media Library
`useMediaLibrary.utils.test.ts` → helpers puros: getCategoriesForType, getUrlField, getBucket, extractStoragePath

### UI / Experiência
`useTheme` → localStorage + matchMedia + classList
`useSidebarCollapse`/`useSidebarFavorites` → `useSidebarState` + localStorage
`useSwipeGesture`/`useSwipeNavigation` → `useSwipeControl` + touch events
`usePullToRefresh` → touch events + damping
`useZenMode` → localStorage + Escape listener
`useViewTransition` → `document.startViewTransition` com fallback
`useUndoableAction` → sonner toast + timer

---

## 3. Tabelas, RPCs, canais realtime e edge functions

### Tabelas Supabase (`zapp` salvo indicação)

| Tabela | Schema | Arquivos de teste |
|--------|--------|------------------|
| `user_settings` | zapp | useOnboarding, useUserSettings |
| `profiles` | zapp | useOnboardingChecklist, useQueueAnalytics |
| `permissions`, `user_roles`, `role_permissions` | zapp | usePermissions |
| `queues`, `queue_members`, `queue_positions` | zapp | useQueues, useQueueManagement |
| `queue_goals` | zapp | useQueueGoals, useQueueManagement |
| `audit_logs` | zapp | useSentimentAlerts, useQueueManagement |
| `messages`, `conversations`, `contacts` | zapp | useRealtimeMessages, useQueueAnalytics |
| `conversation_sla` | zapp | useSLAHistory, useSLAMetrics |
| `scheduled_messages` | zapp | useScheduledMessages |
| `tags` | zapp | useTags |
| `warroom_alerts` | zapp | useWarRoomAlerts.*.test |
| `user_passkeys` | zapp | useWebAuthn |
| `entity_versions` | zapp | useVersions |
| `quick_replies`, `whatsapp_connections` | zapp | useOnboardingChecklist |
| `evolution_messages` | evo | useTranscriptionNotifications, useRealtimeMessages |

### RPCs

| RPC | Arquivo |
|-----|---------|
| `rpc_queue_sla_panel` | useQueueManagement |
| `rpc_queue_rebalance_candidates` | useQueueManagement |
| `rpc_list_conversations` | v237Fallbacks |
| `rpc_list_contacts` | v237Fallbacks |
| `rpc_get_contact` | v237Fallbacks |

### Canais Realtime

| Canal | Tipo | Arquivo |
|-------|------|---------|
| `sentiment-alerts-realtime` | postgres_changes | useRealtimeSentimentAlerts |
| `warroom_alerts` | postgres_changes | useWarRoomAlerts |
| `evo.evolution_messages` UPDATE | postgres_changes | useTranscriptionNotifications |
| `typing-presence-{conversationId}` | presence | useTypingPresence |
| `transcription-notifications:{id}` | postgres_changes | useTranscriptionNotifications |
| `queue_goals` | postgres_changes | useQueueGoals |

### Edge Functions

| Função | Arquivo |
|--------|---------|
| `sentiment-alert` | useSentimentAlerts |
| Não nomeada (via `functions.invoke`) | useWebAuthn |

---

## 4. Exports Públicos por categoria

Arquivos de teste não exportam símbolos para produção. Os módulos subjacentes exportam:

| Categoria | Exemplos de exports testados |
|-----------|------------------------------|
| Hooks React | `useQueues`, `useQueueManagement`, `useRealtimeMessages`, `useTheme`, `useUrlFilters`, `useUserRole` (25+ importadores) |
| Reducer puro | `reducer` de `use-toast.ts` (101 importadores) |
| Helpers puros | `getSentimentColor/Bg/Label`, `getCategoriesForType`, `getBucket`, `gmailTypes guards`, `buildMimeMessage` |
| Constantes | `DEFAULT_SHORTCUTS` (array de 25 entradas) |
| Utilitários Evolution | `isEndpointUnavailable`, `withV237Fallback` |

---

## 5. Chama (Saída)

Dependências externas ao conjunto `src/hooks/__tests__/`:

| Dependência | Usada por |
|-------------|-----------|
| `@testing-library/react` / `renderHook` | maioria dos arquivos |
| `vitest` (`vi`, `describe`, `it`, `expect`) | todos |
| `@supabase/supabase-js` (mock) | hooks com DB |
| `react-router-dom` (`MemoryRouter`, `useSearchParams`) | useUrlFilters.test.ts, useHubTabNavigation |
| `@tanstack/react-query` | useTags, useScheduledMessages, etc. |
| `sonner` (mock) | useUndoableAction, useSentimentAlerts |
| `@/integrations/supabase/client` | hooks que fazem queries |
| `@/hooks/useWarRoomAlerts` | useWarRoomAlerts.*.test |
| `@/features/sla/hooks/*` | useSLACalculation, useSLAHistory, useSLAMetrics |
| `@/features/auth/hooks/useUserRole` | useUserRole.test |
| `../connectivityMonitor` (internals) | useSupabaseConnectivity |

---

## 6. Chamado Por (Entrada)

Arquivos de teste não têm importadores por convenção — nenhum arquivo de produção importa um arquivo de teste. A tabela abaixo registra quem importa o **hook alvo** fora de `__tests__`:

| hook alvo | importadores fora de __tests__ |
|-----------|-------------------------------|
| `use-toast` (reducer) | 101 arquivos |
| `useUserRole` (via features/auth) | 25 arquivos |
| `useTheme` | 14 arquivos |
| `useQueues` | 9 arquivos |
| `useUserSettings` | 10 arquivos |
| `useTranscriptionNotifications` | 6 arquivos |
| `useRealtimeMessages` | 11 arquivos |
| `useTextToSpeech` | 5 arquivos |
| `useSLAMetrics` | 5 arquivos |
| `useQueueGoals` | 4 arquivos |
| `useReauthentication` | 4 arquivos |
| `useRetryOperation` (via useRetryAndErrorPrevention) | 3 arquivos |
| `useSLAHistory` | 4 arquivos |
| `useSpeechToText` | 4 arquivos |
| `useServiceWorker` | 4 arquivos |
| `useScheduledMessages` | 3 arquivos |
| `useScreenProtection` | 4 arquivos |
| `useSearchHistory` | 4 arquivos |
| `useSentimentAlerts` | 3 arquivos |
| `useSidebarState` (cobrindo collapse+favorites) | 3 arquivos |
| `useSwipeControl` (cobrindo gesture+navigation) | 3 arquivos |
| `useTags` | 4 arquivos |
| `useQueueManagement` | 3 arquivos |
| `useVersions` | 4 arquivos |
| `useViewTransition` | 3 arquivos |
| `useVoiceActionHandler` | 3 arquivos |
| `useUrlFilters` | 3 arquivos |
| `useTypingPresence` | 4 arquivos |
| `useUndoableAction` | 2 arquivos |
| `useSupabaseConnectivity` | 2 arquivos |
| `usePermissions` | 2 arquivos |
| `useOnboardingChecklist` | 2 arquivos |
| `useOfflineCache` | 1 arquivo |
| `usePullToRefresh` | 1 arquivo |
| `useQueueAnalytics` | 1 arquivo |
| `useQueuesComparison` | 1 arquivo |

---

## 7. Orfaos

**Zero arquivos de teste são órfãos** — por regra, arquivos de teste não são classificados como órfãos (não têm importadores por design). Todos os hooks/módulos alvo têm ao menos 1 importador externo ao diretório `__tests__`.

Nota especial: `gmail/__tests__/gmailUtils.test.ts` importa de `../gmailTypes` e `../gmailApi` (ambos existem e são usados). Não existe um módulo `gmailUtils.ts` — o nome do arquivo de teste é enganoso, mas o código testado é real e em uso. Não é candidato a remoção.

---

## 8. Implementacao por Arquivo

| arquivo | COMPLETA/PARCIAL/STUB/MORTA | o que falta |
|---------|----------------------------|-------------|
| useOfflineCache.test.ts | COMPLETA | — |
| useOnboarding.test.tsx | PARCIAL | `completeOnboarding` upsert não testado; só verifica existência da fn |
| useOnboardingChecklist.test.tsx | PARCIAL | `dismiss`/`checkStatus`/`progress` só verificam `typeof fn` |
| usePermissions.test.tsx | COMPLETA | — |
| usePullToRefresh.test.ts | COMPLETA | — |
| usePushNotifications.test.ts | STUB | Permissão browser, subscribe/unsubscribe, VAPID, showNotification não exercitados |
| useQueueAnalytics.test.tsx | PARCIAL | `dateRange` dinâmico; cores HSL por período não cobertas |
| useQueueGoals.test.tsx | PARCIAL | `saveGoal` (upsert real) e evento `postgres_changes` não testados |
| useQueueManagement.test.tsx | COMPLETA | `updateQueueConfig` só cobre path de erro |
| useQueues.test.tsx | PARCIAL | Evento Realtime INSERT/DELETE e error path ausentes |
| useQueuesComparison.test.tsx | PARCIAL | `dateRange` alternativo; error handling minimalista |
| useRealtimeMessages.test.tsx | PARCIAL | Evento realtime real não disparado nos testes |
| useRealtimeSentimentAlerts.test.ts | COMPLETA | — |
| useReauthentication.test.tsx | COMPLETA | — |
| useRetryOperation.test.ts | COMPLETA | — |
| useSLACalculation.test.ts | PARCIAL | Hook real não instanciado; cobertura zero de `renderHook` |
| useSLAHistory.test.tsx | COMPLETA | — |
| useSLAMetrics.test.tsx | PARCIAL | Filtros por agente/período não cobertos |
| useScanResponseHandler.test.ts | COMPLETA | — |
| useScheduledMessages.test.tsx | PARCIAL | Mutações (create/delete/update) não cobertas |
| useScreenProtection.test.tsx | COMPLETA | — |
| useSearchHistory.test.ts | COMPLETA | — |
| useSentimentAlerts.test.ts | COMPLETA | Som/notificação browser disparados; `alertsEnabled=false` |
| useServiceWorker.test.ts | COMPLETA | — |
| useSidebarCollapse.test.ts | COMPLETA | — |
| useSidebarFavorites.test.ts | COMPLETA | — |
| useSpeechToText.test.ts | COMPLETA | — |
| useSupabaseConnectivity.test.ts | COMPLETA | — |
| useSwipeGesture.test.ts | COMPLETA | — |
| useSwipeNavigation.test.ts | COMPLETA | — |
| useTags.test.tsx | PARCIAL | CRUD (insert/update/delete) definidos no mock mas sem testes |
| useTextToSpeech.test.ts | STUB | `speak()` com texto real, parada prematura, erros, enfileiramento não testados |
| useTheme.test.ts | COMPLETA | — |
| useTheme.test.tsx | COMPLETA | — |
| useToast.reducer.test.ts | COMPLETA | — |
| useTranscriptionNotifications.test.ts | PARCIAL | Payload handler e `showBrowserNotification` não testados |
| useTypingPresence.test.tsx | PARCIAL | `handleTypingStart`/`Stop` end-to-end não cobertos |
| useUndoableAction.test.ts | PARCIAL | `cancelPendingAction` e countdown real ausentes |
| useUrlFilters.test.ts | COMPLETA | — |
| useUrlFilters.test.tsx | PARCIAL | Duplicata parcial do .test.ts (subset de 99 vs 291 linhas) |
| useUserRole.test.tsx | COMPLETA | — |
| useUserSettings.test.tsx | COMPLETA | — |
| useVersions.test.tsx | COMPLETA | — |
| useViewTransition.test.ts | COMPLETA | — |
| useVoiceActionHandler.test.ts | COMPLETA | — |
| useWarRoomAlerts.integration.test.tsx | COMPLETA | — |
| useWarRoomAlerts.test.tsx | COMPLETA | — |
| useWebAuthn.test.tsx | COMPLETA | Happy-path de register/authenticate via Edge Function não exercitado |
| useWebhookViewPreferences.test.ts | COMPLETA | — |
| useZenMode.test.ts | COMPLETA | — |
| connections/__tests__/useHubTabNavigation.test.tsx | COMPLETA | — |
| dashboard/__tests__/useSentimentData.pure.test.ts | COMPLETA | Hook `useSentimentData` principal não testado (só helpers puros) |
| evolution/__tests__/v237Fallbacks.test.ts | COMPLETA | — |
| gmail/__tests__/gmailUtils.test.ts | COMPLETA | — |
| media-library/__tests__/useMediaLibrary.utils.test.ts | COMPLETA | Hook React principal não testado (só utilitários puros) |
| shortcuts/__tests__/defaultShortcuts.test.ts | COMPLETA | — |

---

## 9. Achados

### A1 — Dois arquivos de teste para `useTheme` (duplicação)
`useTheme.test.ts:1` (249 linhas) e `useTheme.test.tsx:1` (83 linhas) testam o mesmo hook com sobreposição de cenários. O `.test.tsx` não acrescenta cobertura nova e é candidato a consolidação ou remoção.

### A2 — Dois arquivos de teste para `useUrlFilters` (duplicação)
`useUrlFilters.test.ts:1` (291 linhas, MemoryRouter) e `useUrlFilters.test.tsx:1` (99 linhas, mock de `useSearchParams`) cobrem o mesmo hook com abordagens distintas mas sem complementaridade clara. O `.test.tsx` é subconjunto do `.test.ts` e candidato a remoção.

### A3 — `usePushNotifications.test.ts` — STUB com cobertura zero de comportamento
`usePushNotifications.test.ts:17-52` — 8 testes verificam apenas `typeof fn === 'function'` e valores iniciais. Permissão de browser, subscribe/unsubscribe, VAPID key e `showNotification` nunca exercitados. Qualquer regressão real passaria nos testes silenciosamente.

### A4 — `useTextToSpeech.test.ts` — STUB com cobertura zero de fala
`useTextToSpeech.test.ts:12-41` — 5 testes só verificam shape/inicialização. Nenhuma chamada real a `SpeechSynthesis.speak()`, parada prematura, erro de síntese ou enfileiramento de falas testados. Equivale a um type-check, não a um teste de comportamento.

### A5 — `useSLACalculation.test.ts` não testa o hook real
`useSLACalculation.test.ts:3` — arquivo importa de `@/features/sla/hooks/useSLACalculation` mas não usa `renderHook`; copia as funções puras localmente e as testa de forma isolada. Refatorações no hook real (timer, intervalo, estados de loading) não serão detectadas.

### A6 — Nomes de arquivos de teste divergem do módulo fonte
`useSidebarCollapse.test.ts:13` importa de `../useSidebarState` — `useSidebarCollapse.ts` não existe como arquivo isolado.
`useSidebarFavorites.test.ts:21` idem — ambos os hooks estão em `useSidebarState.ts`.
`useSwipeGesture.test.ts:23` e `useSwipeNavigation.test.ts:20` importam de `../useSwipeControl` — os arquivos `useSwipeGesture.ts` e `useSwipeNavigation.ts` não existem.
`useRetryOperation.test.ts:1` importa de `../useRetryAndErrorPrevention` — nenhum arquivo `useRetryOperation.ts` existe.

### A7 — `gmailUtils.test.ts` com nome enganoso
`gmail/__tests__/gmailUtils.test.ts:1` — o arquivo chama-se `gmailUtils` mas importa de `../gmailTypes` e `../gmailApi`. Não existe módulo `gmailUtils.ts`. Nome dificulta descoberta e manutenção.

### A8 — Canal Realtime mockado sem teste de eventos em useQueueGoals/useQueues
`useQueueGoals.test.tsx:108-123` e `useQueues.test.tsx:48-52` — `channel.subscribe` é chamado e verificado, mas nenhum evento `postgres_changes` é disparado. O handler de refetch não é validado; bugs de sincronização passariam despercebidos.

### A9 — `defaultShortcuts.test.ts` — discrepância 24 vs 25 entries
`shortcuts/__tests__/defaultShortcuts.test.ts:5,24` — cabeçalho JSDoc documenta "exactly 24 entries" mas `toHaveLength(25)`. Indica que um shortcut foi adicionado sem atualizar a documentação; pode mascarar regressão futura se a contagem esperada não for revisada.

### A10 — `useQueueManagement.test.tsx` — `updateQueueConfig` só cobre path de erro
`useQueueManagement.test.tsx:252-270` — caminho de sucesso do upsert (`updateQueueConfig` retornando `true`) não coberto; possível bug de silêncio em update válido não seria detectado.

### A11 — `useWarRoomAlerts.integration.test.tsx` guarda fronteira do enum `alert_type`
`useWarRoomAlerts.integration.test.tsx:126-144` — descarta `alert_type: 'urgent'` (inválido) e aceita `'sla_breach'` (novo valor). Relevante para migrações de schema: alteração do enum sem atualizar este teste causaria falha controlada.

### A12 — `v237Fallbacks.test.ts` guarda assinatura de RPC da Evolution API
`v237Fallbacks.test.ts:159-161` — confirma `rpc_list_conversations(p_instance)` como parâmetro exato. Breaking change de parâmetro na RPC quebraria este teste de forma detectável — serve como contrato de interface.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
