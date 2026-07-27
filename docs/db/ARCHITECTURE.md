# Database Architecture

> Arquitetura completa do banco de dados — Schema, partitioning, replication, and operations.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         zapp-web-v3 (Frontend)                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Supabase Self-hosted (PaaS)                      │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────────┐  │
│  │ PostgREST│  │ Realtime │  │  Auth   │  │ Storage (S3/LFS)    │  │
│  │ /rest/v1│  │ WebSocket│  │ JWT     │  │ 13 buckets           │  │
│  └────┬────┘  └────┬─────┘  └────┬────┘  └──────────────────────┘  │
└───────┼────────────┼────────────┼──────────────────────────────────┘
        │            │            │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL 15.8 (Self-hosted)                    │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  zapp    │ │   evo     │ │  public  │ │   ops    │ │ others  │ │
│  │ (core)  │ │ (WhatsApp)│ │ (API)   │ │  (SRE)   │ │ bpm/fin │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Partitioned Tables (25 partitions each)           │  │
│  │  evolution_messages │ evolution_conversations │ evo.webhook_v2 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Evolution API v2.3.7                            │
│                 WhatsApp Gateway (AtomicaBR VPS)                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Schemas

| Schema | Tables | Views | Primary Use |
|--------|--------|-------|-------------|
| zapp | 320 | 406 | Core application entities |
| evo | 193 | 16 | Evolution API WhatsApp data |
| public | 1 | 539 | PostgREST API facade |
| ops | 20 | 4 | Operations & observability |
| bpm | ~30 | ~15 | Business process management |
| financeiro | ~25 | ~5 | Financial module |
| vendas | ~20 | ~5 | Sales module |
| logistica | ~15 | ~3 | Logistics module |
| ai | ~10 | ~2 | AI/ML module |
| archive | ~5 | 1 | Historical data |
| email_app | ~10 | 1 | Email campaigns |
| artes | ~5 | 1 | Design/art assets |

---

## Security Architecture

### Row Level Security (RLS)

- RLS ativo em todas as tabelas de negócio (zapp, evo, bpm, financeiro, etc.)
- Políticas por role: `authenticated` (read own), `service_role` (full access)
- Views em `public` usam `security_invoker = on` (respeitam RLS da tabela base)
- `ops` schema: service_role apenas

### Authentication Flow

```
Client → Supabase Auth (JWT) → PostgREST → public views → zapp tables (RLS)
```

### Security Definer Functions

- Funções que precisam de privilégios elevados usam `SECURITY DEFINER`
- `SET search_path = 'schema, pg_catalog'` em todas as SECURITY DEFINER
- Jamais usar `public` no search_path de SECURITY DEFINER

---

## Replication & High Availability

- **Type**: Self-hosted single primary (Supabase)
- **Replicas**: None configured (future: read replicas for reporting)
- **WAL**: Streaming replication slot for Supabase realtime
- **Backups**: pg_dump diário, retention 30 dias
- **DR**: Backup via pg_dump on remote server

---

## Partitioning Strategy

3 tabelas particionadas (range por `created_at`, mensal, 25 partições):

- `evo.evolution_messages` — mensagens WhatsApp
- `evo.evolution_conversations` — conversas WhatsApp
- `evo.evolution_webhook_events_v2` — eventos de webhook

Particionamento permite:
- DROP PARTITION para limpeza de dados antigos
- TRUNCATE PARTITION para reset rápido
- Index pruning em queries por range de datas

---

## Migration Strategy

```
1. Author writes migration in supabase/migrations/
2. Apply to staging via supabase db push
3. Smoke tests validate
4. Code review + merge to main
5. Apply to production via supabase db push
6. Post-deploy validation
```

Version format: `YYYYMMDDHHMMSS_description.sql` (14-digit prefix)

---

## API Layer (PostgREST)

- **Endpoint**: `/rest/v1/*`
- **Auth**: Bearer JWT token
- **RLS**: Respected via security_invoker=on
- **CORS**: Configured for app domains
- **Rate limit**: Via nginx upstream

---

## Storage

13 buckets, todos gerenciados pelo Supabase Storage (S3-compatible):
- 3 buckets públicos (sem PII): avatars, profile-photos, product-images
- 10 buckets privados
- 2 buckets públicos com PII (⚠️): whatsapp-media, recibos-entrega
