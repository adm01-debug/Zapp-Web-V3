# Deployment Guide — zapp-web-v3

## Ambientes de deploy

### 1. Vercel / Lovable Preview (vercel.json)

Usado para deploy automático no Lovable (via GitHub integration) e previews de PR.

Arquivo relevante: `vercel.json`

- **installCommand:** `bun install` (consistente com bun.lock)
- **buildCommand:** `vite build`
- **outputDirectory:** `dist`

Env vars estão hardcoded no `vercel.json` para o ambiente self-hosted Supabase.
Secret keys adicionais devem ser configuradas no painel da Vercel (não no `vercel.json`).

---

### 2. Docker Swarm / Portainer (Dockerfile + nginx.conf)

Ambiente de produção principal. Docker image é buildada no CI ou manualmente e
deployada via Portainer em Docker Swarm.

Arquivos relevantes:
- `Dockerfile` — build multi-stage (bun + nginx)
- `nginx.conf` — config do servidor nginx dentro do container

**Build args obrigatórios:**
```bash
docker build \
  --build-arg VITE_SUPABASE_URL=... \
  --build-arg VITE_SUPABASE_ANON_KEY=... \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
  -t zapp-web-v3:latest .
```

A env var `VITE_SUPABASE_PUBLISHABLE_KEY` tem fallback para `VITE_SUPABASE_ANON_KEY`
caso não seja fornecida explicitamente (ver `Dockerfile`).

---

### 3. VPS Direct (nginx-prod.conf)

Para servir o dist/ diretamente do filesystem da VPS sem Docker (modo legado).

Arquivo relevante: `nginx-prod.conf`

Path fixo: `/workspace/repos/zapp-web-v3/dist` (VPS-específico).
Atualizar o nginx.conf da VPS para apontar para este arquivo:

```bash
nginx -c /etc/nginx/sites-enabled/zapp-web-v3  # aponta para nginx-prod.conf
```

---

## Package manager

Este projeto usa **bun** como package manager. `bun.lock` é o lockfile canônico.

Para instalar dependências:
```bash
bun install
```

`package-lock.json` está no `.gitignore` — não deve ser commitado.
