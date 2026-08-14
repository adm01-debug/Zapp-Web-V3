#!/usr/bin/env bash
set -uo pipefail

# fail-closed: se alguma metrica nao veio, falha (validacao final V3)
[ -n "${MSGS_24H:-}" ] && [ -n "${DLQ:-}" ] && [ -n "${HEALTH_SCORE:-}" ] || { echo "ERRO: medicao incompleta" >&2; exit 1; }
