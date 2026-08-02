# RELATÓRIO DE EXECUÇÃO DA ANÁLISE — `zapp-web-v3`

> Documento vivo. Atualizado bloco a bloco conforme o `PLANO_QA_ANALISE_100.md` é executado.
> Cada etapa fechada gera 0..N achados; achados vão para `PLANO_IMPLEMENTACAO_100.md`.

---

## Estado geral

| Bloco | Descrição | Status | Achados |
|---|---|---|---|
| 1 | Inventário estrutural e mapeamento (1-10) | ✅ Concluído | 14 (F1-01 a F1-14) |
| 2 | Auditoria do banco (11-20) | ✅ Concluído | 13 (F2-01 a F2-13) |
| 3 | Autenticação e sessão (21-30) | ✅ Concluído | 12 (F3-01 a F3-12) |
| 4 | Inbox e mensageria (31-45) | ✅ Concluído | 24 (F4-01 a F4-24) |
| 5 | Contatos e CRM (46-55) | ✅ Concluído | 30 (F5-01 a F5-30) |
| 6 | Conexões WhatsApp (56-65) | ⏸ Pendente | — |
| 7 | Admin e monitoramento (66-75) | ⏸ Pendente | — |
| 8 | SLA/BPM (76-80) | ⏸ Pendente | — |
| 9 | Resiliência e edge cases (81-90) | ⏸ Pendente | — |
| 10 | Cross-browser / a11y / perf (91-100) | ⏸ Pendente | — |

**Achados até aqui: 93 (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4 + 30 Bloco 5).**

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

_(Detalhes registrados anteriormente.)_

## Bloco 2 — Auditoria do banco (etapas 11-20)

_(Detalhes registrados anteriormente.)_

## Bloco 3 — Autenticação e sessão (etapas 21-30)

_(Detalhes registrados anteriormente.)_

## Bloco 4 — Inbox e mensageria (etapas 31-45)

_(Detalhes registrados anteriormente. 24 achados F4-01 a F4-24 em `PLANO_IMPLEMENTACAO_100.md` Tema 8.)_

---

## Bloco 5 — Contatos e CRM (etapas 46-55)

Arquivos auditados linha a linha:
- `src/features/contacts/index.ts` (barrel, 411 B).
- `src/features/contacts/hooks/useContactAssignment.ts` (1 437 B).
- `src/features/contacts/hooks/useContactCustomFields.ts` (2 658 B).
- `src/features/contacts/hooks/useContactEnrichedData.ts` (7 601 B).
- `src/features/contacts/hooks/useContactIntelligence.ts` (3 823 B).
- `src/features/contacts/hooks/useContactNotes.ts` (5 586 B).
- `src/features/contacts/hooks/useContactStats.ts` (1 899 B).
- `src/features/contacts/hooks/useContactTyping.ts` (6 514 B).
- `src/features/contacts/hooks/useContactsSearch.ts` (9 478 B).

Auditoria SQL profunda:
- View `zapp.contacts` + 3 INSTEAD OF triggers (`fn_contacts_view_insert_handler`, `_update_handler`, `_delete_handler`).
- Tabela `evo.evolution_contacts` (44 colunas, 20 índices).
- Tabela `zapp.contact_intelligence` (15 colunas, 5 índices).
- Tabela `zapp.contact_notes` (6 colunas, 4 índices, 3 RLS policies).
- Tabela `zapp.tags` (11 colunas mistas) + `zapp.contact_tags` (4 colunas).
- Tabela `zapp.empresas` (6 colunas — mínima).
- RPCs auditadas: `bulk_auto_merge_duplicates`, `bulk_soft_delete_contacts`, `bulk_add_tag`, `add_contact_note`, `rpc_get_contact` (4 overloads), `merge_contacts`, `search_contacts_cursor`, `contacts_count_by_type`, `get_contact_intelligence_by_phone` (2 overloads), `fn_normalize_br_phone`, `fn_normalize_phone`, `get_normalized_phone`, `normalize_phone_for_unique`, `is_admin_or_supervisor` (2 overloads), `is_contact_visible_to_user`, `get_default_workspace_id`, `mask_cpf`.

