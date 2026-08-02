# REVISÃO DO CORPO DOS 172 ACHADOS (Blocos 1-8)

**Base:** `docs/audits/PLANO_IMPLEMENTACAO_100.md` · **Método:** `docs/audits/HANDOFF_REVISAO_BACKLOG.md`
**Status geral:** Lotes A e B concluídos (114/172) · Lote C pendente.

| Lote | Blocos | Achados | Status | Sessão | Resultado |
|---|---|---:|---|---|---|
| A | F2, F5, F8 | 60 | ✅ concluído | 2026-08-02 | 40 ✅ · 6 ⚠️ · 3 🔄 · 10 📝 · 1 ❓ |
| B | F4, F6 | 54 | ✅ concluído | 2026-08-02 | 44 ✅ · 4 ⚠️ · 2 🔄 · 4 📝 |
| C | F1, F3, F7 | 58 | ⬜ pendente | — | — |

---

## Resumo executivo do Lote A

**Taxa de defeito de referência/evidência: 9/60 = 15%** (6 ⚠️ REFERÊNCIA + 3 🔄 OBSOLETO) — coerente com os ~12% da amostragem de origem.
Somando o defeito estrutural do bloco F2 (10 📝), **20 dos 60 achados não estão prontos para a esteira**.

### Os 3 achados que causariam dano se executados como escritos

1. **F8-10** — `git rm src/pages/SLADashboard.tsx` **quebraria o build**. O arquivo é o entrypoint da rota `/sla` (`AppRoutes.tsx:25`).
2. **F8-01** — remover `SLAAlertPreferences.tsx` removeria uma **página roteada e funcional** (`/sla/preferences`, `AppRoutes.tsx:27,144-147`).
3. **F2-13** — `CREATE INDEX CONCURRENTLY ... ON zapp.messages` **falha**: `zapp.messages` é VIEW e a base `evo.evolution_messages` é particionada (não aceita `CONCURRENTLY`).

### Dois padrões sistemáticos de erro de medição (previsíveis nos Lotes B e C)

| Padrão | Onde apareceu | O que procurar nos próximos lotes |
|---|---|---|
| **Roteador errado** — a evidência grepou `src/App.tsx`, `src/pages/lazyViews.ts`, `src/pages/ViewRouter.tsx`. Os 3 existem, mas **o roteador de rotas é `src/components/routing/AppRoutes.tsx`**. Grep deu 0 e concluiu "órfão". | F8-01, F8-10 | Todo achado de "página órfã / dead code" no Lote C (F1, F7) precisa ser re-grepado contra `AppRoutes.tsx`. |
| **Função homônima em 2 schemas** — nome não qualificado, e só uma das cópias tem o defeito. | F5-19, F2-02, F2-03 | Antes de qualquer `ALTER`/`REVOKE`/`CREATE OR REPLACE`, rodar a query de resolução de schema do §4 do handoff. |

### Erro de leitura de catálogo (novo, não previsto no handoff)

**F5-14** leu `polqual=NULL` numa policy `INSERT` e concluiu "sem WITH CHECK". Em policy `INSERT` o `polqual` **é sempre NULL** por definição — a expressão vive em `polwithcheck`. A policy é restritiva (admin/supervisor). **Regra para os próximos lotes:** para `polcmd='a'`, ler `polwithcheck`; nunca `polqual`.

---

## Vereditos — Bloco F2 (13 achados)

> **Nota estrutural:** os 13 achados F2 são títulos-resumo herdados do Bloco 2 — **não possuem seções `Evidência`/`Ação`/`Aceite`**. A substância de cada um foi revalidada e confirmada abaixo, mas a dimensão 4 (aceite verificável) falha por ausência. Todos recebem `📝 AÇÃO FRÁGIL (estrutural)` salvo quando há defeito adicional.

