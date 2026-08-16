# Estado: src/components/contacts — 50 arquivos

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 50/50

## 1. Visao Geral

Diretório central de CRM de contatos da plataforma ZAPP. Contém o orquestrador `ContactsRichView` (único ponto de entrada externo real), ~18 sub-componentes de UI, ~10 hooks locais, 2 utilitários de dados e 2 arquivos de teste. A biblioteca está **inflada**: 37 dos 50 arquivos têm zero importadores fora do diretório — todos encapsulados pelo `ContactsRichView`. Apenas 13 arquivos são consumidos diretamente por código externo.

| arquivo | linhas | o que faz | status_uso |
|---------|--------|-----------|------------|
| AuditLogPanel.tsx | 204 | Painel LGPD de log de auditoria de contato | EM_USO |
| CompaniesManagerDialog.tsx | 285 | CRUD dialog de empresas | EM_USO |
| CompanyLogo.tsx | 93 | Avatar/logo de empresa com fallback de iniciais | ORFAO |
| ConflictResolutionDialog.tsx | 105 | Resolução de edição concorrente | EM_USO |
| ContactAdvancedFilters.tsx | 197 | Filtros avançados com slider e badges | ORFAO |
| ContactAnalyticsDashboard.tsx | 280 | Dashboard analítico client-side (só props) | ORFAO |
| ContactBirthdayPanel.tsx | 135 | Painel de aniversariantes | ORFAO |
| ContactCard.tsx | 307 | Card com health, avatar, checkbox e menu | EM_USO |
| ContactCompanyField.tsx | 110 | Campo autocomplete de empresa | EM_USO |
| ContactConsentManager.tsx | 262 | Gerenciador de consentimento LGPD | EM_USO |
| ContactContentArea.tsx | 246 | Roteador de views (grid/list/kanban/map/analytics) | ORFAO |
| ContactDialogs.tsx | 181 | Agregador de dialogs de CRUD de contato | ORFAO |
| ContactEmptyState.tsx | 157 | Estado vazio animado com ações primárias | ORFAO |
| ContactExportDialog.tsx | 108 | Dialog de exportação CSV/XLSX | ORFAO |
| ContactFormV3.tsx | 342 | Formulário CRUD de contato (add/edit) | ORFAO |
| ContactGroupedList.tsx | 136 | Lista agrupada por empresa com collapse | ORFAO |
| ContactImportDialog.tsx | 392 | Dialog de importação CSV via Edge Function | ORFAO |
| ContactKanbanView.tsx | 207 | Kanban por tipo de contato com drag-and-drop | ORFAO |
| ContactListItem.tsx | 248 | Item de lista com health, tags e menu de ações | ORFAO |
| ContactMapView.tsx | 269 | "Mapa" por DDD — lista textual, sem lib de mapa | ORFAO |
| ContactMergeDialog.tsx | 426 | Fusão de dois contatos com seleção de campos | ORFAO |
| ContactPhoneManager.tsx | 266 | Gerenciador de múltiplos telefones com CRUD | EM_USO |
| ContactQuickView.tsx | 373 | Sheet lateral de visualização rápida | ORFAO |
| ContactRecycleBin.tsx | 225 | Lixeira com restauração via RPC | ORFAO |
| ContactSearchWithSuggestions.tsx | 200 | Busca com autocomplete e histórico local | ORFAO |
| ContactStatsCards.tsx | 216 | Cards de estatísticas calculadas client-side | ORFAO |
| ContactToolbar.tsx | 235 | Barra de ferramentas com filtros e ações bulk | ORFAO |
| ContactViewSwitcher.tsx | 88 | Seletor de modo de visualização (6 modos) | ORFAO |
| ContactsBulkActionBar.tsx | 107 | Barra flutuante de ações em massa | ORFAO |
| ContactsRichHeader.tsx | 134 | Cabeçalho da página com ações principais | ORFAO |
| ContactsRichTabs.tsx | 88 | Abas Todos/Duplicatas/Lixeira com contadores | ORFAO |
| ContactsRichView.tsx | 326 | Orquestrador principal (ponto de entrada externo) | EM_USO |
| ContactsShortcutHelp.tsx | 113 | Modal de atalhos de teclado | ORFAO |
| ContactsSkeleton.tsx | 141 | Skeleton loader de carregamento | ORFAO |
| ContactsTable.tsx | 466 | Tabela paginada com seleção e health | EM_USO |
| ContactsTableVirtual.tsx | 376 | Tabela virtualizada (@tanstack/react-virtual) | ORFAO |
| DuplicateContactsPanel.tsx | 303 | Painel de detecção e merge de duplicatas | ORFAO |
| FilterPresets.tsx | 154 | Filtros salvos em localStorage | EM_USO |
| HighlightText.tsx | 29 | Destaque de substring em resultado de busca | ORFAO |
| SegmentsManagerDialog.tsx | 296 | CRUD de segmentos (contact_segments) | EM_USO |
| __tests__/ExternalDataIntegration.test.tsx | 336 | Testes de hooks de dados externos | ORFAO |
| __tests__/contactExportFields.test.ts | 92 | Testes de funções de exportação CSV | ORFAO |
| contactExportFields.ts | 86 | Campos e funções para exportação CSV | ORFAO |
| contactTypeConfig.tsx | 89 | Mapa visual por tipo de contato (ícone, cor) | EM_USO |
| types.ts | 32 | Tipos locais Contact e ContactItemProps | EM_USO |
| useContactDuplicateDetector.ts | 156 | Hook de detecção de duplicatas por phone/email | ORFAO |
| useContactFormV3.ts | 262 | Hook de formulário com versionamento e merge | ORFAO |
| useContactsCRUD.ts | 234 | Hook de operações CRUD em contatos | ORFAO |
| useContactsKeyboardShortcuts.ts | 85 | Hook de atalhos de teclado globais (n, f, Esc, ?) | ORFAO |
| useContactsViewState.ts | 190 | Hook de estado da view (filtros, paginação, export) | ORFAO |

