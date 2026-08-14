# 🛠️ Operação — Build & Deploy do Frontend V3 (self-hosted)

> Complementa `docs/DEPLOYMENT.md` com as **pegadinhas de build/deploy** descobertas na rodada de paridade Lovable → VPS (jul/2026). Leia isto antes de rodar um build de produção em runner novo.

---

## 1. Objetivo

Garantir que o build e o deploy do `zapp-web-v3` sejam **reproduzíveis** e não dependam de conhecimento tácito. Todo ponto abaixo já causou falha real em produção pelo menos uma vez.

---

## 2. Requisitos de build (produção)

| Requisito | Valor | Por quê |
|-----------|-------|---------|
| **RAM do runner** | **≥ 8 GB** (heap `--max-old-space-size` ≥ 6144) | O bundle tem ~6.000 módulos; o rollup estoura na fase *rendering chunks*. Em container com teto de **4 GB o build morre com `Killed` (OOM)** — sem mensagem de erro clara. |
| **`bun`** instalado | v1.3+ | O projeto usa `bun.lock` como fonte de verdade. O hook `prebuild` roda `bun run scripts/generate-component-registry.ts`. Sem bun → `bun: not found` e o build aborta antes do `vite build`. |
| **Node** | 20.x | Alinhado ao runtime de produção. Dev-deps pedem node ≥22 (só *warnings* `EBADENGINE`, não bloqueiam). |

### Comando de build de produção

```sh
# Instalar dependências com bun (fonte de verdade do projeto)
bun install --frozen-lockfile

# Build com heap ampliado + envs do self-hosted
VITE_SUPABASE_URL=https://supabase.atomicabr.com.br \
VITE_SUPABASE_ANON_KEY=<anon key> \
NODE_OPTIONS=--max-old-space-size=6144 \
npm run build
```

> **Nota:** `npm run build` chama `bun` internamente no hook `prebuild`. O `bun install` deve ser executado antes para garantir que o `bun.lock` esteja sincronizado.

Saída esperada: `dist/` (~17 MB), `✓ built in ~1m`, PWA com ~283 entradas de precache, assets com variantes `.br`/`.gz` pré-comprimidas.

---

## 3. Gerenciamento de dependências — `bun.lock` (fonte de verdade)

O projeto usa **`bun.lock`**, não `package-lock.json`, como arquivo de lock. O `ci.yml` valida isso com `bun install --frozen-lockfile`.

- O `bun.lock` resolve `xlsx@0.20.3` via tarball da CDN SheetJS: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (versões ≥0.19 não existem no registry npm público).
- O `package-lock.json` que o npm gera é um **artefato não versionado** — não use como referência.

**Comando para regenerar o lock** (se bumpar dependências):
```sh
bun install          # atualiza bun.lock
git add bun.lock && git commit -m "chore: atualiza bun.lock"
```

**Nunca** commitar `package-lock.json` gerado pelo npm — ele conflita com o `bun.lock`.

---

## 4. Deploy do frontend (Docker Swarm)

O serviço `zapp-web-prod_web` (nginx:alpine) serve o `dist/` a partir do volume `claude-code_workspace` (montado RO em `/workspace`), roteado pelo Traefik em `Host(zapp.atomicabr.com.br)` com TLS Let's Encrypt.

- **Config nginx**: versionada em **`nginx-prod.conf`** (raiz do repo). O serviço copia esse arquivo para `/etc/nginx/conf.d/default.conf` no boot.
  > ⚠️ Antes vivia só no volume. Sem versionar, recriar a workspace derrubava o nginx na **página default**. Nunca edite a conf só no volume — edite no repo.
- **Flip de versão** (Portainer/Swarm): `Order: start-first` (zero downtime) + `FailureAction: rollback` (reverte sozinho se o healthcheck falhar). Sempre incrementar `ForceUpdate` para forçar a substituição da task em mudanças de env/args.
- **Healthcheck**: `GET /health` → `{"status":"ok","app":"zapp-web-v3","version":"3.0.0"}`.
- **Smoke pós-deploy** (obrigatório):
  ```sh
  curl -s https://zapp.atomicabr.com.br/health           # versão correta?
  curl -s -o /dev/null -w '%{http_code}' https://zapp.atomicabr.com.br/conversations  # SPA fallback = 200
  ```

---

## 5. Boas práticas de checkout (workspace compartilhada)

A workspace `/workspace/repos/zapp-web-v3` é **compartilhada** entre processos/agentes e **troca de branch** sem aviso. Para builds/commits confiáveis:

- **Nunca** commite direto no branch que estiver montado sem checar `git branch --show-current`.
- Use **worktree dedicado** por tarefa: `git worktree add -b <branch> /tmp/<dir> origin/main`.
- Rode build de produção em **container builder descartável** com ≥ 8 GB (`docker run --rm -m 12g -v claude-code_workspace:/workspace ...`), preservando a claude-code (que tem teto de 4 GB).

---

## 6. Backup das edge functions legadas (`_shared`)

As funções legadas do domínio WhatsApp/CRM (`audio-transcribe`, `evolution-*`) usam `_shared/mod.ts` com re-exports próprios (`auth-legacy.ts`, `rate-limiter-legacy.ts`, `validation-legacy.ts`) que **vivem no volume de functions e no diretório `supabase/functions-legacy/`** deste repo. Um deploy que sobrescreva o `_shared/` quebra o boot delas. (Desde a consolidação de jul/2026 elas rodam no Supabase self-hosted único — o Evolution DB cloud foi descontinuado e não há mais dependência de banco externo.)

- Backup pós-fix preservado no host: `functions-postfix-20260703-2148.tar.gz` (em `/root/supabase/docker/volumes/`).
- Arquivos versionados em: `supabase/functions-legacy/_shared/` (merged via PR #176, jul/2026).
- **Script de restauração**: ver `supabase/functions-legacy/README.md`.

---

_Última atualização: 2026-07-04 — corrigido diagnóstico bun vs npm; adicionados detalhes sobre bun.lock e functions-legacy._


## Evolution API — operação (pós-2026-08-12)

Build e deploy da imagem Evolution: gerenciados em [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack).
Workflows removidos deste repo: `publish-evolution-api-custom.yml`, `publish-evolution-rabbit-consumer.yml`.
