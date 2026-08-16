# 14 — `src/components/settings/` — Componentes de Configurações

> Runtime: **NAO_VERIFICADO**
> Data: 2026-08-09
> Arquivos lidos: 54/54

---

## 1. Visão Geral

O diretório `src/components/settings/` é o módulo completo de configurações da plataforma Zapp-Web. O componente central **`SettingsView`** organiza 22 abas scrolláveis que cobrem horário de atendimento, mensagens automáticas, automações, sons, aparência, atalhos, integrações, SLA, e-mail, IA, orçamento e muito mais. O módulo tem 4 subdiretórios temáticos: `ai-providers/`, `media-library/`, `sla/` e `theme/`.

**Critério de ORFÃO**: arquivo sem nenhum importador fora do próprio diretório direto (ex.: um arquivo em `settings/sla/` é EM_USO se importado de `settings/`; um arquivo em `settings/` é ORFÃO se só importado por outro arquivo em `settings/`).

| Arquivo | Linhas | O que faz | Status |
|---------|--------|-----------|--------|
| `AIAutoTagsConfig.tsx` | 121 | Configura tags automáticas por IA com distribuição e retag de contatos | ORFÃO |
| `AIProvidersManager.tsx` | 97 | Gestão CRUD de provedores de IA (listagem, criação, edição, monitoramento) | ORFÃO |
| `AppearanceSettings.tsx` | 116 | Configurações de aparência: avatar, tema, idioma, densidade e tour | ORFÃO |
| `AutoCloseSettings.tsx` | 101 | Auto-fechamento de conversas por inatividade com mensagem | ORFÃO |
| `AutomationSettings.tsx` | 112 | Atribuição automática, transcrição de áudio e auto-fechamento | ORFÃO |
| `AvatarUpload.tsx` | 158 | Upload e recorte de foto de perfil com preview | ORFÃO |
| `CSATAutoConfig.tsx` | 147 | Configuração de pesquisa CSAT automática pós-atendimento | ORFÃO |
| `ChatbotL1Config.tsx` | 226 | Configuração do chatbot L1 de triagem com regras e respostas | ORFÃO |
| `ConnectionAlertPreferences.tsx` | 143 | Preferências de alertas de desconexão de instâncias WhatsApp | **EM_USO** |
| `ConnectionTestPanel.tsx` | 163 | Painel de diagnóstico de conexão WA com checks pass/warn/fail/skip | ORFÃO |
| `EmailSignaturesSettings.tsx` | 185 | Gerenciamento de assinaturas de e-mail por usuário | ORFÃO |
| `EmailTemplatesSettings.tsx` | 231 | Gerenciamento de templates de e-mail padronizados | ORFÃO |
| `FollowUpExecutionsHistory.tsx` | 169 | Histórico de execuções de sequências de follow-up | ORFÃO |
| `FollowUpSequences.tsx` | 278 | Configuração de sequências automáticas de follow-up | ORFÃO |
| `GlobalSettingsSection.tsx` | 149 | Configurações globais: idioma, modo WA e teste de conexão | ORFÃO |
| `ImapAccountsSettings.tsx` | 531 | Gerenciamento completo de contas IMAP para integração de e-mail | ORFÃO |
| `IntegrationKeysSection.tsx` | 378 | Gerenciamento de chaves de integração e tokens de API | ORFÃO |
| `KeyboardShortcutsSettings.tsx` | 277 | Visualização e configuração de atalhos de teclado da plataforma | ORFÃO |
| `LanguageSelector.tsx` | 46 | Seletor de idioma com dropdown e flags | ORFÃO |
| `MarketingBudgets.tsx` | 115 | Visualização read-only de orçamentos de marketing WhatsApp | ORFÃO |
| `MediaLibraryAdmin.tsx` | 47 | Wrapper com abas para gerenciar stickers, áudios meme e emojis | ORFÃO |
| `MessagesSettings.tsx` | 67 | Configuração de mensagens automáticas: boas-vindas, ausência e encerramento | ORFÃO |
| `SLAConfigurationManager.tsx` | 156 | Gerenciador de configurações globais de SLA com CRUD por prioridade | **EM_USO** |
| `SLARulesManager.tsx` | 82 | Gerenciador de regras granulares de SLA por 6 escopos | **EM_USO** |
| `SLASettings.tsx` | 109 | Configurações de SLA: limites de risco/violação e modo simulação | ORFÃO |
| `ScheduleSettings.tsx` | 92 | Configuração de horário de atendimento com dias da semana | ORFÃO |
| `SettingsView.tsx` | 340 | Hub principal de configurações com 22 abas scrolláveis | **EM_USO** |
| `SkillBasedRoutingSettings.tsx` | 238 | Roteamento por habilidades: skills de agentes e requisitos de filas | ORFÃO |
| `SoundCategoryCard.tsx` | 59 | Card individual de categoria de som com seletor e preview | ORFÃO |
| `SoundCustomizationPanel.tsx` | 326 | Painel de sons: volume global, horário silencioso, 5 categorias, upload | ORFÃO |
| `ThemeCustomizer.tsx` | 133 | Customizador de tema com presets, modo claro/escuro e border-radius | **EM_USO** |
| `WhatsAppModeSetting.tsx` | 209 | Switch entre modo WA Oficial (Cloud API) e não-oficial (Evolution) | ORFÃO |
| `__tests__/MediaLibraryAdmin.test.tsx` | 1929 | Suite de 200+ testes para MediaLibraryAdmin | ORFÃO |
| `__tests__/SLAConfigurationManager.test.tsx` | 134 | Testes de SLAConfigurationManager (renderização, botões, badges) | ORFÃO |
| `__tests__/SLARulesManager.test.tsx` | 160 | Testes do SLARulesManager (6 abas, dialog, formatação) | ORFÃO |
| `ai-providers/AIProviderCard.tsx` | 152 | Card de provedor IA com ações testar/editar/remover e badges | **EM_USO** |
| `ai-providers/AIProviderFormDialog.tsx` | 224 | Dialog de criação/edição de provedor IA com validação inline | **EM_USO** |
| `ai-providers/AIProviderHealthPanel.tsx` | 172 | Painel de saúde e monitoramento de provedor IA | **EM_USO** |
| `ai-providers/types.ts` | 58 | Tipos e constantes: AIProvider, ProviderFormData, USE_FOR_OPTIONS | **EM_USO** |
| `media-library/AIGenerateDialog.tsx` | 243 | Dialog para gerar mídia via IA (sticker/áudio/emoji) | ORFÃO |
| `media-library/MediaAdminPanel.tsx` | 270 | Painel admin de mídia: listagem, upload, busca e geração por IA | **EM_USO** |
| `media-library/MediaItemRow.tsx` | 234 | Linha de item de mídia com preview, edição inline e remoção | ORFÃO |
| `media-library/StatsCards.tsx` | 82 | Cards de estatísticas da biblioteca (total, por tipo, pendentes) | ORFÃO |
| `sla/SLARuleFormDialog.tsx` | 329 | Dialog de criação/edição de regra granular de SLA | ORFÃO |
| `sla/SLARuleRow.tsx` | 113 | Linha de regra de SLA com toggle ativo/inativo e ações | ORFÃO |
| `sla/ScopeRulesList.tsx` | 112 | Lista CRUD de regras de SLA por escopo com estado vazio | **EM_USO** |
| `sla/__tests__/sla-utils.test.ts` | 156 | Testes unitários para formatSLAMinutes e constantes sla-utils | ORFÃO |
| `sla/sla-utils.ts` | 34 | Utilitários SLA: formatSLAMinutes, SCOPE_TABS, CONTACT_TYPES, SCOPE_LABELS | **EM_USO** |
| `theme/BorderRadiusControl.tsx` | 124 | Controle deslizante de border-radius com preview em tempo real | **EM_USO** |
| `theme/PresetCard.tsx` | 57 | Card de preset de tema com seleção e preview de cores | **EM_USO** |
| `theme/ThemeDebugTooltip.tsx` | 56 | Tooltip de debug com valores CSS do tema (só em desenvolvimento) | **EM_USO** |
| `theme/__tests__/presets.test.ts` | 339 | Testes de integridade dos presets de tema (IDs, cores, estrutura) | ORFÃO |
| `theme/presets.ts` | 492 | Definição de todos os presets de tema com cores, border-radius e tipografia | **EM_USO** |
| `theme/useThemePreset.ts` | 218 | Hook de gerenciamento de preset ativo com aplicação de CSS vars | **EM_USO** |

