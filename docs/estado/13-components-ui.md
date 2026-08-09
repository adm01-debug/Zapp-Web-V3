# Estado: components/ui — Biblioteca de Primitivos de UI

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 98/98

## 1. Visão Geral

Este documento cobre o diretório `src/components/ui/` — a biblioteca de primitivos de UI da plataforma ZAPP-WEB. São 98 arquivos totalizando ~10.361 linhas. O diretório mistura componentes shadcn/ui (primitivos Radix UI), componentes customizados de higher-level, submódulos organizados (`motion/`, `micro-interactions/`, `sidebar/`, `empty-states/`, `stories/`, `__tests__/`), além de ficheiros de conveniência/barrel.

**Objetivo central desta auditoria:** separar EM_USO de ORFAO — identificar primitivos inflados que podem ser removidos sem risco.

### Tabela de Arquivos por Categoria

| arquivo | linhas | o que faz em 1 linha | status |
|---------|--------|----------------------|--------|
| **Raiz — shadcn/ui stdlib** | | | |
| `accordion.tsx` | ~85 | Accordion Radix UI com AnimatePresence de abertura | EM_USO |
| `alert-dialog.tsx` | ~145 | Dialog de alerta destrutivo com overlay Radix UI | EM_USO |
| `alert.tsx` | ~50 | Componente Alert com variantes default/destructive/warning via CVA | EM_USO |
| `avatar.tsx` | ~60 | Avatar com fallback de iniciais Radix UI | EM_USO |
| `badge.tsx` | 39 | Badge com variantes de cor via CVA (361 importadores) | EM_USO |
| `breadcrumb.tsx` | ~110 | Breadcrumb semântico com separador e ellipsis | EM_USO |
| `button.tsx` | 117 | Button shadcn/ui + CVA (487 importadores — mais usado do projeto) | EM_USO |
| `calendar.tsx` | ~280 | Calendário com react-day-picker e estilos Tailwind | EM_USO |
| `card.tsx` | 104 | Card shadcn/ui com Header, Content, Footer, Title, Description (325 importadores) | EM_USO |
| `chart.tsx` | ~350 | Wrapper Recharts com ChartContainer, ChartTooltip, ChartLegend e helpers | EM_USO |
| `checkbox.tsx` | ~35 | Checkbox Radix UI com animação de check | EM_USO |
| `collapsible.tsx` | ~25 | Collapsible Radix UI com Trigger e Content | EM_USO |
| `command.tsx` | ~160 | Command palette base (cmdk) com CommandGroup, CommandItem, CommandInput | EM_USO |
| `context-menu.tsx` | ~200 | ContextMenu Radix UI completo (Item, Sub, Radio, Checkbox, Separator) | EM_USO |
| `dialog.tsx` | 151 | Dialog shadcn/ui com Header, Footer, Title, Description (115 importadores) | EM_USO |
| `dropdown-menu.tsx` | ~210 | DropdownMenu Radix UI completo (Sub, Radio, Checkbox, Separator, Shortcut) | EM_USO |
| `form.tsx` | 132 | Wrapper react-hook-form: Form, FormField, FormItem, FormLabel, FormControl, FormMessage | EM_USO |
| `hover-card.tsx` | 28 | HoverCard Radix UI com Trigger e Content animados | **ORFAO** |
| `input.tsx` | 85 | Input shadcn/ui estendido com CVA (variants/sizes), ícones esquerda/direita, states (196 importadores) | EM_USO |
| `label.tsx` | 18 | Label Radix UI minimalista com CVA (136 importadores) | EM_USO |
| `menubar.tsx` | 208 | Menubar completo Radix UI (16 exports: Menu, Trigger, Content, Item, Sub, etc.) | **ORFAO** |
| `pagination.tsx` | 82 | Componente Pagination com Previous/Next/Links e acessibilidade | **ORFAO** |
| `phone-input.tsx` | ~190 | Input de telefone com seletor de país (react-phone-number-input) | EM_USO |
| `popover.tsx` | ~70 | Popover Radix UI com Trigger e Content (100+ importadores) | EM_USO |
| `progress.tsx` | ~30 | Progress bar Radix UI animada | EM_USO |
| `radio-group.tsx` | ~60 | RadioGroup Radix UI com RadioGroupItem e indicador animado | EM_USO |
| `resizable.tsx` | ~55 | Painel redimensionável (react-resizable-panels) com handle visual | EM_USO |
| `scroll-area.tsx` | ~60 | ScrollArea Radix UI customizado (100+ importadores) | EM_USO |
| `select.tsx` | ~165 | Select Radix UI completo com Group, Item, Separator (120+ importadores) | EM_USO |
| `separator.tsx` | ~30 | Separator Radix UI horizontal/vertical | EM_USO |
| `sheet.tsx` | ~140 | Sheet shadcn/ui (drawer lateral) com variantes de lado via CVA | EM_USO |
| `skeleton.tsx` | ~20 | Skeleton de carregamento via pulse animation (90+ importadores) | EM_USO |
| `slider.tsx` | ~40 | Slider Radix UI para inputs de range | EM_USO |
| `sonner.tsx` | ~30 | Toaster sonner montado com tema system e offset de posição | EM_USO |
| `switch.tsx` | ~60 | Switch Radix UI (toggle on/off) com animação de thumb | EM_USO |
| `table.tsx` | ~120 | Table shadcn/ui (Table, Header, Body, Row, Head, Cell, Caption) | EM_USO |
| `tabs.tsx` | ~60 | Tabs Radix UI com TabsList, TabsTrigger, TabsContent | EM_USO |
| `textarea.tsx` | ~30 | Textarea shadcn/ui com variante auto-resize | EM_USO |
| `toast.tsx` | ~135 | Toast shadcn/ui (Action, Close, Title, Description, Viewport, Provider) | EM_USO |
| `toaster.tsx` | ~35 | Toaster shadcn/ui montado em App.tsx com mapToast | EM_USO |
| `toggle-group.tsx` | ~60 | ToggleGroup Radix UI com ToggleGroupItem | EM_USO |
| `toggle.tsx` | ~55 | Toggle Radix UI com variantes outline/default via CVA | EM_USO |
| `tooltip.tsx` | 132 | Tooltip Radix UI com Provider, Trigger, Content + arrow (96+ importadores) | EM_USO |
| `visually-hidden.tsx` | ~25 | VisuallyHidden Radix UI para acessibilidade (screen readers) | EM_USO |
| **Raiz — componentes custom** | | | |
| `EmptyState.tsx` | ~120 | EmptyState simples com ícone, título, descrição e ação opcional | EM_USO |
| `GenericEmptyState.tsx` | ~89 | EmptyState genérico com variantes de tamanho e ícone Lucide | EM_USO |
| `SkeletonList.tsx` | ~150 | Lista de skeletons parametrizada por count/height | **ORFAO** |
| `UnifiedEmptyState.tsx` | ~429 | EmptyState unificado com ilustrações SVG, variantes e ações; exporta `EmptyState` (conflito de nome) | **ORFAO** |
| `accessible-toast.tsx` | ~206 | Sistema de toast alternativo com aria-live e acessibilidade aprimorada (não montado) | **ORFAO** |
| `command-palette-data.tsx` | ~180 | Dados estáticos de comandos da palette (atalhos, categorias, ações) | EM_USO |
| `command-palette.tsx` | ~290 | Command palette global com busca, navegação por teclado e atalho Cmd+K | EM_USO |
| `contextual-empty-states.tsx` | ~80 | Barrel de re-exportação dos convenience components de empty-states/ (TagsEmptyState, AgentsEmptyState, etc.) | EM_USO |
| `emoji-picker.tsx` | 334 | Seletor de emoji com busca, categorias, recentes (localStorage) e FloatingReaction | EM_USO |
| `empty-state-illustrations.tsx` | 176 | Mapa de SVGs animados para 14 contextos de estado vazio (usado por empty-state.tsx) | EM_USO |
| `empty-state.tsx` | 152 | EmptyState com ilustração SVG opcional e variantes xs/sm/md/lg | EM_USO |
| `empty-states.tsx` | 20 | Barrel quebrado: re-exporta de `./UnifiedEmptyState` (que existe mas os consumidores usam empty-states/index.ts) | EM_USO |
| `error-boundary-retry.tsx` | 140 | ErrorBoundary com retry exponential backoff (maxAutoRetries) + botão manual | EM_USO |
| `icon-button.tsx` | 153 | IconButton + MotionIconButton com CVA, tooltip integrado e suporte asChild | EM_USO |
| `mobile-components.tsx` | 256 | MobileDrawer, BottomNavigation, PullToRefresh, TouchFeedback (framer-motion) | EM_USO |
| `motion.tsx` | 15 | Arquivo DEPRECATED: re-exporta tudo de ./motion/index para compatibilidade retroativa | EM_USO |
| `offline-indicator.tsx` | ~110 | Banner de indicador offline com polling de conectividade | EM_USO |
| `quick-peek.tsx` | ~200 | Componente de preview rápido (hover card estendido) com conteúdo lazy | EM_USO |
| `route-loading-bar.tsx` | ~140 | Barra de progresso de carregamento de rotas (framer-motion) | EM_USO |
| `scroll-to-top.tsx` | ~85 | Botão flutuante de scroll-to-top com threshold de visibilidade | EM_USO |
| `section-error-boundary.tsx` | ~120 | ErrorBoundary de seção com fallback inline (não full-page) | EM_USO |
| `skip-link.tsx` | ~35 | Link de skip navigation para acessibilidade (ativa em App.tsx) | EM_USO |
| `sparkline.tsx` | ~180 | Mini gráfico sparkline com Recharts/SVG inline para dashboards | EM_USO |
| `step-progress.tsx` | ~210 | Indicador de progresso por etapas com estados completed/active/pending | EM_USO |
| `supabase-connectivity-banner.tsx` | 107 | Banner de status da conectividade Supabase via useSupabaseConnectivity hook | EM_USO |
| `use-toast.ts` | 4 | Re-export de @/hooks/use-toast — 0 importadores externos (todos usam o hook diretamente) | **ORFAO** |
| **Módulo motion/** | | | |
| `motion/__tests__/variants.test.ts` | 234 | Suite Vitest para os 10 variants de animação; valida hidden/visible/exit, stagger, blur neon | EM_USO |
| `motion/components.tsx` | 138 | PageTransition, NeonPageReveal, MotionCard, MotionButton, StaggeredList, MotionFadeIn, MotionSlideUp, MotionScale, SkeletonShimmer | EM_USO |
| `motion/effects.tsx` | 258 | AnimatedCounter, AnimatedProgress, Presence, StaggerContainerEnhanced, SlideTransition, HoverScale, AnimatedList, Typewriter | EM_USO |
| `motion/index.ts` | 37 | Barrel canônico: re-exporta variants + components + effects + AnimatePresence/motion do framer-motion | EM_USO |
| `motion/variants.ts` | 69 | 10 objetos de variantes framer-motion (fadeInUp, neonReveal, staggerContainer…) | **ORFAO** |
| **Módulo micro-interactions/** | | | |
| `micro-interactions.tsx` | 7 | Barrel de re-exportação de todos os sub-módulos de micro-interactions | EM_USO |
| `micro-interactions/buttons.tsx` | 294 | RippleButton, InteractiveIconButton, BounceTapButton, MagneticButton, GlowButton, PressFeedback | EM_USO |
| `micro-interactions/feedback.tsx` | 86 | MicroFeedback, LoadingDots, SpinnerGlow, FeedbackAnimation | EM_USO |
| `micro-interactions/skeletons.tsx` | 107 | SkeletonPulse, ContentSkeleton (tipos: card/list-item/message/avatar/stat) | EM_USO |
| **Módulo sidebar/** | | | |
| `sidebar.tsx` | ~810 | Sidebar shadcn/ui completo (140+ linhas de tipos, Provider, Rail, Inset, Toggle, etc.) | EM_USO |
| `sidebar/index.ts` | ~20 | Barrel do módulo sidebar/ | EM_USO |
| `sidebar/sidebar-context.tsx` | ~120 | SidebarContext, useSidebar hook, estado do drawer e persistência | EM_USO |
| `sidebar/sidebar-menu.tsx` | ~260 | SidebarMenu, SidebarMenuButton, SidebarMenuSkeleton, SidebarMenuSub | EM_USO |
| `sidebar/sidebar-primitives.tsx` | ~110 | SidebarHeader, SidebarFooter, SidebarContent, SidebarGroup, SidebarSeparator | EM_USO |
| **Módulo empty-states/** | | | |
| `empty-states/ContextualEmptyState.tsx` | 86 | Componente contextual com ícone animado, título/descrição dinâmicos e até 3 ações | EM_USO |
| `empty-states/ConvenienceExports.tsx` | 46 | Wrappers pré-configurados: InboxEmptyState, ContactsEmptyState, AgentsEmptyState, etc. | EM_USO |
| `empty-states/contextConfigs.tsx` | 85 | Mapa de configs (ícone, título, descrição, ações) para cada contexto | EM_USO |
| `empty-states/index.ts` | 58 | Barrel público do módulo: re-exporta EmptyState + contextConfigs + ContextualEmptyState + conveniences | EM_USO |
| **Módulo stories/** | | | |
| `stories/Button.stories.tsx` | 139 | Stories Storybook para Button (sem .storybook/config no repo) | **ORFAO** |
| `stories/Card.stories.tsx` | 158 | Stories Storybook para Card | **ORFAO** |
| `stories/Input.stories.tsx` | 119 | Stories Storybook para Input | **ORFAO** |
| `stories/Introduction.stories.tsx` | 120 | Story introductória do Storybook | **ORFAO** |
| `stories/Link.stories.tsx` | 127 | Stories Storybook para Link | **ORFAO** |
| `stories/dialog.stories.tsx` | 45 | Stories Storybook para Dialog | **ORFAO** |
| `stories/select.stories.tsx` | 43 | Stories Storybook para Select | **ORFAO** |
| `stories/textarea.stories.tsx` | 46 | Stories Storybook para Textarea | **ORFAO** |
| `stories/tooltip.stories.tsx` | 35 | Stories Storybook para Tooltip | **ORFAO** |
| **Módulo __tests__/** | | | |
| `__tests__/button.test.tsx` | 44 | Testes unitários de variantes, disabled e asChild do Button | EM_USO |

---

## 2. Fluxos Funcionais de UI

### Sistema de notificação
`App.tsx` → monta `sonner.tsx` (Toaster principal) + `toaster.tsx` (Toaster legado shadcn/ui) + ignora `accessible-toast.tsx` (nunca montado) + ignora `use-toast.ts` (todos os consumidores importam `@/hooks/use-toast` diretamente).

### Command Palette global
`AppLayout.tsx` (ou equivalente) → `command-palette.tsx` → `command-palette-data.tsx` (dados/atalhos) → `command.tsx` (base cmdk) → Atalho Cmd+K via `@/hooks/useCommandPalette`.

### Sistema de Empty States (multi-camada — COMPLEXO)
Existem **4 sistemas paralelos** de empty state:
1. `EmptyState.tsx` — componente simples direto
2. `GenericEmptyState.tsx` — variante genérica com Lucide
3. `empty-state.tsx` — com ilustrações SVG (`empty-state-illustrations.tsx`)
4. `empty-states/` — sistema contextual completo (ContextualEmptyState + ConvenienceExports)
5. `UnifiedEmptyState.tsx` + `empty-states.tsx` — sistema órfão nunca consumido

### Animações e Motion
`src/features/inbox/components/*` (44 arquivos) → `@/components/ui/motion` (resolve para `motion/index.ts` ou `motion.tsx` deprecated) → `motion/components.tsx` + `motion/effects.tsx` + `motion/variants.ts` (os variants são usados apenas pelos tests e pelos próprios components.tsx/effects.tsx — não diretamente por consumidores externos).

### Mobile Shell
`MobileShell.tsx` → `mobile-components.tsx` (MobileDrawer + BottomNavigation + PullToRefresh)

### Supabase Connectivity
`AppLayout.tsx` ou `_shared` → `supabase-connectivity-banner.tsx` → `useSupabaseConnectivity` (hook de polling)

### Sidebar da Aplicação
`AppLayout.tsx` → `sidebar.tsx` → `sidebar/sidebar-context.tsx` + `sidebar/sidebar-menu.tsx` + `sidebar/sidebar-primitives.tsx`

### Auth (micro-interactions)
`src/pages/Auth.tsx` → `micro-interactions.tsx` → `micro-interactions/buttons.tsx` (RippleButton) + `micro-interactions/feedback.tsx` (SpinnerGlow/LoadingDots) + `micro-interactions/skeletons.tsx`

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

### 3.1 Tabelas via `.from()`

Nenhuma tabela Supabase é consultada diretamente pelos primitivos de UI (correta separação de responsabilidades). `supabase-connectivity-banner.tsx` usa o hook `useSupabaseConnectivity` que internamente faz polling — a tabela consultada está no hook, não no componente.

### 3.2 RPCs via `.rpc()`

Nenhuma.

### 3.3 Canais Realtime

Nenhum — os primitivos de UI não subscrevem canais Realtime diretamente.

### 3.4 Edge Functions e APIs Externas

Nenhuma — os primitivos de UI não invocam Edge Functions diretamente.

---

## 4. Exports Públicos

| módulo | exports principais |
|--------|-------------------|
| `button.tsx` | `Button`, `buttonVariants` |
| `input.tsx` | `Input`, `inputVariants` |
| `badge.tsx` | `Badge`, `badgeVariants` |
| `card.tsx` | `Card`, `CardHeader`, `CardContent`, `CardFooter`, `CardTitle`, `CardDescription` |
| `dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose` |
| `tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` |
| `select.tsx` | `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`, `SelectValue` |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent` |
| `scroll-area.tsx` | `ScrollArea`, `ScrollBar` |
| `skeleton.tsx` | `Skeleton` |
| `form.tsx` | `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField` |
| `toast.tsx` | `Toast`, `ToastAction`, `ToastClose`, `ToastDescription`, `ToastProvider`, `ToastTitle`, `ToastViewport` |
| `toaster.tsx` | `Toaster` |
| `sonner.tsx` | `Toaster` (sonner — alias diferente) |
| `sidebar.tsx` | `Sidebar`, `SidebarProvider`, `SidebarTrigger`, `SidebarRail`, `SidebarInset`, `useSidebar` |
| `emoji-picker.tsx` | `EmojiPicker`, `QuickReactionPicker`, `FloatingReaction` |
| `empty-state.tsx` | `EmptyState` |
| `empty-states/index.ts` | `EmptyState`, `ContextualEmptyState`, `contextConfigs`, `InboxEmptyState`, `ContactsEmptyState`, `AgentsEmptyState`, `TagsEmptyState`, `SearchEmptyState`, `DashboardEmptyState`, `NotificationsEmptyState`, `TranscriptionsEmptyState`, `QueuesEmptyState` |
| `motion/index.ts` | `fadeInUp`, `fadeIn`, `scaleIn`, `slideInRight`, `slideInLeft`, `staggerContainer`, `staggerItem`, `neonReveal`, `staggeredNeonContainer`, `staggeredNeonItem`, `PageTransition`, `NeonPageReveal`, `MotionCard`, `MotionButton`, `StaggeredList`, `StaggeredItem`, `MotionFadeIn`, `MotionSlideUp`, `MotionScale`, `MotionInteractive`, `SkeletonShimmer`, `AnimatedCounter`, `AnimatedProgress`, `Presence`, `StaggerContainerEnhanced`, `SlideTransition`, `HoverScale`, `AnimatedList`, `AnimatedListItem`, `Typewriter`, `AnimatePresence`, `motion` |
| `micro-interactions.tsx` | `RippleButton`, `InteractiveIconButton`, `BounceTapButton`, `MagneticButton`, `GlowButton`, `PressFeedback`, `MicroFeedback`, `LoadingDots`, `SpinnerGlow`, `FeedbackAnimation`, `SkeletonPulse`, `ContentSkeleton` |
| `mobile-components.tsx` | `MobileDrawer`, `BottomNavigation`, `PullToRefresh`, `TouchFeedback` |
| `icon-button.tsx` | `IconButton`, `MotionIconButton`, `iconButtonVariants` |
| `command-palette.tsx` | `CommandPalette` |
| `error-boundary-retry.tsx` | `ErrorBoundaryWithRetry` |
| `supabase-connectivity-banner.tsx` | `SupabaseConnectivityBanner` |

---

## 5. Chama (Saída)

Dependências externas consumidas pelos primitivos de `src/components/ui/`:

| dependência | quem usa |
|-------------|----------|
| `@radix-ui/*` (accordion, alert-dialog, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, label, menubar, popover, progress, radio-group, scroll-area, select, separator, sheet, slider, switch, tabs, toggle, toggle-group, tooltip) | ~35 primitivos shadcn/ui |
| `class-variance-authority` (CVA) | `button`, `input`, `badge`, `alert`, `icon-button`, `sidebar`, `sheet`, `tabs`, `toggle` |
| `clsx` + `tailwind-merge` (via `cn()`) | todos os primitivos |
| `framer-motion` | `motion/*`, `micro-interactions/*`, `emoji-picker`, `empty-states/ContextualEmptyState`, `mobile-components`, `route-loading-bar`, `command-palette` |
| `sonner` | `sonner.tsx` |
| `react-hook-form` | `form.tsx` |
| `recharts` | `chart.tsx`, `sparkline.tsx` |
| `react-day-picker` | `calendar.tsx` |
| `cmdk` | `command.tsx` |
| `react-phone-number-input` | `phone-input.tsx` |
| `react-resizable-panels` | `resizable.tsx` |
| `lucide-react` | `GenericEmptyState`, `empty-state`, `empty-states/*`, `command-palette`, `icon-button`, `sidebar/*`, `pagination`, `scroll-to-top`, `skip-link` |
| `@/integrations/supabase/client` | `supabase-connectivity-banner.tsx` (via hook) |
| `@/hooks/useSupabaseConnectivity` | `supabase-connectivity-banner.tsx` |
| `@/hooks/use-toast` | `toaster.tsx` |
| `@/lib/utils` (`cn()`) | todos os primitivos |

---

## 6. Chamado Por (Entrada)

Componentes mais consumidos da biblioteca (top 15 por número de importadores):

| componente | importadores (aprox.) | principais consumidores |
|------------|----------------------|------------------------|
| `button.tsx` | **487** | toda a aplicação |
| `badge.tsx` | **361** | toda a aplicação |
| `card.tsx` | **325** | dashboards, settings, modais |
| `input.tsx` | **196** | formulários, filtros, search |
| `label.tsx` | **136** | formulários |
| `select.tsx` | **120+** | filtros, configurações |
| `scroll-area.tsx` | **100+** | listas, drawers, sidebars |
| `popover.tsx` | **100+** | pickers, menus contextuais |
| `skeleton.tsx` | **90+** | loading states |
| `dialog.tsx` | **115** | toda a aplicação |
| `tooltip.tsx` | **96+** | ícones, botões, badges |
| `motion/*` | **44** | features/inbox/components |
| `dropdown-menu.tsx` | ~50 | menus de contexto, actions |
| `tabs.tsx` | ~45 | painéis multi-aba |
| `avatar.tsx` | ~40 | perfis, agentes, contatos |

Componentes com apenas 1 importador externo (baixa cobertura):
- `error-boundary-retry.tsx` → `ViewRouter.tsx`
- `icon-button.tsx` → `MobileDrawerMenu.tsx`
- `micro-interactions/*` → `Auth.tsx` (via barrel)

---

## 7. Implementação por Arquivo

| arquivo | status | observação |
|---------|--------|------------|
| `EmptyState.tsx` | COMPLETA | — |
| `GenericEmptyState.tsx` | COMPLETA | — |
| `SkeletonList.tsx` | COMPLETA | ORFAO — pode ser removido |
| `UnifiedEmptyState.tsx` | COMPLETA | ORFAO — exporta nome conflitante `EmptyState` |
| `__tests__/button.test.tsx` | COMPLETA | — |
| `accessible-toast.tsx` | COMPLETA | ORFAO — nunca montado; não tem consumer |
| `accordion.tsx` | COMPLETA | — |
| `alert-dialog.tsx` | COMPLETA | — |
| `alert.tsx` | COMPLETA | — |
| `avatar.tsx` | COMPLETA | — |
| `badge.tsx` | COMPLETA | — |
| `breadcrumb.tsx` | COMPLETA | — |
| `button.tsx` | COMPLETA | — |
| `calendar.tsx` | COMPLETA | — |
| `card.tsx` | COMPLETA | — |
| `chart.tsx` | COMPLETA | — |
| `checkbox.tsx` | COMPLETA | — |
| `collapsible.tsx` | COMPLETA | — |
| `command-palette-data.tsx` | COMPLETA | — |
| `command-palette.tsx` | COMPLETA | — |
| `command.tsx` | COMPLETA | — |
| `context-menu.tsx` | COMPLETA | — |
| `contextual-empty-states.tsx` | COMPLETA | — |
| `dialog.tsx` | COMPLETA | — |
| `dropdown-menu.tsx` | COMPLETA | — |
| `emoji-picker.tsx` | COMPLETA | Usa localStorage para emojis recentes |
| `empty-state-illustrations.tsx` | COMPLETA | Usado internamente por empty-state.tsx |
| `empty-state.tsx` | COMPLETA | — |
| `empty-states.tsx` | PARCIAL | Barrel quebrado: re-exporta de UnifiedEmptyState mas consumidores usam empty-states/index.ts |
| `empty-states/ContextualEmptyState.tsx` | COMPLETA | — |
| `empty-states/ConvenienceExports.tsx` | COMPLETA | Consumidores chegam via contextual-empty-states.tsx, não via este barrel |
| `empty-states/contextConfigs.tsx` | COMPLETA | Usado apenas internamente por ContextualEmptyState |
| `empty-states/index.ts` | COMPLETA | — |
| `error-boundary-retry.tsx` | COMPLETA | — |
| `form.tsx` | COMPLETA | — |
| `hover-card.tsx` | COMPLETA | ORFAO — zero importadores |
| `icon-button.tsx` | COMPLETA | — |
| `input.tsx` | COMPLETA | — |
| `label.tsx` | COMPLETA | — |
| `menubar.tsx` | COMPLETA | ORFAO — zero importadores |
| `micro-interactions.tsx` | COMPLETA | — |
| `micro-interactions/buttons.tsx` | COMPLETA | — |
| `micro-interactions/feedback.tsx` | COMPLETA | — |
| `micro-interactions/skeletons.tsx` | COMPLETA | — |
| `mobile-components.tsx` | COMPLETA | — |
| `motion.tsx` | COMPLETA | DEPRECATED — pode ser removido após migrar imports para motion/ |
| `motion/__tests__/variants.test.ts` | COMPLETA | — |
| `motion/components.tsx` | COMPLETA | — |
| `motion/effects.tsx` | COMPLETA | — |
| `motion/index.ts` | COMPLETA | — |
| `motion/variants.ts` | COMPLETA | ORFAO — nenhum consumidor externo usa variants diretamente |
| `offline-indicator.tsx` | COMPLETA | — |
| `pagination.tsx` | COMPLETA | ORFAO — implementado mas não consumido |
| `phone-input.tsx` | COMPLETA | — |
| `popover.tsx` | COMPLETA | — |
| `progress.tsx` | COMPLETA | — |
| `quick-peek.tsx` | COMPLETA | — |
| `radio-group.tsx` | COMPLETA | — |
| `resizable.tsx` | COMPLETA | — |
| `route-loading-bar.tsx` | COMPLETA | — |
| `scroll-area.tsx` | COMPLETA | — |
| `scroll-to-top.tsx` | COMPLETA | — |
| `section-error-boundary.tsx` | COMPLETA | — |
| `select.tsx` | COMPLETA | — |
| `separator.tsx` | COMPLETA | — |
| `sheet.tsx` | COMPLETA | — |
| `sidebar.tsx` | COMPLETA | — |
| `sidebar/index.ts` | COMPLETA | — |
| `sidebar/sidebar-context.tsx` | COMPLETA | — |
| `sidebar/sidebar-menu.tsx` | COMPLETA | — |
| `sidebar/sidebar-primitives.tsx` | COMPLETA | — |
| `skeleton.tsx` | COMPLETA | — |
| `skip-link.tsx` | COMPLETA | — |
| `slider.tsx` | COMPLETA | — |
| `sonner.tsx` | COMPLETA | — |
| `sparkline.tsx` | COMPLETA | — |
| `step-progress.tsx` | COMPLETA | — |
| `stories/Button.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `stories/Card.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `stories/Input.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `stories/Introduction.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `stories/Link.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `stories/dialog.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `stories/select.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `stories/textarea.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `stories/tooltip.stories.tsx` | COMPLETA | ORFAO — Storybook sem config |
| `supabase-connectivity-banner.tsx` | COMPLETA | — |
| `switch.tsx` | COMPLETA | — |
| `table.tsx` | COMPLETA | — |
| `tabs.tsx` | COMPLETA | — |
| `textarea.tsx` | COMPLETA | — |
| `toast.tsx` | COMPLETA | — |
| `toaster.tsx` | COMPLETA | — |
| `toggle-group.tsx` | COMPLETA | — |
| `toggle.tsx` | COMPLETA | — |
| `tooltip.tsx` | COMPLETA | — |
| `use-toast.ts` | COMPLETA | ORFAO — todos os consumers importam @/hooks/use-toast diretamente |
| `visually-hidden.tsx` | COMPLETA | — |

---

## 8. Órfãos

| arquivo | linhas | risco de remoção | motivo |
|---------|--------|-----------------|--------|
| `SkeletonList.tsx` | ~150 | SEGURO | Nenhum importador; substituído por `micro-interactions/skeletons.tsx` e `skeleton.tsx` |
| `UnifiedEmptyState.tsx` | ~429 | VERIFICAR | Exporta `EmptyState` (conflito com `empty-state.tsx`); `empty-states.tsx` aponta para ele mas nenhum consumer real usa |
| `accessible-toast.tsx` | ~206 | SEGURO | Alternativa ao sonner nunca montada; sem nenhum consumer |
| `hover-card.tsx` | 28 | SEGURO | Primitivo Radix completo sem nenhum consumidor no projeto |
| `menubar.tsx` | 208 | SEGURO | Primitivo Radix completo (16 exports); nenhum consumidor no projeto |
| `motion/variants.ts` | 69 | VERIFICAR | Usado internamente por motion/components.tsx e motion/effects.tsx; não importado diretamente por consumidores externos — mas é parte interna do módulo motion/. Remover quebraria motion/index.ts |
| `pagination.tsx` | 82 | SEGURO | Implementado completo; nunca consumido (paginação feita ad-hoc nos componentes) |
| `stories/Button.stories.tsx` | 139 | SEGURO | Storybook sem .storybook/config no repo; não executável |
| `stories/Card.stories.tsx` | 158 | SEGURO | Idem |
| `stories/Input.stories.tsx` | 119 | SEGURO | Idem |
| `stories/Introduction.stories.tsx` | 120 | SEGURO | Idem |
| `stories/Link.stories.tsx` | 127 | SEGURO | Idem |
| `stories/dialog.stories.tsx` | 45 | SEGURO | Idem |
| `stories/select.stories.tsx` | 43 | SEGURO | Idem |
| `stories/textarea.stories.tsx` | 46 | SEGURO | Idem |
| `stories/tooltip.stories.tsx` | 35 | SEGURO | Idem |
| `use-toast.ts` | 4 | SEGURO | Re-export wrapper com 0 importadores; todos usam @/hooks/use-toast |

**Total órfãos: 17** (12 SEGURO para remoção + 2 VERIFICAR antes de remover + motion/variants.ts que é interno ao módulo)

---

## 9. Achados

### A1 — Quatro sistemas paralelos de Empty State (proliferação)
Existem 5 implementações distintas de empty state: `EmptyState.tsx` (simples), `GenericEmptyState.tsx` (Lucide), `empty-state.tsx` (ilustrações SVG), `empty-states/` (contextual), e `UnifiedEmptyState.tsx` (nunca consumido). Nenhum arquivo serve como ponto único canônico. Isso aumenta a superfície de manutenção e cria confusão para novos desenvolvedores.

### A2 — `empty-states.tsx` barrel quebrado
`empty-states.tsx:1-20` re-exporta de `./UnifiedEmptyState`, que existe no disco mas nunca é consumido diretamente. Os consumidores reais chegam via `empty-states/index.ts`. Há risco de ambiguidade de resolução entre `empty-states.tsx` (arquivo) e `empty-states/` (diretório) dependendo do bundler — o arquivo pode ser silenciosamente ignorado.

### A3 — Dois sistemas de toast coexistindo
`sonner.tsx` (Toaster principal) e `toaster.tsx` (shadcn/ui legado) são ambos montados. `use-toast.ts` é um re-export wrapper sem importadores (todos usam `@/hooks/use-toast` diretamente). `accessible-toast.tsx` é uma terceira alternativa nunca montada. São 3 implementações de toast; apenas 2 estão ativas.

### A4 — `motion.tsx` deprecated coexiste com `motion/index.ts`
`motion.tsx:7` tem comentário `@deprecated`. O path `@/components/ui/motion` pode resolver para o arquivo ou para o diretório dependendo da configuração do bundler Vite/TypeScript. Os 44 importadores externos usam o path ambíguo. Se o arquivo for removido antes de os imports serem migrados, pode causar erros silenciosos.

### A5 — `stories/` sem .storybook config: dead code certificado
O diretório `src/components/ui/stories/` contém 9 arquivos `.stories.tsx` (832 linhas) mas o repositório não tem configuração `.storybook/`. Os arquivos nunca são executados, bundled ou testados. São dead code certificado.

### A6 — `motion/variants.ts` marcado como ORFAO mas é interno ao módulo
`motion/variants.ts` não tem importadores *externos* a `src/components/ui/`, mas é importado por `motion/components.tsx` e `motion/effects.tsx` dentro do próprio módulo. O status ORFAO aqui indica "não usado diretamente por consumidores externos" — não pode ser removido sem quebrar o módulo motion.

### A7 — `UnifiedEmptyState.tsx` exporta nome `EmptyState` em conflito com `empty-state.tsx`
`UnifiedEmptyState.tsx:linha_principal` exporta `export const EmptyState = ...`. `empty-state.tsx` também exporta `export function EmptyState`. Qualquer import de `@/components/ui/EmptyState` ou `@/components/ui/empty-state` pode resolver para o arquivo errado dependendo do path utilizado. Como `UnifiedEmptyState` é órfão, o risco está latente, não ativo.

### A8 — `emoji-picker.tsx:2` usa localStorage diretamente (safeGetJSON/safeSetJSON)
`emoji-picker.tsx:2` importa utilitários `safeGetJSON`/`safeSetJSON` para persistir emojis recentes no localStorage. Isso é acoplamento direto ao storage sem abstração — se o localStorage não estiver disponível (SSR, iframe sandbox, modo privado) o componente pode silenciar erros. O `safeGet` mitiga o risco mas não elimina.

### A9 — `icon-button.tsx` + `mobile-components.tsx`: poucos consumidores para componentes elaborados
`icon-button.tsx` (153 linhas, 4 variantes, tooltip integrado) tem apenas 1 importador externo (`MobileDrawerMenu.tsx`). `mobile-components.tsx` (256 linhas, 4 componentes) tem 4 importadores. São componentes well-crafted com baixíssimo ROI de uso atual.

---

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*

UI_CONCLUIDO arquivos_lidos:98 orfaos:17
