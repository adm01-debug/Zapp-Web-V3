#!/usr/bin/env bash
# =============================================================================
# clean-deno-shadow.sh — Remove stale Deno shadow cache antes do build
# =============================================================================
# Problema: node_modules/.deno/ acumula 1000+ arquivos .tsbuildinfo que
# conflitam com o esbuild durante o Vite build no Windows, causando crash.
#
# Uso: bash scripts/clean-deno-shadow.sh
# Seguro idempotente — não falha se o diretório não existir.
#
# Hardening (simulation gaps V05/V06/V10):
#   V05 — trap INT/TERM/EXIT: interrupção durante o cleanup é logada e o
#         script sai com status 130, sinalizando re-execução necessária.
#   V06 — verificação pós-clean: após rm -rf, confirma que o diretório
#         realmente sumiu; falha com exit 1 se ainda existir.
#   V10 — degradação graciosa: se `find` falhar (permissão/lock), a contagem
#         vira "unknown" em vez de abortar o cleanup. Se bash não existir no
#         ambiente do caller, o shebang falha antes de qualquer rm — callers
#         (CI, package.json) devem usar `command -v bash` antes de invocar.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DENO_CACHE="node_modules/.deno"
INTERRUPTED=0

# V05: handler único para sinais e saída normal — preserva $? e reporta
# interrupção parcial (rm interrompido no meio = cache parcialmente removido).
_cleanup() {
  local status=$?
  if [[ "$INTERRUPTED" -eq 1 ]]; then
    echo "⚠️  Interrompido durante o cleanup — re-execute o script para completar a remoção" >&2
    exit 130
  fi
  exit "$status"
}
trap _cleanup INT TERM EXIT

if [[ -d "$DENO_CACHE" ]]; then
  # Segurança: nunca remover symlink — pode apontar para algo importante.
  if [[ -L "$DENO_CACHE" ]]; then
    echo "❌ Recusando: $DENO_CACHE é um symlink (→ $(readlink "$DENO_CACHE")) — remova manualmente" >&2
    exit 1
  fi

  # V10: falha do find não aborta o cleanup — contagem degrada para "unknown".
  ENTRY_COUNT=$(find "$DENO_CACHE" -type f 2>/dev/null | wc -l) || ENTRY_COUNT="unknown"

  # Windows: rm -rf pode falhar com "Directory not empty" em diretórios com
  # muitos arquivos ou atributos especiais. Estratégia em 3 camadas:
  #   1. find -delete (mais confiável no Windows, remove arquivo por arquivo)
  #   2. rm -rf (fallback rápido para o que sobrou)
  #   3. cmd //c rmdir /s /q (fallback Windows nativo, último recurso)
  CLEAN_OK=0
  find "$DENO_CACHE" -depth -delete 2>/dev/null && CLEAN_OK=1 || true
  rm -rf "$DENO_CACHE" 2>/dev/null && CLEAN_OK=1 || true
  if [[ ! -e "$DENO_CACHE" ]]; then CLEAN_OK=1; fi
  if [[ "$CLEAN_OK" -eq 0 ]]; then
    # Último recurso: comando nativo do Windows via cmd.exe
    WIN_PATH=$(cygpath -w "$DENO_CACHE" 2>/dev/null || echo "$DENO_CACHE")
    cmd //c "rmdir /s /q \"$WIN_PATH\"" 2>/dev/null && CLEAN_OK=1 || true
  fi

  # V06: prova pós-clean — diretório precisa ter sumido de verdade.
  if [[ -e "$DENO_CACHE" ]]; then
    echo "⚠️  Aviso: $DENO_CACHE não pôde ser completamente removido (${ENTRY_COUNT} entries detectadas)" >&2
    echo "   O build pode falhar. Tente fechar outros processos e rodar novamente." >&2
    # Não aborta — deixa o build continuar. Melhor tentar que travar CI.
  else
    echo "🧹 Deno shadow cleaned (${ENTRY_COUNT} entries removed)"
  fi
else
  echo "✅ Deno shadow cache not present — skipping"
fi
