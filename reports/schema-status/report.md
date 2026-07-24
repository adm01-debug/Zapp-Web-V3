# Schema Status Report — ❌ FAIL

- **Gerado em:** 2026-07-24T01:45:31.928Z
- **Requeridos:** `zapp, evo`

## Local (arquivo `types.ts`)

| Campo | Valor |
|-------|-------|
| Status | ❌ fail |
| Arquivo existe | ✅ `src/integrations/supabase/types.ts` |
| Schemas presentes | `__InternalSupabase`, `public` |
| Schemas ausentes | `zapp`, `evo` |
| Erro | `types.ts sem: zapp, evo` |

## Remoto (`postgres-meta`)

| Campo | Valor |
|-------|-------|
| Status | ⏭️ skipped |
| Schemas presentes | _(nenhum)_ |
| Schemas ausentes | _(nenhum)_ |

## Como resolver

1. Rode o workflow de regeneração: [gen-types-zapp.yml](https://github.com/atomicabr/zapp-web/actions/workflows/gen-types-zapp.yml) → **Run workflow** (schemas: `public,zapp,evo`).
2. Faça merge do PR `chore/regen-zapp-types` gerado automaticamente.
3. Reexecute este job.

Alternativa local (requer VPN/token da VPS):

```bash
META_URL=https://supabase.atomicabr.com.br \
  META_TOKEN=<service_role> \
  SCHEMAS=public,zapp,evo \
  node scripts/gen-types-zapp.mjs
```
