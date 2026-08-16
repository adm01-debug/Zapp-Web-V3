# Estado: features/inbox/components — Diretórios Restantes

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 45/45

## 1. Visão Geral

Este documento cobre os 12 subdiretórios finais de `src/features/inbox/components/`: collaboration, media-gallery, search, agents-ops, interactive-builder, slash-commands, quick-replies, summary, templates, location-picker, monitoring e `__tests__` (raiz). São 45 arquivos totalizando ~3.971 linhas.

### Tabela de Arquivos por Categoria

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| **__tests__** | | |
| `__tests__/TicketHistorySheet.audit-mapping.test.ts` | 47 | Regressão de migração: garante que nenhum arquivo usa `conversation_audit_logs` fora do esperado |
| `__tests__/TicketTabs.test.tsx` | 150 | Testa visibilidade do seletor Meus/Depto/Todos conforme permissões |
| `__tests__/archivedUi.simulacao.test.tsx` | 757 | Teste ponta-a-ponta da UI de arquivados (badge, context menu, sidebar, lista virtual) |
| `__tests__/emojiConstants.test.ts` | 257 | Valida estrutura de `CATEGORY_LABELS`, `ALL_CATEGORIES` e `NATIVE_EMOJI_CATEGORIES` |
| `__tests__/linkPreviewUtils.test.ts` | 265 | Testa regex, detecção de mídia, extração de domínio, favicon e escape HTML |
| `__tests__/swipeActions.test.ts` | 234 | Testa shape, labels, cores e defaults dos factories de `SWIPE_ACTIONS` |
| `__tests__/template-utils.test.ts` | 212 | Testa `extractVariables`, `replaceVariables` e `AVAILABLE_VARIABLES` |
| **agents-ops** | | |
| `agents-ops/AgentOpsTable.tsx` | 132 | Tabela de agentes com status, filas, progresso de chats e popover de envios recentes |
| `agents-ops/AgentRecentSendsPopover.tsx` | 110 | Popover com histórico dos últimos envios via Evolution proxy de um agente |
| `agents-ops/AgentsConnectionsHeader.tsx` | 64 | Header compacto com status das conexões WhatsApp (conectado/instável/desconectado) |
| `agents-ops/index.ts` | 5 | Barrel de exportações do módulo |
| **collaboration** | | |
| `collaboration/HandoffDialog.tsx` | 125 | Dialog de transferência de conversa entre agentes com busca de perfis ativos |
| `collaboration/InternalNotesPanel.tsx` | 154 | Painel de notas internas com menções, lista e adição via mutation Supabase |
| `collaboration/MentionInput.tsx` | 84 | Input com autocomplete de menções via `@` para perfis disponíveis |
| `collaboration/ViewersIndicator.tsx` | 152 | Indicador em tempo real de agentes vendo a conversa (Supabase Presence) |
| `collaboration/__tests__/InternalNotesPanel.test.tsx` | 97 | Testes de dedupe/staleTime do InternalNotesPanel |
| `collaboration/index.ts` | 6 | Barrel de exportações do módulo |
| **interactive-builder** | | |
| `interactive-builder/ButtonTypeHelpers.tsx` | 27 | Funções utilitárias de ícone e label por tipo de botão interativo WhatsApp |
| `interactive-builder/MessagePreview.tsx` | 62 | Prévia visual de mensagem interativa (botões ou lista) |
| `interactive-builder/index.ts` | 5 | Barrel de exportações do módulo |
| `interactive-builder/useInteractiveMessage.ts` | 195 | Hook de estado e validação de mensagens interativas WA (seções, botões, tipo) |
| **location-picker** | | |
| `location-picker/index.ts` | 3 | Barrel que re-exporta `useLocationPicker` |
| `location-picker/useLocationPicker.ts` | 217 | Hook que gerencia mapa Mapbox (carregamento dinâmico, marcador, geocode reverso, geolocalização) |
| **media-gallery** | | |
| `media-gallery/MediaCard.tsx` | 96 | Card de mídia individual com seleção, preview e skeleton de carregamento |
| `media-gallery/MediaGalleryListView.tsx` | 78 | Visualização de galeria em modo lista com seleção e download |
| `media-gallery/MediaPreviewDialog.tsx` | 48 | Dialog de preview de mídia (imagem, vídeo, áudio, documento) |
| `media-gallery/__tests__/mediaUtils.test.ts` | 115 | Testes unitários de `getMediaType` e `getFilename` |
| `media-gallery/index.ts` | 5 | Barrel de exportações do módulo (falta `MediaGalleryListView`) |
| `media-gallery/mediaUtils.ts` | 29 | Funções utilitárias de detecção de tipo e extração de nome de arquivo de mídia |
| **monitoring** | | |
| `monitoring/QueueMetricsDashboard.tsx` | 339 | Dashboard de métricas de fila de mensagens + STS com gráficos Recharts |
| **quick-replies** | | |
| `quick-replies/QuickReplyCardList.tsx` | 117 | Lista de cards de respostas rápidas agrupadas, com favoritos, cópia, edição e exclusão |
| `quick-replies/QuickReplyDialog.tsx` | 89 | Dialog de criação/edição de resposta rápida com formulário e categorias fixas |
| `quick-replies/index.ts` | 4 | Barrel de exportações do módulo |
| **search** | | |
| `search/GlobalSearchFilters.tsx` | 210 | Painel de filtros animado (tipo, período, mídia) para busca global |
| `search/GlobalSearchHistory.tsx` | 65 | Lista de histórico de buscas recentes com remoção por item |
| `search/GlobalSearchResults.tsx` | 193 | Renderiza lista de resultados com ícone/badge por tipo e botão "Ver no chat" |
| `search/index.ts` | 4 | Barrel do módulo (falta `GlobalSearchHistory`) |
| **slash-commands** | | |
| `slash-commands/__tests__/slashCommandsData.test.ts` | 197 | Testes Vitest para completude, unicidade, shortcuts e subCommands |
| `slash-commands/index.ts` | 3 | Barrel do módulo |
| `slash-commands/slashCommandsData.ts` | 58 | Dados estáticos de 16 comandos de barra com categorias, cores e atalhos |
| **summary** | | |
| `summary/SummaryResult.tsx` | 98 | Exibição do resumo IA com TTS por seção e botão "Ouvir Tudo" |
| `summary/index.ts` | 4 | Barrel do módulo |
| `summary/useSummaryTts.ts` | 102 | Hook de TTS: controla reprodução, autoplay bloqueado e limpeza de ref de áudio |
| **templates** | | |
| `templates/TemplateEditorDialog.tsx` | 247 | Dialog de criação/edição de template com inserção de variáveis e preview |
| `templates/index.ts` | 3 | Barrel do módulo |