| Achado | Veredito | Evidência da revisão | Correção necessária |
|---|---|---|---|
| F2-01 | 📝 AÇÃO FRÁGIL | 6 funções confirmadas em `public`; `has_function_privilege('authenticated', ..., 'EXECUTE')` = true nas 6 | escrever Ação/Aceite |
| F2-02 | ⚠️ REFERÊNCIA | as 3 existem em `public` **e** em `zapp` (homônimas); `authenticated` tem EXECUTE nas de `public` | ✅ nota adicionada: qualificar `public.` no REVOKE |
| F2-03 | ⚠️ REFERÊNCIA | 7 dos 9 nomes duplicados em `zapp`; `rpc_get_contact` tem 4 overloads entre `public`+`zapp`; `public` tem 19 SECDEF acessíveis a `authenticated` | ✅ nota adicionada: qualificar `public.` |
| F2-04 | 📝 AÇÃO FRÁGIL | **119 exato** confirmado (`prosecdef` + `has_function_privilege('authenticated')` em `zapp`); `docs/audits/secdef-zapp.csv` ainda não existe (é entregável) | escrever Ação/Aceite |
| F2-05 | 📝 AÇÃO FRÁGIL | **25 / 11 / 5 exatos** confirmados (`financeiro` / `artes` / `vendas`) | escrever Ação/Aceite |
| F2-06 | 📝 AÇÃO FRÁGIL | 4 pares confirmados com jobids exatos: 190+189, 54+152, 209+61, 99+216. Pares 99/216 e 54/152 têm alvo idêntico e retenções divergentes (30d vs 3d) | escrever Ação/Aceite |
| F2-07 | 📝 AÇÃO FRÁGIL | exatamente **6** VACUUMs entre 02:06 e 02:21 (jobs 133, 184, 185, 183, 135, 136) | escrever Ação/Aceite |
| F2-08 | 📝 AÇÃO FRÁGIL | exatamente **7** jobs logflare entre 03:00 e 03:45 (218-224) | escrever Ação/Aceite |
| F2-09 | 📝 AÇÃO FRÁGIL | `ops.fn_regression_tests` = **8.803 ms** de média (`pg_stat_statements`) — confere com os 8,8 s | escrever Ação/Aceite |
| F2-10 | 📝 AÇÃO FRÁGIL | INSERTs unitários em `financeiro.pagamentos_diarios`: **1.235.584** desde o reset de 31/07 (2 fingerprints: 964.992 + 270.592). Número do PLANO (588.042) é de janela anterior | escrever Ação/Aceite; atualizar o número |
| F2-11 | 📝 AÇÃO FRÁGIL | `zapp.fn_system_health_score_cached` = **287,6 ms** / 544 chamadas — confere com os 289 ms | escrever Ação/Aceite |
| F2-12 | ❓ INDETERMINÁVEL | `pg_stat_statements` foi resetado em **2026-07-31 18:36** — os 203 s de introspection não são reproduzíveis nesta janela | re-medir após ≥ 7 dias de estatística acumulada |
| F2-13 | ⚠️ REFERÊNCIA | `zapp.messages` é **VIEW** sobre `evo.evolution_messages` (**particionada**, `relkind='p'`); view remapeia `direction` `'inbound'→'incoming'`; índice equivalente não existe hoje | ✅ SQL reescrito no PLANO (índice na base + estratégia por partição) |

---

## Vereditos — Bloco F5 (30 achados)

