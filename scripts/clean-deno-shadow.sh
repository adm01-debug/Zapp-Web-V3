#!/usr/bin/env bash
# =============================================================================
# clean-deno-shadow.sh — Remove stale Deno shadow cache antes do build
# =============================================================================
# Problema: node_modules/.deno/ acumula 1000+ arquivos .tsbuildinfo que
# conflitam com o esbuild durante o Vite build no Windows, causando crash.
#
# Uso: bash scripts/clean-deno-shadow.sh
# Seguro idempotente — não falha se o diretório não existir.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DENO_CACHE="node_modules/.deno"

if [[ -d "$DENO_CACHE" ]]; then
  ENTRY_COUNT=$(find "$DENO_CACHE" -type f 2>/dev/null | wc -l)
  rm -rf "$DENO_CACHE"
  echo "🧹 Deno shadow cleaned ($ENTRY_COUNT entries removed)"
else
  echo "✅ Deno shadow cache not present — skipping"
fi