---

## 2. Fluxos Funcionais de UI

### Colaboração em tempo real
`RealtimeCollaboration.tsx` → `ViewersIndicator` (presença via Supabase Realtime, canal `presence`, tabela `profiles`) + `HandoffDialog` (query `profiles` → seleciona agente destino) + `InternalNotesPanel` → `MentionInput` + mutation `contact_notes`

### Construtor de mensagens interativas WhatsApp
`InteractiveMessageBuilder.tsx` → `useInteractiveMessage` (estado + validação) + `MessagePreview` (prévia) + `ButtonTypeHelpers` (utilitários de ícone/label)

### Picker de localização
`LocationPicker.tsx` → `useLocationPicker` → Edge Function `get-mapbox-token` → Mapbox GL (carregamento dinâmico via `@/lib/mapbox-loader`) → geocode reverso + geolocalização do navegador

### Galeria de mídia
`MediaGallery.tsx` → `MediaCard` + `MediaGalleryListView` + `MediaPreviewDialog` + `mediaUtils` (detecção de tipo)

### Dashboard de monitoramento
`ChatMonitoringDialog.tsx` → `QueueMetricsDashboard` → `sts_performance_metrics` (schema `zapp`) + `useMessageQueue` → gráficos Recharts

### Respostas rápidas (Quick Replies)
`QuickRepliesManager.tsx` → `QuickReplyCardList` (lista com CRUD) + `QuickReplyDialog` (form de criação/edição)

