# REFACTOR_PLAN.md — Refatoração Estrutural zapp-web-v3

> Wave 1 executada em 2026-07-06 (branch `refactor/structural-wave1-2026-07-06`).
> Princípio inegociável: **zero mudança de comportamento visível**. Toda onda é
> validada por `npm run check` completo antes de merge.

## 1. Diagnóstico (baseline 2026-07-06, main @ 182fdae5a)

| Métrica | Valor | Avaliação |
|---|---|---|
| Arquivos TS/TSX em `src/` | 1.726 | — |
| Linhas TS/TSX em `src/` | ~259.9k (9.3k geradas em `integrations/supabase/types.ts`) | — |
| Arquivos mortos (grafo de imports) | 94 (~11k linhas) | 🔴 |
| `supabase.from()` em components+pages | 262 chamadas | 🔴 acoplamento UI↔dados |
| `supabase.from()` total fora de services | 712 chamadas | 🔴 |
| `src/services/` | 5 arquivos / 262 linhas | 🔴 camada inexistente na prática |
| `interface Contact` redefinida | 9 arquivos de produção | 🟠 |
| `ChatMessage`/`Profile`/`SLAStatus`/`AuditLog` | 6 definições cada | 🟠 |
| `formatTime` duplicada | 10 implementações | 🟠 |
| `formatDate` / `getInitials` / `formatCurrency` | 7 / 6 / 4 | 🟠 |
| Pastas de teste distintas | 3 (`__tests__`, `test`, `tests`) | 🟡 |
| Arquiteturas convivendo | `components/` (661 arq, por tipo) × `features/` (483 arq, por domínio) | 🟠 |
| `: any` em produção | 221 | 🟡 aceitável p/ escala |
| `console.*` em produção | 13 | 🟢 |
| Imports relativos profundos (`../../..`) | 0 (alias `@/` universal: 5.434) | 🟢 |
| Guards de arquitetura preexistentes | `check:domain`, `check:barrels`, `ds:check`, `lint-supabase-casts` | 🟢 base excelente |

**Leitura executiva:** o projeto já tem disciplina de guards e alias consistente.
Os três débitos estruturais reais são (a) código morto acumulado, (b) acesso a
dados pulverizado em camadas de UI e (c) tipos/utils de domínio duplicados.

## 2. Wave 1 — executada nesta branch

| # | Ação | Resultado |
|---|---|---|
| A | Remoção de código morto com validação forense (grafo de imports + zero menções por string em src/e2e/scripts + cascata iterativa) | **41 arquivos / ~5.4k linhas removidos** |
| B | Guard `scripts/check-dead-code.mjs` + `npm run check:deadcode` no chain `check` | Impede novo código morto; allowlist = registro de dívida (51 itens p/ triagem) |
| C | Consolidação `getInitials` dos componentes de e-mail → `getInitialsFromNameOrEmail` em `src/lib/formatters.ts` | Paridade de comportamento; corrige crash latente em `email=""` no EmailContactPanel |
| D | Este plano (`docs/REFACTOR_PLAN.md`) | Roadmap versionado |
| E | Ratchet `scripts/check-data-layer.mjs` + `npm run check:datalayer` (baseline `data-layer-baseline.json`) | Teto congelado: components 212 / pages 50 / features 220 / hooks 230. Só pode cair. |

## 3. Roadmap — próximas ondas (prioridade por impacto × risco)

### Wave 2 — Triagem da allowlist de código morto (risco baixo)
Os 51 arquivos em `scripts/dead-code-allowlist.txt` não têm importador, mas o
basename aparece em strings/comentários. Triagem manual: deletar, reconectar ou
justificar em comentário na própria allowlist. Meta: allowlist ≤ 10.
Inclui decidir os primitivos não usados de `src/components/ui/` (hoje excluídos
do guard por dependência do `generate-component-registry`).

### Wave 3 — Camada de dados por domínio (maior impacto)
Extrair as 262 chamadas de components+pages para hooks/services por domínio,
seguindo o padrão já existente em `features/*/hooks`:
1. Componente/página **nunca** chama `supabase` direto.
2. Query/mutation vive em `@/features/<dominio>/hooks` (React Query) ou
   `@/features/<dominio>/services` para lógica sem estado de UI.
3. A cada PR: `node scripts/check-data-layer.mjs --update-baseline` para apertar o ratchet.
Ordem sugerida (maiores ofensores primeiro): `pages/admin/*`, `components/contacts/*`,
`components/settings/*`. Meta de saída: components=0, pages=0.

### Wave 4 — Tipos canônicos de domínio (risco médio)
Criar `src/types/domain/` (ou expandir `src/types/`) com `Contact`, `ChatMessage`,
`Profile`, `SLAStatus`, `AuditLog`, `QuickReply`, `Department` únicos, derivados de
`Tables<'...'>` do types.ts gerado. Migrar arquivo a arquivo; onde a forma local
divergir do canônico, mapear explicitamente (adapter) em vez de forçar cast.

### Wave 5 — Utils canônicos (risco médio — exige tabela de paridade)
As 10 `formatTime` / 7 `formatDate` têm semânticas divergentes (locale, formato,
relative time). Processo: inventariar assinaturas → agrupar por semântica →
canonizar em `src/lib/formatters.ts` com nomes explícitos
(`formatTimeHHmm`, `formatRelativeTime`, ...) → migrar grupo a grupo com teste
de paridade em `src/lib/__tests__/formatters.parity.test.ts`.

### Wave 6 — Convergência arquitetural (risco alto, fim de ciclo)
1. Migrar `src/components/<dominio>` → `src/features/<dominio>` até `components/`
   conter apenas `ui/` e compartilhados genuínos.
2. Unificar `src/test`, `src/tests`, `src/__tests__` → padrão único
   (`__tests__` colocado por feature + `src/test/` só para setup).
3. Avaliar promover `check:deadcode`/`check:datalayer` a job dedicado no CI.

## 4. Regras de execução (todas as ondas)
- Branch por onda; PR pequeno e temático; nunca misturar ondas.
- Gate obrigatório: `npm run check` verde + `npm run test` sem novas falhas.
- Ratchets nunca afrouxam: baselines só são atualizados para baixo.
- Comportamento visível idêntico; qualquer divergência intencional (ex.: correção
  de crash latente) documentada no PR.
