# ADR-DB-001 — Schema public como camada de API do PostgREST

**Status:** DECIDIDO
**Data:** 2026-07-16
**Decisão:** Opção A — public como facade via PostgREST

---

## Contexto

O schema `public` contém 539 views que são expostas pelo PostgREST em `/rest/v1/*`.
O PostgREST expõe APENAS o schema `public`. Foi considerado mover tabelas de negócio
para `public` diretamente.

## Decisão

Manter `public` como **camada de facade** (views), NÃO como schema de tabelas base.
Views em `public` fazem `security_invoker = on` para respeitar RLS das tabelas base.

## Opção A — public como API facade (ESCOLHIDA)

- Views em `public` leem de `zapp`, `evo`, `bpm`, etc.
- PostgREST expõe `/rest/v1/*` via `public`
- RLS das tabelas base é respeitado
- Contrato de API é versionado via `public`
- Requer `security_invoker = on` em todas as views

## Opção B — public como schema de tabelas (REJEITADA)

- Tabelas de negócio em `public` direto
- PostgREST expõe tabelas diretamente
- RLS se aplica diretamente
- Requer reescrever todas as 539 views
- **Rejeitada** por custo de migração e risco de quebrar clientes

## Consequências

- Views em `public` são o contrato de API
- Toda mudança de schema de negócio deve manter compatibilidade de view
- `security_invoker = on` é obrigatório em todas as views
- `publish_via_partition_root = true` no Realtime