### Busca global
`GlobalSearch.tsx` → `GlobalSearchFilters` + `GlobalSearchHistory` (via `useSearchHistory`) + `GlobalSearchResults` → `useGlobalSearchData`

### Slash commands
`SlashCommands.tsx` + `ContactIntelligencePanel.tsx` → `slashCommandsData` (`SLASH`, `categoryColors`, `categoryLabels`)

### Resumo IA com TTS
`ConversationSummary.tsx` → `SummaryResult` → `useSummaryTts` → Edge Function TTS (via `playTtsAudio` com `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`)

### Templates com variáveis
`TemplatesWithVariables.tsx` → `TemplateEditorDialog` → `template-utils` (`AVAILABLE_VARIABLES`, `replaceVariables`, `extractVariables`) + `useMessageTemplates`

### Operações de agentes (AgentOps)
`AgentsOperationsPage.tsx` + `components/index.ts` → `AgentOpsTable` + `AgentRecentSendsPopover` + `AgentsConnectionsHeader`

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

### 3.1 Tabelas via `.from()`

| tabela | schema | arquivo | operação |
|--------|--------|---------|----------|
| `profiles` | `zapp` | `HandoffDialog.tsx` | SELECT (`id, name, avatar_url`) where `is_active = true` |
| `profiles` | `zapp` | `ViewersIndicator.tsx` | SELECT (`name, avatar_url`) by `user_id` |
| `contact_notes` | `zapp` | `InternalNotesPanel.tsx` | SELECT + JOIN `author:author_id` + INSERT via mutation |
| `sts_performance_metrics` | `zapp` | `QueueMetricsDashboard.tsx` | SELECT via `safeClient.from<StsMetricRow>(...)` |
| `audit_logs` | `zapp` | verificado indiretamente em `TicketHistorySheet.audit-mapping.test.ts` | write (via `messageSender.ts` etc.) |

### 3.2 RPCs via `.rpc()`

Nenhuma chamada `.rpc()` encontrada nos arquivos deste conjunto.

### 3.3 Canais Realtime

| canal | schema | arquivo | tipo |
|-------|--------|---------|------|
| `presence` (canal de conversa) | `zapp` | `ViewersIndicator.tsx` | Supabase Realtime Presence (`track`/`untrack`, evento `sync`) |

### 3.4 Edge Functions e APIs Externas

| função/API | arquivo | uso |
|-----------|---------|-----|
| `get-mapbox-token` | `useLocationPicker.ts:41` | `supabase.functions.invoke()` para obter token Mapbox seguro |
| Edge Function TTS (via `playTtsAudio`) | `useSummaryTts.ts` | Síntese de voz por seção do resumo; URL e key via `import.meta.env` |
| Mapbox API (geocode + busca) | `useLocationPicker.ts` | Geocode reverso e busca de endereço via `mapbox-gl` |

---

## 4. Exports Públicos

