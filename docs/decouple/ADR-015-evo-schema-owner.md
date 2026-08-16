# ADR-015: Dono único do schema `evo` — evolution-stack

**Data:** 2026-08-16
**Status:** ✅ APROVADO (decisão de arquitetura — Rota A consumada)
**Relacionado:** ADR-I4-ROTA-A-MANTIDA, E41 (baseline), E42/E43 (gates), E44 (expand/contract), E45 (schema-registry)

---

## 1. Decisão

**O schema `evo` tem dono único de migrations: o repositório `adm01-debug/evolution-stack`.** O `zapp-web-v3` NÃO cria, altera ou dropa objetos `evo.*` em migrations novas — leituras via bridge views (`zapp.*`)/views de contrato (`public.*`); escritas via RPCs de contrato (`zapp.rpc_boundary_*`, allowlist do gate).

## 2. Contexto

- Rota A consumada (16/08): `evolution_messages/conversations/contacts` + partições vivem em `evo`; bridge views em `zapp`; views de contrato em `public`.
- `evolution-stack` já mergeou `20260816000000_e41_evo_schema_baseline.sql` (618 KB, idempotente — 66 `CREATE TABLE` / 98 `CREATE FUNCTION`), o "estado atual" do `evo`.
- O `zapp-web-v3` tem **51+ migrations legadas** com DDL `evo.*` (E40 — inventário em `EVO_MIGRATION_SPLIT.md`). São histórico; o gate E42 impede DDL `evo.*` NOVO fora da allowlist de regularização.
- Gate E42 (`evo-ddl-gate.mjs`) ativo no CI do zapp-web-v3; gate E43 (DDL `zapp.*`) ativo no evolution-stack (16/08).

## 3. Consequências

1. Migration nova tocando `evo.*` no zapp-web-v3 → **falha o CI** (E42). Exceção só via allowlist com justificativa em `docs/decouple/`.
2. Migration tocando `zapp.*` no evolution-stack → **falha o CI** (E43).
3. Mudança coordenada cross-repo segue o protocolo expand/contract (E44, `CONTRIBUTING.md`).
4. O `schema-registry` (E45) declara `owner: evolution-stack` para `evo.json`.

## 4. Critérios de aceitação

- [x] E41 baseline no evolution-stack (mergeado)
- [x] E42 gate ativo no zapp-web-v3 (passando em PR real)
- [x] E43 gate ativo no evolution-stack (mergeado 16/08)
- [ ] Zero migrations novas `evo.*` fora da allowlist por 30 dias corridos (métrica)