**Resumo**: 54 arquivos · 17 EM_USO · 37 ORFÃO (27 root sem testes + 5 sub-sub-componentes + 5 arquivos de teste)

---

## 2. Fluxos Funcionais

### F1 — Configurações de Workspace (via SettingsView)
```
SettingsView
  └── useUserSettings → workspace_settings (zapp) — leitura/escrita de settings
  └── useOnboarding → (NAO_VERIFICADO: tabela de onboarding_state)
  └── [22 sub-componentes] → cada aba → seus próprios hooks/RPCs
```

### F2 — Modo WhatsApp (switch Oficial ↔ Evolution)
```
GlobalSettingsSection → WhatsAppModeSetting
  └── safeClient.rpc('rpc_get_active_integration_profile') → integration_profiles (zapp)
  └── safeClient.rpc('rpc_set_whatsapp_mode', { p_mode }) → global_settings.whatsapp_mode (zapp)
  └── safeClient.rpc('rpc_migrate_whatsapp_integration') → migração de integração
  └── getWhatsAppMode() / invalidateWhatsAppModeCache() → lib/whatsappAdapter
```

### F3 — Diagnóstico de Conexão WhatsApp
```
GlobalSettingsSection → ConnectionTestPanel
  └── supabase.functions.invoke('connection-test') → Edge Function `connection-test`
  └── getWhatsAppMode() → lib/whatsappAdapter
  └── checks com status: pass/warn/fail/skip
  └── copia webhook URL para clipboard
```

