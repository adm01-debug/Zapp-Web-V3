# Auditoria Evolution API — Onda 4 — 2026-08-08

## Resumo executivo

Auditoria exaustiva com inspeção ao vivo via MCPs (5 camadas: Portainer, Docker, PG14, Supabase PG15, EVO API). FMEA de 10 domínios executado antes de qualquer mudança. Resultado: instalação saudável com melhorias críticas de segurança, pipeline e higiene aplicadas.

## Stack de referência

| Componente | Estado | Container |
|---|---|---|
| Evolution API | ✅ healthy, `open` | `ec54ee8ed145` |
| Imagem custom | `sha256:678f84d85f2b` (etapa-27, evolution_app) | — |
| PostgreSQL 14 | ✅ healthy | `212ef2cbae98` |
| Supabase PG15 | ✅ healthy | `ef6d3932698c` |
| Consumer v7 | ✅ 2 replicas healthy | `4be2596725e9`, `8f7d174ed9ac` |
| RabbitMQ | ✅ healthy | `3993abe37b19` |
| Redis DB8 | ✅ volatile-lru (sessão sem TTL = imune) | `7af95087c066` |

## Correções aplicadas

### Críticas ✅

**A1 — Postgres SUPERUSER no runtime**
Evolution estava rodando com role `postgres` (superuser). Corrigido no etapa-27 via docker-entrypoint.sh customizado: `evolution_app` (least-privilege) é o role do runtime. Superuser só no arranque do Docker secret.

**A2/A8 — Dual delivery de 15 eventos**
Webhook wpp2 tinha 16 eventos. Consumer Rabbit já tinha 16 eventos (desde 2026-08-06). 15 overlaps causavam 429 rate_limit_exceeded (1,40% da taxa total). Webhook reduzido para `SEND_MESSAGE` only (único evento não coberto pelo Rabbit). Consumer e edge function `evolution-webhook` validados: ambos tratam todos os 17 tipos de evento.

**A3 — Conexões zumbis superuser**
10 conexões `postgres@10.0.1.6` idle por 2139–6972s terminadas via `pg_terminate_backend`. Prevenção futura: `idle_session_timeout=15min` (ALTER SYSTEM).

### Altas ✅

| Item | Descrição | Resultado |
|---|---|---|
| A4 | Stack 126: AUDIT_RETENTION 90→30d, target `/tmp/purge-v9.sh` | ✅ |
| A6 | DELETE direto: 2.732 linhas `_audit_outbound_trap` > 30d + VACUUM | ✅ |
| A9 | 3 labels duplicadas deletadas (No lidas/Favoritos/Grupos CUIDs antigos) | ✅ |
| A27 | `idle_session_timeout` e `idle_in_transaction_session_timeout` = 15min | ✅ |
| A39 | 3 BRIN indexes CONCURRENTLY nas tabelas de retenção | ✅ |

### Médias ✅

| Item | Descrição | Resultado |
|---|---|---|
| A10 | ~3.1GB de imagens Docker obsoletas removidas | ✅ |
| A12 | VACUUM FULL em 3 tabelas Supabase bloatadas (~38MB liberados) | ✅ |
| A13 | Partição `evolution_messages_comercial_03` detachada (instância descontinuada) | ✅ |
| A14 | 3 tabelas VPS migradas `evo→ops` schema | ✅ |
| A16 | `_prisma_migrations` tem conteúdo real (finding inicial incorreto) | ℹ️ |
| A19 | Redis volatile-lru + sessão sem TTL = imune a eviction | ℹ️ |
| A64 | 998 linhas `evo.evolution_connection_history` > 90d purgadas | ✅ |

## Root cause dos 42K eventos 401 (A15)

**NÃO** é problema de sessão WhatsApp. São IPs AWS externos batendo em `/message/sendText/wpp2` com API key v4 (rotacionada para v5 em 2026-08-05):

| IP | Hits | Região |
|---|---|---|
| 52.67.175.207 | 4.792 | AWS SA-EAST-1 (banido) |
| 54.78.199.253 | 1.250 | AWS EU-WEST-1 |
| 172.18.0.1 | 526 | Docker bridge (N8N local) |
| (outros IPs AWS) | ~35K | AWS diversas |

**Ação manual necessária:** Atualizar credencial **`Evolution API - Promo Brindes`** (ID: `tyLhN1fGwJveaDCg`) no N8N:
1. N8N UI → Settings → Credentials → "Evolution API - Promo Brindes"
2. Editar → campo `Value` → substituir com a chave v5
3. A chave v5 está em: `docker exec <evolution_container> cat /run/secrets/evolution_api_key_v4_20260704`

## Estado final da infra

```
WhatsApp wpp2:  open ✅
Evolution:      ec54ee8ed145, healthy, evolution_app (zero superuser) ✅
Webhook wpp2:   SEND_MESSAGE only (1 evento) — zero dual delivery ✅
Rabbit wpp2:    16 eventos (single delivery via consumer v7) ✅
Consumer:       2 replicas healthy (v7, SHADOW=false, ok=200K+) ✅
DB PG14:        evolution_app (5 conns) + n8n_app (2 conns) — zero zumbis ✅
Purge:          running, AUDIT_RETENTION=30d, 3 BRIN indexes ativos ✅
Supabase:       schema evo limpo, tabelas VPS em ops, partição defunta detachada ✅
```

## Pendências próxima sessão

- **N8N credencial** (MANUAL): atualizar v4→v5 — zera 401s de `172.18.0.1`
- **Bloco 7**: alertas Prometheus permanentes (conexões, 401s, erros)
- **A18**: alinhar digest `postgres:14-alpine` entre purge (`bc06a4b2`) e reconcile (`f1341c01`)
- **Bloco 9**: secret órfão `supabase_service_key_v1` top-level stack 25 (cosmético)
- **Bloco 10**: restore tests, doc final no claude-cerebro
