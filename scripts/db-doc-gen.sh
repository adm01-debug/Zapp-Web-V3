#!/usr/bin/env bash
# ============================================================
# db-doc-gen.sh — Database Documentation Generator
# Etapa 42: Auto-generation tooling (SQL → Markdown)
# ============================================================
# Usage:
#   export DATABASE_URL="postgresql://postgres:pass@supabase.atomicabr.com.br:5432/postgres"
#   bash scripts/db-doc-gen.sh [--schema zapp] [--output docs/db/auto/]
#
# Requires: psql, jq (optional for JSON output)
# ============================================================

set -euo pipefail

# --- Config ---
DB_URL="${DATABASE_URL:-}"
OUTPUT_DIR="${OUTPUT_DIR:-docs/db/auto}"
TARGET_SCHEMAS="${SCHEMAS:-zapp evo ops financeiro email_app bpm ai vendas}"
DATE_STAMP=$(date +%Y-%m-%d)

if [[ -z "$DB_URL" ]]; then
    echo "ERROR: DATABASE_URL is not set." >&2
    echo "  export DATABASE_URL='postgresql://postgres:pass@host:5432/postgres'" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

psql_q() {
    psql "$DB_URL" --no-psqlrc --tuples-only --no-align --field-separator '|' -c "$1" 2>/dev/null
}

# ============================================================
# 1. Table catalog per schema
# ============================================================
for SCHEMA in $TARGET_SCHEMAS; do
    OUTFILE="$OUTPUT_DIR/catalog_${SCHEMA}.md"
    echo "Generating $OUTFILE ..."

    cat > "$OUTFILE" <<HEADER
# Catálogo de Tabelas — \`${SCHEMA}\`

