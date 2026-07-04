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
| **`bun`** instalado | qualquer versão recente | O hook `prebuild` roda `bun run scripts/generate-component-registry.ts`. Sem bun → `bun: not found` e o build aborta antes do `vite build`. |
| **Node** | 20.x | Alinhado ao runtime. Dev-deps pedem node ≥22 (só *warnings* `EBADENGINE`, não bloqueiam). |

### Comando de build de produção
```sh
# instalar deps (NÃO usar 'npm ci' — ver seção 3)
npm install --no-audit --no-fund

# build com heap ampliado + envs do self-hosted
VITE_SUPABASE_URL=https://supabase.atomicabr.com.br \
VITE_SUPABASE_ANON_KEY=<anon key> \
NODE_OPTIONS=--max-old-space-size=6144 \
npm run build
```

Saída esperada: `dist/` (~17 MB), `✓ built in ~1m`, PWA com ~283 entradas de precache, assets com variantes `.br`/`.gz` pré-comprimidas.

---

## 3. Pegadinha do `package-lock.json` (xlsx via CDN)

- O `package.json` referencia o xlsx por **tarball da CDN**: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` — porque a SheetJS **saiu do npm registry** (versões ≥0.19 não existem lá; um `npm view xlsx@0.20.3` dá **E404**).
- Se o `package-lock.json` estiver **dessincronizado** (travado em `xlsx@0.18.5` do registry), o **`npm ci` falha** com `EUSAGE / Invalid: lock file's xlsx@0.18.5 does not satisfy xlsx@0.20.3`.
- **Correção** (regenera o lock a partir do `package.json`):
  ```sh
  npm install --package-lock-only --no-audit --no-fund
  git add package-lock.json && git commit -m "chore: sincroniza package-lock (xlsx CDN 0.20.3)"
  ```
  Regra de ouro: **sempre que bumpar o xlsx, rode isso e commite o lock** — senão a CI quebra.

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

## 6. Backup das edge functions legadas (`_shared` Fator X)

As funções legadas (`audio-transcribe`, `evolution-*`) usam `_shared/mod.ts` com exports próprios (`auth-legacy.ts`, `rate-limiter-legacy.ts`, `validation-legacy.ts`) que **vivem só no volume de functions**, fora deste repo. Um deploy que sobrescreva o `_shared` quebra o boot delas.

- Backup pós-fix preservado no host: `functions-postfix-*.tar.gz` (em `/root/supabase/docker/volumes/`).
- **Pendência**: migrar essas funções para versionamento formal (ver issues abertas).

---

_Última atualização: rodada de paridade Lovable → VPS, jul/2026._
