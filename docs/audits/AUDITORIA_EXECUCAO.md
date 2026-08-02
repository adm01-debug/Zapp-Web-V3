# AUDITORIA DA EXECUÇÃO — Blocos 1 e 2 do `PLANO_QA_ANALISE_100.md`

> Cross-check honesto das 20 etapas dos Blocos 1 e 2 contra o que realmente foi executado no chat de análise.
> Objetivo: expor o que foi feito com profundidade real, o que ficou superficial, e o que não foi feito.

**Data da auditoria:** 2026-08-02
**Auditor:** Claude (chat de análise)

---

## Placar geral

| Categoria | Bloco 1 (10 etapas) | Bloco 2 (10 etapas) | Total (20) |
|---|---:|---:|---:|
| ✅ Feito com profundidade | 0 | 1 | **1 (5%)** |
| ⚠️ Parcial/superficial | 5 | 5 | **10 (50%)** |
| ❌ Não feito | 5 | 4 | **9 (45%)** |

**Blocos 3-10 (etapas 21-100):** todos com status ❌ (não iniciados).

**Correção de reporte anterior:** o relatório `RELATORIO_EXECUCAO_ANALISE.md` marcou Blocos 1 e 2 como "✅ Concluído". A rigor, ambos deveriam estar marcados como "⚠️ Percorridos com profundidade parcial — 27 achados capturados, mas ~45% das etapas ainda precisam ser executadas dentro dos próprios blocos".

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

### Etapa 1 — Contar arquivos por extensão + cruzar com `bun.lock` p/ imports órfãos

- **Status:** ⚠️ Superficial
- **Feito:** contagem estrutural de pastas em `src/`; identificação das 5 pastas de teste; listagem visual de raiz suja.
- **Não feito:** contagem exata por extensão (`.tsx`, `.ts`, `.css`); cruzamento com `bun.lock` para detectar imports órfãos.
- **Executar:** `find src -name "*.tsx" | wc -l && find src -name "*.ts" -not -name "*.tsx" | wc -l && find src -name "*.css" | wc -l`; parsear `bun.lock` e cruzar `import from '<pkg>'` contra dependências declaradas.

### Etapa 2 — Mapear rotas React Router + achar pages sem rota E rotas sem page

- **Status:** ⚠️ Parcial
- **Feito:** puxados `App.tsx`, `AppRoutes.tsx`, `AdminRoutes.tsx`, `lazyViews.ts`; identificadas 11 pages sem `<Route>` correspondente (rotas órfãs); catalogadas em F1-13.
- **Não feito:** `ViewRouter.tsx` (10 KB) não foi lido — arquivo central da navegação `?view=X&tab=Y`; validação do inverso (rotas sem page) não feita.
- **Executar:** ler `src/pages/ViewRouter.tsx`; grep global por `<Route path=` contra existência de arquivo destino.

### Etapa 3 — Extrair menu de navegação completo + permissões

- **Status:** ❌ Não feito
- **Feito:** apenas citada existência de sidebar/topbar/admin submenu.
- **Executar:** identificar componentes de sidebar (`src/components/layout/*`, `AppSidebar.tsx`, `MainSidebar.tsx`, etc.), extrair itens de menu, mapear cada `href` → handler → `requiredRoles`.

### Etapa 4 — Inventariar componentes de UI + cobertura Storybook

- **Status:** ❌ Quase nada
- **Feito:** citação isolada de "28 pacotes @radix-ui/react-*".
- **Executar:** listar `src/components/ui/` (wrappers shadcn); classificar cada `src/components/**/*.tsx` como (a) primitivo Radix, (b) wrapper shadcn, (c) componente de domínio; cruzar com `.storybook/` para cobertura.

### Etapa 5 — Tabela `page → rota → feature-slice → hooks → services`

- **Status:** ⚠️ Superficial
- **Feito:** contagem: 46 arquivos + 15 subpastas em `src/pages/`; homônimos detectados (F1-12).
- **Não feito:** a tabela cruzada em si.
- **Executar:** para cada page, extrair via grep: `import.*from '@/features/(\w+)'`, `import.*from '@/hooks/(\w+)'`, `import.*from '@/services/(\w+)'`; gerar CSV.

### Etapa 6 — Mapear hooks customizados + duplicatas semânticas

- **Status:** ❌ Não feito
- **Executar:** listar `src/hooks/*.ts` e `src/features/*/hooks/*.ts`; comparar assinaturas e implementações (semelhança de nome não implica funcionalmente idêntico — precisa leitura).

