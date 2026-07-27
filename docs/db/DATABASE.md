# DATABASE — Overview

> Ponto de entrada para a documentação do banco de dados.

---

## Navegação

- [Architecture](ARCHITECTURE.md) — Overview da arquitetura
- [Schema Contract](SCHEMA-CONTRACT.md) — Regras de dependência entre schemas
- [DDL Freeze Policy](DDL-FREEZE-POLICY.md) — Regras de alteração estrutural
- [Functions](FUNCTIONS.md) — Catálogo de funções
- [Error Contract](ERROR-CONTRACT.md) — Convenções de erro
- [Partitions](PARTITIONS.md) — Tabelas particionadas
- [Indexes](INDEXES.md) — Estratégia de índices
- [Storage](STORAGE.md) — Storage buckets e políticas
- [CRONS](CRONS.md) — Cron jobs
- [Observability](OBSERVABILITY.md) — Dashboards e alertas
- [Staging Setup](STAGING-SETUP.md) — Procedimento de staging
- [Baseline](baseline/) — Catálogo baseline (2026-07-16)
- [Schemas](schemas/) — Documentação por schema
- [ADRs](adrs/) — Architecture Decision Records

---

## Architecture Decision Records (ADRs)

- [ADR-001](adrs/ADR-DB-001-schema-public-destino.md) — Schema public como API facade
- [ADR-002](adrs/ADR-DB-002-fronteira-zapp-evo.md) — Fronteira zapp↔evo
- [ADR-003](adrs/ADR-DB-003-extensoes-public-para-extensions.md) — Extensões public → extensions (DEFERIDO)