### F4 — Provedores de IA
```
AIProvidersManager
  └── useAIProviders (src/hooks/ai-providers/) → ai_providers (zapp)
  └── AIProviderCard → botão "Testar Conexão" → (NAO_VERIFICADO: RPC ou Edge Function)
  └── AIProviderFormDialog → validação inline → useAIProviders.create/update
  └── AIProviderHealthPanel → (NAO_VERIFICADO: endpoint de saúde do provedor)
  └── ai-providers/types.ts → AIProvider, ProviderFormData, USE_FOR_OPTIONS
```

### F5 — Configurações de SLA
```
SLASettings → thresholds globais → useUserSettings → workspace_settings (zapp)

SLAConfigurationManager → configurações por prioridade
  └── useSLAConfigurations (@/features/sla) → sla_configurations (zapp)
  └── PRIORITY_CONFIG (@/features/sla) → configuração de prioridades
  └── formatSLAMinutes (sla/sla-utils) → formatação de minutos para exibição

SLARulesManager → regras granulares por escopo
  └── useSLARulesCounts → sla_rules (zapp) — contagem por escopo
  └── SCOPE_TABS (sla/sla-utils) → 6 abas: contact/company/job_title/contact_type/queue/agent
  └── ScopeRulesList → SLARuleRow + SLARuleFormDialog → CRUD de regras
```

### F6 — Biblioteca de Mídia
```
MediaLibraryAdmin
  └── MediaAdminPanel (3 instâncias: stickers, audio_memes, custom_emojis)
    └── useMediaLibrary (@/hooks/media-library/) → stickers/audio_memes/custom_emojis (zapp)
    └── useMediaUpload → storage buckets: stickers, audio-messages, custom-emojis
    └── StatsCards → estatísticas por tipo
    └── MediaItemRow → linha individual com preview e ações
    └── AIGenerateDialog → geração de mídia via IA (NAO_VERIFICADO: Edge Function/RPC)
```

### F7 — Personalização de Tema
```
ThemeCustomizer
  └── useThemePreset (theme/useThemePreset) → localStorage + CSS vars aplicação
  └── PRESETS (theme/presets) → definição de paletas de cores e tipografia
  └── PresetCard → seleção visual de preset
  └── BorderRadiusControl → ajuste de border-radius (Slider)
  └── ThemeDebugTooltip → debug em desenvolvimento

ThemeInitializer (src/components/) → PRESETS (theme/presets) → inicialização de CSS vars no mount
useUIManagement (src/hooks/) → PRESETS (theme/presets) → gestão de UI
```

### F8 — Auto-fechamento de Conversas
```
AutomationSettings → AutoCloseSettings
  └── useAutoCloseConversations → (NAO_VERIFICADO: workspace_settings ou tabela dedicada)
  └── campos: is_enabled, inactivity_hours, close_message
```

### F9 — Orçamento Marketing WhatsApp
```
MarketingBudgets
  └── useMarketingBudgets → marketing_budgets (zapp) — somente leitura (RLS SELECT-only)
  └── Nota: edição bloqueada por ausência de policies de escrita (comentário no código)
  └── Cron daily-wa-marketing-budget (fora do repo) alimenta current_usd
```

### F10 — Alertas de Conexão (externo ao módulo)
```
NotificationSettingsPanel (src/components/notifications/) → ConnectionAlertPreferences
  └── (NAO_VERIFICADO: hook de preferências de alerta de conexão)
```

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

### Tabelas (schema `zapp`) — verificadas via hooks/componentes lidos:
| Tabela | Componente(s) | Operação |
|--------|---------------|----------|
| `workspace_settings` (ou `user_settings`) | SettingsView → useUserSettings | SELECT, UPDATE |
| `ai_providers` | AIProvidersManager → useAIProviders | SELECT, INSERT, UPDATE, DELETE |
| `sla_configurations` | SLAConfigurationManager → useSLAConfigurations | SELECT, INSERT, UPDATE, DELETE |
| `sla_rules` | SLARulesManager → useSLARulesCounts | SELECT |
| `marketing_budgets` | MarketingBudgets → useMarketingBudgets | SELECT (read-only) |
| `stickers` / `audio_memes` / `custom_emojis` | MediaAdminPanel → useMediaLibrary | SELECT, INSERT, DELETE |
| `integration_profiles` (via RPC) | WhatsAppModeSetting | via RPC |
| `global_settings` (via RPC) | WhatsAppModeSetting | via RPC |