## 2. Fluxos funcionais

### Visualização de contatos
`ContactsRichView` → `ContactContentArea` → `ContactCard` / `ContactListItem` / `ContactsTable` / `ContactsTableVirtual` / `ContactKanbanView` / `ContactMapView` / `ContactAnalyticsDashboard` / `ContactRecycleBin` / `DuplicateContactsPanel`

### CRUD de contato
`ContactsRichView` → `ContactDialogs` → `ContactFormV3` → `useContactFormV3` → `useContactsCRUD` → `dbFrom('contacts')`
Edição concorrente: `useContactFormV3` → `ConflictResolutionDialog`
Versionamento: `useContactFormV3` → RPC `updateContactVersioned`

### Fusão de duplicatas
Detecção automática: `DuplicateContactsPanel` → RPCs `findDuplicateContacts` / `getDuplicateReport` / `mergeContacts` / `bulkAutoMergeDuplicates`
Merge manual: `ContactMergeDialog` → 3 UPDATEs sequenciais em `contacts`, `conversations`, `messages` (sem transação — ver A1)

### Importação / Exportação
Import: `ContactImportDialog` → `supabase.functions.invoke('contacts-import')`
Export: `ContactExportDialog` → `contactExportFields.ts` (`buildContactsCsv`) → download client-side

### LGPD e auditoria
`ContactConsentManager` → RPC `grant_lgpd_consent` / `revoke_lgpd_consent`
`AuditLogPanel` → `safeClient.from('contact_audit_log')`

### Segmentos e filtros
`SegmentsManagerDialog` → `useContactSegments` → `contact_segments`
`FilterPresets` → `localStorage` (sem persistência em banco)

### UX / atalhos
`ContactsRichView` → `useContactsKeyboardShortcuts` → `ContactsShortcutHelp`

## 3. Tabelas, RPCs, canais realtime e edge functions

### Tabelas (schema zapp)

| tabela | operação | via |
|--------|----------|-----|
| contacts | SELECT / INSERT / UPDATE / DELETE | useContactsCRUD, useContactFormV3, useContactDuplicateDetector |
| contact_audit_log | SELECT | AuditLogPanel (safeClient) |
| contact_segments | SELECT / INSERT / UPDATE / DELETE | SegmentsManagerDialog → useContactSegments |
| companies | SELECT | CompaniesManagerDialog, ContactCompanyField → useCompanies |
| conversations | UPDATE (reparent ao contato sobrevivente) | ContactMergeDialog |
| messages | UPDATE (reparent ao contato sobrevivente) | ContactMergeDialog |
| v_deleted_contacts (view) | SELECT | ContactRecycleBin |

