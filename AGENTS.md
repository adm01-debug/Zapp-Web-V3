# AGENTS.md — Regras de Engajamento (devs humanos e agentes LLM)

> Objetivo: mexer **só onde pode**, sem quebrar a arquitetura planejada do banco.
>
> **Leitura obrigatória antes de mexer no banco:**
> - [`CLAUDE.md`](./CLAUDE.md) — contexto profundo: regras PostgREST (`schema: 'zapp'`), Realtime, histórico de bugs.
> - [`docs/db/ARCHITECTURE.md`](./docs/db/ARCHITECTURE.md) e [`docs/db/SCHEMA-CONTRACT.md`](./docs/db/SCHEMA-CONTRACT.md) — mapa e contrato de schemas.

## Onde mora o quê

- Dado real do **WhatsApp/Evolution** → schema **`evo`** (`evolution_*`, partições, `contact_id_graveyard`).
- Dado real do **app ZAPP Web** → schema **`zapp`**.
- **`public` é só camada de API** (views `security_invoker` + RPC). **Nunca** crie tabela nem escreva "na tabela" do `public` — ali é sempre uma **view** apontando para `zapp`/`evo`/domínio.
- Módulos de negócio isolados: `bpm`, `vendas`, `financeiro`, `email_app`, `ai`, `logistica`, `artes`.
- Infra/observabilidade em `ops`/`monitoring`. Frio/backup em `archive`.

## Direção de dependência

- **Permitido:** `public → domínios`; `zapp → evo` **apenas via contrato curado**.
- **Proibido:** `evo` depender de `zapp` (a Evolution nunca importa o app).

## Fluxo obrigatório para mudança de banco

1. Ler `CLAUDE.md` + `docs/db/SCHEMA-CONTRACT.md` e confirmar o **schema-dono** do objeto.
2. Escrever **migration versionada** (nome `^\d{14}$` — 14 dígitos `YYYYMMDDHHMMSS`).
3. Escrever o **teste** que falha sem a mudança.
4. Rodar em **staging**; comparar contra o baseline. Só então promover para produção.
5. **Nunca** rodar DDL manual em produção. Nunca commitar direto na `main` (abrir PR).

## Lista "NÃO MEXA" (sem revisão sênior explícita)

- **Partições-filhas** de `evo.evolution_messages` / `evolution_conversations` / `evolution_webhook_events` — criadas por cron (`evo.fn_auto_create_next_partitions`).
- **`evo.fn_ensure_evolution_backcompat_views` e as views de compat** — alterar a allowlist/função, nunca a view avulsa. Ver [`docs/db/BACKCOMPAT-VIEWS.md`](./docs/db/BACKCOMPAT-VIEWS.md).
- **Crons de DR/backup:** `daily-backup-sentinel-check`, `restore-integrity-check`, `fn_auto_update_backup_sentinel`.
- **Tabelas com PII:** `zapp._lgpd_payload` (e qualquer tabela de payload/anonimização LGPD).
- **Schemas de plataforma:** `auth`, `storage`, `realtime`, `_realtime`, `vault`, `pgsodium`, `net`, `graphql`, `cron`, `pgmq`, `supabase_*`.
- **PK / UNIQUE / índice de suporte de FK** — **nunca** dropar em "limpeza de índice", mesmo que apareça com `idx_scan=0`. Ver [`docs/db/INDEXES.md`](./docs/db/INDEXES.md).

## Convenções

- Funções: `fn_*` (interna), `rpc_*` (exposta via PostgREST), `trg_*` (trigger), `get_*` (leitura). A maioria é `SECURITY DEFINER` — **sempre** fixe `search_path` em função `SECURITY DEFINER`.
- Comando de cron: **sempre** qualifique com `schema.função` (ex.: `SELECT zapp.fn_x()`), nunca dependa do `search_path`.
- Migration: um tema por migration; rollback documentado.