### RPCs verificadas (leitura direta do código-fonte):
| RPC | Componente | Operação |
|-----|-----------|----------|
| `rpc_get_active_integration_profile` | WhatsAppModeSetting | SELECT perfil de integração ativo |
| `rpc_set_whatsapp_mode` | WhatsAppModeSetting | UPDATE modo WA do workspace |
| `rpc_migrate_whatsapp_integration` | WhatsAppModeSetting | Executa migração de integração |

### Edge Functions verificadas:
| Edge Function | Componente | Uso |
|---------------|-----------|-----|
| `connection-test` | ConnectionTestPanel | Diagnóstico de conexão WA (checks pass/warn/fail/skip) |

### Realtime: NAO_VERIFICADO
Não foi identificado uso de Realtime nos componentes deste diretório. Os updates são feitos via React Query mutations e invalidação de cache.

### Storage Buckets (verificados via hooks):
| Bucket | Componente | Operação |
|--------|-----------|----------|
| `stickers` | MediaAdminPanel | UPLOAD, DELETE, LIST |
| `audio-messages` | MediaAdminPanel (audio_memes) | UPLOAD, DELETE, LIST |
| `custom-emojis` | MediaAdminPanel | UPLOAD, DELETE, LIST |
| `avatars` | AvatarUpload | UPLOAD |

---

## 4. Exports Públicos por Categoria

### Componentes React (function components)
`AIAutoTagsConfig`, `AIProvidersManager`, `AppearanceSettings`, `AutoCloseSettings`, `AutomationSettings`, `AvatarUpload`, `CSATAutoConfig`, `ChatbotL1Config`, `ConnectionAlertPreferences`, `ConnectionTestPanel`, `EmailSignaturesSettings`, `EmailTemplatesSettings`, `FollowUpExecutionsHistory`, `FollowUpSequences`, `GlobalSettingsSection`, `ImapAccountsSettings`, `IntegrationKeysSection`, `KeyboardShortcutsSettings`, `LanguageSelector`, `MarketingBudgets`, `MediaLibraryAdmin`, `MessagesSettings`, `SLAConfigurationManager`, `SLARulesManager`, `SLASettings`, `ScheduleSettings`, `SettingsView`, `SkillBasedRoutingSettings`, `SoundCategoryCard`, `SoundCustomizationPanel`, `ThemeCustomizer`, `WhatsAppModeSetting`, `AIProviderCard`, `AIProviderFormDialog`, `AIProviderHealthPanel`, `MediaAdminPanel`, `AIGenerateDialog`, `MediaItemRow`, `StatsCards`, `ScopeRulesList`, `SLARuleFormDialog`, `SLARuleRow`, `BorderRadiusControl`, `PresetCard`, `ThemeDebugTooltip`

### Hooks
`useThemePreset` (theme/)

### Tipos TypeScript
`AIProvider`, `ProviderFormData`, `ProviderType` (ai-providers/types.ts)

### Constantes
`USE_FOR_OPTIONS`, `EMPTY_FORM` (ai-providers/types.ts)  
`PRESETS`, `STORAGE_KEY`, `DEFAULT_PRESET_ID`, `ThemeModeColors` (theme/presets.ts)  
`SCOPE_TABS`, `CONTACT_TYPES`, `SCOPE_LABELS` (sla/sla-utils.ts)

### Funções utilitárias
`formatSLAMinutes` (sla/sla-utils.ts)

---

## 5. Chama (Saída) — Dependências Externas

### Hooks externos consumidos:
| Hook | Importado por | Localização |
|------|--------------|-------------|
| `useUserSettings` | SettingsView, SLASettings | `@/hooks/useUserSettings` |
| `useOnboarding` | SettingsView, AppearanceSettings | `@/hooks/useOnboarding` |
| `useAIProviders` | AIProvidersManager | `@/hooks/ai-providers/useAIProviders` |
| `useAITagStats` | AIAutoTagsConfig | `@/hooks/` (NAO_VERIFICADO caminho exato) |
| `useRetagRecentContacts` | AIAutoTagsConfig | `@/hooks/` (NAO_VERIFICADO) |
| `useAutoCloseConversations` | AutoCloseSettings | `@/hooks/useAutoCloseConversations` |
| `useSLAConfigurations` | SLAConfigurationManager | `@/features/sla` |
| `useSLARulesCounts` | SLARulesManager | `@/hooks/useSLARulesCounts` |
| `useMarketingBudgets` | MarketingBudgets | `@/hooks/useMarketingBudgets` |
| `useMediaLibrary` | MediaAdminPanel | `@/hooks/media-library/useMediaLibrary` |
| `useMediaUpload` | MediaAdminPanel | `@/hooks/media-library/useMediaUpload` |
| `useTheme` | ThemeCustomizer | `@/hooks/useTheme` |
| `useDensity` | AppearanceSettings | `@/hooks/useDensity` (via DensitySelector) |
| `useLanguage` | LanguageSelector | `@/i18n` |
| `useSLARulesCounts` | SLARulesManager | `@/hooks/useSLARulesCounts` |