### RPCs

| RPC | parâmetros principais | via |
|-----|-----------------------|-----|
| grant_lgpd_consent | p_contact_id, p_channel | ContactConsentManager |
| revoke_lgpd_consent | p_contact_id, p_channel | ContactConsentManager |
| restore_contact | p_contact_id | ContactRecycleBin |
| updateContactVersioned | — | useContactFormV3 |
| findDuplicateContacts | p_workspace_id | DuplicateContactsPanel |
| getDuplicateReport | p_instance_name | DuplicateContactsPanel |
| mergeContacts | — | DuplicateContactsPanel |
| bulkAutoMergeDuplicates | — | DuplicateContactsPanel |

### Edge Functions

| função | via |
|--------|-----|
| contacts-import | ContactImportDialog (`supabase.functions.invoke`) |

### Canais Realtime
Nenhum canal realtime encontrado neste diretório.

## 4. Exports Públicos por categoria

### Componentes reutilizados externamente
- `AuditLogPanel` — features/inbox
- `CompaniesManagerDialog` — components/crm360
- `ConflictResolutionDialog` — features/inbox
- `ContactCard` — features/inbox (3 importadores externos)
- `ContactCompanyField` — components/crm360
- `ContactConsentManager` — features/inbox
- `ContactPhoneManager` — features/inbox
- `ContactsRichView` — ExternalContact360Panel, lazyViews.ts
- `ContactsTable` — QueueContactsTable, QueueDetails
- `FilterPresets` — inbox (tipo + instância)
- `SegmentsManagerDialog` — ExternalContact360Panel

### Tipos exportados externamente
- `types.ts` → `Contact`, `ContactItemProps` — consumidos por `lib/contactHealth.ts`
- `contactTypeConfig.tsx` → config + `ContactTypeIcon` — consumido por `inbox/ContactHeaderSection`
- `ContactViewSwitcher.tsx` → `ContactViewMode` — consumido por `ContactsSkeleton` (interno)

### Utilitários de dados
- `contactExportFields.ts` → `buildContactsCsv`, `buildExportFileName`, `EXPORT_DEFAULT_KEYS` (uso interno)

## 5. Chama (Saida)

| categoria | dependência |
|-----------|-------------|
| DB/ORM | `@/integrations/datasource/db` (dbFrom, dbRpc), `@/integrations/supabase/client`, `@/integrations/supabase/safeClient` |
| Hooks externos | `@/hooks/contacts/useCompanies`, `@/hooks/contacts/useContactSegments`, `@/hooks/useExternalContact360Batch`, `@/hooks/useMountedRef`, `@/hooks/useRetryAndErrorPrevention`, `@/hooks/useActionFeedback`, `@/hooks/useContactsSearch` |
| Libs internas | `@/lib/contactHealth`, `@/lib/avatarColors`, `@/lib/sanitize`, `@/lib/logger`, `@/lib/phoneUtils`, `@/lib/csvUtils`, `@/lib/openContactInChat`, `@/lib/constants/whatsappInstances` |
| Serviços | `@/features/contacts/services/contactExportLogService` |
| UI | `@/components/ui/*` (shadcn/ui), `framer-motion`, `lucide-react`, `sonner` |
| 3rdparty | `@hello-pangea/dnd` (kanban), `@tanstack/react-virtual` (tabela virtual), `date-fns` |

## 6. Chamado Por (Entrada)