### Etapa 7 — Mapear services + catalogar cada RPC Supabase

- **Status:** ❌ Não feito
- **Executar:** grep global por `.rpc('` e `.rpc("` para catalogar todas as chamadas de RPC; cruzar com lista de SECDEF do Bloco 2 (F2-04/05).

### Etapa 8 — Mapear contexts/providers + tenant/workspace + feature flags

- **Status:** ⚠️ Parcial
- **Feito:** leitura de `AppProviders.tsx`: QueryClient/Validation/Auth/Theme/HighContrast/Tooltip. Order documentada.
- **Não feito:** auditoria do `AuthProvider` interno; existência de tenant/workspace context não confirmada; existência de feature flags não investigada.
- **Executar:** ler `src/features/auth/AuthProvider.tsx`; grep por `TenantContext`, `WorkspaceContext`, `FeatureFlag`, `PostHog`, `LaunchDarkly`, `unleash`.

### Etapa 9 — Verificar tsconfig paths + `bun run check:barrels`

- **Status:** ❌ Não feito
- **Executar:** ler `tsconfig.app.json` e `tsconfig.json` para listar `paths`; executar `bun run check:barrels` no ambiente do usuário via `code_exec` do Claude Code container.

### Etapa 10 — `bun run check:deadcode` + cruzar git blame

- **Status:** ⚠️ Parcial
- **Feito:** dead code visual (raiz suja, `functions-legacy`, `fatorx-migrations`, `playwright.e2e.config.fixed.ts`).
- **Não feito:** script formal `check:deadcode` não executado; git blame não cruzado.
- **Executar:** via container Claude Code na VPS: `cd /workspace/repos/zapp-web-v3 && bun run check:deadcode`.

---

## Bloco 2 — Auditoria do banco (etapas 11-20)

### Etapa 11 — Zero tabela sem RLS + snapshot markdown

- **Status:** ⚠️ Parcial
- **Feito:** query confirmou 682/682 tabelas com RLS.
- **Não feito:** arquivo `docs/audits/rls-snapshot-2026-08-02.md` não gerado.
- **Executar:** exportar via `SELECT n.nspname, c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('zapp','evo',...)` e salvar como MD.

### Etapa 12 — 429 SECDEF `zapp.*` → CSV categorizado

- **Status:** ⚠️ Parcial
- **Feito:** contagem: 119 SECDEF+`authenticated` em `zapp` (subset das 429 SECDEF totais — as 429 incluem também as chamáveis só por `service_role`).
- **Não feito:** `docs/audits/secdef-zapp.csv` não gerado; sem categorização (a) seguro por design / (b) precisa `SET search_path` / (c) revogar.
- **Executar:** query já pronta em F2-04; enriquecer com `pg_get_functiondef(oid)` truncated hash para deduplicar; exportar CSV.

### Etapa 13 — 506 SECDEF dos outros schemas

- **Status:** ⚠️ Parcial
- **Feito:** contagem em `financeiro` (25), `public` (19), `artes` (11), `vendas` (5) = 60. Total das SECDEF+authenticated em 5 schemas = 179.
- **Não feito:** schemas `evo`, `ops`, `bpm`, `ai`, `email_app`, `logistica` não inspecionados isoladamente.
- **Executar:** rerun da query do F2-04 com `nspname IN ('evo','ops','bpm','ai','email_app','logistica')`.

### Etapa 14 — 30+ views sem `security_invoker=on`

- **Status:** ✅ **Feito com profundidade**
- **Feito:** query confirmou 0 views regulares sem `security_invoker` nos 11 schemas de aplicação; 11 MVs (não aplicável — MVs no PG 15 sempre executam com role do owner).
- **Conclusão:** hardening prévio bem-sucedido; nada a corrigir neste item.

### Etapa 15 — 149 crons: `jobname → schedule → owner → SLO` + overlaps + duplicatas

- **Status:** ⚠️ Parcial
- **Feito:** query filtrada por padrão de nome (`cleanup/vacuum/webhook/partition/refresh`) retornou 46 dos 149 jobs. Achados: 4 pares duplicados, 6 VACUUMs empilhados (02:06-02:21), chain de 7 logflare cleanups (03:00-03:45).
- **Não feito:** 103 jobs restantes (fora dos padrões de nome) não catalogados; não coletei `owner` nem `depende de` nem SLO documentado por job.
- **Executar:** `SELECT jobid, jobname, schedule, active, username FROM cron.job ORDER BY jobname` (sem filtro) para os 149; anotar SLO em documento separado.