### Base factual do banco (medida em 01/08/2026 22:55 UTC)

| Métrica | Valor |
|---|---|
| `zapp.contacts` (view) total | 20 445 |
| `evo.evolution_contacts` total (incl. deletados) | 20 446 |
| `evo.evolution_contacts` soft-deleted | 1 |
| `zapp.contact_intelligence` total | 20 445 (1:1 com contacts) |
| `contact_intelligence` fresh 7d | **20 445 (100%)** — cron `refresh-health-score-cache` (148) opera OK |
| `zapp.contact_notes` total | **0 rows** (feature dead em produção) |
| Distribuição por instância | wpp2: 17 492 (85,5%); wpp_pink_test: 2 949; comercial_03: 2; outras: 2 (uma delas `instancia_fantasma_999` — data hygiene issue) |
| `evo.evolution_contacts.lgpd_consent_at IS NOT NULL` | **0** |
| `evo.evolution_contacts.lgpd_opt_out_at IS NOT NULL` | **0** |
| `evo.evolution_contacts.lgpd_last_updated_at IS NOT NULL` | **0** |
| `evo.evolution_contacts.merge_source_id IS NOT NULL` | **0** (merge nunca funcionou) |
| `zapp.empresas` total | 51 688 |
| Índices trgm em `evo.evolution_contacts` | `push_name`, `email` (nada em `full_name`, `first_name`, `last_name`, `nickname`, `company`, `phone_number`) |
| Duplicatas identificadas (phone 15 dígitos+) | 5+ pares (formatos anômalos — provavelmente JIDs de outras plataformas) |
| Funções de normalização de phone no banco | **4 divergentes** (`fn_normalize_br_phone`, `fn_normalize_phone`, `get_normalized_phone`, `normalize_phone_for_unique`) |
| Funções de normalização de phone no frontend | +1 (`useContactIntelligence.cleanPhone`) |
| Estratégia usada por `bulk_auto_merge_duplicates` | +1 hand-rolled inline (ignora todas as 5 acima) |

### Etapa 46 — Criar contato

**Descoberta P0**: view `zapp.contacts` é **layer lossy sobre `evo.evolution_contacts`**. Trigger INSERT (`fn_contacts_view_insert_handler`) só propaga 23 dos 50 campos da view. Colunas HARDCODED como NULL/constante que não podem ser gravadas via INSERT:
- `cpf` (não existe em `evo.evolution_contacts`) → **F5-06**
- `address`, `city`, `state` → sem storage
- `country = 'BR'::text` fixed
- `is_blocked = false`, `is_favorite = false` fixed
- `surname` = NULL fixed
- `channel_type = 'whatsapp'` fixed, `channel = 'whatsapp'` fixed
- `ai_priority = 'normal'`, `ai_sentiment = 'neutral'`, `risk_score = 0` fixed
- `channel_connection_id = NULL`
- `workspace_id = get_default_workspace_id()` (constante — sem tenant isolation, **F5-16**)

Sem função `validate_cpf` ou `validate_cnpj` no banco (só `mask_cpf`) — **F5-07**. Sem coluna `cnpj` em lugar nenhum. UI de criação de contato com campo CPF é feature sem persistência.

Trigger INSERT fabricado `remote_jid = NEW.phone || '@s.whatsapp.net'` quebra contatos de grupo (`@g.us`) — **F5-27**.

### Etapa 47 — Editar contato

Trigger UPDATE (`fn_contacts_view_update_handler`) só propaga **16 colunas** para `evo.evolution_contacts`: `full_name`, `phone_number`, `email`, `profile_picture_url`, `lead_status`, `assigned_to`, `queue_id`, `company`, `notes`, `tags`, `whatsapp_labels`, `lead_score`, `last_message_at`, `instance_name`, `raw_data`, `updated_at`.

