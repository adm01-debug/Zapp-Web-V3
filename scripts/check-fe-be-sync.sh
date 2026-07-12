#!/usr/bin/env bash
# =============================================================================
# check-fe-be-sync.sh
# -----------------------------------------------------------------------------
# Garante o sincronismo Frontend <-> Backend na camada de BANCO (Postgres),
# complementando o check-edge-function-sync.sh (que cobre só Edge Functions).
#
# Faz TRÊS verificações, cada uma capaz de quebrar a app ou um `supabase db reset`:
#
#   [A] RPC ÓRFÃ:     supabase.rpc('X') chamado no frontend para um X que NÃO
#                     tem CREATE FUNCTION em supabase/migrations.
#   [B] TABELA ÓRFÃ:  supabase.from('Y') (client principal) para um Y que NÃO
#                     tem CREATE TABLE/VIEW/MATERIALIZED VIEW em migrations.
#   [C] ALTER SEM CREATE: migration faz ALTER FUNCTION em uma função que nunca
#                     teve CREATE FUNCTION.
#
# Uso: bash scripts/check-fe-be-sync.sh
# Saída != 0 em qualquer dessincronismo.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_DIR="src"
MIG_DIRS=(supabase/migrations supabase/fatorx-migrations supabase/migrations-from-lovable)
IGNORE_FILE="scripts/.sync-ignore"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fail=0

# Helper: normaliza nome de relação/função vindo de uma definição SQL.
# strip schema (public. / auth_helpers. / etc), aspas e lowercase.
norm() { sed -E 's/^[a-zA-Z_][a-zA-Z0-9_]*\.//' | tr -d '"' | tr 'A-Z' 'a-z'; }

# --- Allowlist (relações/RPCs de bancos externos) ---
if [[ -f "$IGNORE_FILE" ]]; then
  grep -vE '^\s*(#|$)' "$IGNORE_FILE" | tr -d ' ' | tr 'A-Z' 'a-z' | sort -u > "$TMP/ignore.txt"
else
  : > "$TMP/ignore.txt"
fi

# =============================================================================
# Conjunto FONTE-DA-VERDADE: tudo que as migrations CRIAM (reproduzível).
# =============================================================================
# IMPORTANTE: o padrao de grep NÃO pode ter espaco no final do character class!
# "create ... function [chars]+ " (com espaco) falharia em nomes sem espaco
# antes de '(' como fn_foo() — capturaria zero nomes, zerando fn_defined.txt
# e gerando centenas de falsos-positivos.
grep -rhoiE "create (or replace )?function [a-zA-Z0-9_.\"]+[a-zA-Z0-9_\"]" "${MIG_DIRS[@]}" 2>/dev/null \
  | sed -E 's/[Cc][Rr][Ee][Aa][Tt][Ee]( [Oo][Rr] [Rr][Ee][Pp][Ll][Aa][Cc][Ee])? [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] //' \
  | norm | sort -u > "$TMP/fn_defined.txt"

grep -rhoiE "create (or replace )?(table|view|materialized view)( if not exists)? [a-zA-Z0-9_.\"]+[a-zA-Z0-9_\"]" "${MIG_DIRS[@]}" 2>/dev/null \
  | sed -E 's/[Cc][Rr][Ee][Aa][Tt][Ee] ([Oo][Rr] [Rr][Ee][Pp][Ll][Aa][Cc][Ee] )?([Tt][Aa][Bb][Ll][Ee]|[Vv][Ii][Ee][Ww]|[Mm][Aa][Tt][Ee][Rr][Ii][Aa][Ll][Ii][Zz][Ee][Dd] [Vv][Ii][Ee][Ww])( [Ii][Ff] [Nn][Oo][Tt] [Ee][Xx][Ii][Ss][Tt][Ss])? //' \
  | norm | sort -u > "$TMP/rel_defined.txt"