| módulo | exports |
|--------|---------|
| `agents-ops/index.ts` | `AgentOpsTable`, `AgentRecentSendsPopover`, `AgentsConnectionsHeader` |
| `collaboration/index.ts` | `HandoffDialog`, `InternalNotesPanel`, `MentionInput`, `ViewersIndicator`, `useConversationViewers` |
| `interactive-builder/index.ts` | `useInteractiveMessage`, `MessagePreview`, `getButtonTypeIcon`, `getButtonTypeLabel` |
| `location-picker/index.ts` | `useLocationPicker` |
| `media-gallery/index.ts` | `MediaCard`, `MediaPreviewDialog`, `MediaItem`, `getMediaType`, `getFilename` *(falta `MediaGalleryListView`)* |
| `monitoring/` *(sem barrel)* | `QueueMetricsDashboard` (importado diretamente pelo arquivo pai) |
| `quick-replies/index.ts` | `QuickReplyCardList`, `QuickReplyDialog` |
| `search/index.ts` | `GlobalSearchFilters`, `GlobalSearchResults` *(falta `GlobalSearchHistory`)* |
| `slash-commands/index.ts` | `SlashCommand`, `SLASH`, `categoryColors`, `categoryLabels` |
| `summary/index.ts` | `SummaryResult`, `useSummaryTts` |
| `templates/index.ts` | `TemplateEditorDialog` |

---

## 5. Chama (Saída)

Dependências externas que este conjunto consome:

| dependência | quem usa |
|-------------|----------|
| `@tanstack/react-query` | `HandoffDialog`, `InternalNotesPanel`, `collaboration/__tests__` |
| `framer-motion` | `GlobalSearchFilters`, `GlobalSearchResults`, `SummaryResult` |
| `recharts` | `QueueMetricsDashboard` |
| `mapbox-gl` (tipos) + `@/lib/mapbox-loader` | `useLocationPicker` |
| `date-fns` / `date-fns/locale` | `InternalNotesPanel`, `GlobalSearchResults`, `QueueMetricsDashboard` |
| `sonner` | `useSummaryTts`, `TemplateEditorDialog`, `InternalNotesPanel` |
| `@/hooks/use-toast` | `AgentRecentSendsPopover`, `useInteractiveMessage` *(dois sistemas de toast coexistindo)* |
| `@/integrations/supabase/client` | `HandoffDialog`, `ViewersIndicator`, `useLocationPicker`, `GlobalSearchFilters` |
| `@/integrations/supabase/safeClient` | `InternalNotesPanel`, `QueueMetricsDashboard` |
| `@/features/auth` → `useAuth` | `HandoffDialog`, `ViewersIndicator`, `InternalNotesPanel` |
| `@/services/api/queryKeys` | `InternalNotesPanel` |
| `../../hooks/useContactNotesMutations` | `InternalNotesPanel` |
| `../../hooks/useMentionableProfilesData` | `MentionInput` |
| `../../hooks/useMessageQueue` | `QueueMetricsDashboard` |
| `../../hooks/useSearchHistory` | `GlobalSearchHistory` |
| `../../hooks/useMessageTemplates` | `TemplateEditorDialog` |
| `../template-utils` | `TemplateEditorDialog` |
| `../useGlobalSearchData` | `GlobalSearchFilters`, `GlobalSearchResults` |
| `@/features/inbox` (tipos e `playTtsAudio`) | `useSummaryTts`, `AgentOpsTable`, `AgentRecentSendsPopover` |
| `@/features/connections` | `AgentsConnectionsHeader` |
| `@/lib/mapbox-loader`, `@/lib/logger`, `@/lib/formatters` | `useLocationPicker`, vários |

---

## 6. Chamado Por (Entrada)

