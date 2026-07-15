#!/usr/bin/env bash
# =====================================================================
# Aplicador de migrações para VPS Supabase Self-Hosted
# Uso:
#   PG_URL="postgres://postgres:***@supabase.atomicabr.com.br:5432/postgres" \
#     ./scripts/apply-vps-migrations.sh [--dry-run] [--only <file>]
#
# Trata CREATE INDEX CONCURRENTLY (não pode rodar dentro de transação):
#   - Arquivos com "CONCURRENTLY" são executados statement-a-statement
#     em AUTOCOMMIT (psql -1 é DESLIGADO), com ON_ERROR_STOP=on.
#   - Demais arquivos rodam em transação única.
#
# Valida ao final:
#   - Presença dos índices esperados em evo.*
#   - search_path das funções SECURITY DEFINER
#   - Contagem de policies RESTRICTIVE
# =====================================================================
set -euo pipefail

: "${PG_URL:?Defina PG_URL apontando para a VPS self-hosted}"

MIG_DIR="docs/migrations"
DRY_RUN=0
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --only)    ONLY="$2"; shift 2 ;;
    *) echo "Flag desconhecida: $1" >&2; exit 2 ;;
  esac
done

echo "==> Alvo: $(psql "$PG_URL" -Atc "select current_database() || '@' || inet_server_addr()")"

run_sql_file() {
  local f="$1"
  echo ""
  echo "==> Aplicando: $f"

  if grep -qi "CONCURRENTLY" "$f"; then
    echo "    (contém CONCURRENTLY — modo autocommit statement-a-statement)"
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "    [dry-run] pular execução"
      return
    fi
    # -1 forçaria transação; usamos psql sem -1 e AUTOCOMMIT explícito.
    PGOPTIONS="-c statement_timeout=0" \
      psql "$PG_URL" -v ON_ERROR_STOP=1 --set AUTOCOMMIT=on -f "$f"
  else
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "    [dry-run] pular execução"
      return
    fi
    psql "$PG_URL" -1 -v ON_ERROR_STOP=1 -f "$f"
  fi
}

FILES=(
  "$MIG_DIR/2026-07-15_zapp_schema_bridges.sql"
  "$MIG_DIR/2026-07-15_security_hardening.sql"
  "$MIG_DIR/2026-07-15_evo_indices_perf.sql"
)

for f in "${FILES[@]}"; do
  [[ -n "$ONLY" && "$f" != *"$ONLY"* ]] && continue
  [[ -f "$f" ]] || { echo "Arquivo ausente: $f" >&2; exit 3; }
  run_sql_file "$f"
done

echo ""
echo "==> Validação pós-migração"

psql "$PG_URL" -v ON_ERROR_STOP=1 <<'SQL'
\echo -- 1. Índices esperados em evo.evolution_messages_wpp2
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'evo'
  AND tablename  = 'evolution_messages_wpp2'
  AND indexname LIKE 'idx_evo_msg_wpp2_%'
ORDER BY indexname;

\echo -- 2. Funções SECURITY DEFINER sem search_path fixado (deve ser 0)
SELECT n.nspname || '.' || p.proname AS func
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname IN ('zapp','public')
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
    WHERE c LIKE 'search_path=%'
  )
ORDER BY 1;

\echo -- 3. Policies RESTRICTIVE em tabelas sensíveis
SELECT schemaname, tablename, policyname, permissive
FROM pg_policies
WHERE (schemaname, tablename) IN (
        ('zapp','evolution_instance_credentials'),
        ('zapp','password_reset_requests'),
        ('zapp','whatsapp_official_credentials')
      )
ORDER BY schemaname, tablename, policyname;

\echo -- 4. Contagem geral de RLS
SELECT schemaname,
       count(*) FILTER (WHERE rowsecurity) AS with_rls,
       count(*) FILTER (WHERE NOT rowsecurity) AS without_rls
FROM pg_tables
WHERE schemaname IN ('zapp','evo')
GROUP BY schemaname;
SQL

echo ""
echo "OK — migrações aplicadas e validadas."
