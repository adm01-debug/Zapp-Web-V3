# REVISÃO DO CORPO DOS 172 ACHADOS (Blocos 1-8)

**Base:** `docs/audits/PLANO_IMPLEMENTACAO_100.md` · **Método:** `docs/audits/HANDOFF_REVISAO_BACKLOG.md`
**Status geral:** Lote A concluído (60/172) · Lotes B e C pendentes.

| Lote | Blocos | Achados | Status | Sessão | Resultado |
|---|---|---:|---|---|---|
| A | F2, F5, F8 | 60 | ✅ concluído | 2026-08-02 | 40 ✅ · 6 ⚠️ · 3 🔄 · 10 📝 · 1 ❓ |
| B | F4, F6 | 54 | ⬜ pendente | — | — |
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
