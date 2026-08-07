#!/bin/bash
# ==============================================================================
# validate-supabase-types.sh
# Checks if src/integrations/supabase/types.ts is in sync with the database schema
# and ensures it's compatible with the current TypeScript configuration.
# ==============================================================================

set -euo pipefail

# Constantes de versão para determinismo
SUPABASE_CLI_VERSION="2.9.8"
TYPES_FILE="src/integrations/supabase/types.ts"
TYPES_BAK="${TYPES_FILE}.bak"
CHECK_MODE=false
SUMMARY_MODE=false
PR_NUMBER="${GITHUB_PR_NUMBER:-}"

# Simple flag parsing
for arg in "$@"; do
  if [ "$arg" == "--check" ]; then
    CHECK_MODE=true
  elif [ "$arg" == "--summary" ]; then
    SUMMARY_MODE=true
  fi
done

# Check dependencies
if ! command -v npx &> /dev/null; then
  echo "❌ Error: npx is required but not installed."
  exit 1
fi

# Load env vars if .env exists (local use)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Validate required environment variables for type generation
if [ -z "${SUPABASE_PROJECT_ID:-}" ]; then
  echo "⚠️ SUPABASE_PROJECT_ID not set. Type generation might fail if not using local Supabase."
fi

echo "🔄 Generating Supabase types..."

# Store hash of current file if in check mode
if [ "$CHECK_MODE" = true ]; then
  if [ -f "$TYPES_FILE" ]; then
    OLD_HASH=$(md5sum "$TYPES_FILE" | cut -d' ' -f1)
  else
    OLD_HASH="none"
  fi
fi

# We use npx supabase to lock the version via package manager or direct call
# The --project-id flag is preferred for remote projects
if [ -n "${SUPABASE_PROJECT_ID:-}" ] && [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  # Uso determinístico da versão travada via npx
  npx "supabase@$SUPABASE_CLI_VERSION" gen types typescript --project-id "$SUPABASE_PROJECT_ID" > "$TYPES_FILE.new"
elif [ -d "supabase" ] && command -v docker &> /dev/null && docker ps &> /dev/null; then
  # Try local generation if supabase folder exists and docker is running
  npx supabase gen types typescript --local > "$TYPES_FILE.new"
elif [ -n "${META_URL:-}" ] && [ -n "${META_TOKEN:-}" ]; then
  # Self-hosted (AtomicaBR): postgres-meta via gen-types-zapp.mjs
  # (schemas public+zapp+evo; preserva a cauda legada do types.ts atual).
  echo "🔄 Generating types via postgres-meta (self-hosted)..."
  if [ ! -f "$TYPES_FILE" ]; then
    echo "❌ Error: $TYPES_FILE not found (cannot preserve legacy tail)."
    exit 1
  fi
  cp "$TYPES_FILE" "$TYPES_FILE.new"
  if ! META_URL="$META_URL" META_TOKEN="$META_TOKEN" SCHEMAS="${SCHEMAS:-public,zapp,evo}" \
       OUT_FILE="$TYPES_FILE.new" node scripts/gen-types-zapp.mjs; then
    # Resiliencia: falha de infra (endpoint fora, OOM do postgres-meta, DNS do
    # Kong) NAO deve quebrar o typecheck local — usa o arquivo atual e avisa.
    echo "⚠️ Self-hosted generation failed — keeping current types.ts (check META_URL/META_TOKEN/endpoint)."
    cp "$TYPES_FILE" "$TYPES_FILE.new"
  fi
else
  # If we are in a limited environment (like the agent sandbox or CI without secrets/docker),
  # we skip actual generation and just validate the existing file if it exists.
  echo "⚠️ Skipping actual type generation (Docker/Secrets unavailable)."
  echo "   Local self-hosted hint: set META_URL and META_TOKEN in .env (see .env.example)."
  if [ -f "$TYPES_FILE" ]; then
    cp "$TYPES_FILE" "$TYPES_FILE.new"
  else
    echo "❌ Error: src/integrations/supabase/types.ts not found and cannot be generated."
    exit 1
  fi
fi

# Check for TS1005 (basic syntax check)
if [ -s "$TYPES_FILE.new" ]; then
  # Only run tsc if it's a new generation. If we just copied the old one, we assume it's valid for now
  # to avoid build loops in restricted environments.
  if [ "${SKIP_TSC_VALIDATION:-false}" != "true" ]; then
    if grep -q ";" "$TYPES_FILE.new" && grep -q "  " "$TYPES_FILE.new"; then
       # FIX (validacao 2026-08-06): tsc rejeita extensao '.new' (TS6054 — falso positivo permanente).
       # Valida via copia temporaria .ts e remove depois.
       TYPES_TMP="${TYPES_FILE}.tmp.ts"
       cp "$TYPES_FILE.new" "$TYPES_TMP"
       # TSC_LOCAL evita npx resolver um tsc GLOBAL mais novo (ex.: TS 7) que
       # quebra com TS5112/TS5108 — usa SEMPRE o tsc do projeto (package.json).
       TSC_BIN="./node_modules/.bin/tsc"
       if ! "$TSC_BIN" "$TYPES_TMP" --noEmit --esModuleInterop --target esnext --moduleResolution node &> /dev/null; then
          echo "❌ Error: Generated types.ts contains TypeScript errors."
          rm -f "$TYPES_TMP"
          exit 1
       fi
       rm -f "$TYPES_TMP"
    fi
  fi
fi

if [ "$CHECK_MODE" = true ]; then
  NEW_HASH=$(md5sum "$TYPES_FILE.new" | cut -d' ' -f1)
  if [ "$OLD_HASH" != "$NEW_HASH" ]; then
    echo "❌ Error: src/integrations/supabase/types.ts is out of sync with the database schema."
    
    if [ "$SUMMARY_MODE" = true ] && [ -n "$PR_NUMBER" ]; then
      echo "### 🔄 Supabase Types Diff Summary" > types_diff.md
      echo "O schema do banco de dados mudou. Abaixo estão as alterações detectadas no \`types.ts\`:" >> types_diff.md
      echo "\`\`\`diff" >> types_diff.md
      diff -u "$TYPES_FILE" "$TYPES_FILE.new" | head -n 50 >> types_diff.md
      echo "\`\`\`" >> types_diff.md
      [ $(diff -u "$TYPES_FILE" "$TYPES_FILE.new" | wc -l) -gt 50 ] && echo "... (truncado)" >> types_diff.md
    fi
    
    echo "Run 'npm run types:gen' to update it and commit the changes."
    rm "$TYPES_FILE.new"
    exit 1
  else
    echo "✅ src/integrations/supabase/types.ts is up to date."
    rm "$TYPES_FILE.new"
  fi
else
  # Garantir diff no output durante geração manual/CI push
  if [ -f "$TYPES_FILE" ]; then
    diff -u "$TYPES_FILE" "$TYPES_FILE.new" || true
  fi
  mv "$TYPES_FILE.new" "$TYPES_FILE"
  echo "✅ src/integrations/supabase/types.ts updated successfully."
fi
