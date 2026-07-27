# Análise Técnica — CSP + Storage 400 (2026-07-27)

## FASE 0 — Baseline CONCLUÍDA ✅
- Branch criada: `fix/csp-storage-audio-400`
- Baseline commit: `91bb6ecd5240d73b376ed3cf1dac421818ee1cda`
- Tag image: `zapp-web:production-latest@sha256:3c2650172b714a27d7148855db1d416b0474f7d7d00d694ff07b6be8ce0c3f9d`
- Doc baseline: `docs/incident/2026-07-27-csp-storage/BASELINE.md`

## DIAGNÓSTICO DE FONTES

### CSP — Onde é injetado?
1. ✅ **NGINX do container** (`nginx.conf` — repo main): NÃO tem CSP
2. ⚠️ **Traefik middleware** (Swarm): possível — não confirmado sem exec
3. ⚠️ **`security-headers.conf`** (em `migrations-from-lovable/_deploy/`): PODE estar
   no container via Docker build (verificar `Dockerfile`)
4. ❓ **Vercel** (se deployado via Vercel): não aplicável — produção é VPS/Swarm

### Storage 400 — Causa mais provável
- Bucket `audio-messages` = **não público** (CLAUDE.md audit)
- Alternativa: `allowed_mime_types` sem `audio/ogg` ou RLS negando `anon`
- Confirmar via: `SELECT * FROM storage.buckets WHERE name='audio-messages';`

## MATRIZ DE CORREÇÃO

| ID | Causa-Raiz | Fix |
|----|-------------|-----|
| BUG-1 | `img-src 'self' data: blob: https:` | Refinar para origens explícitas |
| BUG-2 | `media-src` sem supabase.atomicabr.com.br | Adicionar `https://supabase.atomicabr.com.br` |
| BUG-3 | Bucket `audio-messages` não público | `public=true` OU signed URLs (LGPD) |
| BUG-4 | Consequência de BUG-2 + BUG-3 | Error handling graceful no player |

## PRÓXIMO STEP: FASE 1 — Localizar fonte canônica do CSP
- Verificar `Dockerfile` do zapp-web para incluir de `security-headers.conf`
- Verificar Traefik config via Portainer MCP (se exec liberado)
