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

## 2b. Status de execução (atualizado 2026-07-06, mesma sessão)

| Onda | Status | Resultado |
|---|---|---|
| Fase 0 — Simulação adversarial | ✅ | 1.326 cenários (grafo 51+arestas, 894 exec de paridade, 35 tipos, 346 call-sites). Preveniu 2 quebras (lib/mcp, __mocks__). |
| Wave 2 — Triagem allowlist | ✅ **superada** | 158 mortos removidos em cascata (6 iterações); allowlist final = 2 itens justificados (meta era ≤10) |
| Wave 5 — Utils canônicos | ✅ (grupos comprovados) | 3 canônicas + 20 testes de paridade permanentes. Famílias divergentes documentadas — NÃO forçar. |
| Wave 4 — Tipos canônicos | ✅ (shapes idênticos) | QuickReply 4→1, ChatMessage-AI 4→1. Contact×9/Profile×6 divergem: exigem adapters (backlog). |
| Wave 6 — Convergência | 🟡 parcial | Pasta tripla de testes eliminada (src/tests removida). Migração components/→features/ = programa dedicado. |
| Wave 3 — Data layer | ✅ **top ofensores zerados** | 6 extrações c/ fingerprint-parity (SkillRouting, DeptManagement, EvolutionApi, AdminQueues, SalesPipeline+realtime, useMediaLibrary realocado). components 191→150, pages 49→40. Ferramenta permanente: `scripts/query-fingerprint.mjs`. |

## 3. Roadmap — próximas ondas (prioridade por impacto × risco)

### Wave 3 — Camada de dados por domínio (maior impacto)
Extrair as 262 chamadas de components+pages para hooks/services por domínio,
seguindo o padrão já existente em `features/*/hooks`:
1. Componente/página **nunca** chama `supabase` direto.
2. Query/mutation vive em `@/features/<dominio>/hooks` (React Query) ou
   `@/features/<dominio>/services` para lógica sem estado de UI.
3. A cada PR: `node scripts/check-data-layer.mjs --update-baseline` para apertar o ratchet.
Blueprint pronto: `src/hooks/meta-capi/useMetaCapi.ts`. Ordem por ofensores (SIM D): SalesPipelineView(10), AdminQueuesPage(9), EvolutionApiIntegrationView(8), SkillBasedRoutingSettings(8), DepartmentManagementDialog(7). Meta de saída: components=0, pages=0.

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


## 4b. Wave 3 — protocolo de extração validado (2026-07-06)

1. `node scripts/query-fingerprint.mjs --save /tmp/fp-X.json <componente>` (invariante ANTES)
2. Extrair p/ `src/hooks/<dominio>/useX.ts`: queries/mutations/handlers + estados de DOMÍNIO; view-state (tabs, busca, drag) fica no componente
3. `--parity /tmp/fp-X.json <componente> <hook>` — multiset de queries deve ser idêntico
4. eslint dos 2 arquivos; tsc/build por batch; `--update-baseline` ao final

Ofensores restantes (informativo): distribuídos em cauda longa (≤5 calls/arquivo) — seguir o protocolo acima por domínio.

## Sessão 2026-07-06 (tarde) — Wave 3 tier-2 + W4 Pick + W5 semântica + CI guards

**Simulação prévia: ~1.486 cenários** (SIM H re-ranking, SIM I classificação semântica por execução, SIM J v2 subset-analysis vs schema, SIM K auditoria CI).