| Achado | Veredito | Evidência da revisão | Correção necessária |
|---|---|---|---|
| F5-01 | ✅ VÁLIDO | `pg_get_viewdef` confirma `NULL::text AS cpf`, `false AS is_blocked`, `false AS is_favorite`, filtro `deleted_at IS NULL`, `workspace_id` via `get_default_workspace_id()` | — |
| F5-02 | ✅ VÁLIDO | `zapp.fn_contacts_view_update_handler` não menciona `deleted_at`, `lgpd*` nem `workspace_id`; propaga `queue_id` e `whatsapp_labels` | — |
| F5-03 | ✅ VÁLIDO | body literal: `DELETE FROM evo.evolution_contacts WHERE id = OLD.id; RETURN OLD;` | — |
| F5-04 | ✅ VÁLIDO | `RAISE EXCEPTION 'merge_contacts: implementacao pendente (etapa 30)'` confirmado; `merge_source_id IS NOT NULL` = 0 rows | — |
| F5-05 | ✅ VÁLIDO | view `zapp.contacts` não tem `deleted_by` nem `deleted_reason`; `evo.evolution_contacts` tem `deleted_reason` e **não** tem `deleted_by` — exatamente como a Ação descreve | — |
| F5-06 | ✅ VÁLIDO | 44 colunas em `evo.evolution_contacts`, nenhuma `cpf`/`cnpj` | ✅ nota adicionada: já existe `pii_masked_at`, avaliar reuso antes de criar `pii_cpf_masked_at` |
| F5-07 | ✅ VÁLIDO | `validate_cpf` e `validate_cnpj` **não existem** em nenhum schema; só `zapp.mask_cpf` | — |
| F5-08 | ✅ VÁLIDO | 4 funções SQL confirmadas em `zapp` + `regexp_replace` inline em `bulk_auto_merge_duplicates` + `cleanPhone` local em `useContactIntelligence.ts:102` | (enriquecimento opcional) existem 2 implementações a mais: `src/lib/formatters.ts:49` (`\D`) e `src/hooks/useContactIntelligence.ts:39` |
| F5-09 | ✅ VÁLIDO | body confirmado: `INSERT INTO zapp.contact_notes (contact_id, author_id, content)`; tabela tem exatamente 6 colunas | — |
| F5-10 | ✅ VÁLIDO | `.from('contact_notes').insert({...})` em `useContactNotes.ts` **l.115-116** (PLANO diz ~100-115) | — |
| F5-11 | ✅ VÁLIDO | `COUNT(*) FROM zapp.contact_notes` = 0 | — |
| F5-12 | ✅ VÁLIDO | `search_contacts_cursor` usa `ILIKE`; índices trgm existem só em `push_name` e `email`, não em `full_name` | — |
| F5-13 | ✅ VÁLIDO | `uq_tags_name` UNIQUE em `(name)` confirmado; `zapp.workspaces` existe (1 row) | (contexto) `zapp.tags` = 0 rows → risco estrutural sem impacto vivo hoje |
| F5-14 | 🔄 OBSOLETO | **falso positivo:** `contacts_insert` (`polcmd='a'`) **tem** `WITH CHECK` restringindo a admin/supervisor. `polqual=NULL` é normal em policy INSERT — a medição leu a coluna errada | ✅ marcado `~~OBSOLETO~~` + revalidação. Risco residual (não valida `assigned_to`) registrado no corpo |
| F5-15 | ✅ VÁLIDO | `contacts_select` qual contém `OR (assigned_to IS NULL)` sem filtro de workspace | (enriquecimento) `contacts_update` tem a **mesma** cláusula — incluir no escopo |
| F5-16 | ✅ VÁLIDO | `get_default_workspace_id()` = `SELECT id FROM zapp.workspaces ORDER BY created_at LIMIT 1`; `evo.evolution_contacts` sem `workspace_id`; view usa a constante | — |
| F5-17 | ✅ VÁLIDO | `bulk_add_tag` **não** contém `array_length`; `bulk_soft_delete_contacts` contém (confirma o contraste citado) | — |
| F5-18 | ✅ VÁLIDO | `array_agg(ct.id ORDER BY coalesce(ct.total_messages,0) DESC, ct.created_at ASC)` confirmado; corpo **não menciona `lgpd`** | — |
| F5-19 | ⚠️ REFERÊNCIA | hardcode `evolution_messages_wpp2` existe **só em `zapp.get_contact_intelligence_by_phone`**; a homônima `public.` não tem. Distribuição: wpp2=17.493, wpp_pink_test=2.949, outras=4 | ✅ nota adicionada: qualificar `zapp.` na Ação |
| F5-20 | ✅ VÁLIDO | body confirmado: `FROM evo.evolution_contacts WHERE deleted_at IS NULL GROUP BY lead_status`, sem filtro de workspace | — |
| F5-21 | ✅ VÁLIDO | `WITH total` (COUNT CTE) presente no corpo | — |
| F5-22 | ✅ VÁLIDO | `c.phone ILIKE` presente; `fn_normalize_phone` **ausente** do corpo | — |
| F5-23 | ✅ VÁLIDO | `c.company` aparece na função apenas como filtro dedicado, não no `OR` da busca geral — consistente com o texto do achado | — |
| F5-24 | ⚠️ REFERÊNCIA | arquivo canônico é `src/features/contacts/hooks/useContactsSearch.ts` **l.159**; `src/hooks/useContactsSearch.ts` é re-export de 2 linhas | ✅ caminho corrigido no PLANO |
| F5-25 | ✅ VÁLIDO | duas queries confirmadas (`from('contact_notes')` l.63, `from('profiles')` l.42 e l.82); nenhum `.limit(` no arquivo | — |
| F5-26 | ✅ VÁLIDO | **20.446** contatos (PLANO: 20.445 — drift natural); `lgpd_consent_at`, `lgpd_opt_out_at` e `lgpd_last_updated_at` = **0** cada | — |
| F5-27 | ✅ VÁLIDO | `COALESCE(NULLIF(NEW.remote_jid,''), NULLIF(NEW.external_id,''), NEW.phone \|\| '@s.whatsapp.net')` literal; corpo **não menciona `@g.us`** | — |
| F5-28 | ✅ VÁLIDO | 4 overloads (2 assinaturas × `public`+`zapp`); **nenhuma** filtra `lgpd_opt_out`; só 2 filtram `deleted_at` | — |
| F5-29 | ✅ VÁLIDO | 0 FKs envolvendo `zapp.empresas`; 6 colunas exatas; 51.688 rows | — |
| F5-30 | 📝 AÇÃO FRÁGIL | 11 colunas confirmadas, mas `zapp.tags` = **0 rows**: o passo "migrar dados" é no-op e o Aceite original já é verdadeiro hoje | ✅ Aceite reescrito no PLANO (4 critérios discriminantes) |

