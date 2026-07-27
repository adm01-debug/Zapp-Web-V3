# Baseline Catalog — 2026-07-16

> Snapshot do estado do banco de dados no momento inicial da organização.
> Uso: comparação futura, drift detection, auditing.

## Resumo executivo

| Schema | Tables | Views | Matviews | Functions | Triggers |
|--------|--------|-------|----------|-----------|----------|
| zapp | 320 | 406 | 6 | 1052 | ~300 |
| evo | 193 | 16 | 4 | 69 | 446 |
| public | 1 | 539 | 0 | 145 | 0 |
| bpm | ~30 | ~15 | 0 | ~40 | ~30 |
| ops | 20 | 4 | 0 | 47 | 2 |
| financeiro | ~25 | ~5 | 0 | ~20 | ~10 |
| vendas | ~20 | ~5 | 0 | ~15 | ~5 |
| logistica | ~15 | ~3 | 0 | ~10 | ~5 |
| ai | ~10 | ~2 | 0 | ~15 | ~5 |
| archive | ~5 | 1 | 0 | 5 | 0 |
| email_app | ~10 | 1 | 0 | 10 | 0 |
| artes | ~5 | 1 | 0 | 5 | 0 |

## Índices

Total estimado: **2176 índices**
- Utilizados (idx_scan > 0): ~195 (9%)
- Não utilizados: ~1981 (91%) — candidatos a quarantine

## Crons

Total: **80+ active cron jobs**
Maioria: 6h, 1h, 30min intervals

## Particionamento

3 tabelas particionadas (25 partições cada):
- `evo.evolution_messages`
- `evo.evolution_conversations`
- `evo.evolution_webhook_events_v2`

## Extensões (schema public)

- pg_trgm
- vector
- unaccent
- pgjwt
- uuid-ossp
- pg_stat_statements
- pg_net
- pg_cron
- hypopg

**⚠️ HIGH RISK: mover extensões para schema separado pode quebrar clientes.**

## Migrations

- No repositório: 900+ arquivos
- No banco (schema_migrations): 52 versões
- Tracking started: 2026-07-16
- 4 versões mal formatadas identificadas

## Views públicas (PostgREST /api/v1/)

- `public.evolution_*`: ~182 views (leitura evo)
- `public.zapp_*`: ~300 views (leitura zapp)
- `public.bpm_*`: ~41 views
- `public.vendas_*`: ~12 views
- `public.logistica_*`: ~3 views
- Todas: `security_invoker = on` (respeita RLS da tabela base)

## Contrato de fronteira zapp/evo

- zapp → evo: ~254 views (leitura de dados Evolution API)
- evo → zapp: ~30 pipeline functions (webhook ingestion)
- evo NUNCA pode criar FKs para zapp

## Storage Buckets

- Total: 13 buckets
- públicos: whatsapp-media (9.56 GB PII), recibos-entrega
- ⚠️ Both need to become private with signed URLs

## Status de governança

- [ ] Migrations auditadas
- [ ] Índices quarantine implementados
- [ ] FK gaps resolvidos
- [ ] RLS coverage verificado
- [x] DDL guardrails ativos
- [ ] Storage bucket policies aplicados