| componente/hook | importado por |
|----------------|---------------|
| `HandoffDialog` | `RealtimeCollaboration.tsx` |
| `InternalNotesPanel` | `RealtimeCollaboration.tsx` |
| `MentionInput` | `InternalNotesPanel.tsx` (interno ao módulo) |
| `ViewersIndicator` / `useConversationViewers` | `RealtimeCollaboration.tsx` |
| `AgentOpsTable` | `AgentsOperationsPage.tsx`, `components/index.ts` |
| `AgentRecentSendsPopover` | `AgentOpsTable.tsx` (interno ao módulo) |
| `AgentsConnectionsHeader` | `AgentsOperationsPage.tsx`, `components/index.ts` |
| `useInteractiveMessage` | `InteractiveMessageBuilder.tsx` |
| `MessagePreview` (interactive-builder) | `InteractiveMessageBuilder.tsx`, `components/index.ts` |
| `ButtonTypeHelpers` | `InteractiveMessageBuilder.tsx` (via índice) |
| `useLocationPicker` | `LocationPicker.tsx` |
| `MediaCard` | `MediaGallery.tsx` |
| `MediaGalleryListView` | `MediaGallery.tsx` *(não está no barrel — importado diretamente)* |
| `MediaPreviewDialog` | `MediaGallery.tsx` |
| `mediaUtils` | `MediaGallery.tsx` |
| `QueueMetricsDashboard` | `ChatMonitoringDialog.tsx` (único importador externo) |
| `QuickReplyCardList` | `QuickRepliesManager.tsx` |
| `QuickReplyDialog` | `QuickRepliesManager.tsx` |
| `GlobalSearchFilters` | `GlobalSearch.tsx` |
| `GlobalSearchHistory` | `GlobalSearch.tsx` *(não exportado pelo barrel)* |
| `GlobalSearchResults` | `GlobalSearch.tsx` |
| `slashCommandsData` / `SLASH` / `categoryColors` / `categoryLabels` | `SlashCommands.tsx`, `ContactIntelligencePanel.tsx` |
| `SummaryResult` | `ConversationSummary.tsx` |
| `useSummaryTts` | `SummaryResult.tsx` (interno ao módulo) |
| `TemplateEditorDialog` | `TemplatesWithVariables.tsx` |

> **Nenhum componente deste conjunto está completamente sem importadores externos.** O dashboard `QueueMetricsDashboard` tem apenas um importador (`ChatMonitoringDialog.tsx`), tornando-o o menos conectado do grupo.

---