---

## Vereditos — Bloco F8 (17 achados)

| Achado | Veredito | Evidência da revisão | Correção necessária |
|---|---|---|---|
| F8-01 | 🔄 OBSOLETO | **falso positivo:** página **está roteada** — `AppRoutes.tsx:27` + rota `/sla/preferences` (l.144-147). A evidência grepou 3 arquivos que existem mas não são o roteador. Arquivo tem **221** linhas, não 215. `sla_alert_preferences` = 0 rows continua verdadeiro | ✅ `~~OBSOLETO~~` + reescrito como problema de descoberta/UX, com Aceite novo |
| F8-02 | ✅ VÁLIDO | `bpm`: `r=41, i=62`, zero views/matviews/funções; `bpm_cards` e `bpm_sla_records` = 0 rows; 41 views `zapp.bpm_*` + 41 `public.bpm_*` = 82 (confere) | — |
| F8-03 | ✅ VÁLIDO | contagens confirmadas: `conversation_sla`=0, `sla_delivery_violations`=2, `sla_delivery_rules`=2, `sla_violations`/`sla_history`/`sla_rules`/`sla_policies`=0, `bpm_sla_records`=0 | — |
| F8-04 | ✅ VÁLIDO | ambos os bodies são `BEGIN RETURN NEW; END;` (131 e 141 chars); triggers `bpm_sla_on_create` e `bpm_sla_on_move` confirmados em `bpm.bpm_cards`, `tgenabled='O'` | ✅ nota adicionada: existe **3º** trigger SLA não citado — `trg_check_card_sla` → `zapp.fn_check_card_sla` |
| F8-05 | ✅ VÁLIDO | cron 198 = `SELECT zapp.bpm_check_breached_slas();` (`*/5 * * * *`, 736 execuções succeeded); **0 crons** chamam `fn_check_all_cards_sla` | (detalhe) o UPDATE também seta `breached_at` |
| F8-06 | ✅ VÁLIDO | `pg_policies WHERE schemaname='bpm'`: **82 policies / 41 tabelas / 82 com `qual='true'`** | — |
| F8-07 | ✅ VÁLIDO | fallbacks `: 100` confirmados em `useSLAMetrics.ts` **l.95** (geral) e **l.125** (por agente) | — |
| F8-08 | ✅ VÁLIDO | `queues`/`queue_positions`/`queue_members`/`sticky_assignments` = 0; comentário v2 presente no corpo | ✅ ressalva adicionada: o comentário v2 está **desatualizado** — a view hoje expõe `ec.queue_id` real, não `NULL::uuid` |
| F8-09 | ⚠️ REFERÊNCIA | `evo.evolution_health_logs` **não está vazia** — 1 row (`performed_at` 2026-06-13, `created_at` 2026-07-01). Fora da janela de 1h, então `NO_PEAK_DATA` se mantém. Cron 163: **245** succeeded, última 2026-08-02 15:45 (PLANO: 237 / 13:45) | ✅ evidência corrigida no PLANO |
| F8-10 | 🔄 OBSOLETO | **falso positivo — NÃO EXECUTAR:** `AppRoutes.tsx:25` faz `lazyWithRetry(() => import('@/pages/SLADashboard'))`, usado na rota `/sla` (l.128-131). `git rm` quebraria o build | ✅ `~~OBSOLETO~~` + redirecionado para F1-12 (homônimos) |
| F8-11 | ✅ VÁLIDO | 3 policies confirmadas; `users_own_preferences` (`user_id = auth.uid()`) é subset estrito de `auth_secure_105` (`... OR is_admin_or_supervisor()`) | — |
| F8-12 | ✅ VÁLIDO | arquivo tem exatamente 2 linhas, conteúdo confirmado | ✅ nota adicionada: existe 1 consumidor real — `src/hooks/__tests__/useSLAHistory.test.tsx:14` |
| F8-13 | ✅ VÁLIDO | `sla_delivery_rules`: `F4 SLA` (2026-05-04T01:38:46Z) e `E2 Race` (2026-05-04T09:11:46Z); `sla_delivery_violations` = 2 rows; coluna `detected_at` existe → DELETE da Ação é executável | — |
| F8-14 | ✅ VÁLIDO | cron 205 = `SELECT ops.fn_verify_alert_delivery()` (`*/10 * * * *`, 368 succeeded); corpo contém `notify_request_id` | — |
| F8-15 | ✅ VÁLIDO | `pg_indexes` em `bpm.bpm_sla_records` retorna 1 row: `bpm_sla_records_pkey` | (detalhe) tabela **não** é particionada → `CREATE INDEX CONCURRENTLY` da Ação funciona |
| F8-16 | ✅ VÁLIDO | 1 row com `source='fn_verify_alert_delivery'` em **2026-07-31T18:40:00.123Z**, nenhuma depois; `warroom_alerts` total = 4.509 (PLANO: 4.501) | — |
| F8-17 | ✅ VÁLIDO | `proconfig` = `search_path=zapp, evo, monitoring` (sem `bpm`); 41 views `zapp.bpm_*` sustentam a resolução implícita | ✅ o "(confirmar)" do passo 3 virou fato: `bpm_refresh_dashboards` e `bpm_check_breached_slas` têm o mesmo `search_path` |