**Descartados silenciosamente** (34 campos, mesmo padrão do F4-18):
- LGPD: `consent_status`, `lgpd_*` (não gravável via view)
- Soft-delete: `deleted_at`, `deleted_by`, `deleted_reason`
- Tenant: `workspace_id`
- Categorização: `contact_type`, `ai_priority`, `ai_sentiment`, `channel_type`, `group_category`, `risk_score`, `lead_origin`
- Perfil: `nickname`, `surname`, `first_name`, `last_name`, `role_title`, `is_blocked`, `is_favorite`, `cpf`, `address`, `city`, `state`, `country`
- Métricas: `first_message_at`, `unread_count`, `total_purchases`, `last_seen_at`

→ **F5-02** (P0).

Trigger de audit em `zapp.audit_logs` não foi encontrado ligado a `zapp.contacts` — plan mencionou "trigger de audit" mas depende de arquitetura do audit_logs, não de trigger específico. Não é achado direto.

### Etapa 48 — Merge de duplicatas (`bulk_auto_merge_duplicates`)

**Descoberta P0**: `zapp.merge_contacts()` **LEVANTA EXCEPTION `implementacao pendente (etapa 30)` com ERRCODE '0A000'**. Body inteiro:
```sql
IF NOT zapp.is_admin_or_supervisor() THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
RAISE EXCEPTION 'merge_contacts: implementacao pendente (etapa 30)' USING ERRCODE = '0A000';
```

`bulk_auto_merge_duplicates` chama `merge_contacts` em loop — cada chamada aborta a função inteira via exception (transaction rollback). `SELECT COUNT(*) FROM evo.evolution_contacts WHERE merge_source_id IS NOT NULL` retorna **0** — nunca houve merge bem-sucedido em produção. → **F5-04** (P0).

Seleção do primário no `bulk_auto_merge_duplicates`: `ORDER BY total_messages DESC, created_at ASC`. Sem regra LGPD explícita — pode migrar `lgpd_opt_out_at` errado para o merged → **F5-18**.

Estratégia de dedup usa **6ª normalização de phone** (`regexp_replace(phone_number, '\D', '', 'g')` hand-rolled inline), ignorando as 4 funções SQL de normalização e a 5ª do frontend → **F5-08** (P0).

Duplicates snapshot revelou 5+ pares com phones de 15 dígitos (`194879879659641`, etc.) — formatos anômalos (talvez JIDs de outras plataformas misturados). `bulk_auto_merge_duplicates` inclui esses no dedup por default.

### Etapa 49 — Bulk soft-delete (`bulk_soft_delete_contacts`)

**Descoberta P0**: RPC executa `UPDATE zapp.contacts SET deleted_at=now(), deleted_by=auth.uid(), deleted_reason=p_reason`. Colunas `deleted_by` e `deleted_reason` **NÃO EXISTEM na view `zapp.contacts`** — Postgres rejeita statement no parse com `column "deleted_by" of relation "contacts" does not exist`. → **F5-05** (P0).

Mesmo se colunas existissem, trigger UPDATE handler não propagaria `deleted_at` para `evo.evolution_contacts` (F5-02). E trigger DELETE handler faz **HARD DELETE**, não soft-delete → **F5-03** (P0). Requisito LGPD de "soft-delete undo 30d" é impossível de cumprir com arquitetura atual.

Cap de 500 contatos por chamada existe (bom): `IF array_length(p_contact_ids, 1) > 500 THEN RAISE`.

Filtro por workspace: `WHERE workspace_id = (SELECT workspace_id FROM zapp.profiles WHERE id = auth.uid())`. Como view.workspace_id é constante `get_default_workspace_id()`, se `zapp.profiles.workspace_id` do usuário divergir, RPC retorna 0 rows sem erro.

### Etapa 50 — Bulk tag (`bulk_add_tag`)

Verifica `is_admin_or_supervisor()`. INSERT em `zapp.tags` com `WHERE name = p_tag LIMIT 1` para reutilizar tag existente.

**Descoberta P0**: `zapp.tags.name` é UNIQUE **globalmente** (`uq_tags_name`), não por workspace. Se workspace A cria "VIP", workspace B tenta criar "VIP" — RPC pega o `tag_id` de A e associa contatos de B ao tag de A. Cross-workspace tag pollution → **F5-13** (P0).

Sem cap em `array_length(p_contact_ids, 1)` (ao contrário de bulk_soft_delete). 100k UUIDs consome memória do worker → **F5-17**.

