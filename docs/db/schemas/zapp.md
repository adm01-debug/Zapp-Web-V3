# Schema: zapp

> Schema principal da aplicação zapp-web-v3. 320 tables, 406 views, 6 matviews, 1052 functions.

---

## Principais tabelas (com volumes estimadas)

| Tabela | Tipo | Volume | Descrição |
|--------|------|--------|-----------|
| `users` | TABLE | alta | Usuários autenticados |
| `contatos` | TABLE | alta | Agenda de contatos |
| `empresas` | TABLE | alta | Cadastro de empresas |
| `tickets` | TABLE | alta | Sistema de tickets |
| `messages` | VIEW | — | Aggregated messages |
| `conversations` | VIEW | — | Aggregated conversations |

---

## Matviews (6)

| Matview | Refresh | Strategy |
|---------|---------|---------|
| `vw_dashboard_metrics` | sob demanda | Manual |
| `vw_contato_stats` | sob demanda | Manual |
| `vw_ticket_sla` | sob demanda | Manual |
| `vw_empresa_faturamento` | sob demanda | Manual |
| `vw_user_activity` | sob demanda | Manual |
| `vw_inbox_summary` | sob demanda | Manual |

> ⚠️ refresh automatico via cron `zapp.fn_refresh_matviews()`

---

## Views contrato com evo

As seguintes views em `public` leem de `evo` (não de `zapp`):
- `public.evolution_messages` → `evo.evolution_messages`
- `public.evolution_contacts` → `evo.evolution_contacts`
- `public.evolution_conversations` → `evo.evolution_conversations`
- `public.evolution_media` → `evo.evolution_media`
- `public.evolution_whatsapp_status` → `evo.evolution_whatsapp_status`

> refs: SCHEMA-CONTRACT.md, ADR-DB-002

---

## Funções (1052)

- ~120 Category A (ativas, mantidas)
- ~20 Category B (legacy/deprecated)
- ~5 Category C (extension wrappers)
- ~900+ identificadas mas não catalogadas individualmente

> refs: FUNCTIONS.md

---

## Dependencies

- Depende de: `evo` (via views contratadas), `public` (PostgREST)
- Nunca criar objetos em `evo`
- Nunca criar FKs para `evo`
