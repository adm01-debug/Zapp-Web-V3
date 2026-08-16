# EVO_MIGRATION_SPLIT — inventário de migrations legadas com DDL `evo.*` no zapp-web-v3

**Data:** 2026-08-16 | **Etapa:** E40 | **Estado:** inventário consolidado (51+ arquivos)

## Objetivo

Classificar as migrations do zapp-web-v3 que fazem DDL em `evo.*` para decidir destino pós-ADR-015 (dono = evolution-stack).

## Classes

| Classe | Definição | Destino |
|---|---|---|
| **ESTRUTURA** | Cria/alterar objeto base do `evo` (tabela, partição, função de negócio do provider) | Deveria viver no evolution-stack (já coberto pelo baseline E41; manter apenas como histórico) |
| **CONTRATO** | View/RPC de contrato (bridge `zapp.*`, views `public.*`, RPCs `rpc_boundary_*`) | Ok permanecer — é a camada de contrato do ZAPP |
| **HISTÓRICA** | Já supersedida pelo baseline E41 (objeto recriado lá) ou corrigida depois | Arquivar — não reaplicar |

## Método de classificação

```bash
# Listar candidates (zapp-web-v3)
grep -lEi '(create|alter|drop)[[:space:]]+(table|view|function|type|schema|index|trigger)[[:space:]]+(if[[:space:]]+exists[[:space:]]+)?evo\.' supabase/migrations/*.sql

# Por arquivo: ver se o objeto citado existe no baseline E41 do evolution-stack
# (20260816000000_e41_evo_schema_baseline.sql) → HISTÓRICA se sim
```

## Contagem medida (16/08)

- Total de migrations tocando `evo.*`: **51+** (medição do T5 — `I7_violations` listou 67 arquivos; o gate E42 com allowlist auto cobre o estado atual)
- Amostra por classe (classificação manual das mais recentes):
  - **HISTÓRICA** (maioria): migrations 20260804–20260814 que criaram objetos agora materializados no baseline E41 — ex.: `20260804000000_canonical_schema_squash_133_migrations.sql`, `20260805000000_*`, `20260807*`, `20260811*` (notificações, grupos, status_contato), `20260814010000_fix_inbound_silencio_comercial.sql`
  - **CONTRATO**: migrations com views `public.evolution_*` e RPCs de contrato (`rpc_boundary_*`, `fn_provider_call`) — ex.: `20260815210000_decouple_e41_i1_contract_views.sql`, `20260815250012_decouple_e51_e52_e54_rpc_boundary_surface_v1.sql`
  - **ESTRUTURA residual**: poucas — verificar caso a caso antes de qualquer ação

## Regra operacional (ADR-015 + E42)

- **Nada a mover fisicamente.** O banco é a fonte de verdade (DB-as-source); migrations do repo são espelho histórico.
- Migration NOVA com `evo.*` no zapp-web-v3 → CI falha (E42), exceto allowlist com justificativa.
- O baseline E41 do evolution-stack é o mecanismo de recriação (DR) do `evo`.

## Pendência aberta

- [ ] Classificação exaustiva arquivo-a-arquivo (planilha) — não bloqueia nada (gates já protegem)
