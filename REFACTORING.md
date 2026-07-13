# Guia de Refatoração — ZAPP-WEB v3

> Documento criado em 2026-07-13 após análise de 700+ arquivos do projeto.
> Mantido como referência viva — atualize ao executar melhorias.

---

## 1. Visão Geral da Arquitetura

```
src/
├── components/          # UI genérica, agrupada por domínio visual
│   ├── ui/              # Primitivos shadcn/ui + extensões locais
│   ├── layout/          # AppShell, Sidebar, SidebarNavItem, PageTemplate
│   ├── routing/         # AppRoutes, AdminRoutes, DebugRoutes
│   ├── email/           # Módulo e-mail (thread, inbox, reply)
│   ├── monitoring/      # Dashboard de saúde da Evolution API
│   ├── gamification/    # Sistema de conquistas
│   └── ...              # ~40 outros domínios visuais
│
├── features/            # ✅ Arquitetura feature-first (padrão de referência)
│   ├── admin/           # components/ hooks/ services/ data-access/ utils/
│   ├── auth/            # components/ context/ hooks/ services/
│   ├── inbox/           # O maior módulo (~120 componentes + hooks)
│   ├── connections/     # Gerenciamento WhatsApp
│   └── contacts/        # hooks/ index.ts
│
├── lib/                 # Utilitários compartilhados (~60 arquivos)
│   ├── sanitize.ts      # DOMPurify v2.1 — funções simples, retornam string
│   ├── sanitize-v2.ts   # DOM nativo com SanitizeResult — API diferente!
│   ├── logger.ts        # Logger estruturado via getLogger()
│   ├── jid.ts           # Manipulação de JIDs do WhatsApp (16 KB)
│   └── ...
│
├── hooks/               # Hooks React globais
├── types/               # Tipos TypeScript globais e da Supabase
├── integrations/        # Cliente Supabase tipado
└── data/                # Dados estáticos (emojiDatabase.ts 38KB)
```

---

## 2. O que está BOM (preservar)

- **Arquitetura feature-first** em `src/features/` com separação clara de `components/`, `hooks/`, `services/`, `data-access/`
- **Barrel exports** (`index.ts`) nos módulos de features
- **Toolchain robusto**: TypeScript strict, ESLint 10, Vitest, Playwright E2E, Storybook, Husky pre-commit
- **Scripts de guardrail**: `check:domain`, `check:deadcode`, `check:barrels`, `check:datalayer`, `ds:check`
- **Separação de tipos** em `src/types/` e `src/integrations/supabase/types.ts`
- **Hooks customizados** bem nomeados e colocalizados com seus domínios
- **CI Gates** ativos (5 gates: RLS 100%, TS 0 errors, ESLint frozen, Gate 1–5)

---

## 3. Problemas Identificados por Prioridade

### 🔴 ALTA — Corrigir nos próximos sprints

#### 3.1 Dependência fantasma: `isomorphic-dompurify`

**Arquivo:** `src/components/email/EmailChatBubble-v2.tsx` ← **Corrigido neste PR**

Antes:
```ts
// 'isomorphic-dompurify' NÃO estava no package.json — build poderia quebrar
import DOMPurify from 'isomorphic-dompurify';
```

Depois:
```ts
// Usa 'dompurify' (já no package.json)
import DOMPurify from 'dompurify';
```

#### 3.2 Fragmentação de "empty state" — 5 implementações paralelas

```
src/components/ui/
├── EmptyState.tsx          # Componente standalone (capital E)
├── GenericEmptyState.tsx   # Versão genérica
├── empty-state.tsx         # Versão kebab-case (shadcn style)
├── empty-states.tsx        # Versão plural — exporta múltiplos
├── contextual-empty-states.tsx  # Wrapper de contexto
└── empty-states/           # ← Barrel criado neste PR
    ├── ContextualEmptyState.tsx
    ├── ConvenienceExports.tsx
    ├── contextConfigs.tsx
    └── index.ts  ← NOVO
```

**Impacto:** Inconsistência de importação, dificulta onboarding, estados visuais divergentes.
**Ação futura:** Consolidar todos os arquivos acima no `empty-states/` e deprecar as variantes
no nível de `ui/`.

#### 3.3 APIs incompatíveis entre os dois módulos de sanitização

```ts
// sanitize.ts — retorna string diretamente
export function sanitizeHtml(html: unknown): string

// sanitize-v2.ts — retorna objeto com success/error
export function sanitizeHtml(html: unknown, opts?): SanitizeResult
```

Ver `docs/sanitize-architecture.md` para a explicação completa e a decisão de qual usar.

---

### 🟡 MÉDIA — Planejar para próximas iterações

#### 3.4 Convenção de nomeação inconsistente em `src/lib/`

| Padrão | Exemplos |
|--------|----------|
| `camelCase.ts` | `contactsDB.ts`, `clientTelemetry.ts`, `evolutionCircuitBreaker.ts` |
| `kebab-case.ts` | `avatar-colors.ts`, `sanitize-v2.ts`, `web-vitals.ts`, `contact-health.ts` |

**Decisão recomendada:** padronizar tudo em `camelCase.ts` (maioria já está assim).

#### 3.5 Três camadas de animação sobrepostas

