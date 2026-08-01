# Runbook: Sincronizar Edge Functions do volume com o repositório

**Data:** 2026-08-01 · **Motivo:** validação exaustiva encontrou o volume com 113/123
funções DESATUALIZADAS em relação ao `main` (deploy parcial de outra sessão — o
`main/index.ts` foi atualizado mas as funções individuais não). Duas funções
(`auto-close-conversations`, `cleanup-storage-orphans`) rodavam versões SEM
autenticação (executáveis por qualquer pessoa na internet).

## Como verificar divergência

```bash
# 1. md5 de todas as funções no volume
docker exec <supabase_functions> sh -c 'cd /home/deno/functions && for d in */; do d=${d%/}; [ "$d" = main ] && continue; case "$d" in _*) continue;; esac; echo "$d $(md5sum < $d/index.ts | cut -d" " -f1)"; done'

# 2. Comparar com o raw do repo (main)
#    (script em docs/edge/ ou gerar via gh api git/trees)
```

## Como sincronizar (192 arquivos: 124 funções + 68 _shared)

O volume persiste entre restarts (mount em `/root/supabase/docker/volumes/functions`),
então o sync é feito por download direto do `raw.githubusercontent.com` (repo público):

```bash
# No container supabase_functions (instalar curl se ausente):
BASE=https://raw.githubusercontent.com/adm01-debug/zapp-web-v3/main/supabase/functions
# Para CADA função <fn> do repo:
curl -fsSL -o /home/deno/functions/<fn>/index.ts "$BASE/<fn>/index.ts"
# Para CADA arquivo _shared/<x>.ts:
curl -fsSL -o /home/deno/functions/_shared/<x>.ts "$BASE/_shared/<x>.ts"
# main/index.ts:
curl -fsSL -o /home/deno/functions/main/index.ts "$BASE/main/index.ts"
```

Depois: **reiniciar o serviço** (`docker service update --force supabase_functions` ou
restart do container) para recarregar.

## Como validar (sweep de autenticação)

Para cada função, `curl -X POST https://supabase.atomicabr.com.br/functions/v1/<fn> -d '{}'`:

| Resposta | Significado | Esperado |
|---|---|---|
| 401 "Authorization failed"/"Missing authorization" | bloqueada pelo main | funções FORA da allowlist |
| 401 (outro corpo) | auto-protegida (CRON_SECRET/service_role) | funções NA allowlist (cron/alert) |
| 200 | pública | só health-check, status, email-track-pixel, webhooks HMAC |
| 400/404/405/422/500/503 | fail-closed ou quebrada | investigar individualmente |

Meta: **nenhuma função fora da allowlist responde 200 ou 401-de-função** (só 401 do main).

## Lição registrada

O deploy de Edge Functions self-hosted é manual (copiar para o volume). SEMPRE
sincronizar TODAS as funções + `_shared` + `main/index.ts` juntos — nunca apenas o
`main`. Considerar automatizar via workflow (candidato: `edge-sync` job no CI).
