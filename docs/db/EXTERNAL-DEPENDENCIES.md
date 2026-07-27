# External Dependencies

> Documentação de serviços externos que o banco depende.

---

## Serviços PostgreSQL

| Serviço | Host | Porta | Uso | SLA |
|---------|------|-------|-----|-----|
| PostgreSQL primary | localhost | 5432 | Main database | 99.99% |
| (replica read-only) | — | — | Read replicas (future) | — |

## Storage

| Serviço | Provider | Bucket | Uso |
|---------|----------|--------|-----|
| Supabase Storage | Self-hosted | whatsapp-media | WhatsApp media files |
| Supabase Storage | Self-hosted | avatars | User avatars |
| Supabase Storage | Self-hosted | chat-attachments | Chat attachments |

## Authentication

| Serviço | Provider | Schema | Uso |
|--------|----------|--------|-----|
| Supabase Auth | Self-hosted | auth | User auth |
| JWT validation | Local | zapp | Session validation |

## WhatsApp

| Serviço | Version | Host | Uso |
|--------|---------|------|-----|
| Evolution API | 2.3.7 | atomica.br:8080 | WhatsApp gateway |
| Evolution DB | — | Evolution container | Stores messages/conversations |

## Email

| Serviço | Provider | Uso |
|---------|----------|-----|
| Resend | resend.com | Transactional email |
| SMTP relay | — | Outbound email |

## Cache

| Serviço | Provider | Uso |
|---------|----------|-----|
| Redis | — | Session cache, rate limiting (future) |

## Observability

| Serviço | Endpoint | Uso |
|---------|----------|-----|
| GlitchTip | — | Error tracking |
| Grafana | — | Metrics dashboards |
| pg_stat_statements | Built-in | Query performance |
| pg_cron | Built-in | Job scheduling |

## CDN / Reverse Proxy

| Serviço | Provider | Uso |
|---------|----------|-----|
| Nginx | Self-hosted | Reverse proxy, SSL termination |

---

## Diagrama de dependência

```
App (zapp-web-v3)
  ├── PostgreSQL 15.8 (Supabase)
  │     ├── Evolution API DB (evo)
  │     ├── Auth (auth)
  │     └── Storage (storage.buckets)
  ├── Evolution API v2.3.7 (WhatsApp)
  ├── Supabase Auth
  ├── Supabase Realtime
  ├── Nginx (reverse proxy)
  ├── Resend (email)
  └── GlitchTip (error tracking)
```

---

## Procedimento de failover

1. **PostgreSQL down**: Usar replica como read-only. Monitorar via Grafana.
2. **Evolution API down**: WhatsApp desconecta. Crons de healthcheck disparam alertas.
3. **Storage down**: Uploads falham. App mostra erro. Downloads usam cache local.
4. **Auth down**: Login falhou. Tokens existentes continuam válidos por TTL.