Sem check de visibility por contato — admin pode tag contatos de qualquer workspace → **F5-17**.

Schema de `zapp.tags` mistura: `(id, name, color, description, created_by)` (canonical) + `(contact_id, tag_name, confidence, source)` (ML suggestions). Dupla responsabilidade — **F5-30**.

### Etapa 51 — Contact intelligence

Tabela `zapp.contact_intelligence` (20 445 rows, 100% fresh nos últimos 7 dias). Cron `refresh-health-score-cache` (jobid 148) funciona.

RPC `zapp.get_contact_intelligence_by_phone(p_phone text)` faz lógica sofisticada (guards: `unknown` sentinel, min 8 digits, normalização JID). **MAS lê APENAS `evo.evolution_messages_wpp2`** (hardcoded). 2 953 contatos em outras instâncias (wpp_pink_test etc.) recebem intelligence com `total_interactions=0`, sentiment `neutral` mesmo tendo histórico → **F5-19**.

Overload em `public.get_contact_intelligence_by_phone` (para `authenticated`) só valida membership em qualquer workspace, sem filtrar phone por workspace do caller.

Hook `useContactIntelligence.cleanPhone` (frontend): 5ª estratégia de normalização (`replace(/[^0-9]/g, '')`). Se user digita `(41)9988` vs `4199888`, keys diferentes na cache mesmo para mesmo contato → F5-08.

### Etapa 52 — Notes (`add_contact_note`)

**Descoberta P0**: RPC signature aceita `p_note_type text='general'` e `p_is_pinned boolean=false`. Body INSERT usa só `(contact_id, author_id, content)`. `zapp.contact_notes` tabela tem só 6 colunas — nenhuma delas é `note_type` ou `is_pinned`. **Signature mente** → **F5-09** (P0).

**Descoberta P0**: `useContactNotes.addNote` **BYPASSA a RPC** — faz `supabase.from('contact_notes').insert(...)` direto. Segurança depende só de RLS `contact_notes_insert` policy → **F5-10** (P0).

**Descoberta P0**: `zapp.contact_notes` **0 rows** em produção (notes_7d=0, notes_30d=0, total=0). Feature 100% dead — ou UI nunca chama, ou RLS silencia todos os inserts → **F5-11** (P0).

Hook N+1 query: SELECT notes → SELECT profiles.in(authorIds). Sem pagination — carrega todas as notas ao abrir contato. Sem UPDATE mutation (só add + delete) — versionamento impossível → **F5-25**.

### Etapa 53 — Timeline

Não coberto com profundidade neste bloco — depende da lógica de merge de `messages + calls + notes + tasks` em ordem cronológica. Se `contact_notes` está vazia (F5-11), timeline não mostra notas. Se `rpc_get_contact` (F5-28) não filtra opted-out, timeline vaza dados LGPD.

### Etapa 54 — Empresa vinculada

**Descoberta**: `zapp.empresas` tem 51 688 rows mas schema mínimo (6 colunas: `id, created_at, nome, email jsonb, telefone, bitrix_empresa_id`). **Sem FK** entre `zapp.contacts.company` e `zapp.empresas.nome/id`. Coluna `company` em contacts é `text` livre. Plan requer "validar FK cascade em delete" — sem FK, cascade não existe → **F5-29**.

`empresas.email` como `jsonb` é schema anti-pattern. Sem index em `nome`, `telefone`, `bitrix_empresa_id` — busca em 51k rows sempre full scan.

### Etapa 55 — Contact search (`pg_trgm` fuzzy)

**Descoberta P0**: `search_contacts_cursor` NÃO usa pg_trgm. Faz `c.name ILIKE '%X%'`. Índices trgm existem em `evo.evolution_contacts.push_name` e `.email` — RPC busca em `zapp.contacts.name` que é `COALESCE(full_name, push_name, ...)`. Nenhum índice em `full_name`. Sequential scan em 20k+ rows → **F5-12** (P0).