### Etapa 16 — Cron failures rolling 7 d

- **Status:** ❌ Não feito
- **Executar:** `SELECT jobname, count(*) FROM cron.job_run_details WHERE status='failed' AND start_time > NOW()-INTERVAL '7 days' GROUP BY 1 ORDER BY 2 DESC;`

### Etapa 17 — EXPLAIN ANALYZE das 15 queries mais lentas + foco em `pgrst_source` em `zapp.messages`

- **Status:** ⚠️ Superficial
- **Feito:** top-12 por consumo total via `pg_stat_statements` (achados F2-09, F2-10, F2-11, F2-12).
- **Não feito:** **zero** EXPLAIN ANALYZE executado; as 3 top queries `pgrst_source` em `zapp.messages` (13-14 s cada segundo o levantamento) não foram diagnosticadas com plano.
- **Executar:** capturar as queries reais das top-15 e rodar `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` para cada uma.

### Etapa 18 — Índices ausentes em FKs via `hypopg + index_advisor`

- **Status:** ❌ Não feito
- **Feito:** propus F2-13 (índice parcial para unread inbound) por análise manual.
- **Não feito:** extensões `hypopg` e `index_advisor` (já instaladas) não foram usadas.
- **Executar:** `SELECT * FROM index_advisor('SELECT ...');` para cada query top-15; ou usar `pg_qualstats` se disponível.

### Etapa 19 — Índices duplicados/não usados via `pg_stat_user_indexes`

- **Status:** ❌ Não feito
- **Feito:** advisor citou 1 índice não-usado (`_wal_slot_guard_events.idx_wsg_detected`).
- **Não feito:** análise dos particionados `pidx_msgs_starred` e `idx_messages_reply_to_id` (23 partições cada) não realizada.
- **Executar:** `SELECT schemaname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) FROM pg_stat_user_indexes WHERE schemaname IN ('zapp','evo') AND idx_scan < 10 ORDER BY pg_relation_size(indexrelid) DESC;`

### Etapa 20 — Partições: `auto-create-monthly-partitions` (cron 64) gerando 2026-08+?

- **Status:** ❌ Não feito
- **Executar:** `SELECT c.relname, pg_get_expr(c.relpartbound, c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('zapp','evo') AND c.relispartition ORDER BY c.relname;` — verificar se partições de agosto/2026 existem para `zapp.messages` e `evo.evolution_messages`.

---

## Blocos 3-10 (etapas 21-100) — Status geral: ❌ NÃO INICIADOS

Roteiro completo em `PLANO_QA_ANALISE_100.md`. Nenhuma etapa desses blocos foi tocada.

Blocos:

- 3 (21-30) — Autenticação e sessão
- 4 (31-45) — Inbox e mensageria
- 5 (46-55) — Contatos e CRM
- 6 (56-65) — Conexões WhatsApp
- 7 (66-75) — Admin e monitoramento
- 8 (76-80) — SLA/BPM
- 9 (81-90) — Resiliência e edge cases
- 10 (91-100) — Cross-browser / a11y / performance

---

## Recomendação para o próximo chat

**Antes de avançar para o Bloco 3, fechar as pendências dos Blocos 1 e 2:**

Prioridade P0 (dados que faltam impedem análise correta dos próximos blocos):
- Etapa 7 — mapear services + RPCs (necessário para cruzar com Bloco 3-8)
- Etapa 12 — CSV das SECDEF `zapp` (necessário para revogar em massa)
- Etapa 13 — completar SECDEF nos 6 schemas faltantes
- Etapa 17 — EXPLAIN ANALYZE das top slow queries (necessário para F2-13 e F2-09/10/11)

Prioridade P1:
- Etapas 15 (149 crons completos), 16 (failures 7d), 18 (índices ausentes), 19 (índices duplicados), 20 (partições agosto).

Prioridade P2:
- Etapas 3, 4, 5, 6, 9 (inventários de menu/UI/pages/hooks/tsconfig — importantes mas não bloqueiam segurança).

**Só depois de fechar essas 12 etapas** avançar para o Bloco 3.

---

## Achados registrados até aqui

- `PLANO_IMPLEMENTACAO_100.md`: **27 achados catalogados** (F1-01 a F1-14, F2-01 a F2-13).
- Todos estão válidos e utilizáveis — a auditoria apenas expõe que 45% das etapas dos Blocos 1-2 ainda podem gerar mais achados.
