# Edge Function Environment Variables

## supabase_functions Swarm Service

The `supabase_functions` Docker Swarm service (`rhfc155h366c54ka5x52p1do3`) requires the following
environment variables to be configured **in the startup command** (not just in the `Env` array), so
that `Deno.env.toObject()` returns them to user workers.

### How env vars reach user workers

The startup command is `/bin/sh -c "export VAR=... && exec edge-runtime start ..."`. The
`edge-runtime` process inherits all exported variables. The `main/index.ts` then calls
`Deno.env.toObject()` and passes every key-value pair to each user worker via `envVars` in
`EdgeRuntime.userWorkers.create()`. Variables in the Docker `Env` array are visible to the shell
but must also be explicitly exported to PID 1 if added to the `Args` startup command.

### Required variables

| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `http://kong:8000` | Internal Kong URL |
| `SUPABASE_ANON_KEY` | `eyJ...` | Anon JWT |
| `VERIFY_JWT` | `"false"` | Auth bypass for internal calls |
| `WEBHOOK_SECRET` | `promo-brindes-evolution-...` | HMAC secret |
| `PROMOGIFTS_SUPABASE_URL` | `https://doufsxqlfjyuvxuezpln.supabase.co` | Cloud project |
| `PROMOGIFTS_SUPABASE_ANON_KEY` | `eyJ...` | Cloud anon key |
| `EVOLUTION_API_URL` | `http://evolution_evolution:8080` | **Internal Docker network URL** |
| `EVOLUTION_API_KEY` | `429683C4C977415CAAFCCE10F7D57E11` | Evolution API master key |

> **Note on EVOLUTION_API_URL**: Use the internal Docker overlay network hostname
> (`evolution_evolution:8080`) rather than the external URL (`https://evolution.atomicabr.com.br`).
> Internal routing has ~5ms RTT; external routing adds TLS + reverse proxy overhead and is
> subject to external DNS resolution from within the container network.

### Variables injected via Docker Secrets (read in startup script)

These are mounted as files under `/run/secrets/` and exported before `exec edge-runtime`:

| Variable | Secret File |
|---|---|
| `JWT_SECRET` | `supabase_jwt_secret_v1` |
| `SUPABASE_DB_URL` | derived from `supabase_db_password_v1` |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase_service_key_v1` |

### main/index.ts tuning

The `main/index.ts` (live on host at `/root/supabase/docker/volumes/functions/main/index.ts`,
**not** in this repo) has been updated with:

```typescript
const memoryLimitMb = 256       // up from 150 MB
const workerTimeoutMs = 5 * 60 * 1000  // up from 1 min → 5 min (survive cold-start module loading)
```

This prevents the "wall clock duration warning" + "early termination" death loop that occurs when
cold-starting user workers that import remote modules from `deno.land` and `esm.sh`.

### Incident summary — 2026-07-03

**Symptom**: All `evolution-api`, `evolution-api/status`, `evolution-api/list-instances` edge
function calls returned HTTP 503 (`Edge Function returned a non-2xx status code`).

**Root cause**: `EVOLUTION_API_URL` and `EVOLUTION_API_KEY` were absent from the `supabase_functions`
Swarm service spec. The function's guard clause (`isPlaceholder(evolutionApiUrl)`) short-circuits
immediately and returns `503 { error: 'Evolution API not configured' }` before any network call.

**Fix applied**: Updated the service spec via `portainer_update_service` to export both variables
in the startup command (`Args`). The container `a01c3038625d` (task `usvkh84hsolg43t9s2k08j9df`)
is now running with the correct configuration.