**Gerado em:** ${DATE_STAMP}
**Fonte:** pg_catalog (automaticamente gerado por \`scripts/db-doc-gen.sh\`)

> Este arquivo é auto-gerado. Não editar manualmente — edite \`docs/db/schemas/${SCHEMA}.md\` para documentação humana.

| Tabela | Linhas (estimado) | Tamanho | RLS | Descrição |
|--------|------------------:|---------|:---:|-----------|
HEADER

    psql_q "
        SELECT
            t.relname,
            t.reltuples::bigint,
            pg_size_pretty(pg_total_relation_size(t.oid)),
            CASE t.relrowsecurity WHEN true THEN '✅' ELSE '❌' END,
            COALESCE(obj_description(t.oid, 'pg_class'), '')
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '${SCHEMA}'
          AND t.relkind = 'r'
        ORDER BY pg_total_relation_size(t.oid) DESC
    " | while IFS='|' read -r name rows size rls desc; do
        echo "| \`${name}\` | ${rows} | ${size} | ${rls} | ${desc} |"
    done >> "$OUTFILE"

    echo "" >> "$OUTFILE"
    echo "**Total de tabelas:** $(psql_q "SELECT COUNT(*) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='${SCHEMA}' AND t.relkind='r'")" >> "$OUTFILE"
done

# ============================================================
# 2. Index usage snapshot
# ============================================================
OUTFILE="$OUTPUT_DIR/indexes_unused.md"
echo "Generating $OUTFILE ..."

cat > "$OUTFILE" <<HEADER
# Índices Sem Uso (idx_scan = 0)

**Gerado em:** ${DATE_STAMP}
**Nota:** idx_scan reseta após pg_stat_reset. Verificar data do último reset antes de dropar.

| Schema | Tabela | Índice | Tamanho | PK | UNIQUE |
|--------|--------|--------|--------:|:--:|:------:|
HEADER

psql_q "
    SELECT
        s.schemaname,
        s.relname,
        s.indexrelname,
        pg_size_pretty(pg_relation_size(s.indexrelid)),
        CASE ix.indisprimary WHEN true THEN '✅' ELSE '' END,
        CASE ix.indisunique  WHEN true THEN '✅' ELSE '' END
    FROM pg_stat_user_indexes s
    JOIN pg_index ix ON ix.indexrelid = s.indexrelid
    WHERE s.schemaname IN ('zapp','evo','financeiro','email_app')
      AND s.idx_scan = 0
      AND NOT ix.indisprimary
    ORDER BY pg_relation_size(s.indexrelid) DESC
    LIMIT 50
" | while IFS='|' read -r schema table idx size pk uniq; do
    echo "| \`${schema}\` | \`${table}\` | \`${idx}\` | ${size} | ${pk} | ${uniq} |"
done >> "$OUTFILE"

# ============================================================
# 3. RLS coverage report
# ============================================================
OUTFILE="$OUTPUT_DIR/rls_coverage.md"
echo "Generating $OUTFILE ..."

cat > "$OUTFILE" <<HEADER
# Cobertura de RLS por Schema

**Gerado em:** ${DATE_STAMP}

| Schema | Tabelas | Com RLS | Cobertura |
|--------|--------:|--------:|----------:|
HEADER

psql_q "
    SELECT
        n.nspname,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE t.relrowsecurity) AS with_rls,
        ROUND(COUNT(*) FILTER (WHERE t.relrowsecurity) * 100.0 / NULLIF(COUNT(*),0), 1) || '%' AS coverage
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relkind = 'r'
      AND n.nspname IN ('zapp','evo','financeiro','email_app','bpm','ai','ops','vendas')
    GROUP BY n.nspname
    ORDER BY coverage DESC
" | while IFS='|' read -r schema total rls pct; do
    echo "| \`${schema}\` | ${total} | ${rls} | ${pct} |"
done >> "$OUTFILE"

# ============================================================
# 4. Cron jobs snapshot
# ============================================================
OUTFILE="$OUTPUT_DIR/crons_active.md"
echo "Generating $OUTFILE ..."

cat > "$OUTFILE" <<HEADER
# Cron Jobs Ativos

**Gerado em:** ${DATE_STAMP}
**Fonte:** cron.job

| # | Nome | Schedule | Ativo | Comando (truncado) |
|---|------|----------|:-----:|-------------------|
HEADER

psql_q "
    SELECT jobid, jobname, schedule, active, LEFT(command, 80)
    FROM cron.job
    ORDER BY jobname
" | while IFS='|' read -r id name sched active cmd; do
    ACTIVE_ICON="✅"
    [[ "$active" == *"f"* ]] && ACTIVE_ICON="❌"
    echo "| ${id} | \`${name}\` | \`${sched}\` | ${ACTIVE_ICON} | \`${cmd}...\` |"
done >> "$OUTFILE"

# ============================================================
# 5. Function count per schema
# ============================================================
OUTFILE="$OUTPUT_DIR/functions_summary.md"
echo "Generating $OUTFILE ..."

cat > "$OUTFILE" <<HEADER
# Funções por Schema

**Gerado em:** ${DATE_STAMP}

| Schema | Funções | SECURITY DEFINER | Com search_path fixo |
|--------|--------:|----------------:|---------------------:|
HEADER

psql_q "
    SELECT
        n.nspname,
        COUNT(*),
        COUNT(*) FILTER (WHERE p.prosecdef),
        COUNT(*) FILTER (WHERE p.prosecdef AND p.proconfig IS NOT NULL AND 'search_path' = ANY(
            ARRAY(SELECT split_part(unnest(p.proconfig),'=',1))
        ))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
      AND n.nspname IN ('zapp','evo','ops','financeiro','email_app','bpm','ai','vendas','public')
    GROUP BY n.nspname
    ORDER BY COUNT(*) DESC
" | while IFS='|' read -r schema total secdef sps; do
    echo "| \`${schema}\` | ${total} | ${secdef} | ${sps} |"
done >> "$OUTFILE"

# ============================================================
# Done
# ============================================================
echo ""
echo "✅ Documentation generated in: $OUTPUT_DIR"
echo "   Files:"
ls -1 "$OUTPUT_DIR"/*.md 2>/dev/null | while read -r f; do echo "   - $f"; done
echo ""
echo "Note: Commit generated files with:"
echo "  git add $OUTPUT_DIR/ && git commit -m 'docs(db): regenerate auto-catalog $(date +%Y-%m-%d)'"