## 7. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| `__tests__/TicketHistorySheet.audit-mapping.test.ts` | COMPLETA | — |
| `__tests__/TicketTabs.test.tsx` | COMPLETA | Handlers `empty-handlers` (issue do índice, não impedem funcionamento do teste) |
| `__tests__/archivedUi.simulacao.test.tsx` | COMPLETA | — |
| `__tests__/emojiConstants.test.ts` | COMPLETA | — |
| `__tests__/linkPreviewUtils.test.ts` | COMPLETA | — |
| `__tests__/swipeActions.test.ts` | COMPLETA | — |
| `__tests__/template-utils.test.ts` | COMPLETA | — |
| `agents-ops/AgentOpsTable.tsx` | COMPLETA | Sem testes unitários próprios |
| `agents-ops/AgentRecentSendsPopover.tsx` | COMPLETA | Sem testes unitários próprios |
| `agents-ops/AgentsConnectionsHeader.tsx` | COMPLETA | Fallback ausente quando `instance_id` e `name` são nulos |
| `agents-ops/index.ts` | COMPLETA | — |
| `collaboration/HandoffDialog.tsx` | COMPLETA | `contactId` recebido mas não usado internamente (`_contactId`) |
| `collaboration/InternalNotesPanel.tsx` | COMPLETA | — |
| `collaboration/MentionInput.tsx` | COMPLETA | Sem feedback visual quando `showMentions=true` com lista vazia |
| `collaboration/ViewersIndicator.tsx` | COMPLETA | `last_seen` reflete hora do `sync`, não hora de entrada real do viewer |
| `collaboration/__tests__/InternalNotesPanel.test.tsx` | COMPLETA | — |
| `collaboration/index.ts` | COMPLETA | — |
| `interactive-builder/ButtonTypeHelpers.tsx` | COMPLETA | — |
| `interactive-builder/MessagePreview.tsx` | COMPLETA | Retorna `null` silenciosamente quando sem dados |
| `interactive-builder/index.ts` | COMPLETA | — |
| `interactive-builder/useInteractiveMessage.ts` | COMPLETA | Acoplamento frágil entre `addSection` (ID por timestamp) e `toggleSection` |
| `location-picker/index.ts` | COMPLETA | — |
| `location-picker/useLocationPicker.ts` | COMPLETA | Import de `toast` fora de ordem no arquivo |
| `media-gallery/MediaCard.tsx` | COMPLETA | — |
| `media-gallery/MediaGalleryListView.tsx` | COMPLETA | Não exportada pelo barrel |
| `media-gallery/MediaPreviewDialog.tsx` | COMPLETA | Botão "Download" hardcoded em inglês |
| `media-gallery/__tests__/mediaUtils.test.ts` | COMPLETA | — |
| `media-gallery/index.ts` | PARCIAL | `MediaGalleryListView` ausente do barrel |
| `media-gallery/mediaUtils.ts` | COMPLETA | — |
| `monitoring/QueueMetricsDashboard.tsx` | COMPLETA | Tipo `StsMetricRow` local pode divergir do schema real |
| `quick-replies/QuickReplyCardList.tsx` | COMPLETA | — |
| `quick-replies/QuickReplyDialog.tsx` | PARCIAL | Form não sincroniza quando `editingTemplate` muda com dialog já montado |
| `quick-replies/index.ts` | COMPLETA | — |
| `search/GlobalSearchFilters.tsx` | COMPLETA | Type cast `v as DateFilter` sem validação em runtime |
| `search/GlobalSearchHistory.tsx` | COMPLETA | Não exportado pelo barrel |
| `search/GlobalSearchResults.tsx` | COMPLETA | — |
| `search/index.ts` | PARCIAL | `GlobalSearchHistory` ausente do barrel |
| `slash-commands/__tests__/slashCommandsData.test.ts` | COMPLETA | Teste fixa `toHaveLength(16)` sem mensagem de contexto ao falhar |
| `slash-commands/index.ts` | COMPLETA | — |
| `slash-commands/slashCommandsData.ts` | COMPLETA | JSDoc incorreto ("component" em vez de "constante") |
| `summary/SummaryResult.tsx` | COMPLETA | — |
| `summary/index.ts` | COMPLETA | — |
| `summary/useSummaryTts.ts` | COMPLETA | Credenciais lidas via `import.meta.env` sem guard de undefined |
| `templates/TemplateEditorDialog.tsx` | PARCIAL | Form não sincroniza quando `template` muda; preview usa dados fictícios hardcoded |
| `templates/index.ts` | COMPLETA | — |

---

## 8. Achados

### A1 — Dois sistemas de toast coexistindo no mesmo feature
`InternalNotesPanel.tsx:15` importa `sonner`; `useInteractiveMessage.ts:3` importa `@/hooks/use-toast`. O mesmo conjunto de componentes usa dois sistemas distintos de notificação, criando inconsistência visual e de comportamento.

### A2 — Barrel `media-gallery/index.ts` omite `MediaGalleryListView`
`media-gallery/index.ts` (linhas 2-5): exporta `MediaCard`, `MediaPreviewDialog` e utilitários, mas não `MediaGalleryListView`. Qualquer importador usando o barrel não encontrará o componente e terá de importar o arquivo diretamente — caso `MediaGallery.tsx` já faça isso, mas cria inconsistência.

### A3 — Barrel `search/index.ts` omite `GlobalSearchHistory`
`search/index.ts`: não re-exporta `GlobalSearchHistory`. O componente é importado diretamente por `GlobalSearch.tsx`, mas quem consumir o barrel não terá acesso.

### A4 — `QuickReplyDialog` e `TemplateEditorDialog`: estado de form não sincroniza ao reusar o dialog
`quick-replies/QuickReplyDialog.tsx:22-26` e `templates/TemplateEditorDialog.tsx:100-103`: ambos inicializam estado via `useState(() => template?.X || '')` mas não têm `useEffect` para sincronizar quando a prop muda com o componente já montado. Reusar o Dialog para itens diferentes (sem desmontar) exibe dados do item anterior.

