#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Instala um self-hosted GitHub Actions runner na VPS ZAPP para executar
# suites Playwright dentro da infra (sem depender do runner ubuntu-latest
# do GitHub e sem baixar Chromium a cada job).
#
# Requisitos:
#   - Rodar como root (ou com sudo) em Ubuntu 20.04+ / Debian 11+.
#   - Ter um token de registro (Settings → Actions → Runners → New runner).
#
# Uso:
#   sudo REPO_URL="https://github.com/<owner>/<repo>" \
#        RUNNER_TOKEN="ABC123..." \
#        RUNNER_NAME="vps-zapp-01" \
#        RUNNER_LABELS="self-hosted,linux,x64,vps-zapp,playwright" \
#        bash infra/runner/install-runner.sh
# ---------------------------------------------------------------------------
set -euo pipefail

: "${REPO_URL:?REPO_URL é obrigatório (ex.: https://github.com/org/repo)}"
: "${RUNNER_TOKEN:?RUNNER_TOKEN é obrigatório (gerado no GitHub UI)}"
RUNNER_NAME="${RUNNER_NAME:-vps-zapp-$(hostname -s)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,vps-zapp,playwright}"
RUNNER_VERSION="${RUNNER_VERSION:-2.319.1}"
RUNNER_USER="${RUNNER_USER:-ghrunner}"
RUNNER_HOME="/opt/actions-runner"
WORK_DIR="${WORK_DIR:-_work}"

echo "[1/6] Instalando dependências do sistema + Playwright/Chromium..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  curl ca-certificates jq git tar gnupg lsb-release \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2 libatspi2.0-0 libwayland-client0 \
  fonts-liberation fonts-noto-color-emoji xvfb

if ! command -v node >/dev/null 2>&1; then
  echo "  -> Instalando Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "[2/6] Criando usuário ${RUNNER_USER}..."
if ! id "${RUNNER_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${RUNNER_USER}"
fi

echo "[3/6] Baixando runner v${RUNNER_VERSION}..."
mkdir -p "${RUNNER_HOME}"
chown "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_HOME}"
cd "${RUNNER_HOME}"

if [ ! -f "./config.sh" ]; then
  sudo -u "${RUNNER_USER}" curl -o actions-runner.tar.gz -L \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  sudo -u "${RUNNER_USER}" tar xzf actions-runner.tar.gz
  sudo -u "${RUNNER_USER}" rm actions-runner.tar.gz
fi

echo "[4/6] Registrando runner ${RUNNER_NAME} em ${REPO_URL}..."
sudo -u "${RUNNER_USER}" ./config.sh \
  --unattended \
  --replace \
  --url "${REPO_URL}" \
  --token "${RUNNER_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --work "${WORK_DIR}"

echo "[5/6] Instalando como serviço systemd..."
./svc.sh install "${RUNNER_USER}"
./svc.sh start

echo "[6/6] Pré-instalando browsers do Playwright para cache global..."
sudo -u "${RUNNER_USER}" bash -lc "
  mkdir -p ~/.cache/ms-playwright
  npx --yes playwright@1.48.0 install --with-deps chromium || true
"

echo
echo "✅ Runner ${RUNNER_NAME} ativo com labels: ${RUNNER_LABELS}"
echo "   Status: sudo systemctl status actions.runner.*"
echo "   Logs:   sudo journalctl -u 'actions.runner.*' -f"