---

## Achados novos gerados por esta revisão (não são F-IDs; registrar se relevante)

1. **`contacts_update` repete a falha do `contacts_select`** — mesma cláusula `OR (assigned_to IS NULL)` em `qual` **e** em `with_check`. F5-15 só cobre o SELECT.
2. **`bpm.bpm_cards` tem 3 triggers SLA**, não 2 — `trg_check_card_sla` → `zapp.fn_check_card_sla` não aparece em nenhum achado F8.
3. **Comentário v2 de `zapp.rpc_queue_sla_panel` está desatualizado** e induz a diagnóstico errado (afirma hardcode `NULL::uuid` em `zapp.contacts.queue_id` que não existe mais).
4. **`pg_stat_statements` foi resetado em 2026-07-31 18:36** — todo achado com número de performance anterior a essa data precisa de re-medição (afeta F2-10 e F2-12; verificar F3/F7 no Lote C).
5. **`docs/audits/secdef-zapp.csv` não existe** — F2-04 o cita como caminho; é entregável, não evidência.

## Recomendações para os Lotes B e C

- **Antes de qualquer coisa no Lote C (F1, F3, F7):** re-grepar todo achado de "página órfã / dead code / rota inexistente" contra `src/components/routing/AppRoutes.tsx`. Dois dos três falsos positivos do Lote A vieram desse erro.
- **No Lote B (F4, F6):** F6-06 já é um caso conhecido de homônima. Rodar a query de resolução de schema (§4 do handoff) para **todos** os nomes de função de uma vez, antes de abrir qualquer achado.
- **Policies:** `polcmd='a'` → ler `polwithcheck`. Nunca concluir "sem restrição" a partir de `polqual=NULL`.

---
---

# LOTE B — F4 (24) + F6 (30) = 54 achados

**Sessão:** 2026-08-02 · **Resultado:** 44 ✅ VÁLIDO · 4 ⚠️ REFERÊNCIA · 2 🔄 OBSOLETO · 4 📝 AÇÃO FRÁGIL · 0 ❓

**Taxa de defeito de referência/evidência: 6/54 = 11%** (4 ⚠️ + 2 🔄). Acumulado A+B: **15/114 = 13%**.

## Resumo executivo do Lote B

### O achado que causaria erro imediato na esteira

**F4-18** manda investigar `fn_messages_instead_of_update` — **função que não existe em nenhum schema**. O trigger real na view `zapp.messages` é `messages_instead_of_update` → **`zapp.messages_update_trigger()`**. O diagnóstico está certo por outra via: a view expõe `error_code`/`error_reason`/`retry_attempt`/`retry_total`, mas `evo.evolution_messages` tem 48 colunas e **nenhuma das quatro** — o writeback não tem destino.

### Dois achados já resolvidos entre a auditoria e esta revisão

- **F4-24** — o schema drift foi corrigido: `zapp.warroom_alerts` **tem** a coluna `severity`, a tabela **não tem nenhuma CHECK constraint** (`chk_warroom_alert_type` não existe mais), e o cron 213 rodou 6/6 com sucesso em 24h.
- **F6-10** — o cron 96 rodou **288/288 (100%)** nas últimas 24h, acima do próprio Aceite (≥97%). A perda de 11% era transitória.

### Padrão novo do Lote B: Aceite mais amplo que a Ação

Três achados têm diagnóstico correto mas **Aceite que nunca fecha** com a Ação proposta — a esteira ficaria presa tentando validar:

| Achado | Ação cobre | Aceite exige |
|---|---|---|
| F6-06 | refatorar **3** funções com `'wpp2'` | `pg_proc.prosrc` sem `'wpp2'` — há **47** funções |
| F6-07 | `SECURITY DEFINER` em **1** função | todas `fn_alert_*` SECDEF — falta também `zapp.fn_alert_connection_lost` |
| F4-22 | trocar `storage_path` por URL real | `avg(pg_column_size(...))` numa tabela com **0 rows** |

