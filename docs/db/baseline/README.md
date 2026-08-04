# Baseline do Estado do Banco

Este diretório armazena snapshots imutáveis do schema de produção.

## Propósito

- Permite medir regressão de qualquer etapa do plano
- Bloqueia o argumento "mas funcionava antes" — tem o antes documentado
- Permite criar o ambiente de staging reproduzindo o estado real (não os 130 arquivos)

## Conteúdo esperado

| Arquivo | Conteúdo | Gerado em |
|---|---|---|
| `schema_YYYYMMDD.sql` | `pg_dump --schema-only` de produção | antes de cada onda |
| `catalog_YYYYMMDD.json` | Contagens por schema/objeto | antes de cada onda |
| `cron_jobs_YYYYMMDD.json` | Export de `cron.job` | antes de cada onda |

## Snapshot de catálogo (27/07/2026)

```json
{
  "date": "2026-07-27",
  "source": "supabase.atomicabr.com.br",
  "postgres_version": "15.8",
  "schemas_total": 225,
  "tables_total": 832,
  "index_size_mb": 159,
  "schemas": {
    "zapp":      { "tables": 320, "views": 406, "matviews": 6, "functions": 1052, "triggers": 219 },
    "evo":       { "tables": 193, "views":  16, "matviews": 4, "functions":   69, "triggers": 446 },
    "public":    { "tables":   1, "views": 539, "matviews": 0, "functions":  145, "triggers":   9 },
    "bpm":       { "tables":  41, "views":   0, "matviews": 0, "functions":    0, "triggers":  32 },
    "email_app": { "tables":  33, "views":   0, "matviews": 0, "functions":    0, "triggers":  23 },
    "ai":        { "tables":  31, "views":   0, "matviews": 0, "functions":    0, "triggers":  14 },
    "archive":   { "tables":  25, "views":   0, "matviews": 0, "functions":    2, "triggers":   1 },
    "ops":       { "tables":  20, "views":   4, "matviews": 0, "functions":   47, "triggers":   0 },
    "financeiro":{ "tables":  16, "views":  11, "matviews": 0, "functions":   45, "triggers":  19 },
    "vendas":    { "tables":  14, "views":   5, "matviews": 0, "functions":   21, "triggers":  12 },
    "logistica": { "tables":   3, "views":   0, "matviews": 0, "functions":    0, "triggers":   2 },
    "artes":     { "tables":   2, "views":   1, "matviews": 0, "functions":   15, "triggers":   1 }
  },
  "crons": {
    "total_active": 80,
    "successes_7d": 22239,
    "failures_7d": 7,
    "failure_rate_pct": 0.03
  },
  "indexes": {
    "total": 2176,
    "unused_idx_scan_0": 1987,
    "unused_pct": 91,
    "size_unused_mb": 77,
    "duplicates": 3
  },
  "migrations": {
    "applied_in_db": 52,
    "files_in_repo": 944,
    "malformed_versions": ["20260716","20260717","20260722","20260722.2"]
  },
  "storage_buckets": {
    "whatsapp_media": { "public": true, "objects": 5088, "size_gb": 9.56 },
    "recibos_entrega": { "public": true },
    "avatars":         { "public": true },
    "audio_memes":     { "public": true },
    "custom_emojis":   { "public": true },
    "stickers":        { "public": true },
    "comprovantes_financeiro": { "public": false },
    "email_attachments":       { "public": false },
    "etiquetas_remessa":       { "public": false },
    "fechamentos":             { "public": false },
    "audio_messages":          { "public": false },
    "team_chat_files":         { "public": false },
    "quarantine":              { "public": false }
  }
}
```

## Como atualizar

```sql
-- Contagens por schema
SELECT
  n.nspname AS schema,
  COUNT(*) FILTER (WHERE c.relkind='r') AS tables,
  COUNT(*) FILTER (WHERE c.relkind='v') AS views,
  COUNT(*) FILTER (WHERE c.relkind='m') AS matviews
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
GROUP BY n.nspname ORDER BY tables DESC;
```

> Rodar este snapshot antes de CADA onda do plano e commitar o resultado aqui.
