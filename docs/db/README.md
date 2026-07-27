# Documentação do Banco — `zapp-web-v3`

> Fonte de verdade da arquitetura do banco (Supabase self-hosted / PostgreSQL 15.8).
> Leia **antes** de tocar em qualquer objeto do banco. Vale para devs humanos **e** agentes LLM.

**Última auditoria de base:** 27/07/2026 · somente-leitura sobre `pg_catalog`, `information_schema`, `cron.*`.

## Índice

| Doc | Conteúdo |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Mapa dos 225 schemas, camadas e onde mora cada dado |
| [`SCHEMA-CONTRACT.md`](./SCHEMA-CONTRACT.md) | O que cada schema **pode** e **não pode** conter + direção de dependência |
| [`BACKCOMPAT-VIEWS.md`](./BACKCOMPAT-VIEWS.md) | ⚠️ A fachada de views `public`/`zapp` e o cron que a recria (crítico) |
| [`CRONS.md`](./CRONS.md) | Registro dos 80+ jobs `pg_cron` |
| [`FUNCTIONS.md`](./FUNCTIONS.md) | Panorama das ~1.400 funções (por schema, `SECURITY DEFINER`) |
| [`RLS-POLICIES.md`](./RLS-POLICIES.md) | Cobertura de RLS e tabelas sem policy |
| [`INDEXES.md`](./INDEXES.md) | Inventário de índices e política de criação/remoção |
| [`MIGRATIONS.md`](./MIGRATIONS.md) | Como migrations funcionam aqui (52 aplicadas × 944 arquivos) |

## Docs relacionados (já existentes no repo)

- [`../../CLAUDE.md`](../../CLAUDE.md) — **contexto profundo** para agentes: regras de schema PostgREST, Realtime, histórico de bugs e sessões. Leitura complementar obrigatória.
- [`../../AGENTS.md`](../../AGENTS.md) — **regras de engajamento** (resumo executivo das regras deste diretório).
- `../SCHEMA_REFERENCE.md`, `../ARCHITECTURE_AND_FLOW.md` — referências anteriores de schema/arquitetura.

> ⚠️ **Divergência conhecida (drift):** alguns docs anteriores (auditados em 16/07) listam contagens menores (ex.: `zapp` 312 tabelas, `public` 532 views) e o bucket `whatsapp-media` como **privado**. A auditoria de 27/07 mede `zapp` 320 / `public` 539 e o bucket `whatsapp-media` **público** — ou seja, o bucket foi tornado público depois de 16/07. Em caso de conflito, vale a data mais recente + verificação no catálogo vivo.

## As 5 regras de ouro (resumo)

1. **Dado do WhatsApp → `evo`. Dado do app → `zapp`. `public` é só API (views).** Nunca crie tabela no `public`.
2. **Toda mudança de schema é migration versionada** (`^\d{14}$`), testada em **staging** antes de produção. Nunca DDL manual em produção.
3. **`evo` nunca depende de `zapp`.** A dependência anda `public → domínios → dados`.
4. **Não edite views de compat à mão** — elas são recriadas por cron a cada 6h (ver `BACKCOMPAT-VIEWS.md`).
5. **Nunca dropar PK / UNIQUE / índice de suporte de FK** numa "limpeza" — mesmo que apareçam como não usados.

## Como estes docs são mantidos

A meta (etapa 49 do plano) é **auto-gerar** os catálogos (`FUNCTIONS.md`, `CRONS.md`, `RLS-POLICIES.md`, `INDEXES.md`) a partir do catálogo vivo do Postgres, com um check de CI que **falha** se a doc estiver desatualizada. Enquanto o tooling não existe, estes arquivos são um retrato datado — sempre confira a data no topo de cada doc.
