# Estado: Features Inbox — Componentes contact-details, conversation-list, ai-tools e stickers

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 62/62

## 1. Visao Geral

Quatro sub-módulos de `src/features/inbox/components/` auditados neste batch:

- **ai-tools/** (15 arquivos): painel de análise IA de conversas — resumo, sentimento, pontos-chave, histórico, TTS, configurações de tom e período.
- **contact-details/** (28 arquivos): painel lateral de detalhes do contato — cabeçalho, acordeão com 20+ seções (SLA, tags, campos customizados, inteligência DISC, mídias, status WA, 360° CRM).
- **conversation-list/** (10 arquivos): itens da lista de conversas em dois modos de densidade (comfortable / compact), badge de retry e tooltip truncado.
- **stickers/** (9 arquivos): galeria, upload e envio de figurinhas, com categorias e figurinhas pessoais.

### Tabela de Arquivos por Categoria

#### ai-tools/
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| AIResponseCard.tsx | 101 | Exibe resposta IA gerada com ações copiar/usar/regenerar |
| AnalysisTabs.tsx | 93 | Container de 4 abas (resumo/sentimento/pontos/histórico) com tooltips |
| HistoryTab.tsx | 105 | Lista análises anteriores clicáveis com badges de data/dept/sentimento |
| KeyPointsTab.tsx | 77 | Exibe pontos-chave e próximos passos com TTS por seção |
| PeriodFilterSelector.tsx | 318 | Seletor de período (presets + calendário customizado) com hook usePeriodFilter |
| SentimentTab.tsx | 136 | Gauge de sentimento + CSAT + desempenho do atendente + gráfico de evolução |
| SummaryTab.tsx | 108 | Resumo da análise com badges de status/urgência/churn + oportunidade de venda |
| ToneSelector.tsx | 58 | Radio-group de 5 tons (formal/amigável/objetivo/casual/persuasivo) |
| ToolPanel.tsx | 82 | Modal animado genérico com backdrop, header padronizado e scroll area |
| VisionIcon.tsx | 37 | SVG inline de ícone decorativo para cabeçalho do painel IA |
| analysisConfigs.ts | 104 | Constantes de configuração visual (status/sentimento/urgência/dept/churn/perf) |
| conversationSummaryStorage.ts | 120 | SELECT/INSERT/UPDATE em conversation_summaries com fallback por RLS |
| useAnalysisTts.ts | 98 | Hook gerencia ciclo de vida de TTS (play/stop/autoplay-blocked) |
| index.ts | 15 | Barrel de re-exports do módulo |
| __tests__/analysisConfigs.test.ts | 226 | Testes Vitest para todos os 6 configs exportados |

#### contact-details/
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| AssignmentSection.tsx | 132 | Selects de agente e fila com preview do agente atual atribuído |
| BlockContactDialog.tsx | 151 | Dialog que resolve instância WA e chama Evolution updateBlockStatus |
| CompactContactHeader.tsx | 57 | Header compacto com avatar, coroa VIP e botão copiar telefone |
| Contact360Helpers.tsx | 317 | Sub-componentes puros de exibição (RFM, CompanyCard, CustomerProfile, timeline) |
| ContactAccordionSection.tsx | 45 | Wrapper genérico Section com Accordion + animação framer-motion |
| ContactAccordionSections.tsx | 356 | Orquestra 20+ seções accordion do painel lateral de contato |
| ContactActionButtons.tsx | 172 | Botões de ação (ligação, vídeo, email, VIP, bloquear, arquivar) |
| ContactHeaderSection.tsx | 332 | Header completo com avatar, score de engajamento, badges, CRM 360° e CallDialog lazy |
| ContactInfoSection.tsx | 225 | Campos editáveis inline (telefone, email, empresa, cargo) com update via dbFrom |
| ContactIntelligencePanel.tsx | 341 | Painel de inteligência comercial (DISC, gatilhos, rapport, churn, horários) |
| ContactStatsSection.tsx | 143 | Grid 2x2 de métricas do contato (msgs, tempo médio, conversas, CSAT) com sparklines |
| ContactTagsContent.tsx | 70 | Lista tags do contato e da conversa com botões de adicionar/remover |
| CustomFieldsSection.tsx | 242 | CRUD de campos customizados via useContactCustomFields com inline edit |
| EditContactDialog.tsx | 341 | Dialog de edição com optimistic lock (update_contact_versioned), LGPD, histórico |
| ExternalContact360Panel.tsx | 107 | Visão 360° CRM via useExternalContact360 com proteção anti-stale |
| SLAAndAITagsSection.tsx | 249 | Exibe status de SLA (1ª resp/resolução) e tags IA com retry e tooltips |
| SLADeliveryConfigSection.tsx | 186 | Formulário upsert de sla_delivery_rules por contato + botão de simulação |
| SLATimelineSection.tsx | 366 | Linha do tempo SLA com filtros, marcos e alertas dinâmicos |
| SharedMediaAccordionItem.tsx | 111 | Accordion que conta mídias e faz prefetch da galeria ao abrir |
| StoryViewer.tsx | 202 | Viewer de WhatsApp Status com navegação, carregamento lazy de base64 e teclado |
| WhatsAppStatusSection.tsx | 120 | Exibe presença online e stories de status do WhatsApp de um contato |
| contactDetailSections.ts | 54 | Define as 18 seções de acordeão e helpers de persistência em localStorage |
| index.ts | 21 | Barrel de exportações do módulo |
| sla-timeline/Milestone.tsx | 141 | Renderiza um marco individual da timeline SLA |
| sla-timeline/SLATimelineFilters.tsx | 169 | Painel de filtros da timeline SLA (status, período, escopo) |
| sla-timeline/types.ts | 95 | Tipos, constantes e funções puras de SLA |
| __tests__/contactDetailSections.test.ts | 189 | Testes unitários para seções e helpers de localStorage |
| sla-timeline/__tests__/types.test.ts | 489 | Testes exaustivos para funções e constantes de types.ts |

#### conversation-list/
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| ConversationItem.tsx | 717 | Componente monolítico que renderiza item em modo comfortable E compact |
| ConversationItemComfortable.tsx | 292 | Variante comfortable refatorada, usa useConversationDisplay |
| ConversationItemCompact.tsx | 269 | Variante compact refatorada com SLA + RetryBadge |
| RetryFailureBadge.tsx | 103 | Badge de retry/falha de envio outbound com lazy fetch de reason |
| TruncatedTooltip.tsx | 46 | Tooltip condicional via ResizeObserver quando texto é truncado |
| conversationItemShared.tsx | 171 | Types, status maps, ChannelBadge, buildPrimaryLabel, buildSecondaryLabel |
| useConversationDisplay.ts | 72 | Hook que extrai estado derivado de ConversationItemData |
| index.ts | 4 | Barrel incompleto (exporta apenas ConversationItem e RetryFailureBadge) |
| __mocks__/mockConversations.ts | 432 | 15 fixtures tipados de ConversationWithMessages |
| ConversationItem.test.tsx | 102 | 4 testes vitest (nome, cargo, empresa, estilos) |

#### stickers/
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| StickerManager.tsx | 216 | Orquestrador: busca via react-query, filtros, upload preview, grade + pessoais |
| StickerGrid.tsx | 274 | Grade de figurinhas com ações inline (enviar, favoritar, deletar, recategorizar) |
| PersonalStickers.tsx | 111 | Painel de figurinhas pessoais (upload, favoritar, deletar) |
| StickerCategoryBar.tsx | 104 | Barra de filtros por categoria/favoritos/recentes |
| CategorySelector.tsx | 75 | Dropdown popover para selecionar categoria |
| StickerUploadPreview.tsx | 76 | Formulário inline para nomear/categorizar figurinha antes do upload |
| StickerTypes.ts | 52 | Tipos StickerItem, PendingUpload, constantes de categoria |
| index.ts | 9 | Barrel de exports do módulo |
| __tests__/StickerTypes.test.ts | 189 | Testes unitários das constantes (CATEGORY_LABELS/ALL_CATEGORIES) |

---

## 2. Fluxos funcionais de UI

### Análise IA de conversa
`ChatToolPanels.tsx` / `AIConversationAssistant.tsx` → `ToolPanel` (modal) → `AnalysisTabs` → `SummaryTab` | `SentimentTab` | `KeyPointsTab` | `HistoryTab` → `PeriodFilterSelector` (filtra mensagens localmente) → `conversationSummaryStorage.ts` (persiste sumários em `conversation_summaries`) → `analysisConfigs.ts` (mapeamentos visuais)

### TTS de análise
`KeyPointsTab` / `SummaryTab` → prop `onPlayText`/`onPlaySummary` → `useAnalysisTts` → `playTtsAudio` (edge function TTS)

### Painel lateral de contato
`ContactDetails.tsx` → `ContactHeaderSection` (avatar, score, CRM 360°) + `ContactAccordionSections` (orquestra seções) → `ContactInfoSection` | `AssignmentSection` | `ContactTagsContent` | `CustomFieldsSection` | `SLAAndAITagsSection` | `SLATimelineSection` | `SLADeliveryConfigSection` | `ContactIntelligencePanel` | `ContactStatsSection` | `SharedMediaAccordionItem` | `WhatsAppStatusSection` | `ContactActionButtons`

### Bloquear contato
`ContactActionButtons` → `BlockContactDialog` → `contacts` + `whatsapp_connections` (resolve instância) → Evolution API `updateBlockStatus`

### Edição de contato
`ContactHeaderSection` → `EditContactDialog` → RPC `update_contact_versioned` (via safeClient) com optimistic lock + `ConflictResolutionDialog`

### SLA Timeline
`SLATimelineSection` → `sla-timeline/SLATimelineFilters` (filtros) + `sla-timeline/Milestone` (marcos) → `sla-timeline/types.ts` (funções puras: `getSLAStatus`, `formatDurationMs`)

### Lista de conversas
`ConversationList.tsx` / `VirtualizedRealtimeList.tsx` → `ConversationItem` (legacy monolito) OU `ConversationItemComfortable` / `ConversationItemCompact` → `conversationItemShared.tsx` (tipos/helpers) + `useConversationDisplay` (estado derivado) + `RetryFailureBadge` + `TruncatedTooltip`

### Figurinhas (stickers)
`StickerPicker.tsx` → `StickerManager` → `StickerGrid` (figurinhas compartilhadas) + `PersonalStickers` (figurinhas do usuário) → `useStickerMutations` (CRUD via hooks externos) | `StickerCategoryBar` (filtros) | `StickerUploadPreview` (formulário)

---

## 3. Tabelas, RPCs, canais realtime e edge functions

### 3.1 Tabelas via .from()
| tabela | arquivo | operação |
|--------|---------|----------|
| `conversation_summaries` | ai-tools/conversationSummaryStorage.ts | SELECT, INSERT, UPDATE |
| `contacts` | contact-details/BlockContactDialog.tsx | SELECT (resolve instância) |
| `contacts` | contact-details/ContactInfoSection.tsx | UPDATE via dbFrom |
| `whatsapp_connections` | contact-details/BlockContactDialog.tsx | SELECT |
| `sla_delivery_rules` | contact-details/SLADeliveryConfigSection.tsx | UPSERT |
| `messages` | contact-details/SharedMediaAccordionItem.tsx | SELECT (prefetch mídias) |

### 3.2 RPCs via .rpc()
| rpc | arquivo | descrição |
|-----|---------|-----------|
| `update_contact_versioned` | contact-details/EditContactDialog.tsx | Optimistic lock com versionamento |

### 3.3 Canais realtime
Nenhum neste conjunto. Realtime de contatos/conversas é responsabilidade dos hooks externos (`useContactTyping`, hooks de `features/inbox`).

### 3.4 Edge functions e APIs externas
| recurso | arquivo | descrição |
|---------|---------|-----------|
| Evolution API `updateBlockStatus` | contact-details/BlockContactDialog.tsx | Bloquear/desbloquear contato no WhatsApp |
| Evolution API `getMediaBase64` | contact-details/StoryViewer.tsx | Carregar mídia de WA Status em base64 |
| TTS edge function (via `playTtsAudio`) | ai-tools/useAnalysisTts.ts | Text-to-speech para análises |

---

## 4. Exports Públicos

### ai-tools/index.ts
`AIResponseCard`, `AnalysisTabs`, `HistoryTab`, `KeyPointsTab`, `PeriodFilterSelector`, `AnalysisPeriod`, `PeriodMessage`, `SentimentTab`, `SummaryTab`, `ToneSelector`, `TONE`, `getTonePrompt`, `ToolPanel`, `VisionIcon`, `analysisConfigs` (statusConfig, sentimentConfig, urgencyConfig, departmentConfig, churnConfig), `conversationSummaryStorage`, `useAnalysisTts`

### contact-details/index.ts
`ContactHeaderSection`, `ContactInfoSection`, `ContactActionButtons`, `ContactAccordionSections`, `AssignmentSection`, `BlockContactDialog`, `CompactContactHeader`, `EditContactDialog`, `WhatsAppStatusSection`, `ContactTagsContent`, `CustomFieldsSection`, `contactDetailSections` (CONTACT_DETAIL_SECTIONS, DEFAULT_OPEN_SECTIONS, getStoredAccordionState, saveAccordionState)

### conversation-list/index.ts (INCOMPLETO)
`ConversationItem`, `RetryFailureBadge` — **não exporta**: `ConversationItemComfortable`, `ConversationItemCompact`, `TruncatedTooltip`, `useConversationDisplay`, tipos de `conversationItemShared`

### stickers/index.ts
`StickerManager`, `StickerGrid`, `PersonalStickers`, `StickerCategoryBar`, `CategorySelector`, `StickerUploadPreview`, `StickerTypes` (StickerItem, CATEGORY, ALL, PendingUpload)

---

## 5. Chama (Saida)

### ai-tools chama:
- `@/integrations/supabase/client` — conversationSummaryStorage
- `@/features/inbox` — `playTtsAudio`, `TtsPlayback`, `PlayTtsOptions`
- `@/components/ui/*` — button, badge, card, tabs, tooltip, progress, scroll-area, popover, calendar
- `framer-motion`, `date-fns` + `date-fns/locale/ptBR`, `lucide-react`, `sonner`

### contact-details chama:
- `@/hooks/useContactAssignment`, `useQueues`, `useContactEnrichedData`, `useEvolutionApi`, `useContactIntelligence`, `useRetryAndErrorPrevention`, `useExternalApiManagement`
- `@/features/contacts` — `useContactCustomFields`
- `@/features/sla` — `useApplicableSLA`, `useSLAAlerts`
- `@/features/inbox` — `useWhatsAppStatus`, `WhatsAppStatusMessage`
- `@/integrations/supabase/safeClient`, `@/integrations/datasource/db` (dbFrom)
- `@/services/api/queryKeys`
- `@/components/calls/CallDialog` (lazy)
- `@/components/contacts/` — `ContactPhoneManager`, `ContactConsentManager`, `AuditLogPanel`, `ConflictResolutionDialog`
- `framer-motion`, `lucide-react`, `sonner`, `@tanstack/react-query`

### conversation-list chama:
- `@/lib/utils`, `@/lib/logger`
- `@/hooks/useDensity`, `useContactTyping`, `useInViewport`
- `@/features/inbox` — `useFailureReason`, `formatFailureReason`
- `@/types/chat` — `Message`, `Conversation`
- `@/utils/date/normalize` — `toValidDate`
- `../SLAIndicatorForContact`, `../SentimentIndicator`, `../TypingIndicator`

### stickers chama:
- `../../hooks/useStickerMutations` — fetchStickers, updateStickerFavorite, deleteStickerById, updateStickerCategory, incrementStickerUseCount
- `@/hooks/usePersonalStickers`
- `@/services/api/queryKeys`
- `@/lib/utils`, `@/lib/logger`
- `@tanstack/react-query`, `framer-motion`, `lucide-react`, `sonner`
- `@/components/ui/*`

---

## 6. Chamado Por (Entrada)

| componente | importado em |
|------------|-------------|
| **ai-tools** (ToolPanel, AIResponseCard, AnalysisTabs) | `ChatToolPanels.tsx`, `AIConversationAssistant.tsx`, `ChatPanel.tsx`, `ConversationSummary.tsx`, `ObjectionDetector.tsx`, `UniversityHelp.tsx` |
| **contact-details** (ContactAccordionSections, ContactHeaderSection, ContactInfoSection, AssignmentSection, BlockContactDialog, etc.) | `ContactDetails.tsx` (único orquestrador externo) |
| `SLADeliveryConfigSection` | `CRMAutoSync.tsx`, `chat/hooks/useSLADelivery.ts` |
| `ExternalContact360Panel` | `CRMAutoSync.tsx` |
| **conversation-list** (ConversationItem) | `ConversationList.tsx`, `VirtualizedRealtimeList.tsx`, `__tests__/archivedUi.simulacao.test.tsx` |
| `RetryFailureBadge` | `ConversationList.tsx` |
| **stickers** (StickerManager) | `StickerPicker.tsx`, `SettingsView.tsx` |
| `usePersonalStickers` (hook de stickers) | `StickerPicker.tsx`, `useMediaManagement.ts` |

> **Candidatos a código morto ou órfão:**
> - `ConversationItemComfortable` e `ConversationItemCompact` — **não exportados** pelo barrel (`index.ts`) e não encontrados em importações externas via grep; são instanciados apenas pelo `ConversationItem` monolítico (se houver delegação interna). Verificar se há uso direto fora do módulo.
> - `ContactTagsContent` — exportado, mas handlers de add/remove completamente ausentes; funciona apenas como lista somente-leitura.
> - `TruncatedTooltip` — não exportado pelo barrel; uma cópia local existe dentro de `ConversationItem.tsx`.

---

## 7. Implementacao por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| ai-tools/AIResponseCard.tsx | COMPLETA | — |
| ai-tools/AnalysisTabs.tsx | COMPLETA | — |
| ai-tools/HistoryTab.tsx | COMPLETA | guard em message_count null |
| ai-tools/KeyPointsTab.tsx | COMPLETA | — |
| ai-tools/PeriodFilterSelector.tsx | COMPLETA | scale[0.7] pode quebrar clique em mobile |
| ai-tools/SentimentTab.tsx | COMPLETA | cast inseguro em agentPerformance |
| ai-tools/SummaryTab.tsx | COMPLETA | — |
| ai-tools/ToneSelector.tsx | COMPLETA | — |
| ai-tools/ToolPanel.tsx | COMPLETA | — |
| ai-tools/VisionIcon.tsx | COMPLETA | aria-hidden ou aria-label faltando |
| ai-tools/analysisConfigs.ts | COMPLETA | — |
| ai-tools/conversationSummaryStorage.ts | PARCIAL | RLS de INSERT/UPDATE ausente para não-admins — gravação silenciosamente inativa |
| ai-tools/useAnalysisTts.ts | COMPLETA | — |
| ai-tools/index.ts | COMPLETA | — |
| ai-tools/__tests__/analysisConfigs.test.ts | COMPLETA | — |
| contact-details/AssignmentSection.tsx | PARCIAL | cast `as unknown` oculta tipo real de useContactAssignment |
| contact-details/BlockContactDialog.tsx | COMPLETA | ausência de toast de sucesso após bloquear |
| contact-details/CompactContactHeader.tsx | COMPLETA | — |
| contact-details/Contact360Helpers.tsx | COMPLETA | BehaviorRadar hardcoda eixos DISC |
| contact-details/ContactAccordionSection.tsx | COMPLETA | — |
| contact-details/ContactAccordionSections.tsx | COMPLETA | dois Section com index=6 causam animação colidente |
| contact-details/ContactActionButtons.tsx | PARCIAL | botão Vídeo é stub; email navega via window.location.hash |
| contact-details/ContactHeaderSection.tsx | COMPLETA | engagementScore calculado localmente diverge do RPC get_latest_analysis |
| contact-details/ContactInfoSection.tsx | COMPLETA | não invalida queryKeys.contacts.byPhone |
| contact-details/ContactIntelligencePanel.tsx | COMPLETA | return null silencioso sem feedback ao usuário |
| contact-details/ContactStatsSection.tsx | COMPLETA | sparkData hardcoded com valores inventados |
| contact-details/ContactTagsContent.tsx | PARCIAL | handlers de add/remove tag completamente ausentes |
| contact-details/CustomFieldsSection.tsx | COMPLETA | — |
| contact-details/EditContactDialog.tsx | COMPLETA | _pendingData declarado mas nunca lido — edições durante conflito perdidas |
| contact-details/ExternalContact360Panel.tsx | COMPLETA | — |
| contact-details/SLAAndAITagsSection.tsx | COMPLETA | — |
| contact-details/SLADeliveryConfigSection.tsx | COMPLETA | localStorage lido no render sem useState — SSR-unsafe |
| contact-details/SLATimelineSection.tsx | COMPLETA | — |
| contact-details/SharedMediaAccordionItem.tsx | COMPLETA | — |
| contact-details/StoryViewer.tsx | COMPLETA | vídeo sem track de legendas (WCAG 1.2.2) |
| contact-details/WhatsAppStatusSection.tsx | COMPLETA | — |
| contact-details/contactDetailSections.ts | PARCIAL | 'custom-fields' em DEFAULT_OPEN_SECTIONS ausente em CONTACT_DETAIL_SECTIONS; colisões de customIndex |
| contact-details/index.ts | COMPLETA | — |
| contact-details/sla-timeline/Milestone.tsx | COMPLETA | — |
| contact-details/sla-timeline/SLATimelineFilters.tsx | COMPLETA | 3 casts com comentário ignore-audit — risco de runtime se tipos mudarem |
| contact-details/sla-timeline/types.ts | COMPLETA | — |
| contact-details/__tests__/contactDetailSections.test.ts | COMPLETA | não detecta 'custom-fields' fantasma |
| contact-details/sla-timeline/__tests__/types.test.ts | COMPLETA | — |
| conversation-list/ConversationItem.tsx | PARCIAL | monolito duplica TruncatedTooltip e interfere com Comfortable/Compact; cast as never |
| conversation-list/ConversationItemComfortable.tsx | COMPLETA | — |
| conversation-list/ConversationItemCompact.tsx | COMPLETA | sem tabIndex/onKeyDown (não focável por teclado) |
| conversation-list/RetryFailureBadge.tsx | COMPLETA | — |
| conversation-list/TruncatedTooltip.tsx | COMPLETA | — |
| conversation-list/conversationItemShared.tsx | COMPLETA | fallback 'Cargo não informado' hardcoded em pt-BR |
| conversation-list/useConversationDisplay.ts | COMPLETA | — |
| conversation-list/index.ts | PARCIAL | não exporta Comfortable, Compact, TruncatedTooltip, useConversationDisplay |
| conversation-list/__mocks__/mockConversations.ts | COMPLETA | — |
| conversation-list/ConversationItem.test.tsx | PARCIAL | empty-handlers; cobre apenas 4 casos; sem testes de compact, SLA, retry, a11y |
| stickers/CategorySelector.tsx | COMPLETA | — |
| stickers/PersonalStickers.tsx | COMPLETA | badge exibe "fotos" em vez de "figurinhas" |
| stickers/StickerCategoryBar.tsx | COMPLETA | showRecent aceito mas não implementa filtragem real |
| stickers/StickerGrid.tsx | COMPLETA | variável _idx declarada e não usada |
| stickers/StickerManager.tsx | COMPLETA | showRecent não filtra; pendingUpload nunca setado para figurinhas compartilhadas |
| stickers/StickerTypes.ts | COMPLETA | emojis 'cumprimento' e 'despedida' idênticos |
| stickers/StickerUploadPreview.tsx | COMPLETA | — |
| stickers/index.ts | COMPLETA | — |
| stickers/__tests__/StickerTypes.test.ts | COMPLETA | — |

---

## 8. Achados

### A1 — conversationSummaryStorage: RLS bloqueia INSERT/UPDATE silenciosamente para não-admins
`ai-tools/conversationSummaryStorage.ts:14-19` — O módulo tenta inserir/atualizar sumários em `conversation_summaries`, mas o comentário interno admite que a política RLS de inserção/atualização está ausente para perfis não-admin. Em produção, a escrita falha silenciosamente (retorna null sem lançar erro); o cache de análise não é persistido para a maioria dos usuários.

### A2 — ContactTagsContent: handlers de add/remove tag completamente ausentes
`contact-details/ContactTagsContent.tsx:31,48,60` — Ícone X renderizado com `cursor-pointer` mas sem `onClick`; botão "Adicionar" igualmente sem handler. A UI de tags é decorativa — nenhuma ação funciona. Candidato a feature incompleta exposta em produção.

### A3 — ConversationItem: monolito coexiste com variantes refatoradas sem orquestrador
`conversation-list/ConversationItem.tsx:212-714` — O componente original (717 linhas) renderiza comfortable e compact internamente, ignorando `ConversationItemComfortable` e `ConversationItemCompact`. Os três coexistem sem uma camada de decisão clara; atualizações nos componentes refatorados não refletem no monolito.

### A4 — ConversationItem: TruncatedTooltip duplicado internamente
`conversation-list/ConversationItem.tsx:117-156` — Define `TruncatedTooltip` localmente com implementação diferente da versão exportada em `TruncatedTooltip.tsx`. Duplicata viva; evoluções divergirão silenciosamente.

### A5 — contactDetailSections: 'custom-fields' fantasma em DEFAULT_OPEN_SECTIONS
`contact-details/contactDetailSections.ts:35` — A string `'custom-fields'` está em `DEFAULT_OPEN_SECTIONS` mas ausente em `CONTACT_DETAIL_SECTIONS` (18 entradas). Será persistida no localStorage e lida de volta, mas nunca renderizará acordeão correspondente — bug silencioso de UX. Os testes existentes não detectam esse gap.

### A6 — contactDetailSections: colisões de customIndex
`contact-details/contactDetailSections.ts:16-17` — Múltiplos itens compartilham o mesmo `customIndex`: dois com índice 1 (`whatsapp-status`, `sla-ai`), dois com índice 6 (`scoring`, `notes`), dois com índice 8 (`stats`, `media`). Se `customIndex` for usado para ordenação, a ordem entre esses itens é não-determinística.

### A7 — StickerManager: filtro "Recentes" silenciosamente quebrado
`stickers/StickerManager.tsx:84-91` — A prop `showRecent` é aceita pelo `StickerCategoryBar` e exibe o botão ativo na UI, mas o `useMemo` de `filteredStickers` não aplica nenhuma filtragem por data/uso. Clicar em "Recentes" não altera a lista exibida.

### A8 — StickerManager: pendingUpload nunca setado para figurinhas compartilhadas
`stickers/StickerManager.tsx:34,180-192` — `pendingUpload` é inicializado como `null` e nenhum handler de upload existe no componente para figurinhas compartilhadas. `StickerUploadPreview` é renderizado condicionalmente mas inacessível; o toast `'Use o botão de upload na barra de ferramentas'` (l.210) referencia botão inexistente no modo picker.

### A9 — SLADeliveryConfigSection: localStorage no render sem useState
`contact-details/SLADeliveryConfigSection.tsx:175` — `localStorage.getItem(...)` chamado diretamente no corpo do render (sem `useState`). Re-renders não refletem mudanças do toggle externo e é SSR-unsafe.

### A10 — EditContactDialog: _pendingData nunca lido — edições perdidas durante conflito
`contact-details/EditContactDialog.tsx:99` — `_pendingData` é declarado mas nunca utilizado. No force-save (l.156), usa `data` recém-construído; edições feitas pelo usuário durante o diálogo de conflito são silenciosamente descartadas.

### A11 — ConversationItemCompact: não focável via teclado (WCAG 2.1.1)
`conversation-list/ConversationItemCompact.tsx:59` — `motion.div` sem `tabIndex` nem `onKeyDown`; o item compact não é ativável via teclado, quebrando SC 2.1.1 para usuários que navegam sem mouse.

### A12 — ConversationItem: cast `as never` para SLAIndicatorForContact
`conversation-list/ConversationItem.tsx:463` — `SLAIndicatorForContact` recebe `conversation as never`; `ConversationItemCompact` usa `as unknown as Conversation`. Ambos contornam tipagem TypeScript para o mesmo prop — risco de crash em runtime se a interface mudar.

### A13 — VisionIcon: ícone decorativo sem aria-hidden
`ai-tools/VisionIcon.tsx` — SVG inline exposto ao leitor de tela sem `aria-hidden="true"` nem `aria-label`. Ícone puramente decorativo sem semântica para assistive technology.

### A14 — AssignmentSection: cast `as unknown` oculta tipo real de useContactAssignment
`contact-details/AssignmentSection.tsx:24` — `as unknown as { assignAgent; assignQueue }` torna a tipagem opaca; se a API do hook mudar, quebra em runtime sem erro TypeScript.

### A15 — StoryViewer: vídeo sem track de legendas (WCAG 1.2.2)
`contact-details/StoryViewer.tsx:179` — `<video>` sem `<track kind="captions">`. Comentário `sr-only` presente é placeholder textual, não substitui legendas reais. Violação de WCAG 1.2.2 (Level AA).

### A16 — ContactStatsSection: sparklines com dados inventados
`contact-details/ContactStatsSection.tsx:60-81` — `sparkData` hardcoded com valores fixos literais. Gráficos de sparkline mostram tendência inventada, não dados reais do contato.

### A17 — ContactActionButtons: botão Vídeo é stub exposto e email via hash frágil
`contact-details/ContactActionButtons.tsx:91` — Botão Vídeo exibe `toast.info('Chamada de vídeo em breve')` sem flag de feature. `ContactActionButtons.tsx:104` — `window.location.hash = '#email-chat'` não é roteamento React; quebra em SSR, não navegável por teclado, e não suporta histórico do browser.

*Runtime: NAO_VERIFICADO - nenhuma execucao real foi realizada durante esta analise.*