### Ambiguidade de caminho nos achados F4

As Evidências F4 citam **nomes de arquivo sem caminho**, e dois têm homônimo real (arquivos distintos, não re-exports): `useRealtimeMessages.ts` (canônico em `src/features/inbox/hooks/`, 697 l.; existe outro em `src/hooks/`, 310 l.) e `useMediaUrl.ts` (canônico em `src/features/inbox/hooks/`; existe outro em `src/lib/`). Os **números de linha estão todos defasados** — as 16 linhas revalidadas foram registradas em nota de bloco no PLANO. Regra: localizar por símbolo, nunca por linha.

---

## Vereditos — Bloco F4 (24 achados)

| Achado | Veredito | Evidência da revisão | Correção necessária |
|---|---|---|---|
| F4-01 | ✅ VÁLIDO | `SEEDED_CONTACT_LIMIT=500` / `RECENT_MESSAGES_LIMIT=1000` em l.24-25, usados em `.limit()` nas l.377/384 | ✅ nota de bloco: caminho canônico + linha real |
| F4-02 | ✅ VÁLIDO | `fetchConversations` (l.369): `setLoading(true)` → 2 `await dbFrom` → `commitConversations` → `finally { setLoading(false) }`, **sem guard `active`** | ✅ nota de bloco |
| F4-03 | ✅ VÁLIDO | `const channelName = \`messages-realtime-${Math.random()...}\`` em **l.427** | ✅ nota de bloco |
| F4-04 | ✅ VÁLIDO | `conversationSendState` declarado l.588, loop até l.613, fora de `useMemo` (o `useMemo` da l.617 é do `filteredConversations`) | — |
| F4-05 | ✅ VÁLIDO | `const USE_EXTERNAL_DB = true;` em `useRealtimeInbox.ts` **l.33** (PLANO: 27) | — |
| F4-06 | ✅ VÁLIDO | `void supabase.functions.invoke('evolution-api', { action: 'read-messages' })` l.383-385, sem `.catch` | — |
| F4-07 | ✅ VÁLIDO | `const recent = selectedMessages.slice(-10)` l.358 | — |
| F4-08 | ✅ VÁLIDO | `seededAvatarsRef = useRef<Set<string>>(new Set())` l.142, sem TTL/sweep | (estrutural) achado sem seção `Evidência` |
| F4-09 | ✅ VÁLIDO | `log.info('[probe] conversations state', ...)` l.121, sem guard `import.meta.env.DEV` | — |
| F4-10 | ✅ VÁLIDO | `processedDeliveriesRef = useRef<Set<string>>(new Set())` l.90; `.add()` l.441 sem remoção | — |
| F4-11 | ✅ VÁLIDO | `localStorage.setItem(QUEUE_STORAGE_KEY, ...)` l.169 sem try/catch | — |
| F4-12 | ✅ VÁLIDO | `grep beforeunload` em `useMessageQueue.ts` = 0 hits — ausência confirmada | (estrutural) sem `Evidência` |
| F4-13 | ✅ VÁLIDO | `shouldAutoRetry = itemToProcess.retryCount < config.maxRetries` l.308 — sem classificação de 4xx | — |
| F4-14 | ✅ VÁLIDO | `dbFrom('failed_messages')` l.343 com `.then()` e sem `.select()` l.355; `zapp.failed_messages` = **0 rows** | — |
| F4-15 | ✅ VÁLIDO | happy path confirmado: `dbFrom('messages')` l.43 → `audit_logs` l.70 → `dbFrom('contacts')` l.80 → `dbFrom('messages')` l.91 → `audit_logs` l.95 → … (≥8 round-trips) | — |
| F4-16 | ✅ VÁLIDO | `DEFAULT_BUCKET_MS = 5 * 60 * 1000` em **`src/lib/sendIdempotency.ts` l.54**; função na l.114 | ✅ caminho adicionado no PLANO |
| F4-17 | ✅ VÁLIDO | `.catch((e: unknown) => log.warn('Failed to write retry audit log', e))` l.203 | — |
| F4-18 | ⚠️ REFERÊNCIA | **`fn_messages_instead_of_update` não existe.** Trigger real: `messages_instead_of_update` → `zapp.messages_update_trigger()`. View expõe as 4 colunas; `evo.evolution_messages` (48 col.) não tem nenhuma. 8 failed + 23 pending, 0 com `error_reason`/`retry_attempt` | ✅ nome da função corrigido no PLANO |
| F4-19 | ✅ VÁLIDO | **42** mensagens sem external_id — número exato confirmado | — |
| F4-20 | ✅ VÁLIDO | `const refreshCache = new Map<string, string>()` l.75 — sem LRU, sem `maxSize`, sem `sizeCalculation` | ✅ nota de bloco (homônimo `src/lib/useMediaUrl.ts`) |
| F4-21 | ✅ VÁLIDO | `buildFileHash(originalUrlRef.current)` l.176 vs `buildFileHash(dataUrl)` l.214 — chaves diferentes; `zapp.media_cache` = **0 rows** | — |
| F4-22 | 📝 AÇÃO FRÁGIL | tabela vazia → `avg(pg_column_size(storage_path))` retorna NULL antes e depois da correção | ✅ Aceite reescrito (3 critérios discriminantes) |
| F4-23 | ✅ VÁLIDO | `zapp.outbound_message_queue` = **0 rows**; `fn_retry_stuck_messages` faz `UPDATE zapp.outbound_message_queue` (confirmado no corpo); **23 pending** em `zapp.messages` — número exato | — |
| F4-24 | 🔄 OBSOLETO | `warroom_alerts` **tem** `severity`; **0 CHECK constraints** na tabela; cron 213 com **6/6 succeeded** em 24h | ✅ `~~OBSOLETO~~` + revalidação |

