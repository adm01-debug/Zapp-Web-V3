#!/usr/bin/env bash
# Helper compartilhado para validar secrets obrigatórios antes de rodar
# scripts E2E/seed/cleanup. Falha com exit 78 (EX_CONFIG) e orientação clara.
#
# Uso:
#   source "$(dirname "$0")/lib/preflight-secrets.sh"
#   preflight_secrets "nome-do-script" VAR1 VAR2 VAR3

_preflight_hint() {
  case "$1" in
    SUPABASE_DB_URL)          echo "postgres://user:senha@host:5432/postgres" ;;
    E2E_USER_EMAIL)           echo "e2e-bot@zappweb.test" ;;
    E2E_USER_PASSWORD)        echo "senha forte (≥16 chars)" ;;
    VITE_SUPABASE_URL)        echo "https://supabase.atomicabr.com.br" ;;
    VITE_SUPABASE_PUBLISHABLE_KEY) echo "chave anon publishable da instância" ;;
    E2E_BASE_URL)             echo "https://zapp.atomicabr.com.br" ;;
    VPS_SSH_HOST)             echo "host ou IP da VPS" ;;
    VPS_SSH_USER)             echo "usuário SSH da VPS" ;;
    VPS_SSH_KEY)              echo "chave privada SSH (conteúdo PEM)" ;;
    *)                        echo "valor apropriado" ;;
  esac
}

preflight_secrets() {
  local script_name="$1"; shift
  local missing=()
  local var
  for var in "$@"; do
    if [ -z "${!var:-}" ]; then missing+=("$var"); fi
  done

  if [ ${#missing[@]} -eq 0 ]; then
    return 0
  fi

  {
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo " ❌  $script_name abortado — secrets obrigatórios não configurados"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo " Faltando: ${missing[*]}"
    echo ""
    echo " Como configurar:"
    echo "   1. GitHub → Settings → Secrets and variables → Actions"
    for var in "${missing[@]}"; do
      printf "        • %-32s → %s\n" "$var" "$(_preflight_hint "$var")"
    done
    echo ""
    echo "   2. Localmente:  export ${missing[0]}=..."
    echo ""
    echo " Docs: docs/testing/e2e.md"
    echo "════════════════════════════════════════════════════════════════"
  } >&2

  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error title=$script_name: secrets faltantes::${missing[*]} não configurado(s). Adicione em GitHub → Settings → Secrets → Actions."
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      {
        echo "### ❌ $script_name abortado"
        echo ""
        echo "Secrets obrigatórios ausentes: $(printf '\`%s\` ' "${missing[@]}")"
        echo ""
        echo "Configure em **Settings → Secrets and variables → Actions** e re-execute."
      } >> "$GITHUB_STEP_SUMMARY"
    fi
  fi

  exit 78
}
