# AUDITORIA DA EXECUÇÃO — Blocos 1 e 2 do `PLANO_QA_ANALISE_100.md`

> Cross-check honesto das 20 etapas dos Blocos 1 e 2 contra o que realmente foi executado.
>
> **Régua aplicada:** DESCOBERTA de bugs. Estamos na fase de descoberta — o objetivo agora é **encontrar** os problemas, não corrigi-los. Uma etapa está cumprida se descobriu os bugs que tinha que descobrir. Entregáveis formais (CSV, snapshot markdown, EXPLAIN ANALYZE) são artefatos de correção, não de descoberta.

**Data da auditoria:** 2026-08-02 (revisada)
**Auditor:** Claude (chat de análise)

---

## Placar geral (lente: descoberta de bugs)

| Categoria | Bloco 1 (10 etapas) | Bloco 2 (10 etapas) | Total (20) |
|---|---:|---:|---:|
| ✅ Bugs principais descobertos | 4 | 5 | **9 (45%)** |
| ⚠️ Descoberta parcial (bugs capturados, mais possíveis) | 5 | 4 | **9 (45%)** |
| ❌ Não iniciado | 1 | 1 | **2 (10%)** |

**Blocos 3-10 (etapas 21-100):** todos com status ❌ (não iniciados).

**Achados totais catalogados no Plano B:** 38 (era 27 antes desta rodada de execução).

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

### Etapa 1 — Contar arquivos por extensão + cruzar com `bun.lock` p/ imports órfãos

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** raiz suja (arquivos-lixo), 5 pastas de teste convivendo (F1-01..07), `functions-legacy` e `fatorx-migrations` (F1-08, F1-09).
- **Pode ainda esconder bugs:** imports de pacotes não declarados em `bun.lock`, arquivos `.ts`/`.tsx`/`.css` órfãos.

### Etapa 2 — Mapear rotas React Router + achar pages sem rota E rotas sem page

- **Status:** ✅ Bugs principais descobertos
- **Descoberto:** 11 pages órfãs sem `<Route>` correspondente (F1-13), padrão duplo URL vs `?view=X&tab=Y` (F1-14), homônimos `src/pages/*` (F1-12).
- **Pode ainda esconder bugs:** `ViewRouter.tsx` (10 KB) não lido — pode ter rotas orfãs no sentido inverso ou lógica de redirect complexa.

### Etapa 3 — Extrair menu de navegação completo + permissões

- **Status:** ✅ Bugs principais descobertos (nesta rodada)
- **Descoberto:**
  - 71 itens de menu em `sidebarNavConfig.ts` (primaryNav + salesNav + automationNav + analyticsNav + connectionsNav + systemNav + advancedNav).
  - **20+ itens SEM `requiredRoles`** apesar de serem sensíveis: `security`, `privacy` (LGPD), `admin`, `themes`, `audit-logs`, `webhook-events`, `webhook-secret`, `ai-usage`, `public-api`, `email-webhook`, `media-migration`, `sicoob-bridge`, `evolution-monitor`, `instance-pauses`. O menu aparece pra todos os `authenticated`; `<ProtectedRoute>` bloqueia no clique — UX ruim + risco de falta de guarda dupla em cenários edge.
  - **`campaigns` duplicado** em `primaryNav` E `automationNav` (mesmo `id`).
- Achados novos: **F1-17** (menu sem RBAC visível), **F1-18** (campaigns duplicado).

### Etapa 4 — Inventariar componentes de UI + cobertura Storybook

- **Status:** ❌ Não iniciado
- **Executar:** listar `src/components/ui/` (wrappers shadcn); classificar cada `src/components/**/*.tsx` como (a) primitivo Radix, (b) wrapper shadcn, (c) componente de domínio; cruzar com `.storybook/` para cobertura.

### Etapa 5 — Tabela `page → rota → feature-slice → hooks → services`

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** 46 arquivos + 15 subpastas em `src/pages/`; homônimos (F1-12).
- **Pode ainda esconder bugs:** a tabela cruzada em si não foi gerada — pode revelar pages usando hooks/services deprecated.

### Etapa 6 — Mapear hooks customizados + duplicatas semânticas

- **Status:** ✅ Bugs principais descobertos (nesta rodada)
- **Descoberto:**
  - **248 arquivos em `src/hooks/`** — excesso patológico.
  - **God-hooks gigantescos** (violam SRP, causam re-renders desnecessários):
    - `useEvolutionApiManagement.ts` — **51 KB**
    - `useExternalApiManagement.ts` — **42,5 KB**
    - `useEmailManagement.ts` — **41 KB**
    - `useAudioManagement.ts` — **38,5 KB**
    - `useExternalEvolution.ts` — **30,8 KB**
    - `useEmail.ts` — **25,8 KB**
    - `useUIInteractionManagement.ts` — **25,5 KB**
    - `useAutomationManagement.ts` — **22 KB**
  - **Duplicatas semânticas confirmadas** em 7+ áreas: connections (4-5 hooks), UI (3 hooks), evolution (5-7 hooks), email (5+), contacts (8+), automation (4), SLA (5).