| arquivo | quem importa (externo ao diretório) | contagem |
|---------|-------------------------------------|---------|
| AuditLogPanel | features/inbox/.../EditContactDialog | 1 |
| CompaniesManagerDialog | components/crm360/CompanyFormDialog | 1 |
| ConflictResolutionDialog | features/inbox/.../EditContactDialog | 1 |
| ContactCard | inbox/AdvancedMessageMenu, inbox/useSafeInteractiveMessage, hooks/useEvolutionApiManagement | 3 |
| ContactCompanyField | components/crm360/CompanyFormDialog | 1 |
| ContactConsentManager | features/inbox/.../EditContactDialog | 1 |
| ContactPhoneManager | features/inbox/.../EditContactDialog | 1 |
| ContactsRichView | ExternalContact360Panel, lazyViews.ts | 2 |
| ContactsTable | QueueContactsTable, QueueDetails | 2 |
| FilterPresets | inbox/ConversationListSidebar, InboxFilterPresets (+ ContactToolbar interno) | 2 ext |
| SegmentsManagerDialog | ExternalContact360Panel (+ ContactsRichView interno) | 1 ext |
| contactTypeConfig | features/inbox/ContactHeaderSection | 1 |
| types | lib/contactHealth.ts | 1 |

## 7. Orfaos

37 arquivos sem importadores fora de `src/components/contacts/`. A grande maioria é encapsulamento legítimo do módulo; `ContactsRichView` funciona como ponto de entrada único (facade pattern). Candidatos reais a revisão: 3 arquivos.

| arquivo | linhas | veredito | motivo |
|---------|--------|----------|--------|
| CompanyLogo.tsx | 93 | SEGURO | 4 usos internos; encapsulamento legítimo |
| ContactAdvancedFilters.tsx | 197 | SEGURO | Subcomponente do toolbar |
| ContactAnalyticsDashboard.tsx | 280 | SEGURO | View do roteador |
| ContactBirthdayPanel.tsx | 135 | SEGURO | Subcomponente do header |
| ContactContentArea.tsx | 246 | SEGURO | Roteador central do módulo |
| ContactDialogs.tsx | 181 | SEGURO | Agregador de dialogs |
| ContactEmptyState.tsx | 157 | SEGURO | Estado vazio funcional |
| ContactExportDialog.tsx | 108 | SEGURO | Dialog funcional |
| ContactFormV3.tsx | 342 | SEGURO | Formulário principal |
| ContactGroupedList.tsx | 136 | SEGURO | Modo de visualização funcional |
| ContactImportDialog.tsx | 392 | SEGURO | Dialog de importação funcional |
| ContactKanbanView.tsx | 207 | VERIFICAR | Colunas hardcoded; usa dbFrom não-padrão; sem adoção externa |
| ContactListItem.tsx | 248 | SEGURO | 2 usos internos; funcional |
| ContactMapView.tsx | 269 | VERIFICAR | Nome enganoso (sem mapa real); implementação PARCIAL; candidato a renomear |
| ContactMergeDialog.tsx | 426 | NAO_REMOVER | Merge sem transação atômica (ver A1) — precisa de fix, não remoção |
| ContactQuickView.tsx | 373 | SEGURO | Sheet de visualização funcional |
| ContactRecycleBin.tsx | 225 | SEGURO | Lixeira funcional com RPC |
| ContactSearchWithSuggestions.tsx | 200 | SEGURO | Busca com autocomplete funcional |
| ContactStatsCards.tsx | 216 | SEGURO | Stats client-side funcional |
| ContactToolbar.tsx | 235 | SEGURO | Toolbar funcional |
| ContactViewSwitcher.tsx | 88 | SEGURO | Seletor de view; exporta tipo usado externamente |
| ContactsBulkActionBar.tsx | 107 | SEGURO | Ações bulk funcionais |
| ContactsRichHeader.tsx | 134 | SEGURO | Cabeçalho funcional |
| ContactsRichTabs.tsx | 88 | SEGURO | Abas de filtragem |
| ContactsShortcutHelp.tsx | 113 | SEGURO | Modal de ajuda |
| ContactsSkeleton.tsx | 141 | SEGURO | Loading state |
| ContactsTableVirtual.tsx | 376 | VERIFICAR | Alternativa virtualizada com baixa adoção; manutenção dupla com ContactsTable |
| DuplicateContactsPanel.tsx | 303 | SEGURO | Painel de duplicatas funcional |
| HighlightText.tsx | 29 | SEGURO | Utilitário tiny; 4 usos internos |
| contactExportFields.ts | 86 | SEGURO | 2 usos internos; lógica de exportação |
| useContactDuplicateDetector.ts | 156 | SEGURO | 2 usos internos; lógica coesa |
| useContactFormV3.ts | 262 | SEGURO | Hook central do formulário |
| useContactsCRUD.ts | 234 | SEGURO | Hook de CRUD central |
| useContactsKeyboardShortcuts.ts | 85 | SEGURO | Hook de atalhos |
| useContactsViewState.ts | 190 | SEGURO | Estado da view |
| __tests__/ExternalDataIntegration.test.tsx | 336 | SEGURO | Arquivo de teste; orphan por natureza |
| __tests__/contactExportFields.test.ts | 92 | SEGURO | Arquivo de teste; orphan por natureza |

