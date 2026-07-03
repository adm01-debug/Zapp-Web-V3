# Edge Function Environment Variables

## supabase_functions Swarm Service

The `supabase_functions` Docker Swarm service (`rhfc155h366c54ka5x52p1do3`) requires the following
environment variables to be configured **in the startup command** (not just in the `Env` array), so
that `Deno.env.toObject()` returns them to user workers.

### Current startup command (as of 2026-07-03)

```sh
export JWT_SECRET=$(cat /run/secrets/supabase_jwt_secret_v1) \
  && export DB_PASS=$(cat /run/secrets/supabase_db_password_v1) \
  && export SUPABASE_DB_URL=postgresql://postgres:${DB_PASS}@db:5432/postgres \
  && export SUPABASE_SERVICE_ROLE_KEY=$(cat /run/secrets/supabase_service_key_v1) \
  && export EVOLUTION_API_URL=http://evolution_evolution:8080 \
  && export EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11 \
  && exec edge-runtime start \
       --main-service /home/deno/functions/main \
       --request-wait-timeout 60000
```

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
> Internal routing has ~56ms RTT (confirmed); external routing adds TLS + reverse proxy overhead.

### Variables injected via Docker Secrets (read in startup script)

These are mounted as files under `/run/secrets/` and exported before `exec edge-runtime`:

| Variable | Secret File |
|---|---|
| `JWT_SECRET` | `supabase_jwt_secret_v1` |
| `SUPABASE_DB_URL` | derived from `supabase_db_password_v1` |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase_service_key_v1` |

### edge-runtime flags explained

| Flag | Value | Notes |
|---|---|---|
| `--main-service` | `/home/deno/functions/main` | Main service handler |
| `--request-wait-timeout` | `60000` ms | **Critical**: time allowed for a user worker to establish connection (cold-start). Default is 10000ms (10s), which is insufficient for cold-starting heavy functions (e.g., evolution-api with 13 remote imports from deno.land/esm.sh that can take 12-15s to load). |

> **Note**: `--wall-clock-time` does NOT exist in edge-runtime v1.71.2. The equivalent is
> `--request-wait-timeout` (max time to establish connection with a worker) and
> `--user-worker-request-idle-timeout` (max request processing time, disabled by default).

### main/index.ts tuning

The `main/index.ts` (live on host at `/root/supabase/docker/volumes/functions/main/index.ts`,
**not** in this repo) has been updated with:

```typescript
const memoryLimitMb = 256       // up from 150 MB
const workerTimeoutMs = 5 * 60 * 1000  // up from 1 min → 5 min
```

`workerTimeoutMs` in `userWorkers.create()` controls the idle timeout for the user worker pool
(how long a worker lives without requests). It does NOT control the per-request wall clock time.

### Incident summary — 2026-07-03

**Symptom 1** (Critical): All `evolution-api` edge function calls returned HTTP 503.
**Root cause**: `EVOLUTION_API_URL` and `EVOLUTION_API_KEY` were absent from the service spec.
**Fix**: Added to startup command via `portainer_update_service`.

**Symptom 2** (High): `wall clock duration warning` + `early termination` in edge-runtime logs.
**Root cause**: `--request-wait-timeout` defaults to 10000ms (10s), but cold-starting evolution-api
from `deno.land`/`esm.sh` CDNs takes 12-15s on a clean isolate, exceeding the limit.
**Fix**: `--request-wait-timeout 60000` added to startup command.

**Verification timeline**:
- Before fix: wall clock warnings every ~15s, 503 on every call
- After EVOLUTION vars: 503 resolved, wall clock still firing at ~14s  
- After request-wait-timeout: no wall clock warnings observed (container `34c72b8a0993`)

### Security gap (NOT yet fixed — requires explicit decision)

The `auth_rw` RLS policy on `zapp.instance_processing_pauses` uses `qual: true` (always-pass),
effectively overriding the admin-only `ipp_admin_*` policies. Any authenticated user can currently
read, write, and delete pause records. The `SECURITY DEFINER` function
`auto_pause_instance_on_auth_spike` bypasses RLS, so the auto-pause flow is unaffected.

Resolution options:
1. Drop `auth_rw` policy if `ipp_admin_*` are the intended access controls
2. Convert `auth_rw` to a RESTRICTIVE policy to let it coexist with admin checks