Adicionalmente:
- **F5-21**: CTE de COUNT em cada página (custo dobrado).
- **F5-22**: sem normalização de phone na busca (`c.phone ILIKE '%<literal>%'` — busca formatada não casa com armazenado).
- **F5-23**: só busca em `name`, `email`, `phone` — não em `company`, `job_title`, `nickname`, `cpf`.
- **F5-24**: `useContactsSearch.pageIndexToCursor` sem deep-link support — URL `?p=5` retorna page 0.

RPC `contacts_count_by_type` SECURITY DEFINER **sem filtro por workspace** — data leak agregado → **F5-20**.

RPC `search_contacts_cursor` é **NOT SECURITY DEFINER** (usa RLS do rol chamador). Dinamicamente concatena SQL (`v_query := ... || v_where || ...`) com sanitização via CASE — potencial vetor de injection se novos sort_fields forem adicionados sem validação → risco médio, não achado separado.

### Segurança RLS de `evo.evolution_contacts`

**Descobertas P0** durante auditoria RLS:
- Policy `contacts_insert` tem `polcmd='a'` e **`polqual=NULL`** — sem `WITH CHECK`. Qualquer authenticated pode inserir contato com qualquer `assigned_to` → **F5-14** (P0).
- Policy `contacts_select` permite `(assigned_to IS NULL)` sem filtro por workspace — cross-tenant leak de contatos não atribuídos → **F5-15** (P0).
- `get_default_workspace_id()` retorna workspace mais antigo (`ORDER BY created_at LIMIT 1`) — toda coluna `workspace_id` de contacts é a mesma constante → **F5-16** (P0).

### LGPD compliance

**Descoberta P0**: `evo.evolution_contacts` tem 8 colunas LGPD (`lgpd_consent_at`, `lgpd_opt_out_at`, `lgpd_deletion_requested_at`, `lgpd_marketing_consent`, `lgpd_data_sharing`, `lgpd_profiling`, `lgpd_consent_channel`, `lgpd_last_updated_at`). **Todas ZERO populadas em 20 445 rows**. Trigger UPDATE handler da view não propaga essas colunas — via UI, LGPD é impossível de registrar → **F5-26**.

`rpc_get_contact` (4 overloads: `public` + `zapp`, cada uma com 2 assinaturas) retorna `deals`, `recent_messages`, `tasks` sem filtrar por `lgpd_opt_out_at IS NULL`. Contato opted-out ainda expõe dados → **F5-28** (LGPD violation).

---

## Achados do Bloco 5 (30 itens registrados em `PLANO_IMPLEMENTACAO_100.md` Tema 11)

### View / triggers / soft-delete

- **F5-01** (P0) — view `zapp.contacts` descarta silenciosamente CPF, endereço, is_blocked/is_favorite e vários outros campos (13 colunas HARDCODED).
- **F5-02** (P0) — trigger UPDATE dropa 34 campos (LGPD, soft-delete, workspace, AI, categorização).
- **F5-03** (P0) — trigger DELETE = HARD DELETE (viola requisito LGPD soft-delete 30d).
- **F5-27** — trigger INSERT assume individual (`@s.whatsapp.net`) — quebra suporte a grupos (`@g.us`).

### Merge, bulk actions, RPCs quebradas

- **F5-04** (P0) — `zapp.merge_contacts()` RAISE EXCEPTION `implementacao pendente (etapa 30)`.
- **F5-05** (P0) — `bulk_soft_delete_contacts` referencia colunas `deleted_by`/`deleted_reason` inexistentes na view.
- **F5-17** — `bulk_add_tag` sem cap + sem visibility check por contato.
- **F5-18** — `bulk_auto_merge_duplicates` seleção de primário sem regra LGPD.

### CPF/CNPJ

- **F5-06** (P0) — sem coluna CPF em `evo.evolution_contacts`, sem CNPJ em lugar nenhum.
- **F5-07** (P0) — sem `validate_cpf`/`validate_cnpj` no banco (só `mask_cpf`).

### Normalização de telefone

- **F5-08** (P0) — 5 estratégias divergentes (4 SQL + 1 JS) + 6ª hand-rolled em `bulk_auto_merge_duplicates`.

### Notes

