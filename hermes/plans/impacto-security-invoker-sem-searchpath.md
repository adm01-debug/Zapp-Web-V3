# Impacto: 348 Funções SECURITY INVOKER sem `search_path`

> Gerado em: 30/07/2026  
> Schema analisado: `zapp`  
> Search_path atual: `"$user", public, evo, zapp, bpm, email_app, monitoring, extensions`

---

## Sumário Executivo

| Métrica | Valor |
|---|---|
| Total funções SECURITY INVOKER em `zapp` | **348** |
| Funções SEM `search_path` fixo | **348 (100%)** |
| Funções com refs não qualificadas a tabelas | **53 (15.2%)** |
| Funções que **quebram** se `zapp` sair do search_path | **13 (3.7%)** |
| Risco ALTO (tabela duplicada sem schema) | **0** |

---

## Classificação de Risco

### 🔴 RISCO ALTO: 0 funções

Nenhuma função referencia uma **tabela com nome duplicado em múltiplos schemas** sem qualificador de schema.

Tabelas duplicadas encontradas (presentes em ≥2 schemas):
`schema_migrations` (5 schemas), `_snapshot_version_state`, `colaboradores`, `config`, `contact_id_graveyard`, `extensions`, `feature_flags`, `migration_audit`, `migrations`, `sessions`, `tenants`, `usuarios`, `vector_indexes`, `webauthn_challenges`

→ Nenhuma dessas tabelas é referenciada sem schema qualification em nenhuma das 348 funções.

---

### 🟡 RISCO MÉDIO: 13 funções (3.7%)

Quebram **se `zapp` for removido do search_path**. Referenciam tabelas do schema `zapp` **sem qualificador**.

| Função | Tabelas `zapp` referenciadas (sem schema) |
|---|---|
| `fn_audit_unscanned_media` | `media_download_queue` |
| `fn_clamav_scan_media` | `media_download_queue`, `media_quarantine`, `media_scan_log` |
| `fn_create_transfer` | `conversation_transfers` (+ evo.*) |
| `fn_full_ecosystem_report` | `instance_registry` |
| `fn_incrementa_lembrete` | `solicitacoes_vale` |
| `fn_integration_report` | `instance_registry` (+ evo.*) |
| `fn_release_quarantine` | `media_quarantine`, `media_scan_log` |
| `fn_trg_gate_require_scan` | `media_scan_log` |
| `fn_trg_quarantine_alert` | `media_security_alerts` |
| `fn_update_audio_meme_category_count` | `audio_meme_categories` |
| `fn_update_sticker_category_count` | `sticker_categories` |
| `get_dept_mapping` | `dept_mapping` |
| `translate_dept` | `dept_mapping` |

---

### 🟢 RISCO BAIXO: 295 funções (84.8%)

#### Grupo A — 172 funções de extensões
`gin_*`, `dblink_*`, `hypopg_*`, `bt_index_*`, `unaccent_*`, `binary_quantize`, `cosine_distance`, `hamming_distance`, `inner_product`, `jaccard_distance`, `l1_distance`, `l2_distance`, `l2_norm`, `l2_normalize`, `subvector`, `gtrgm_options`, `strict_word_similarity_dist_commutator_op`, `word_similarity_dist_commutator_op`, `verify_heapam`

→ Não acessam tabelas de aplicação. Operam sobre índices, vetores, extensões.

#### Grupo B — 123 funções de aplicação sem refs diretas a tabelas
Funções utilitárias, triggers de updated_at, helpers de formatação, cálculos puros.

Exemplos: `fn_atualiza_timestamp`, `fn_normalize_phone`, `handle_updated_at`, `mask_cpf`, `set_updated_at`, `current_user_role`, `fn_extract_phone_from_jid`, etc.

---

### ⚠️ 40 funções que referenciam `evo`, `ai`, `archive` (já em situação frágil)

Estas funções usam tabelas de outros schemas **sem qualificador**. Funcionam hoje porque `evo` está no search_path, mas `ai` e `archive` **não estão** — indicando que já operam num contexto onde schemas adicionais foram configurados.

| Schema alvo | Qtd | Funções |
|---|---|---|
| `evo` apenas | 37 | `fn_acknowledge_alert`, `fn_add_tag`, `fn_aggregate_hourly_metrics`, ... |
| `ai` apenas | 2 | `estimate_cost`, `find_cheapest_model` |
| `evo` + `zapp` | 2 | `fn_create_transfer`, `fn_integration_report` |
| `archive` + `evo` | 1 | `fn_audit_sample_match` |

---

## Simulação: "authenticated PERDE 'zapp' do search_path"

**Cenário:** search_path atual: `"$user", public, evo, zapp, bpm, email_app, monitoring, extensions`  
**Novo search_path:** `"$user", public, evo, bpm, email_app, monitoring, extensions`

| Resultado | Qtd | % |
|---|---|---|
| ✅ CONTINUAM FUNCIONANDO | **295** | 84.8% |
| ❌ QUEBRAM (refs `zapp` sem schema) | **13** | 3.7% |
| ⚠️ JÁ QUEBRADAS (refs `ai`/`archive` sem schema) | **3** | 0.9% |
| ✅ CONTINUAM (refs `evo` — `evo` ainda no path) | **37** | 10.6% |

**Total de 13 funções quebram exclusivamente pela perda de `zapp`.**

---

## Recomendações

1. **Corrigir as 13 funções MÉDIO** — Adicionar prefixo `zapp.` nas referências a tabelas:
   - `media_download_queue` → `zapp.media_download_queue`
   - `media_quarantine` → `zapp.media_quarantine`
   - `media_scan_log` → `zapp.media_scan_log`
   - `instance_registry` → `zapp.instance_registry`
   - `solicitacoes_vale` → `zapp.solicitacoes_vale`
   - `media_security_alerts` → `zapp.media_security_alerts`
   - `audio_meme_categories` → `zapp.audio_meme_categories`
   - `sticker_categories` → `zapp.sticker_categories`
   - `dept_mapping` → `zapp.dept_mapping`
   - `conversation_transfers` → `zapp.conversation_transfers`

2. **Adicionar `SET search_path = 'zapp, public'`** nas 348 funções como solução definitiva — elimina a dependência do search_path do caller.

3. **Corrigir as 40 funções que referenciam `evo`** com qualificador `evo.` para robustez total.

4. **Revisar funções que referenciam `ai` e `archive`** — esses schemas não estão no search_path atual, sugerindo que já operam via caminhos alternativos (ex.: chamadas via pg_catalog ou schemas adicionados dinamicamente).