# =============================================================================
# [A] RPC ÓRFÃ
# =============================================================================
grep -rhoE "\.rpc\(\s*['\"\`][a-zA-Z0-9_]+" "$SRC_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null \
  | sed -E "s/.*rpc\(\s*['\"\`]//" | tr 'A-Z' 'a-z' | sort -u > "$TMP/rpc_called.txt"

comm -23 "$TMP/rpc_called.txt" "$TMP/fn_defined.txt" \
  | comm -23 - "$TMP/ignore.txt" > "$TMP/rpc_orphans.txt" || true

if [[ -s "$TMP/rpc_orphans.txt" ]]; then
  fail=1
  echo "❌ [A] RPCs chamadas no frontend SEM CREATE FUNCTION em migrations:" >&2
  sed 's/^/     - /' "$TMP/rpc_orphans.txt" >&2
  echo "" >&2
fi

# =============================================================================
# [B] TABELA ÓRFÃ (client principal; exclui Storage e allowlist)
# =============================================================================
grep -rhoE "\.from\(\s*['\"\`][a-zA-Z0-9_-]+" "$SRC_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null \
  | sed -E "s/.*from\(\s*['\"\`]//" | tr 'A-Z' 'a-z' | sort -u > "$TMP/from_all.txt"
grep -rhoE "storage\s*\.\s*from\(\s*['\"\`][a-zA-Z0-9_-]+" "$SRC_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null \
  | sed -E "s/.*from\(\s*['\"\`]//" | tr 'A-Z' 'a-z' | sort -u > "$TMP/from_storage.txt"

comm -23 "$TMP/from_all.txt" "$TMP/from_storage.txt" \
  | comm -23 - "$TMP/rel_defined.txt" \
  | comm -23 - "$TMP/ignore.txt" \
  | grep -vE '-' > "$TMP/tbl_orphans.txt" || true

if [[ -s "$TMP/tbl_orphans.txt" ]]; then
  fail=1
  echo "❌ [B] Tabelas/views referenciadas no frontend SEM definição em migrations:" >&2
  echo "       (se a relação vive em banco externo, adicione em scripts/.sync-ignore)" >&2
  sed 's/^/     - /' "$TMP/tbl_orphans.txt" >&2
  echo "" >&2
fi

# =============================================================================
# [C] ALTER FUNCTION sem CREATE FUNCTION
# =============================================================================
# Abordagem multi-passo:
#   Passo 1: grep -rih preserva a linha inteira (sem nome de arquivo)
#   Passo 2: filtra linhas que começam com -- (comentário SQL)
#   Passo 3: extrai ALTER FUNCTION nome (para antes do '(')
#   Passo 4: remove o prefixo e normaliza (strip schema, lowercase)
# O [C] também filtra pelo .sync-ignore (igual a [A] e [B]).
grep -rihE "alter function " "${MIG_DIRS[@]}" 2>/dev/null \
  | grep -viE '^\s*--' \
  | grep -oiE "alter function [a-zA-Z0-9_.\"]*[a-zA-Z0-9_\"]" \
  | sed -E 's/[Aa][Ll][Tt][Ee][Rr] [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] //' \
  | norm | grep -v '^$' | sort -u > "$TMP/fn_altered.txt"

comm -23 "$TMP/fn_altered.txt" "$TMP/fn_defined.txt" \
  | comm -23 - "$TMP/ignore.txt" > "$TMP/alter_orphans.txt" || true

if [[ -s "$TMP/alter_orphans.txt" ]]; then
  fail=1
  echo "❌ [C] Migrations fazem ALTER FUNCTION em funções que nunca tiveram CREATE" >&2
  echo "       (quebra 'supabase db reset' com: function ... does not exist):" >&2
  sed 's/^/     - /' "$TMP/alter_orphans.txt" >&2
  echo "" >&2
fi

# =============================================================================
if [[ "$fail" -ne 0 ]]; then
  echo "💥 FE/BE DESSINCRONIZADO. Crie as migrations faltantes (ou allowlist se externo)." >&2
  exit 1
fi

echo "✅ FE/BE em sincronismo:"
echo "   - $(wc -l < "$TMP/rpc_called.txt" | tr -d ' ') RPCs chamadas, todas com migration"
echo "   - $(comm -23 "$TMP/from_all.txt" "$TMP/from_storage.txt" | wc -l | tr -d ' ') relações de DB referenciadas, todas resolvidas"
echo "   - 0 ALTER FUNCTION órfão"