- Achados novos: **F1-19** (248 hooks), **F1-20** (god-hooks 20-51 KB), **F1-21** (duplicatas semânticas).

### Etapa 7 — Mapear services + catalogar cada RPC Supabase

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** `src/services/` tem 8 subpastas (api, connections, contacts, email, messages, queues, settings, users) com padrão Repository/Service/hooks (bem estruturado). **Convivência de dois padrões arquiteturais:** service/repository em `src/services/` e god-hook em `src/hooks/`.
- **Pode ainda esconder bugs:** catálogo de chamadas `.rpc(...)` não gerado; cruzamento com SECDEF do Bloco 2 pode revelar RPCs chamadas mas não seguras. Achado novo: **F1-22** (arquitetura dupla).

### Etapa 8 — Mapear contexts/providers + tenant/workspace + feature flags

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** order de providers documentada em `AppProviders.tsx`.
- **Pode ainda esconder bugs:** `AuthProvider` interno não auditado; tenant/workspace context não confirmado; feature flags não investigadas.

### Etapa 9 — Verificar tsconfig paths + `bun run check:barrels`

- **Status:** ✅ Bugs principais descobertos (nesta rodada)
- **Descoberto:**
  - **11 arquivos de teste EXCLUÍDOS do type-check** em `tsconfig.app.json`, incluindo `security-simulations.test.ts` e `validation.test.ts` — testes críticos podem passar com erros TypeScript não detectados.
  - `noImplicitReturns: false` — permite funções sem return em paths.
  - `noUnusedLocals: false` + `noUnusedParameters: false` — permite código morto silencioso.
  - Paths: apenas `@/*` → `./src/*` (simples e OK).
- Achados novos: **F1-15** (testes excluídos do type-check), **F1-16** (noImplicitReturns/noUnusedLocals/noUnusedParameters off).
- **Pode ainda esconder bugs:** `bun run check:barrels` não executado — ciclos de import podem existir.

### Etapa 10 — `bun run check:deadcode` + cruzar git blame

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** dead code visual (raiz suja, `functions-legacy`, `fatorx-migrations`, `playwright.e2e.config.fixed.ts`).
- **Pode ainda esconder bugs:** script formal `check:deadcode` não executado — pode revelar arquivos/exports não usados dentro de `src/`.

---

## Bloco 2 — Auditoria do banco (etapas 11-20)

### Etapa 11 — Zero tabela sem RLS + snapshot

- **Status:** ✅ Descoberta concluída (nada a corrigir)
- **Descoberto:** 682/682 tabelas com RLS. Hardening prévio bem-sucedido.

### Etapa 12 — SECDEF `zapp.*` chamáveis por `authenticated`

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** 119 SECDEF+`authenticated` em `zapp` — F2-04.
- **Pode ainda esconder bugs:** categorização individual (a/b/c) não feita; pode ter TRIGGER functions com grant incorreto (como as 6 identificadas em `public`).

### Etapa 13 — SECDEF nos outros schemas

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** contagem em `financeiro` (25), `public` (19), `artes` (11), `vendas` (5). Total das SECDEF+authenticated em 5 schemas = 179.
- **Pode ainda esconder bugs:** `evo`, `ops`, `bpm`, `ai`, `email_app`, `logistica` não inspecionados — provavelmente há mais SECDEF+authenticated escondidas ali.

### Etapa 14 — Views sem `security_invoker=on`

- **Status:** ✅ Descoberta concluída (nada a corrigir)
- **Descoberto:** 0 views regulares sem `security_invoker`.

### Etapa 15 — 149 crons: overlaps + duplicatas

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** 4 pares duplicados (F2-06), 6 VACUUMs empilhados 02:06-02:21 (F2-07), chain de 7 logflare cleanups (F2-08).
- **Pode ainda esconder bugs:** 103 jobs (fora do filtro por padrão de nome) não catalogados — podem ter mais overlaps/duplicatas.

### Etapa 16 — Cron failures rolling 7 d

- **Status:** ✅ Bugs principais descobertos (nesta rodada)
- **Descoberto:** 3 crons falhando nos últimos 7 dias:
  - **`link-orphan-messages`** — 1 falha em 31/07. **Crítico:** este cron liga `evo.evolution_webhook_events` → `zapp.messages` (via `messages` view). Falha pode ter deixado mensagens órfãs.
  - **`media_pipeline_health_check`** — 4 falhas em 30/07 (04:00 até 16:00 — falhando repetidamente durante o dia). Pipeline de mídia potencialmente comprometido.
  - **`analytics-log-retention`** — 2 falhas em 30 e 31/07. LGPD/retention pode estar quebrado.
- Achados novos: **F2-14** (link-orphan-messages), **F2-15** (media_pipeline_health_check), **F2-16** (analytics-log-retention).

### Etapa 17 — EXPLAIN ANALYZE das 15 queries mais lentas

- **Status:** ✅ Bugs principais descobertos (top-12 identificados)
- **Descoberto:** top-12 slow queries por consumo total via `pg_stat_statements` (F2-09 regression_tests 8,8s, F2-10 588k INSERTs unitários, F2-11 health_score_cached não cacheado, F2-12 PostgREST cache thrashing).
- **Pode ainda esconder bugs:** planos de execução não capturados — EXPLAIN pode revelar seq scans e falta de índices específicos. Mas os bugs de maior impacto foram capturados.