### Features externas consumidas:
| Feature/Import | Importado por | Localização |
|----------------|--------------|-------------|
| `useSLAConfigurations`, `PRIORITY_CONFIG`, `SLARuleScope` | SLAConfigurationManager, SLARulesManager | `@/features/sla` |
| `getWhatsAppMode`, `invalidateWhatsAppModeCache`, `WhatsAppMode` | WhatsAppModeSetting, ConnectionTestPanel | `@/lib/whatsappAdapter` |
| `safeClient` | WhatsAppModeSetting | `@/integrations/supabase/safeClient` |
| `getLogger` | WhatsAppModeSetting | `@/lib/logger` |

### Componentes externos consumidos por SettingsView:
`NPSDashboard` (`@/components/nps/`), `QuickRepliesManager` (`@/features/inbox`), `StickerManager` (`@/features/inbox`), `ElevenLabsDialogue` (`@/components/voice/`), `ElevenLabsVoiceDesign` (`@/components/voice/`), `NotificationSettingsPanel` (`@/components/notifications/`), `NotificationChannelsAdmin` (`@/components/notifications/`), `PageTemplate` (`@/components/layout/`)

### Componentes externos consumidos por AppearanceSettings:
`DensitySelector`, `ChatThemeSettings` (NAO_VERIFICADO: localização exata)

---

## 6. Chamado Por (Entrada) — Importadores Verificados via Grep

