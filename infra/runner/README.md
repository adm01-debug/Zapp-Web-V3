# Self-hosted GitHub Actions Runner — ZAPP VPS

Runner dedicado que roda os workflows Playwright dentro da VPS, eliminando
os problemas recorrentes de:

- Download do Chromium a cada job (~200 MB) no `ubuntu-latest`.
- Dependências de sistema faltando (libnss3, libatk, libgbm, etc.).
- Latência de rede saindo do GitHub Runner até a VPS (`zapp.atomicabr.com.br`).

## Opções de instalação

### Opção A — Runner nativo (recomendada)

Executa como serviço systemd no próprio host da VPS.

```bash
# 1) Gere o token em: Settings → Actions → Runners → New self-hosted runner
sudo REPO_URL="https://github.com/OWNER/REPO" \
     RUNNER_TOKEN="AAA..." \
     RUNNER_NAME="vps-zapp-01" \
     bash infra/runner/install-runner.sh

# 2) Verifique
sudo systemctl status 'actions.runner.*'
sudo journalctl -u 'actions.runner.*' -f
```

Labels aplicadas: `self-hosted, linux, x64, vps-zapp, playwright`.

### Opção B — Runner em Docker

Isolamento total; útil se você não quiser tocar o host.

```bash
cp infra/runner/.env.example infra/runner/.env
$EDITOR infra/runner/.env   # preencha REPO_URL, RUNNER_TOKEN, RUNNER_NAME
docker compose -f infra/runner/docker-compose.runner.yml up -d
docker logs -f zapp-gh-runner
```

## Usar nos workflows

Os workflows E2E aceitam o input `runner` (`self-hosted` ou `ubuntu-latest`),
com default `self-hosted`. Também é possível forçar via secret repo/env
`E2E_RUNNER_LABEL`.

Para rodar manualmente contra o self-hosted:

```
Actions → E2E Inbox (VPS) → Run workflow
  runner: self-hosted
```

O cache do Playwright fica em `~/.cache/ms-playwright` do usuário `ghrunner`
(nativo) ou no volume `playwright-cache` (Docker), evitando redownload.

## Manutenção

| Ação | Comando |
|---|---|
| Reiniciar runner nativo | `sudo systemctl restart 'actions.runner.*'` |
| Atualizar browsers | `sudo -u ghrunner npx playwright install --with-deps chromium` |
| Remover runner | `cd /opt/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall && sudo -u ghrunner ./config.sh remove --token <REMOVE_TOKEN>` |
| Rotacionar token | Gerar novo token no GitHub e reinstalar (script é idempotente com `--replace`) |

## Segurança

- O runner tem acesso ao filesystem da VPS; **não** rode workflows de PRs
  vindas de forks nele. Ative "Require approval for outside collaborators"
  em Settings → Actions.
- Use um usuário dedicado (`ghrunner`), sem sudo, sem acesso ao Postgres
  em produção (as suites usam credenciais do Supabase pelas secrets).
- Rotacione `E2E_USER_PASSWORD` periodicamente e prefira workflows com
  `permissions: contents: read`.
