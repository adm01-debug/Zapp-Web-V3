# STAGING ENVIRONMENT SETUP

> **Procedimento de provisionamento de staging — Banco de dados PostgreSQL**

## Objetivo

Estabelecer uma cópia funcional do banco de produção em ambiente staging para validar
migrations, alterações de schema e procedimentos operacionais antes de aplicar em produção.

---

## 1. Pré-requisitos

```bash
# Acesso ao servidor de produção (AtomicaBR VPS)
# Acesso ao servidor de staging
# Supabase CLI autenticado
# Credenciais de superusuário PostgreSQL
```

---

## 2.backup de produção

```bash
# No servidor de produção
pg_dump \
  -h localhost \
  -p 5432 \
  -U supabase_admin \
  -Fc \
  --no-acl \
  --no-owner \
  --no-security-labels \
  -b \
  -v \
  -f /var/lib/postgresql/backups/prod_backup_$(date +%Y%m%d_%H%M%S).dump \
  postgres
```

---

## 3. Restore em staging

```bash
# No servidor de staging
pg_restore \
  -h localhost \
  -p 5432 \
  -U supabase_admin \
  -d postgres \
  --clean \
  --if-exists \
  -v \
  /path/to/prod_backup_YYYYMMDD_HHMMSS.dump
```

---

## 4. Verificações pós-restore

```sql
-- Verificar integridade do cluster
SELECT pg_is_in_recovery();

-- Verificar contagem de schemas
SELECT count(*) FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog','information_schema','extensions');

-- Verificar RLS ativo
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname IN ('zapp','evo','public','bpm','financeiro','vendas','logistica','ai')
ORDER BY schemaname, tablename;
```

---

## 5. Configurar staging como não-produção

```sql
-- Desabilitar crons de produção
UPDATE cron.job SET active = false
WHERE jobname NOT LIKE '%staging%';

-- Configurar logging para debug
ALTER DATABASE postgres SET log_min_messages TO 'notice';
ALTER DATABASE postgres SET log_connections = on;
ALTER DATABASE postgres SET log_disconnections = on;
```

---

## 6. Validar objetos críticos

```sql
-- Verificar views de compatibilidade (evo)
SELECT schemaname, viewname
FROM pg_views
WHERE schemaname = 'public'
  AND viewname LIKE 'evolution_%'
ORDER BY viewname;

-- Verificar tabelas particionadas
SELECT
  parent.relname AS partitioned_table,
  count(child.relname) AS partition_count
FROM pg_inherits
JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
JOIN pg_class child  ON child.oid   = pg_inherits.inhrelid
GROUP BY parent.relname;
```

---

## 7. Rotina de sincronização incremental

```bash
# Após primeiro restore completo, usar replicação lógica para manter staging atualizado
# Configurar slot de replicação em produção:
SELECT pg_create_logical_replication_slot('staging_sync', 'pgoutput');

# Em staging, configurar assinatura (execute apenas em manutenção)
CREATE SUBSCRIPTION staging_sub
  CONNECTION 'host=<PROD_HOST> port=5432 dbname=postgres user=supabase_admin password=<PASS>'
  PUBLICATION prod_pub
  WITH (copy_data = false);
```

---

## 8. Checklist de validação

- [ ] Restore concluído sem erros
- [ ] Todos os schemas acessíveis
- [ ] RLS verificado nas tabelas de negócio
- [ ] Views de compatibilidade Evo presentes
- [ ] Tabelas particionadas intactas
- [ ] Crons de produção desabilitados
- [ ] Logging configurado
- [ ] Credenciais de staging distintas de produção
