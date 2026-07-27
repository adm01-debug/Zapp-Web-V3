# Arquitetura do Banco — Mapa Mestre

**Retrato de:** 27/07/2026 · PostgreSQL **15.8** · Supabase self-hosted (AtomicaBR) · **225 schemas** · **832 tabelas base** · **159 MB** de índices.

## Princípio central

```
            ┌─────────────────────────────────────────────┐
  Cliente → │  public  (CAMADA DE API — só views + RPC)     │  ← PostgREST /rest/v1/*
            └───────────────────┬─────────────────────────┘
                                │ (views security_invoker)
        ┌───────────────────────┼───────────────────────────┐
        ▼                       ▼                            ▼
  ┌───────────┐          ┌───────────┐              ┌──────────────────┐
  │   zapp    │  ──────▶ │    evo    │              │ bpm / vendas /   │
  │ App ZAPP  │ contrato │ Evolution │              │ financeiro / ... │
  │  (dados)  │  curado  │  (dados)  │              │   (domínios)     │
  └───────────┘          └───────────┘              └──────────────────┘
```

**Direção de dependência permitida:** `public → domínios → dados`. 
**Proibido:** `evo → zapp` (a Evolution API nunca depende do app).

## Onde mora cada dado (validado no catálogo)

O dado existe **uma única vez**. As cópias em `public`/`zapp` são **views** (não há duplicação de dados).

| Dado | Vive em | Volume real |
|---|---|---|
| Mensagens WhatsApp | `evo.evolution_messages_wpp2` (+ partições `evolution_messages`) | 41.462 |
| Mídias WhatsApp | `evo.evolution_media` | 25.906 |
| Contatos WhatsApp | `evo.evolution_contacts` | 20.638 |
| Empresas (app) | `zapp.empresas` | 51.688 |
| Webhooks processados | `zapp.webhook_events_processed` | 26.846 |
| Auditoria de webhook | `zapp.webhook_audit_log` | 43.163 |

## Mapa de schemas de negócio

| Schema | Tabelas | Views | Matviews | Funções | Triggers | Papel |
|---|---:|---:|---:|---:|---:|---|
| `zapp` | 320 | 406 | 6 | 1.052 | 219 | **App ZAPP Web** (dados + RPC + lógica) |
| `evo` | 193 | 16 | 4 | 69 | 446 | **Evolution API** (dados WhatsApp) |
| `public` | **1** | **539** | 0 | 145 | 9 | **Camada de API** (PostgREST) |
| `bpm` | 41 | 0 | 0 | — | 32 | Módulo BPM |
| `email_app` | 33 | 0 | 0 | — | 23 | E-mail |
| `ai` | 31 | 0 | 0 | — | 14 | IA / agentes |
| `archive` | 25 | 0 | 0 | 2 | 1 | Frio / backup |
| `ops` | 20 | 4 | 0 | 47 | — | Infra / observabilidade |
| `financeiro` | 16 | 11 | 0 | 45 | 19 | Financeiro |
| `vendas` | 14 | 5 | 0 | 21 | 12 | Vendas |
| `logistica` | 3 | 0 | 0 | — | 2 | Logística |
| `artes` | 2 | 1 | 0 | 15 | 1 | Artes / design |

## Camadas de plataforma (Supabase/Postgres — não tocar manualmente)

`auth`, `storage`, `realtime`, `_realtime`, `vault`, `pgsodium`, `net`, `graphql`, `graphql_public`, `extensions`, `cron`, `pgmq`, `supabase_functions`, `supabase_migrations`.

## A fachada de 3 camadas (por que `public` tem 539 views)

O **PostgREST expõe o schema `public` por padrão**, e o app chama `/rest/v1/*`. Para servir os dados sem reconfigurar o PostgREST, foram criadas **views** no `public` que apontam para os schemas de domínio. Exemplo real: `public.profiles` é literalmente `SELECT ... FROM zapp.profiles`.

- **`public` (539 views):** corredor de API → 300 apontam para `zapp`, 182 para `evo`, 41 para `bpm`, 12 para `vendas`, 3 para `logistica`.
- **`zapp` (406 views):** 254 espelham o `evo` (segundo corredor, para código que usa nomes `zapp.*`).
- **`evo` (dados reais):** fonte de verdade da Evolution.

**Segurança:** todas as 539 + 406 + 16 views têm `security_invoker=on` → respeitam o RLS das tabelas base. A fachada é dívida de **arquitetura/manutenção**, não furo de RLS. Detalhes e regras em [`BACKCOMPAT-VIEWS.md`](./BACKCOMPAT-VIEWS.md).

## Particionamento

`evo.evolution_messages`, `evo.evolution_conversations` e `evo.evolution_webhook_events` são particionadas — **23 partições cada**, criadas automaticamente pelo cron `auto-create-monthly-partitions` (`evo.fn_auto_create_next_partitions`).

> **Realtime + partição:** a publicação `supabase_realtime` usa `publish_via_partition_root=true` — os eventos CDC saem pela **tabela raiz**, nunca pela partição-filha. Assine sempre a raiz (`evolution_messages`, não `evolution_messages_wpp2`). Detalhes em `../../CLAUDE.md`.

**Não crie/dropar partição-filha à mão.**