### A5 — `useSummaryTts`: credenciais Supabase sem guard de undefined
`summary/useSummaryTts.ts:59-60`: `import.meta.env.VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são passadas diretamente a `playTtsAudio` sem verificação de existência. Se as variáveis não estiverem definidas, a função recebe `undefined` sem erro antecipado.

### A6 — `TemplateEditorDialog`: preview com dados fictícios hardcoded
`templates/TemplateEditorDialog.tsx:221-228`: o preview substitui variáveis com `João Silva`, `Tech Corp`, `Gerente Comercial`. A interface aceita `contactData?` mas o chamador não a fornece. O preview pode induzir o usuário a pensar que a variável funciona com dados reais.

### A7 — `useInteractiveMessage`: acoplamento frágil entre `addSection` e `toggleSection` por timestamp
`interactive-builder/useInteractiveMessage.ts:56-57`: `addSection` registra em `expandedSections` um ID gerado como `section_${Date.now()}`, mas o objeto `section` em `sections[]` não armazena esse campo `id`. `toggleSection` depende de receber esse mesmo ID gerado — acoplamento implícito que pode dessincronizar em lag ou chamadas concorrentes.

### A8 — `AgentRecentSendsPopover`: texto hardcoded com número potencialmente enganoso
`agents-ops/AgentRecentSendsPopover.tsx:43`: texto `"Ver últimos ${sends.length || 5}"` — o fallback `|| 5` mostra "Ver últimos 5" mesmo quando `sends` está vazio/carregando, podendo enganar o usuário.

### A9 — `AgentsConnectionsHeader`: sem fallback quando `instance_id` e `name` são nulos
`agents-ops/AgentsConnectionsHeader.tsx:49`: usa `c.instance_id ?? c.name` como rótulo; se ambos forem `null`/`undefined`, a célula fica visivelmente vazia.

### A10 — `ViewersIndicator`: `last_seen` reflete hora do sync, não de entrada
`collaboration/ViewersIndicator.tsx:49`: `last_seen: new Date()` é definido no momento do evento `sync`, não quando o viewer entrou na conversa. O texto exibido "Visto HH:mm" é tecnicamente impreciso.

### A11 — `InternalNotesPanel`: key composta não garante unicidade em partes repetidas
`collaboration/InternalNotesPanel.tsx:75`: `key={\`${part}-${i}\`}` — se `part` for string vazia ou repetida, a key não é garantidamente única.

### A12 — `QueueMetricsDashboard`: tipo local `StsMetricRow` pode divergir do schema
`monitoring/QueueMetricsDashboard.tsx:50`: `StsMetricRow` é declarado localmente em vez de vir de `@/integrations/supabase/schema`. Mudanças na tabela `sts_performance_metrics` não serão refletidas automaticamente.

### A13 — `archivedUi.simulacao.test.tsx`: mock com caminho relativo potencialmente quebrado
`__tests__/archivedUi.simulacao.test.tsx:104`: mock de `RetryFailureBadge` usa caminho relativo `'./conversation-list/RetryFailureBadge'` a partir de `__tests__/`, mas o arquivo real está um nível acima. Pode falhar em ambientes com resolução estrita de módulos.

### A14 — `GlobalSearchFilters`: type cast sem validação em runtime
`search/GlobalSearchFilters.tsx:111`: `v as DateFilter` com comentário `/* ignore-audit: ... */` — valor inválido vindo do `<Select>` passaria silenciosamente ao estado pai sem erro ou validação.

### A15 — `MediaPreviewDialog`: botão "Download" em inglês
`media-gallery/MediaPreviewDialog.tsx:39` (aproximado): texto "Download" hardcoded em inglês no fallback de documento, enquanto o restante da UI está em pt-BR.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