---

## Vereditos — Bloco F6 (30 achados)

| Achado | Veredito | Evidência da revisão | Correção necessária |
|---|---|---|---|
| F6-01 | ✅ VÁLIDO | `grep -rni pairing src/` = **1 hit**, exatamente o JSDoc em `useEvolutionApiManagement.ts:296`. Zero implementação | — |
| F6-02 | ✅ VÁLIDO | `handleAddConnection` l.36-76; `.insert({...})` l.53; **zero ocorrências de `createInstance`** no arquivo | — |
| F6-03 | ⚠️ REFERÊNCIA | divergência real permanece, números mudaram: eic `health='degraded'` (não `unhealthy`), `online_instances=1` (não 0), `last_check` 2026-08-02 16:10; wconn `last_connected_at` 2026-08-02 02:31 | ✅ evidência atualizada + Aceite com schemas qualificados |
| F6-04 | ✅ VÁLIDO | 3 fontes confirmadas: `zapp.whatsapp_connections` (3 rows), `evo.evolution_instance_credentials` (1 row), `zapp.instance_registry` (22 rows) | — |
| F6-05 | ✅ VÁLIDO | `ON CONFLICT (request_id) DO UPDATE SET dispatched_at = now()` literal; **361 anômalos de 1609** (22,4%) | ✅ nota: PK já é `id`; passo 2 reduz-se a dropar `..._request_id_key UNIQUE` |
| F6-06 | 📝 AÇÃO FRÁGIL | refs corretas (`zapp.fn_alert_wpp2_disconnection`, `evo.fn_bootstrap_wpp2_instance`, crons 104/120). Mas **47 funções** têm `'wpp2'` em `prosrc` e a Ação refatora 3 | ✅ Aceite reescrito |
| F6-07 | 📝 AÇÃO FRÁGIL | `prosecdef=false` confirmado; as 5 afins citadas são `true`. **Mas `zapp.fn_alert_connection_lost` também é `false`** — o Aceite não fecha com a Ação | ✅ Ação complementada + Aceite reescrito |
| F6-08 | ✅ VÁLIDO | `alert_type='wpp2_disconnection'`: **18 total, 1 resolvido** — números exatos | — |
| F6-09 | ✅ VÁLIDO | cron 104 `*/10 6-23 * * *` confirmado (108 execuções/24h = exatamente 18h de cobertura); `message_pipeline_stalled_alert` `0 8-22 * * *` confirmado | — |
| F6-10 | 🔄 OBSOLETO | cron 96 nas últimas 24h: **288 succeeded / 0 falhas = 100%** | ✅ `~~OBSOLETO~~` + revalidação |
| F6-11 | ✅ VÁLIDO | 6 triggers confirmados com nomes e funções exatos, incluindo os 2 pares divergentes | — |
| F6-12 | ✅ VÁLIDO | corpo contém literalmente o fallback `'https://evolution.atomicabr.com.br'` e a mensagem `api_url invalida: % \| esperado: %` | — |
| F6-13 | ✅ VÁLIDO | `information_schema`: `api_url` NOT NULL sem default, `api_key` NOT NULL sem default — exato | — |
| F6-14 | ✅ VÁLIDO | `evolution_instance_credentials` só tem `wpp2`; `wppmkt` e `wpp_pink_test` órfãs em `whatsapp_connections` | — |
| F6-15 | ✅ VÁLIDO | row confirmada: `name='WPP Marketing (Cloud API Oficial)'`, `api_type='evolution'`, `is_active=false`, `health_status='provisioned'` | — |
| F6-16 | ✅ VÁLIDO | `created_by IS NULL` em **3/3** rows | — |
| F6-17 | ✅ VÁLIDO | `polwithcheck` = `((created_by IS NULL) OR (created_by = auth.uid()))` — literal (leitura correta de `polwithcheck`, não `polqual`) | — |
| F6-18 | ✅ VÁLIDO | `auth_secure_123` presente, `polcmd='r'`, qual = `has_role(auth.uid(),'agent') OR is_admin_or_supervisor()` | — |
| F6-19 | ✅ VÁLIDO | `evo.evolution_ip_watch` = **0 rows** | — |
| F6-20 | ✅ VÁLIDO | corpo contém `BLIND`, `CHECKLIST` e `Traefik`; função tem **128 linhas** (Aceite "<100" é mensurável) | — |
| F6-21 | ✅ VÁLIDO | 361 de 1609 (22,4%) — consequência de F6-05 confirmada | — |
| F6-22 | ✅ VÁLIDO | 7d: `info=860`, `critical=363`, `warning=141` (PLANO: 863/385/141 — drift natural) | — |
| F6-23 | ✅ VÁLIDO | **278** alertas sem `resolved_at` e sem `acknowledged_at` (PLANO: 269) | — |
| F6-24 | ⚠️ REFERÊNCIA | distribuição real: `not_provisioned=20`, `archived=1`, `connected=1`. É **1 provisionada (4,5%)**, não 3 (14%) | ✅ números corrigidos no PLANO |
| F6-25 | ⚠️ REFERÊNCIA | **muito pior que o descrito:** 2.495 rows no total, **100%** com `event_type IS NULL` e `success=false`. Produtor **parou** — última row 2026-08-01 15:40, 0 nas últimas 24h | ✅ evidência corrigida; prioridade sobe |
| F6-26 | ✅ VÁLIDO | 2 test files confirmados. Escopo real: **52 arquivos** (14+32+6), não ~30 | ✅ número corrigido |
| F6-27 | ✅ VÁLIDO | `src/hooks/useEvolutionAutoSync.ts` l.22 `.from('whatsapp_connections')` sem filtro; INSERT na l.76 | — |
| F6-28 | 📝 AÇÃO FRÁGIL | `.catch((e) => log.warn(...))` l.125 confirmado. **Mas `zapp.evolution_pending_deletes` não existe** e a Ação manda enfileirar nela sem passo de criação | ✅ passo de criação do DDL adicionado |
| F6-29 | ✅ VÁLIDO | `if (!newConnection.name)` l.37 é a única validação; `phone_number` entra no INSERT (l.55) sem checagem | — |
| F6-30 | ✅ VÁLIDO | **13 objetos / 5 nomes**, composição exata: `evolution_alerts` 3 (evo:r, public:v, zapp:v), `evolution_instance_credentials` 3, `evolution_reconcile_jobs` 3, `instance_auth_events` 2, `qr_attempts` 2 | — |