### Entregas
1. **CI**: guards `check-dead-code` + `check-data-layer` agora rodam no `quality-gate.yml` (eram apenas locais — decorativos no CI).
2. **W3 tier-2** (fingerprint-parity 5/5 em cada): `useChannelRoutingRules`, `useCampaignABTesting`, `useFollowUpSequences`, `useSLAScopeOptions`. Realocações: `useAdminData` e `useChatMediaSending` (features/*/components→hooks), `checklistSteps.ts` → `src/lib/onboarding/` (módulo de dados declarativo, não componente).
3. **W4 experimento Pick**: 6 interfaces `Contact` substituídas por `Pick<Tables<'contacts'>>` derivadas do schema gerado (tsc como juiz; MapView usa `& Partial<Pick<…,'lead_origin'>>` para preservar opcionalidade original). Pendentes de alinhamento: ContactBirthdayPanel (extra: birthday), types/chat.ts (extras: avatar, createdAt).
4. **W5**: `formatTime` do par AdminWebhookOverviewPage+CallCorrelationView migrado para `formatDateTimeCompact` (byte-idêntico, detectado por classificação semântica). **VETO registrado**: par `formatDuration` AdminEvolutionApiLogsPage×telemetryUtils NÃO consolidado — `toFixed(2)≠toFixed(1)` (lição: shape-classifier é triagem; byte-vector é o juiz). `formatPhone`×2 e `getInitials`×2 são intencionais (APIs/semânticas distintas).

### Ratchets (após tier-2)
| escopo | antes | depois |
|---|---|---|
| src/components | 150 | **124** |
| src/pages | 40 | **40** |
| src/features | 220 | 220 (informativo) |
| src/hooks | 249 | 269 (informativo — recebeu extrações) |

## Sessão 2026-07-06 (noite) — auto-ratchet + realocação em massa + W4 final + SIM M (banco real)

**Simulação: SIM L (cauda 106 arquivos/238 calls) · SIM M (information_schema do banco REAL) · SIM N (design do auto-tighten).**

### Entregas
1. **ratchet-tighten.yml**: workflow que auto-aperta o baseline no push para main (down-only nos escopos hard; reverte se detectar subida). Fim da "gordura" no teto.
2. **Realocação em massa** (8 hooks que moravam em components/pages): useAutomations, useSendProduct, useAIProviders, useMediaUpload, useSentimentData, useMonitoringActions, useMonitoringData, useRolesPageState → `src/hooks/*`.
3. **W4 concluída para Contact**: types/chat.ts e ContactBirthdayPanel agora derivam do schema (`Pick` núcleo + `Partial<Pick>` opcionais + extensões client-side explícitas: `avatar`, `createdAt: Date`, `birthday`).

### 🚨 Achados do banco real (SIM M — decisões de produto pendentes)
- `public.contacts` tem **50 colunas**; `types.ts` gerado conhece **26** → **regenerar types é prioridade** (sessão dedicada: mudança em massa de tipos).
- **`birthday` NÃO existe no banco** → ContactBirthdayPanel está funcionalmente inerte (filtra campo que nunca vem). Decidir: criar coluna, mapear de `metadata`, ou remover o painel.

### Ratchets
| escopo | antes | depois |
|---|---|---|
| src/components | 124 | **105** |
| src/pages | 40 | **36** |

### Próximo batch W3 (cauda)
AdminChannelsPage (6), HmacSelfTestPage (6), OmnichannelManager (5) + demais ≤4.

## Sessão 2026-07-06 (madrugada) — Regeneração de types.ts (melhoria estrutural #1)

**Simulação: SIM O (drift-audit: 8.704 comparações de coluna) · SIM P (tsc empírico, 8 rodadas) · SIM Q (estratégia de geração no self-hosted).**

### O problema
`types.ts` conhecia **156 entidades / contacts com 26 colunas**; o banco real tem **678 entidades / contacts com 50 colunas** — quase metade do schema invisível para o TypeScript.

### A solução — `scripts/gen-types.mjs` (ferramenta permanente)
Gera do **postgres-meta vivo** do stack (http interno, porta 8080) com dois pós-processos evidence-based:
1. **INSTEAD OF never→Row**: information_schema marca colunas de views como não-updatable mesmo com triggers INSTEAD OF; consultamos `pg_trigger` e restauramos os tipos reais (52 colunas em app_notifications/contacts/conversation_pins/messages).
2. **Relationships em views**: PostgREST resolve embeds via FKs das tabelas base (mapeamento view→base via `pg_depend/pg_rewrite`); injetamos **3.267 relationships** equivalentes para os embeds tiparem.
3. Helpers `TablesInsert/TablesUpdate` estendidos para cobrir Views (escrevemos em views por design — ADR-001).

### Lição de guerra
`/query` do meta serializa arrays PG como string (`"{col}"`) — relationships com `columns` malformado envenenam a inferência global do client (**628 erros em cascata**). Fix: `to_jsonb()`. Teste binário de isolamento identificou a causa.

### 🐛 Bugs runtime REAIS que o types velho escondia (corrigidos)
- `useAdminData`: insert em user_roles sem `role_key`/`workspace_id` (NOT NULL sem default) — **falhava em produção**
- `RateLimitConfigPanel`: seed sem `block_duration_minutes` — tabela está vazia porque o seed nunca funcionou
- `ForgotPassword`: insert sem `status`

### 📋 Decisões de produto registradas
- `useTags`: a entidade `tags` no schema atual é ponte contato↔tag (exige contact_id/tag_name); criação de tag-catálogo precisa de definição (cast preserva comportamento até lá)
- `useKnowledgeBaseSearch`: RPC retorna `rank` + `tags` agregada — shape local preservado via conversão explícita

### Gates: tsc 0 (628→0) · parity 20/20 · dead-code ✅ · eslint 0 errors · role temporário de introspecção dropado

## Sessão 2026-07-07 — Sentinela de drift + W3 batch-3 + campanha TS2589

### 🛰️ Sentinela de drift de schema (melhoria 1% da sessão anterior, entregue)
- `ops.fn_schema_fingerprint()`: md5 determinístico de colunas(public) + constraints f/p dos schemas cobertos pelo types (public,zapp,evo,email_app,vendas,financeiro,ai,bpm). **Lição**: connames duplicados entre schemas (partições espelhadas em `archive`) causavam empate no ORDER BY → hash instável; fix = chave de ordenação única (nspname, relação, conname) + escopo fechado. Validado: 5 medições = 1 hash.
- `ops.types_sync_state` (single-row) + `ops.check_types_sync()` integrado ao `run_all_checks` (**24 checks**).
- Cron `types-drift-weekly` (seg 10:00 BRT) loga em `ops.schema_drift_log` (kind=types_sync) com a action de regeneração.
- `gen-types.mjs` fecha o loop: ao rodar, marca o schema como sincronizado.
- Teste adversarial: drift simulado → WARN detectado → restaurado → OK ✅.
- **Validação de campo**: o auto-ratchet (PR #241) estreou no merge da #243 — commit `40822f555` do ratchet-bot apertou o baseline sozinho.

### 🔧 W3 batch-3 — 3 extrações (protocolo §4b, fingerprint-parity)
| Origem | Hook | Nota |
|---|---|---|
| OmnichannelManager (237L) | hooks/omnichannel/useOmnichannelChannels | parity 4/4; ChannelType → union no data-layer |
| HmacSelfTestPage (454L) | hooks/admin/useHmacSelfTest | cast-workaround de hmac_selftest_audit removido (regen #243) — a query ficou *visível* ao fingerprinter (extra esperado, runtime idêntico) |
| AdminChannelsPage (536L) | hooks/admin/useAdminChannels | 4 casts de RPC removidos (Functions tipadas); save/runAction retornam boolean p/ resets no call-site |

### ⚔️ Campanha TS2589 (schema 678 × inferência profunda)
Embeds aninhados estouram a instanciação do compilador. Fixes: casts pontuais comentados; varreduras preventivas (7+12 arquivos) + **slayer automatizado** (loop tsc→patch em bg) exterminou a cauda (useSalesPipeline, QueueDetails). tsc final: **0**.

### 📏 Correção de instrumento no ratchet
O parser contava só `supabase.from` — casts `(supabase as any).from` (inclusive legados pré-sessão: useConnectionsActions ×4, TeamFiles ×3…) eram invisíveis. Regex ampliado; **baseline recalibrado para a contagem verdadeira**: components 105 · pages 64 · features 263 · hooks 323 (total 755). A série histórica anterior subcontava — este é o novo marco honesto.

### Gates: tsc 0 · build ✅ · parity 20/20 · eslint 0 · dead-code ✅