```
src/components/
├── ui/motion.tsx              # Wrapper simples (774 bytes)
├── ui/motion/                 # Diretório com components + effects + variants
└── transitions/               # Outro sistema com PageTransition, TransitionProvider
```

**Ação:** Deprecar `ui/motion.tsx` em favor de `ui/motion/` e documentar qual é a
camada de transição de página.

#### 3.6 Monitoramento: hooks dispersos em dois lugares

```
src/components/monitoring/hooks/  ← barrel criado neste PR
    useEvolutionMonitoring.ts, useMonitoringNotifications.ts, types.ts

src/features/admin/hooks/monitoring/
    useFailedMessages.ts, useRetryMetrics.ts, useDlqAuditLog.ts...
```

**Regra atual quebrada:** hooks de domínio do admin vivem em `features/admin/hooks/`,
mas os de monitoring ficaram em `components/monitoring/hooks/`.
**Ação:** Mover `components/monitoring/hooks/` para `features/admin/hooks/monitoring/`.

#### 3.7 `src/lib/` sem barrel `index.ts`

Com ~60 utilitários, qualquer novo consumidor precisa conhecer o nome exato do arquivo.
Um barrel seletivo reduziria acoplamento.

**Cuidado:** Barrel total pode criar ciclos de import. Recomendar barrel seletivo com
apenas funções de alta frequência.

---

### 🟢 BAIXA — Melhoria de qualidade futura

- `EmailChatBubble.tsx` vs `EmailChatBubble-v2.tsx`: arquivos com sufixo de versão (anti-pattern Git)
- Arquivos `.stories.tsx` sem cobertura de testes real em vários componentes UI
- `src/data/emojiDatabase.ts` (38KB) — candidato a lazy-load ou asset externo
- JSDoc ausente em muitas funções públicas de `src/lib/`

---

## 4. Padrões de Referência (usar como modelo)

### Feature bem estruturada: `src/features/auth/`

```
features/auth/
├── components/
│   ├── AuthProvider.tsx
│   ├── ProtectedRoute.tsx
│   ├── mfa/             # Sub-domínio colocado
│   │   ├── MFAEnroll.tsx
│   │   └── index.ts
│   └── index.ts         # ✅ Barrel export
├── context/
│   └── AuthContext.ts
├── hooks/
│   ├── useAuth.ts
│   ├── usePermissions.ts
│   └── index.ts         # ✅ Barrel export
├── services/
│   ├── authService.ts
│   └── index.ts         # ✅ Barrel export
└── index.ts             # ✅ Barrel raiz
```

### Hook bem estruturado: `src/features/connections/hooks/`

```ts
// Divide concerns: state / realtime / actions → composição no hook principal
hooks/
├── parts/
│   ├── useConnectionsState.ts    # Estado local apenas
│   ├── useConnectionsRealtime.ts # Efeitos de realtime
│   └── useConnectionsActions.ts  # Mutações e ações
├── useConnectionsManager.ts      # Composição dos três
├── types.ts
└── index.ts
```

---

## 5. Backlog de Ações (ordenado por ROI)

| # | Ação | Esforço | Risco | ROI |
|---|------|---------|-------|-----|
| 1 | ~~Corrigir `isomorphic-dompurify` em `EmailChatBubble-v2.tsx`~~ | P | B | ✅ Done |
| 2 | ~~Barrel exports: email, empty-states, monitoring/hooks~~ | P | B | ✅ Done |
| 3 | Consolidar 5 empty-state em barrel único (deprecar 4 arquivos) | M | M | 🔴 |
| 4 | Padronizar nomeação `src/lib/` para camelCase | M | B | 🟡 |
| 5 | Mover `components/monitoring/hooks/` → `features/admin/hooks/monitoring/` | P | B | 🟡 |
| 6 | Deprecar `ui/motion.tsx` em favor de `ui/motion/` | P | B | 🟡 |
| 7 | Criar barrel seletivo `src/lib/index.ts` | P | M | 🟡 |
| 8 | Unificar API dos dois módulos sanitize | G | A | 🟡 |
| 9 | Lazy-load `emojiDatabase.ts` | P | B | 🟢 |
| 10 | Adicionar JSDoc a funções públicas de `src/lib/` | G | B | 🟢 |

> Esforço: P=Pequeno, M=Médio, G=Grande | Risco: B=Baixo, M=Médio, A=Alto

---

## 6. Regras do Projeto (não alterar sem revisão)

1. **pg_cron VACUUM** deve ser sempre single-statement (nunca multi-statement)
2. **Nunca criar novas tabelas** no banco — apenas adicionar registros
3. **Tabelas de referência de preço:** `tabela_preco_gravacao_oficial`, `tabela_preco_gravacao_oficial_faixa`, `print_area_techniques`, `tecnicas_gravacao`
4. **Tabelas temporárias:** sempre prefixar com `_backup_*_yyyymmdd`
5. **Lovable bot** faz commits direto em main — monitorar CODEOWNERS e `.lovableignore`
6. **CI Gates obrigatórios** (nunca desabilitar): TS 0, ESLint frozen, RLS 100%, Gates 1–5

---

*Gerado automaticamente por análise de codebase — 2026-07-13*