---

## Achados novos gerados pelo Lote B

6. **`zapp.fn_alert_connection_lost` também não é SECURITY DEFINER** — segunda exceção do padrão, não citada em F6-07.
7. **`zapp.instance_auth_events` tem 2.495 rows 100% corrompidas e o produtor parou em 2026-08-01** — magnitude muito acima do registrado em F6-25; candidato a P0 próprio.
8. **`zapp.evolution_pending_deletes` é citada como destino em F6-28 mas não existe** — mesmo padrão de `docs/audits/secdef-zapp.csv` em F2-04: alvo de entregável tratado como objeto existente.
9. **Homônimos de arquivo em `src/`** (`useRealtimeMessages.ts`, `useMediaUrl.ts`, `useContactsSearch.ts`, `useContactIntelligence.ts`, `useSLAHistory.ts`, `SLADashboard.tsx`) — o padrão de duplicação entre `src/hooks/`, `src/lib/`, `src/features/` e `src/components/` já apareceu em 3 blocos. F1-12 deveria virar prioridade, pois é a causa-raiz de vários erros de referência.

## Recomendação atualizada para o Lote C (F1, F3, F7)

Além das duas regras já registradas (roteador `AppRoutes.tsx` e `polwithcheck`), somar:

- **Verificar se o Aceite fecha com a Ação.** Três defeitos do Lote B foram desse tipo, nenhum aparecia na amostragem de origem. Pergunta padrão: *"se eu executar exatamente os passos da Ação, o comando do Aceite retorna o valor esperado?"*
- **Confirmar existência de toda tabela/arquivo citado como destino**, não só como origem.
- **Ignorar números de linha** — em F4 todos os 16 estavam defasados. Localizar por símbolo.