- **F5-09** (P0) — `add_contact_note` descarta `p_note_type`/`p_is_pinned` (colunas não existem).
- **F5-10** (P0) — `useContactNotes.addNote` bypassa a RPC — INSERT direto na tabela.
- **F5-11** (P0) — `zapp.contact_notes` 0 rows em produção — feature 100% dead.
- **F5-25** — hook com N+1 query + sem pagination + sem edit mutation.

### Contact Intelligence

- **F5-19** — `get_contact_intelligence_by_phone` lê SÓ `evo.evolution_messages_wpp2` (multi-instância bug — afeta 2 953 contatos).

### Search / listagem

- **F5-12** (P0) — `search_contacts_cursor` NÃO usa `pg_trgm` — full scan em ILIKE.
- **F5-20** — `contacts_count_by_type` SECDEF sem filtro por workspace (agregado leak).
- **F5-21** — `search_contacts_cursor` CTE COUNT em cada página (custo dobrado).
- **F5-22** — sem normalização de phone na busca.
- **F5-23** — busca só em name/email/phone (falta company, job_title, nickname, cpf).
- **F5-24** — `pageIndexToCursor` sem deep-link support (`?p=5` renderiza page 0).

### Tags

- **F5-13** (P0) — `zapp.tags.name` UNIQUE global — cross-workspace conflict.
- **F5-30** — schema mistura AI suggestions com canonical tags.

### RLS / tenant isolation

- **F5-14** (P0) — `contacts_insert` policy tem `WITH CHECK NULL` — anyone insere.
- **F5-15** (P0) — `contacts_select` expõe contatos `assigned_to IS NULL` cross-workspace.
- **F5-16** (P0) — `get_default_workspace_id()` constante — sem tenant isolation.

### LGPD

- **F5-26** — 20 445 contatos, ZERO com `lgpd_consent_at`/`lgpd_opt_out_at` — compliance ausente.
- **F5-28** — `rpc_get_contact` expõe deals/messages/tasks de contatos opted-out.

### Modelagem

- **F5-29** — sem FK/relação `zapp.contacts` ↔ `zapp.empresas` (etapa 54 unmeetable).

---

## Retomada — próximo chat

Onde parar de Bloco 5 e o que executar em seguida:

1. **Bloco 6 — Conexões WhatsApp (etapas 56-65):**
   - Criar instância Evolution (POST `/instance/create`, `evo.evolution_instance_credentials`).
   - QR code (expira 60s, cron `qr-attempts-expire-15min` 101), pairing code.
   - Reconexão automática (crons `whatsapp_reconcile_dispatch` 27, `_apply` 30, `_reaper` 68).
   - Disconnection alerts (`wpp2_disconnection_watchdog` 104, `whatsapp_connection_drift_alert` 32).
   - Multi-instância, logout preserva credenciais, delete cascade em contatos importados.
   - Instance drift detection (`sync-instance-registry-status` cron 96).
   - 401 burst (`evo-detect-401-bursts` 173, `evo-401-glitchtip-feed` 161).

2. **Bloco 7-10:** roteiro completo em `PLANO_QA_ANALISE_100.md`.

**Contexto crítico do Bloco 5 para o próximo chat:**
- 17 achados P0 identificados — priorizar F5-04 (merge stub), F5-05 (RPC broken), F5-11 (notes dead), F5-16 (tenant isolation) na correção.
- `evo.evolution_contacts` é a fonte-de-verdade real; `zapp.contacts` view é layer lossy que precisa ser reconstruída OU eliminada.
- Multi-tenant em contatos **NÃO EXISTE** hoje (F5-14/15/16) — impacto arquitetural amplo se workspace_id for adicionado retroativamente.
- LGPD compliance é **ausente** em produção (F5-26) — auditoria externa reprovaria hoje.

**Documentos ao final desta sessão (5 blocos concluídos):**
- `docs/audits/PLANO_QA_ANALISE_100.md` — roteiro (não alterado).
- `docs/audits/PLANO_IMPLEMENTACAO_100.md` — 93 achados nos Temas 1-11.
- `docs/audits/RELATORIO_EXECUCAO_ANALISE.md` — este documento.
