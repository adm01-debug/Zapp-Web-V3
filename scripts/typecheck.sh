#!/usr/bin/env bash
# Wrapper for bun run typecheck — evita bug do bun no Windows com &&
set -e
bash scripts/validate-supabase-types.sh --check --summary
npx tsc --noEmit -p tsconfig.app.json