| Arquivo | Importado por | Contagem |
|---------|---------------|----------|
| `SettingsView.tsx` | `src/pages/lazyViews.ts` | 1 |
| `ThemeCustomizer.tsx` | `src/pages/lazyViews.ts` | 1 |
| `ConnectionAlertPreferences.tsx` | `src/components/notifications/NotificationSettingsPanel.tsx` | 1 |
| `SLAConfigurationManager.tsx` | `src/components/queues/SLADashboard.tsx`, `src/components/dashboard/SLAMetricsDashboard.tsx` | 2 |
| `SLARulesManager.tsx` | `src/components/queues/SLADashboard.tsx` | 1 |
| `theme/presets.ts` | `src/components/ThemeInitializer.tsx`, `src/hooks/useUIManagement.ts`, `settings/ThemeCustomizer.tsx` | 3 |
| `ai-providers/types.ts` | `src/hooks/ai-providers/useAIProviders.ts`, `settings/AIProvidersManager.tsx` | 2 |
| `ai-providers/AIProviderCard.tsx` | `settings/AIProvidersManager.tsx` | 1 |
| `ai-providers/AIProviderFormDialog.tsx` | `settings/AIProvidersManager.tsx` | 1 |
| `ai-providers/AIProviderHealthPanel.tsx` | `settings/AIProvidersManager.tsx` | 1 |
| `media-library/MediaAdminPanel.tsx` | `settings/MediaLibraryAdmin.tsx` | 1 |
| `sla/ScopeRulesList.tsx` | `settings/SLARulesManager.tsx` | 1 |
| `sla/sla-utils.ts` | `settings/SLARulesManager.tsx`, `settings/SLAConfigurationManager.tsx`, `sla/SLARuleFormDialog.tsx`, `sla/SLARuleRow.tsx` | 4 |
| `theme/useThemePreset.ts` | `settings/ThemeCustomizer.tsx` | 1 |
| `theme/PresetCard.tsx` | `settings/ThemeCustomizer.tsx` | 1 |
| `theme/BorderRadiusControl.tsx` | `settings/ThemeCustomizer.tsx` | 1 |
| `theme/ThemeDebugTooltip.tsx` | `settings/ThemeCustomizer.tsx` | 1 |
| `AIAutoTagsConfig.tsx` | `settings/SettingsView.tsx` | 1 |
| `AIProvidersManager.tsx` | `settings/SettingsView.tsx` | 1 |
| `AppearanceSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `AutoCloseSettings.tsx` | `settings/AutomationSettings.tsx` | 1 |
| `AutomationSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `AvatarUpload.tsx` | `settings/AppearanceSettings.tsx` | 1 |
| `CSATAutoConfig.tsx` | `settings/SettingsView.tsx` | 1 |
| `ChatbotL1Config.tsx` | `settings/SettingsView.tsx` | 1 |
| `ConnectionTestPanel.tsx` | `settings/GlobalSettingsSection.tsx` | 1 |
| `EmailSignaturesSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `EmailTemplatesSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `FollowUpExecutionsHistory.tsx` | `settings/FollowUpSequences.tsx` | 1 |
| `FollowUpSequences.tsx` | `settings/SettingsView.tsx` | 1 |
| `GlobalSettingsSection.tsx` | `settings/SettingsView.tsx` | 1 |
| `ImapAccountsSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `IntegrationKeysSection.tsx` | `settings/SettingsView.tsx` | 1 |
| `KeyboardShortcutsSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `LanguageSelector.tsx` | `settings/GlobalSettingsSection.tsx` | 1 |
| `MarketingBudgets.tsx` | `settings/SettingsView.tsx` | 1 |
| `MediaLibraryAdmin.tsx` | `settings/SettingsView.tsx` | 1 |
| `MessagesSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `SLASettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `ScheduleSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `SkillBasedRoutingSettings.tsx` | `settings/SettingsView.tsx` | 1 |
| `SoundCategoryCard.tsx` | `settings/SoundCustomizationPanel.tsx` | 1 |
| `SoundCustomizationPanel.tsx` | `settings/SettingsView.tsx` | 1 |
| `WhatsAppModeSetting.tsx` | `settings/GlobalSettingsSection.tsx` | 1 |
| `media-library/AIGenerateDialog.tsx` | `media-library/MediaAdminPanel.tsx` | 1 |
| `media-library/MediaItemRow.tsx` | `media-library/MediaAdminPanel.tsx` | 1 |
| `media-library/StatsCards.tsx` | `media-library/MediaAdminPanel.tsx` | 1 |
| `sla/SLARuleFormDialog.tsx` | `sla/ScopeRulesList.tsx` | 1 |
| `sla/SLARuleRow.tsx` | `sla/ScopeRulesList.tsx` | 1 |
| `__tests__/MediaLibraryAdmin.test.tsx` | (nenhum — executado pelo test runner) | 0 |
| `__tests__/SLAConfigurationManager.test.tsx` | (nenhum — executado pelo test runner) | 0 |
| `__tests__/SLARulesManager.test.tsx` | (nenhum — executado pelo test runner) | 0 |
| `sla/__tests__/sla-utils.test.ts` | (nenhum — executado pelo test runner) | 0 |
| `theme/__tests__/presets.test.ts` | (nenhum — executado pelo test runner) | 0 |

---

## 7. Órfãos

**Critério**: zero importadores fora do próprio diretório direto.  
**Importante**: "ORFÃO" aqui **não significa código morto**. Os 27 componentes root são ativamente renderizados via `SettingsView` (que é EM_USO). Os arquivos abaixo são "órfãos de consumidores externos" — não têm uso fora do módulo settings, o que os torna candidatos a refatoração se a aba correspondente for removida, mas não são dead code.

### Root `settings/` (27 componentes — usados por SettingsView ou cadeia interna)
1. `AIAutoTagsConfig.tsx` — aba ai-tags do SettingsView
2. `AIProvidersManager.tsx` — aba ai-providers do SettingsView
3. `AppearanceSettings.tsx` — aba appearance do SettingsView
4. `AutoCloseSettings.tsx` — filho de AutomationSettings
5. `AutomationSettings.tsx` — aba automation do SettingsView
6. `AvatarUpload.tsx` — filho de AppearanceSettings
7. `CSATAutoConfig.tsx` — aba csat do SettingsView
8. `ChatbotL1Config.tsx` — aba chatbot-l1 do SettingsView
9. `ConnectionTestPanel.tsx` — filho de GlobalSettingsSection
10. `EmailSignaturesSettings.tsx` — aba email do SettingsView
11. `EmailTemplatesSettings.tsx` — aba email-templates do SettingsView
12. `FollowUpExecutionsHistory.tsx` — filho de FollowUpSequences
13. `FollowUpSequences.tsx` — aba followup do SettingsView
14. `GlobalSettingsSection.tsx` — aba global do SettingsView
15. `ImapAccountsSettings.tsx` — aba email-accounts do SettingsView
16. `IntegrationKeysSection.tsx` — aba global do SettingsView
17. `KeyboardShortcutsSettings.tsx` — aba shortcuts do SettingsView
18. `LanguageSelector.tsx` — filho de GlobalSettingsSection
19. `MarketingBudgets.tsx` — aba budgets do SettingsView
20. `MediaLibraryAdmin.tsx` — aba media do SettingsView
21. `MessagesSettings.tsx` — aba messages do SettingsView
22. `SLASettings.tsx` — aba sla do SettingsView
23. `ScheduleSettings.tsx` — aba schedule do SettingsView
24. `SkillBasedRoutingSettings.tsx` — aba routing do SettingsView
25. `SoundCategoryCard.tsx` — filho de SoundCustomizationPanel
26. `SoundCustomizationPanel.tsx` — aba sounds do SettingsView
27. `WhatsAppModeSetting.tsx` — filho de GlobalSettingsSection

### Subdir `media-library/` (3 componentes — usados por MediaAdminPanel)
28. `media-library/AIGenerateDialog.tsx` — filho de MediaAdminPanel
29. `media-library/MediaItemRow.tsx` — filho de MediaAdminPanel
30. `media-library/StatsCards.tsx` — filho de MediaAdminPanel

### Subdir `sla/` (2 componentes — usados por ScopeRulesList)
31. `sla/SLARuleFormDialog.tsx` — filho de ScopeRulesList
32. `sla/SLARuleRow.tsx` — filho de ScopeRulesList

### Arquivos de teste (5 — sem importadores, executados pelo test runner)
33. `__tests__/MediaLibraryAdmin.test.tsx` — teste (1929 linhas, 200+ casos)
34. `__tests__/SLAConfigurationManager.test.tsx`
35. `__tests__/SLARulesManager.test.tsx`
36. `sla/__tests__/sla-utils.test.ts`
37. `theme/__tests__/presets.test.ts`

**Total ORFÃO**: 37 arquivos  
**Código verdadeiramente morto (zero usos em qualquer cadeia)**: ZERO — todos os arquivos não-teste são alcançados via SettingsView ou ThemeCustomizer.

---

## 8. Implementação por Arquivo

| Arquivo | Status | O que falta / Notas |
|---------|--------|---------------------|
| `AIAutoTagsConfig.tsx` | COMPLETA | — |
| `AIProvidersManager.tsx` | COMPLETA | — |
| `AppearanceSettings.tsx` | PARCIAL | DensitySelector e ChatThemeSettings importados mas localização não verificada diretamente |
| `AutoCloseSettings.tsx` | COMPLETA | — |
| `AutomationSettings.tsx` | PARCIAL | TODO (linha 20-27): UI para cron_schedules, cron_schedule_executions, task_queues, batch_jobs não implementada |
| `AvatarUpload.tsx` | COMPLETA | — |
| `CSATAutoConfig.tsx` | COMPLETA | — |
| `ChatbotL1Config.tsx` | COMPLETA | — |
| `ConnectionAlertPreferences.tsx` | COMPLETA | — |
| `ConnectionTestPanel.tsx` | COMPLETA | — |
| `EmailSignaturesSettings.tsx` | COMPLETA | — |
| `EmailTemplatesSettings.tsx` | COMPLETA | — |
| `FollowUpExecutionsHistory.tsx` | COMPLETA | — |
| `FollowUpSequences.tsx` | COMPLETA | — |
| `GlobalSettingsSection.tsx` | COMPLETA | — |
| `ImapAccountsSettings.tsx` | COMPLETA | Maior arquivo root (531 linhas) |
| `IntegrationKeysSection.tsx` | COMPLETA | — |
| `KeyboardShortcutsSettings.tsx` | COMPLETA | — |
| `LanguageSelector.tsx` | COMPLETA | forwardRef com ref não utilizado (_ref) — smell menor |
| `MarketingBudgets.tsx` | PARCIAL | Somente leitura; edição bloqueada por ausência de policies RLS de escrita (comentário CAMPANHAS-13 no código) |
| `MediaLibraryAdmin.tsx` | COMPLETA | Thin wrapper de 47 linhas |
| `MessagesSettings.tsx` | COMPLETA | — |
| `SLAConfigurationManager.tsx` | COMPLETA | — |
| `SLARulesManager.tsx` | COMPLETA | — |
| `SLASettings.tsx` | COMPLETA | Inclui "Modo Simulação" (mock data toggle) |
| `ScheduleSettings.tsx` | COMPLETA | — |
| `SettingsView.tsx` | COMPLETA | Hub com 22 abas; inclui skeleton detalhado no estado de loading |
| `SkillBasedRoutingSettings.tsx` | COMPLETA | — |
| `SoundCategoryCard.tsx` | COMPLETA | — |
| `SoundCustomizationPanel.tsx` | COMPLETA | — |
| `ThemeCustomizer.tsx` | COMPLETA | — |
| `WhatsAppModeSetting.tsx` | COMPLETA | Inclui re-migração e exibição de perfil de integração |
| `__tests__/MediaLibraryAdmin.test.tsx` | COMPLETA | Suite extensíssima (1929 linhas, 200+ casos) |
| `__tests__/SLAConfigurationManager.test.tsx` | COMPLETA | — |
| `__tests__/SLARulesManager.test.tsx` | COMPLETA | — |
| `ai-providers/AIProviderCard.tsx` | COMPLETA | — |
| `ai-providers/AIProviderFormDialog.tsx` | COMPLETA | — |
| `ai-providers/AIProviderHealthPanel.tsx` | COMPLETA | — |
| `ai-providers/types.ts` | COMPLETA | — |
| `media-library/AIGenerateDialog.tsx` | COMPLETA | — |
| `media-library/MediaAdminPanel.tsx` | COMPLETA | — |
| `media-library/MediaItemRow.tsx` | COMPLETA | — |
| `media-library/StatsCards.tsx` | COMPLETA | — |
| `sla/SLARuleFormDialog.tsx` | COMPLETA | — |
| `sla/SLARuleRow.tsx` | COMPLETA | — |
| `sla/ScopeRulesList.tsx` | COMPLETA | — |
| `sla/__tests__/sla-utils.test.ts` | COMPLETA | — |
| `sla/sla-utils.ts` | COMPLETA | Arquivo enxuto (34 linhas) |
| `theme/BorderRadiusControl.tsx` | COMPLETA | — |
| `theme/PresetCard.tsx` | COMPLETA | — |
| `theme/ThemeDebugTooltip.tsx` | COMPLETA | Renderização condicional por env (dev only) |
| `theme/__tests__/presets.test.ts` | COMPLETA | — |
| `theme/presets.ts` | COMPLETA | Arquivo denso (492 linhas) — define todos os presets de tema |
| `theme/useThemePreset.ts` | COMPLETA | — |

---

## 9. Achados

**A1 — Nenhum código verdadeiramente morto**: Os 37 arquivos classificados como ORFÃO (sem importadores externos ao próprio diretório) são TODOS ativos em runtime. Zero arquivos sem consumidor em nenhuma cadeia de importação. O módulo settings é saudável do ponto de vista de dead code.

**A2 — SLAConfigurationManager e SLARulesManager têm consumidores duplos**: Além de aparecerem na aba SLA do SettingsView, esses componentes são importados diretamente por `SLADashboard` (queues) e `SLAMetricsDashboard` (dashboard), o que os diferencia dos demais componentes da aba. São os únicos sub-componentes do módulo settings com consumidores fora de `src/pages/lazyViews.ts`.

**A3 — `theme/presets.ts` é o arquivo com maior alcance externo**: Importado por 3 arquivos fora de `settings/` (`ThemeInitializer.tsx`, `useUIManagement.ts` e `ThemeCustomizer.tsx`). Seu `DEFAULT_PRESET_ID` e `PRESETS` são usados para inicializar CSS vars no mount da aplicação — alterações têm impacto em toda a plataforma.

**A4 — `ai-providers/types.ts` é compartilhado fora do módulo**: Importado diretamente por `src/hooks/ai-providers/useAIProviders.ts`. Qualquer mudança no contrato de tipos afeta o hook e todos seus consumidores (NAO_VERIFICADO: quantos componentes usam o hook fora de settings/).

**A5 — `MarketingBudgets.tsx` tem edição bloqueada por ausência de RLS de escrita**: O comentário `CAMPANHAS-13` no código documenta que a tabela `marketing_budgets` tem apenas policies de SELECT para admin/supervisor. A edição requer nova migration com policies de INSERT/UPDATE. O componente está deliberadamente read-only.

**A6 — `AutomationSettings.tsx` documenta débito técnico no próprio código**: Um TODO extenso (linhas 20-27) registra que as tabelas `cron_schedules`, `cron_schedule_executions`, `task_queues` e `batch_jobs` existem no schema `zapp` mas não têm UI correspondente. A aba de Automações está incompleta em relação ao backend.

**A7 — `SettingsView.tsx` não importa `SLAConfigurationManager` nem `SLARulesManager` diretamente**: A aba SLA no SettingsView renderiza apenas `SLASettings` (thresholds globais simples). O `SLAConfigurationManager` e `SLARulesManager` são usados fora do SettingsView em painéis dedicados de SLA. Existe portanto uma duplicação conceitual: configurações de SLA estão em dois lugares (`/settings` tab e `/sla` dashboard).

**A8 — `__tests__/MediaLibraryAdmin.test.tsx` com 1929 linhas é o maior arquivo do diretório**: Suíte com 200+ casos de teste cobrindo renderização, loading, busca, upload, deleção, stats e edge cases. Isso sugere alta criticidade do componente MediaLibraryAdmin.

**A9 — `LanguageSelector.tsx` expõe forwardRef com ref não utilizado**: O componente usa `forwardRef<HTMLDivElement>` mas o parâmetro `_ref` não é aplicado em nenhum elemento DOM. O `forwardRef` parece vestigial — o componente não precisa expor ref para nenhum consumidor atual.

**A10 — `ConnectionAlertPreferences.tsx` é o único sub-componente do módulo importado diretamente por um componente de notificações** (`NotificationSettingsPanel`). Isso sugere que suas preferências de alerta de conexão têm relevância cross-feature (não apenas em settings).

---

## Rodapé

- **Branch**: `docs/estado-inventario`
- **Worktree**: `/workspace/estado-inventario`
- **Metodologia**: grep por padrão `from '@/components/settings/` em `src/` (excluindo o próprio diretório) + leitura direta de 54 arquivos via 3 agentes paralelos + leitura direta de 6 arquivos chave
- **Fontes confirmadas**: leitura direta de 100% dos 54 arquivos
- **Linhas totais verificadas**: ~11.275 (conforme informado na tarefa)
