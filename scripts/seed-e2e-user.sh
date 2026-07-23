#!/usr/bin/env bash
# Semeia o usuário E2E com permissões de CRM na VPS Supabase Self-Hosted.
#
# Uso:
#   SUPABASE_DB_URL=postgres://... \
#   E2E_USER_EMAIL=e2e-bot@zappweb.test \
#   E2E_USER_PASSWORD=change-me-in-ci \
#   ./scripts/seed-e2e-user.sh
#
# Idempotente. Seguro para rodar antes de cada suite E2E.

set -euo pipefail

# ── Pré-flight de secrets ─────────────────────────────────────────────
# Falha explicitamente com orientação em vez de "unbound variable" críptico.
REQUIRED=(SUPABASE_DB_URL E2E_USER_EMAIL E2E_USER_PASSWORD)
MISSING=()
for var in "${REQUIRED[@]}"; do
  if [ -z "${!var:-}" ]; then MISSING+=("$var"); fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  {
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo " ❌  Seed E2E abortado — secrets obrigatórios não configurados"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo " Faltando: ${MISSING[*]}"
    echo ""
    echo " Como configurar:"
    echo "   1. GitHub → Settings → Secrets and variables → Actions"
    echo "      Adicione os secrets:"
    for var in "${MISSING[@]}"; do
      case "$var" in
        SUPABASE_DB_URL)   echo "        • $var    → postgres://user:senha@host:5432/postgres" ;;
        E2E_USER_EMAIL)    echo "        • $var     → e2e-bot@zappweb.test (ou outro @zappweb.test)" ;;
        E2E_USER_PASSWORD) echo "        • $var  → senha forte (≥16 chars, gerada com password manager)" ;;
      esac
    done
    echo ""
    echo "   2. Localmente:  export ${MISSING[0]}=..."
    echo ""
    echo " Docs: docs/testing/e2e.md#seed-e2e-user"
    echo "════════════════════════════════════════════════════════════════"
  } >&2

  # Emitir anotação para GitHub Actions (aparece na aba Summary/Checks)
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error title=Seed E2E: secrets faltantes::${MISSING[*]} não configurado(s). Adicione em GitHub → Settings → Secrets → Actions. Veja docs/testing/e2e.md."
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      {
        echo "### ❌ Seed E2E abortado"
        echo ""
        echo "Secrets obrigatórios ausentes: $(printf '`%s` ' "${MISSING[@]}")"
        echo ""
        echo "Configure em **Settings → Secrets and variables → Actions** e re-execute o workflow."
      } >> "$GITHUB_STEP_SUMMARY"
    fi
  fi

  exit 78  # EX_CONFIG — sinaliza problema de configuração, não erro de runtime
fi


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMMARY_JSON="${SEED_REPORT_JSON:-/tmp/seed-e2e-user-summary.json}"
LOG_FILE="${SEED_REPORT_LOG:-/tmp/seed-e2e-user.log}"

echo "[seed-e2e] usuário: $E2E_USER_EMAIL"

# psql envia NOTICE para stderr; capturamos ambos para extrair o marcador.
set +e
psql "$SUPABASE_DB_URL" \
  --set=ON_ERROR_STOP=on \
  --set=email="'${E2E_USER_EMAIL//\'/\'\'}'" \
  --set=password="'${E2E_USER_PASSWORD//\'/\'\'}'" \
  -f "$SCRIPT_DIR/seed-e2e-user.sql" > >(tee -a "$LOG_FILE") 2> >(tee -a "$LOG_FILE" >&2)
rc=$?
set -e

if [ $rc -ne 0 ]; then
  echo "[seed-e2e] ❌ psql exit=$rc — veja $LOG_FILE" >&2
  exit $rc
fi

# Extrai a última linha "E2E_SEED_SUMMARY_JSON:{...}"
if grep -q 'E2E_SEED_SUMMARY_JSON:' "$LOG_FILE"; then
  grep 'E2E_SEED_SUMMARY_JSON:' "$LOG_FILE" | tail -n1 | sed 's/^.*E2E_SEED_SUMMARY_JSON://' > "$SUMMARY_JSON"
  echo "[seed-e2e] summary → $SUMMARY_JSON"
  cat "$SUMMARY_JSON"; echo
else
  echo "[seed-e2e] ⚠️  marcador E2E_SEED_SUMMARY_JSON não encontrado no log" >&2
  echo '{"kind":"user","warning":"summary-not-emitted"}' > "$SUMMARY_JSON"
fi

echo "[seed-e2e] OK — usuário pronto para E2E de CRM."