## 8. Implementacao por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| AuditLogPanel.tsx | COMPLETA | — |
| CompaniesManagerDialog.tsx | COMPLETA | — |
| CompanyLogo.tsx | COMPLETA | — |
| ConflictResolutionDialog.tsx | COMPLETA | — |
| ContactAdvancedFilters.tsx | COMPLETA | — |
| ContactAnalyticsDashboard.tsx | COMPLETA | — |
| ContactBirthdayPanel.tsx | COMPLETA | — |
| ContactCard.tsx | COMPLETA | — |
| ContactCompanyField.tsx | COMPLETA | — |
| ContactConsentManager.tsx | COMPLETA | — |
| ContactContentArea.tsx | COMPLETA | — |
| ContactDialogs.tsx | COMPLETA | — |
| ContactEmptyState.tsx | COMPLETA | — |
| ContactExportDialog.tsx | COMPLETA | — |
| ContactFormV3.tsx | COMPLETA | — |
| ContactGroupedList.tsx | COMPLETA | — |
| ContactImportDialog.tsx | COMPLETA | — |
| ContactKanbanView.tsx | COMPLETA | Colunas dinâmicas por workspace; padrão de DB canônico |
| ContactListItem.tsx | COMPLETA | — |
| ContactMapView.tsx | PARCIAL | Mapa visual real (leaflet/mapbox); hoje apenas lista textual por DDD |
| ContactMergeDialog.tsx | COMPLETA | — |
| ContactPhoneManager.tsx | COMPLETA | — |
| ContactQuickView.tsx | COMPLETA | — |
| ContactRecycleBin.tsx | COMPLETA | — |
| ContactSearchWithSuggestions.tsx | COMPLETA | — |
| ContactStatsCards.tsx | COMPLETA | — |
| ContactToolbar.tsx | COMPLETA | — |
| ContactViewSwitcher.tsx | COMPLETA | — |
| ContactsBulkActionBar.tsx | COMPLETA | — |
| ContactsRichHeader.tsx | COMPLETA | — |
| ContactsRichTabs.tsx | COMPLETA | — |
| ContactsRichView.tsx | COMPLETA | — |
| ContactsShortcutHelp.tsx | COMPLETA | — |
| ContactsSkeleton.tsx | COMPLETA | — |
| ContactsTable.tsx | COMPLETA | — |
| ContactsTableVirtual.tsx | COMPLETA | — |
| DuplicateContactsPanel.tsx | COMPLETA | — |
| FilterPresets.tsx | PARCIAL | Persistência em banco (hoje só localStorage; perde ao trocar dispositivo/browser) |
| HighlightText.tsx | COMPLETA | — |
| SegmentsManagerDialog.tsx | COMPLETA | — |
| __tests__/ExternalDataIntegration.test.tsx | COMPLETA | — |
| __tests__/contactExportFields.test.ts | COMPLETA | — |
| contactExportFields.ts | COMPLETA | — |
| contactTypeConfig.tsx | COMPLETA | — |
| types.ts | COMPLETA | — |
| useContactDuplicateDetector.ts | COMPLETA | — |
| useContactFormV3.ts | COMPLETA | — |
| useContactsCRUD.ts | COMPLETA | — |
| useContactsKeyboardShortcuts.ts | COMPLETA | — |
| useContactsViewState.ts | COMPLETA | — |

## 9. Achados

### A1 — Merge de contatos sem transação atômica (risco de inconsistência)
`ContactMergeDialog.tsx:276–288` — Executa 3 UPDATEs sequenciais em `contacts`, `conversations` e `messages` sem RPC ou transação de banco. Uma falha no segundo ou terceiro UPDATE deixa dados parcialmente migrados e inconsistentes. O `DuplicateContactsPanel` usa RPC `mergeContacts` (correto); há assimetria de padrão entre os dois fluxos de merge.

