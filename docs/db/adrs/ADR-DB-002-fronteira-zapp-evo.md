# ADR-DB-002 — Fronteira zapp ↔ evo: Views e Functions

**Status:** RASCUNHO
**Data:** 2026-07-16

---

## Problema 1: 254 views zapp→evo

`zapp` contém ~254 views que leem de `evo` (via `public`):
- `public.evolution_messages` → `evo.evolution_messages`
- `public.evolution_contacts` → `evo.evolution_contacts`
- etc.

## Problema 2: ~30 pipeline functions em zapp

`zapp` contém funções de pipeline que ingerem dados no `evo`:
- Webhook handlers que fazem INSERT/UPDATE em `evo.evolution_*`
- Não há FK evo→zapp, mas há dependência lógica

## Conjunto canônico (views que devem permanecer)

| View | Origem | Destino | Razão |
|------|--------|---------|-------|
| public.evolution_messages | zapp | evo | API de mensagens |
| public.evolution_contacts | zapp | evo | API de contatos |
| public.evolution_conversations | zapp | evo | API de conversas |
| public.evolution_media | zapp | evo | API de mídia |
| public.evolution_whatsapp_status | zapp | evo | API de status |
| zapp.contact_id_graveyard | zapp | evo | Reconciliação de JID |

## Opções para fronteira de functions

**Opção A (Recomendada):** zapp mantém functions de pipeline (INSERT/UPDATE em evo)
com contracts versionados. `evo` nunca cria objetos em `zapp`.

**Opção B:** Migrar functions de pipeline para um schema neutro `pipeline`
queboth `zapp` e `evo` podem usar.

**Opção C:** Refatorar para que `evo` seja owner dos seus próprios dados
via API gateway (Evolution API → gateway → evo.tables).
