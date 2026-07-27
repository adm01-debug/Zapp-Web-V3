# Schema `public` — Camada de API (PostgREST)

**Dono:** plataforma/API  
**Criado:** histórico (Supabase default)  
**Atualizado:** 27/07/2026

---

## Propósito

O schema `public` é o **corredor de API**: o PostgREST expõe este schema em `/rest/v1/*` por padrão. O app ZAPP Web chama endpoints como `https://supabase.atomicabr.com.br/rest/v1/profiles` que mapeiam para `public.profiles`.

**Regra central:** `public` contém **apenas** views `security_invoker=on` apontando para schemas de domínio, e funções RPC de contrato de API. **Zero tabelas de negócio. Zero extensões. Zero lógica nova.**

---

## Estatísticas (2026-07-27)

| Objeto | Quantidade | Estado |
|---|---:|---|
| Tabelas base | **1** | ⚠️ `_wal_slot_guard_events` — em migração para `ops` (etapa 7) |
| Views | **539** | ✓ todas `security_invoker=on` |
| Matviews | 0 | — |
| Funções | **145** | Ver classificação abaixo |
| Extensões | **9** | ⚠️ devem migrar para `extensions` (etapa 8, ALTO RISCO) |

---

## Distribuição das 539 Views

| Destino | Quantidade |
|---|---:|
| → `zapp` | 300 |
| → `evo` | 182 |
| → `bpm` | 41 |
| → `vendas` | 12 |
| → `logistica` | 3 |
| → outros | 1 |

> Todas as views `evolution_*` em `public` são recriadas automaticamente pelo cron job 138 (`evo.fn_ensure_evolution_backcompat_views`, a cada 6h). **Nunca edite views `evolution_*` manualmente em `public`** — serão sobrescritas. Use `evo.fn_ensure_evolution_backcompat_views` ou o allowlist em `ops.backcompat_view_allowlist`.

---

## Classificação das 145 Funções

### Ativas — Contrato de API (não remover)

Funções chamadas pelo app TypeScript via `supabase.rpc('nome')`:

- `rpc_list_failed_messages_cursor` — DLQ paginação cursor
- `rpc_list_dispatch_error_logs_cursor` — erros de despacho paginados
- `rpc_dlq_list_audit_cursor` — auditoria DLQ paginada
- `rpc_dlq_bulk_retry_now` — retry em massa de DLQ
- `rpc_dlq_log_item_action` — log de ação em item DLQ
- `rpc_list_transfers_paginated` — transferências paginadas
- `search_contacts_cursor` — busca de contatos com cursor
- `add_contacts_to_campaign` — adicionar contatos a campanhas
- `initiate_gmail_oauth` / `complete_gmail_oauth` — OAuth Gmail (stubs)
- `sync_to_crm` — sync CRM (stub)
- `export_user_data` / `import_user_data` — LGPD (stubs)
- `enrich_contact` — enriquecimento de contato (stub)
- `get_latest_analysis` — analytics (stub)
- `check_download_permission` — permissão de download

### Candidatas a Remoção / Migração

Funções em `public` não referenciadas no código TypeScript. Identificar com:
```sql
SELECT p.proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
```
Depois cruzar com `grep -r 'supabase.rpc(' src/` para confirmar quais estão ativas.

---

## Extensões Atualmente em `public` (⚠️ MOVER para `extensions`)

| Extensão | Versão | Risco de Mover |
|---|---|---|
| `amcheck` | 1.3 | Baixo |
| `hypopg` | 1.4 | Baixo |
| `pg_buffercache` | 1.3 | Baixo |
| `index_advisor` | 0.2 | Baixo |
| `btree_gin` | 1.3 | Médio |
| `dblink` | 1.2 | Médio |
| `pg_trgm` | 1.6 | **ALTO** |
| `unaccent` | 1.1 | **ALTO** |
| `vector` | 0.8 | **ALTO** |

Ver ADR-DB-003 e `supabase/migrations/20260727300008_move_extensions_to_extensions_schema.sql`.

---

## Regras Críticas

1. **NUNCA crie tabelas em `public`** — CI-01 falha
2. **NUNCA adicione extensões em `public`** — CI-02 falha (alerta)
3. **TODA nova view em `public`** deve ter `WITH (security_invoker=on)`
4. **Toda nova lógica** vai no schema dono, não em `public`
5. **Views `evolution_*`** são gerenciadas pelo cron — não edite diretamente

---

## `_wal_slot_guard_events` (a única tabela real)

Esta tabela é interna do Supabase (WAL slot guard). Está sendo movida para `ops._wal_slot_guard_events` pela etapa 7 (`20260727300007_move_wal_slot_guard_to_ops.sql`). Após a migração, `public._wal_slot_guard_events` passa a ser uma view compat apontando para `ops`.