### A2 — FilterPresets: duplicata com InboxFilterPresets e persistência assimétrica
`FilterPresets.tsx:32–37` — Presets salvos somente em `localStorage` (chave `'contact-filter-presets'`). Existe `InboxFilterPresets` no inbox com a mesma responsabilidade persistindo em banco via hook. Duas implementações divergentes do mesmo conceito; a versão de contacts perde dados ao trocar dispositivo.

### A3 — SegmentsManagerDialog: RLS pode estar bloqueando INSERT/UPDATE silenciosamente
`SegmentsManagerDialog.tsx:64,95,117` — Três pontos de tratamento de erro com mensagem hardcoded `'RLS só permite SELECT em contact_segments'`. Indica que a policy da tabela `zapp.contact_segments` pode estar rejeitando mutações em produção, tornando a UI de criação/edição de segmentos silenciosamente inoperante.

### A4 — Tipo `Contact` redefinido em dois arquivos do mesmo diretório
`types.ts:1` vs `useContactsCRUD.ts:31` — Dois tipos `Contact` distintos (campos diferentes) convivem no mesmo diretório. Ambíguo ao import e pode causar erros silenciosos de tipagem em consumers.

### A5 — contactExportFields.ts: Invalid Date silencioso no CSV exportado
`contactExportFields.ts:61` — `format(new Date(contact.created_at), 'dd/MM/yyyy', { locale: ptBR })` sem guard para `null`/`undefined`. Contatos sem data de criação geram a string `"Invalid Date"` no CSV sem nenhum aviso ao usuário.

### A6 — DuplicateContactsPanel: parâmetro inconsistente entre RPCs do mesmo domínio
`DuplicateContactsPanel.tsx:62–63` — Passa `p_workspace_id: instanceName` para `findDuplicateContacts` mas `p_instance_name: instanceName` para `getDuplicateReport`. Nomes de parâmetro diferentes para o mesmo valor; um dos dois provavelmente está errado.

### A7 — ContactMapView: nome enganoso, funcionalidade PARCIAL
`ContactMapView.tsx:1` — Agrupa contatos por DDD extraído do telefone e exibe como lista textual por região. Não usa nenhuma lib de mapas (leaflet, mapbox, google). O nome "MapView" cria expectativa falsa de mapa visual. Linha ~223: `members.slice(0, 20)` oculta contatos excedentes sem feedback visual.

### A8 — ContactKanbanView: colunas hardcoded e padrão de DB inconsistente
`ContactKanbanView.tsx:34–38` — Colunas `['lead','prospect','cliente','parceiro']` hardcoded sem configuração por workspace. Linha 15: usa `dbFrom` de `@/integrations/datasource/db` em vez do cliente Supabase canônico — inconsistência com o padrão do projeto.

### A9 — ContactsTableVirtual: implementação paralela com baixa adoção
`ContactsTableVirtual.tsx:1` — 376 linhas de tabela virtualizada importada apenas por `ContactContentArea` (interno). `ContactsTable` (466 linhas, não-virtual) é importada por 2 páginas externas adicionais. Dois caminhos paralelos com manutenção duplicada sem vantagem clara de adoção.

### A10 — ContactsRichHeader: callbacks sem guard podem ser silenciosos
`ContactsRichHeader.tsx` — Props `onOpenSegments`, `onOpenShortcuts` e `onToggleHighContrast` sem `defaultProps` nem guards. Se o pai não passar, os botões correspondentes não fazem nada sem feedback ao usuário.

### A11 — useContactFormV3: acoplamento cruzado elevado com componentes de UI
`useContactFormV3.ts:7–9` — Hook importa tipos de 3 componentes irmãos (`ContactConsentManager`, `ContactMergeDialog`, `ConflictResolutionDialog`). Inversão de dependência: hook dependendo de tipos dos componentes que deveriam depender dele.

### A12 — ContactAnalyticsDashboard: thresholds de saúde hardcoded
`ContactAnalyticsDashboard.tsx:82,93,104` — Limiares de saúde (5%, 30%, 20%) são literais sem constante nomeada ou configuração externa. Difícil de encontrar e ajustar.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