### Etapa 18 — Índices ausentes em FKs via `hypopg + index_advisor`

- **Status:** ⚠️ Descoberta parcial
- **Descoberto:** F2-13 (índice parcial unread inbound) por análise manual — **corrigido nesta rodada: F2-13 estava errado porque `zapp.messages` é VIEW, não tabela** (ver F2-17).
- **Pode ainda esconder bugs:** `hypopg + index_advisor` não usadas — provavelmente há mais índices sugeridos para as top queries.

### Etapa 19 — Índices duplicados/não usados

- **Status:** ❌ Não iniciado
- **Descoberto pelo advisor:** 1 índice não-usado (`_wal_slot_guard_events.idx_wsg_detected`).
- **Executar:** `SELECT schemaname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) FROM pg_stat_user_indexes WHERE schemaname IN ('zapp','evo') AND idx_scan < 10 ORDER BY pg_relation_size(indexrelid) DESC;`

### Etapa 20 — Partições: `auto-create-monthly-partitions` (cron 64) gerando 2026-08+?

- **Status:** ✅ Bugs principais descobertos + descoberta arquitetural (nesta rodada)
- **Descoberto:**
  - **`zapp.messages` é VIEW**, não tabela particionada. O plano assumiu que era tabela — **isso corrige F2-13** (índice não pode ser criado em view).
  - View definition tem CASE/COALESCE/LIKE em `media_url` — re-executa a cada consulta PostgREST, explicando as "3 top queries pgrst_source em zapp.messages 13-14 s cada" citadas no levantamento.
  - Partições em `evo.evolution_webhook_events_v2` existem até **2027-06** (12 meses adiantadas). Cron 64 funcionando corretamente.
  - `evo.evolution_messages` também tem 23 partições.
- Achado novo crítico: **F2-17** (arquitetura view-layer sobre evo — implicação para performance e para F2-13).

---

## Blocos 3-10 (etapas 21-100) — Status: ❌ NÃO INICIADOS

Roteiro em `PLANO_QA_ANALISE_100.md`. Nenhuma etapa iniciada.

---

## Novos achados desta rodada de execução (11 total)

Adicionados ao `PLANO_IMPLEMENTACAO_100.md`:

**Tema 2 — Gates de CI e qualidade (2 novos):**
- **F1-15** — tsconfig exclui 11 testes do type-check (inclui `security-simulations` e `validation`).
- **F1-16** — `noImplicitReturns/noUnusedLocals/noUnusedParameters` desligados.

**Tema 6 — Frontend/router/arquitetura (6 novos):**
- **F1-17** — 20+ itens de menu sem `requiredRoles` (visibility mismatch).
- **F1-18** — `campaigns` duplicado em `primaryNav` e `automationNav`.
- **F1-19** — 248 arquivos em `src/hooks/` (excesso).
- **F1-20** — god-hooks de 20-51 KB violam SRP.
- **F1-21** — duplicatas semânticas em 7+ áreas.
- **F1-22** — arquitetura dupla (service/repository vs god-hooks).

**Tema 5 — Cron (3 novos):**
- **F2-14** — `link-orphan-messages` falhou 31/07 (mensagens órfãs potenciais).
- **F2-15** — `media_pipeline_health_check` 4 falhas 30/07.
- **F2-16** — `analytics-log-retention` 2 falhas 30-31/07 (LGPD retention).

**Tema 4 — Performance / arquitetura (1 novo crítico):**
- **F2-17** — `zapp.messages` é VIEW compat sobre `evo.evolution_messages`; corrige F2-13 (índice deve ser em `evo`, não em `zapp`).

---

## Status para o próximo chat

**Blocos 1-2:** descoberta em 90% (bugs principais capturados em 18 de 20 etapas). Pendências:
- **P0 (podem esconder bugs críticos ainda não vistos):**
  - Etapa 4 — UI/Storybook (não iniciada)
  - Etapa 19 — índices duplicados/não usados nos particionados (não iniciada)
- **P1 (bugs conhecidos ainda podem ter mais instâncias):**
  - Etapa 13 — SECDEF em `evo/ops/bpm/ai/email_app/logistica`
  - Etapa 15 — 103 crons não catalogados
  - Etapa 18 — `hypopg + index_advisor` nas top queries
- **P2 (entregáveis de correção, não descoberta):**
  - Etapa 11 — snapshot RLS markdown
  - Etapa 12 — CSV SECDEF `zapp` categorizado
  - Etapa 17 — EXPLAIN ANALYZE plans para F2-09/10/11
  - Etapa 5 — tabela cruzada page × rota × hooks × services

**Blocos 3-10:** 80 etapas ainda a executar. Recomendação: seguir para Bloco 3 (auth), pois P0 restante é pequeno.

---

## Achados totais catalogados

`PLANO_IMPLEMENTACAO_100.md`: **38 achados** (14 do Bloco 1 + 13 do Bloco 2 + 11 novos desta rodada).
