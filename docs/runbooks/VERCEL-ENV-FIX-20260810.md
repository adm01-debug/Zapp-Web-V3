# Fix do Vercel — Env de Supabase (www.zappweb.app.br)

> **Problema:** o bundle deployado no Vercel foi buildado com a **service_role key antiga** (rotacionada 05/08) como `VITE_SUPABASE_ANON_KEY` → Kong responde 401 em `/auth/v1/token` e todas as rotas protegidas → **login impossível** no `www.zappweb.app.br`.
> O app docker (`zapp.atomicabr.com.br`) está correto (usa a anon key) — builds **separados**, envs **separados**.

## O que trocar (dashboard Vercel → Project → Settings → Environment Variables)

| Env | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://supabase.atomicabr.com.br` |
| `VITE_SUPABASE_ANON_KEY` | **anon key** (role `anon`, 192 chars — a mesma usada no build docker; cópia local: `~/tmp/docker_key.txt`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | idem anon key (o app usa como fallback) |

⚠️ **NÃO** usar a service_role key em nenhum env de frontend (risco: acesso admin ao PostgREST pelo bundle público).

## Passos

1. Atualizar os 3 envs no dashboard (ou `vercel env add` na CLI, projeto `zapp-web`).
2. Redeply: `vercel --prod` (ou Production deploy pelo dashboard).
3. **Verificar pós-deploy** (a prova é o payload da chave no bundle, não o status do deploy):

```bash
JS=$(curl -s https://www.zappweb.app.br | grep -oP 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "https://www.zappweb.app.br/$JS" | grep -oP 'Wr="(eyJ[A-Za-z0-9_.\-]{50,})"'
# decodificar a parte do meio (base64url) → DEVE ter: "role":"anon"
# NÃO pode ter: "role":"service_role"
```

4. Smoke test de login: `https://www.zappweb.app.br/auth` → email + senha → dashboard.

## Nota sobre o workflow GitHub (`deploy-vps-selfhosted.yml`)

O build **docker** (GHCR → zapp.atomicabr.com.br) usa `secrets.VITE_SUPABASE_PUBLISHABLE_KEY` como anon key (linhas ~77-112) — **está correto** (o bundle docker tem a anon key). Se um dia rotacionar a anon key: atualizar o secret `VITE_SUPABASE_PUBLISHABLE_KEY` no GitHub **e** o env no Vercel **na mesma janela**, e reiniciar o Kong (keyring) — os 3 pontos sempre juntos.
