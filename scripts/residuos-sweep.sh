#!/usr/bin/env bash
# residuos-sweep.sh — Varredura anti-resíduos (Docker Swarm)
# ---------------------------------------------------------------------------
# Varre docker config ls / docker secret ls / docker image ls e ALERTA quando
# uma mesma "família" de artefato acumula mais de MAX_VERSIONS versões.
#
# Família = nome sem o sufixo de versão:
#   - configs/secrets: sufixo _v<N> ou -v<N> (ex.: guardrail_script_v1, purge_v9)
#   - imagens: repository (ex.: ghcr.io/atomicalabs/evolution-api) + cada tag
#     conta como uma versão. Imagens dangling (<none>) são listadas como info,
#     não participam da contagem de versões.
#
# Comportamento:
#   - NÃO deleta nada — apenas detecta e alerta (echo). Política anti-resíduos
#     em infra/runbooks/POLITICA_ANTI_RESIDUOS.md.
#   - Exit 0 = sem resíduos; Exit 1 = pelo menos uma família acima do limite
#     (útil para cron/CI reagir).
#   - Sem docker CLI/daemon acessível: avisa e sai 0 (varredura pulada).
#
# Agendamento sugerido (cron semanal — domingo 06:00):
#   0 6 * * 0 /usr/local/bin/residuos-sweep.sh >> /var/log/residuos-sweep.log 2>&1
# ---------------------------------------------------------------------------
set -uo pipefail

MAX_VERSIONS="${RESIDUOS_MAX_VERSIONS:-3}"
SWEEP_NAME="residuos-sweep"

ENTRIES="$(mktemp)"
trap 'rm -f "$ENTRIES"' EXIT

# --- helpers ----------------------------------------------------------------

log() { echo "[$SWEEP_NAME] $*"; }

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "AVISO: docker CLI não encontrado — varredura pulada."
    exit 0
  fi
  if ! docker info >/dev/null 2>&1; then
    log "AVISO: daemon docker inacessível — varredura pulada."
    exit 0
  fi
}

# Extrai a família de um nome de config/secret: remove o sufixo _v<N> ou -v<N>.
# Sem sufixo de versão, o próprio nome é a família (count 1 — nunca alerta).
family_of() {
  local name="$1"
  if [[ "$name" =~ ^(.*)[_-]v[0-9]+$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  else
    printf '%s' "$name"
  fi
}

# Registra uma entrada "família<TAB>versão". Versão vazia é ignorada.
register() {
  local family="$1" version="$2"
  [[ -z "$version" ]] && return 0
  printf '%s\t%s\n' "$family" "$version" >> "$ENTRIES"
}

# --- varreduras -------------------------------------------------------------

scan_configs() {
  local name family
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    family="$(family_of "$name")"
    register "$family" "$name"
  done < <(docker config ls --format '{{.Name}}' 2>/dev/null || true)
}

scan_secrets() {
  local name family
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    family="$(family_of "$name")"
    register "$family" "$name"
  done < <(docker secret ls --format '{{.Name}}' 2>/dev/null || true)
}

scan_images() {
  local repo tag family dangling=0
  while IFS=$'\t' read -r repo tag; do
    [[ -z "$repo" && -z "$tag" ]] && continue
    if [[ "$repo" == "<none>" || "$tag" == "<none>" ]]; then
      dangling=$((dangling + 1))
      continue
    fi
    family="${repo#*/}" # remove registry (ex.: ghcr.io/...) — família = repository
    register "$family" "$tag"
  done < <(docker image ls --format '{{.Repository}}\t{{.Tag}}' 2>/dev/null || true)
  [[ "$dangling" -gt 0 ]] && log "INFO: $dangling imagem(ns) dangling (sem tag) encontradas."
}

# --- relatório --------------------------------------------------------------

report() {
  local family count version line alerts=0
  # família<TAB>versão → conta versões por família (uniq -c separa com espaço)
  while read -r count family; do
    [[ "$count" -gt "$MAX_VERSIONS" ]] || continue
    alerts=1
    log "ALERTA: família '$family' tem $count versões (> limite $MAX_VERSIONS):"
    while IFS=$'\t' read -r _ version; do
      log "  - $version"
    done < <(grep -F "$family"$'\t' "$ENTRIES" | sort)
  done < <(sort "$ENTRIES" | cut -f1 | uniq -c)

  if [[ "$alerts" -eq 0 ]]; then
    log "OK: nenhuma família com mais de $MAX_VERSIONS versões."
    return 0
  fi
  return 1
}

# --- main -------------------------------------------------------------------

require_docker
scan_configs
scan_secrets
scan_images
report
