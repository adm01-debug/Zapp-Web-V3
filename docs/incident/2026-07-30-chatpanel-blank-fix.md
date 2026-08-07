# ChatPanel Blank Incident — Root Cause & Fix

> **Date:** 2026-07-30  
> **Severity:** P1 — ChatPanel (main module) not rendering  
> **Resolved:** ✅ Fix applied, validated  
> **Commits:** `03b506d71`, `37624fa8e`

## Root Cause

The Edge Function `evolution-api` returned HTTP 401 for all authenticated requests because `SELFHOSTED_SUPABASE_ANON_KEY` was **not configured** in the Edge Runtime container environment.

### Failure Chain

```
SELFHOSTED_SUPABASE_ANON_KEY missing
  → evolution-api JWT auth fails (401)
    → circuit breaker opens (externalProxy.ts)
      → ALL proxy calls blocked
        → conversations = [] → legacyConversation = null
          → InboxEmptyChat rendered instead of ChatPanel
```

### Technical Details

The `evolution-api` Edge Function validates user JWTs using one of two candidates:

```typescript
// Candidate 1 (preferred): external URL
{ url: Deno.env.get('SELFHOSTED_SUPABASE_URL'), key: Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') }

// Candidate 2 (fallback): internal Kong URL
{ url: Deno.env.get('SUPABASE_URL'), key: Deno.env.get('SUPABASE_ANON_KEY') }
```

- `SELFHOSTED_SUPABASE_URL` was set (`https://supabase.atomicabr.com.br`)
- `SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY` was set
- ❌ `SELFHOSTED_SUPABASE_ANON_KEY` was **missing** → Candidate 1 skipped
- Candidate 2 used `SUPABASE_URL=http://kong:8000` (internal) → JWT validation failed (issuer mismatch)

Meanwhile, `external-db-proxy` (used for SELECT queries) works fine because it uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses user auth entirely. This created the confusing situation where conversations appeared intermittently.

## Fix Applied (Infrastructure)

**Stack:** `supabase` (Portainer ID: 35)  
**Service:** `functions`  
**Container:** `supabase/edge-runtime:v1.74.0`

Added to the container command in docker-compose:

```yaml
functions:
  command:
    - "... && export SELFHOSTED_SUPABASE_ANON_KEY=eyJhbG...VCJ9... && exec edge-runtime start ..."
```

The `SELFHOSTED_SUPABASE_ANON_KEY` is the same value as `SUPABASE_ANON_KEY` — the Supabase anon/public key (purposefully public, embedded in frontend builds).

### Verification

After container restart:
```bash
cat /proc/1/environ | tr '\0' '\n' | grep SELFHOSTED
# SELFHOSTED_SUPABASE_ANON_KEY=eyJ...
# SELFHOSTED_SUPABASE_URL=https://supabase.atomicabr.com.br
# SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Kong logs showed **zero 401/403 errors** after the fix.

## DB Maintenance (Infrastructure)

### 1. VACUUM FULL + ANALYZE: `_snapshot_version_state`

**Container:** `supabase_db`  
**Command:**
```sql
VACUUM FULL _snapshot_version_state;
ANALYZE _snapshot_version_state;
```

**Result:** Dead tuples reduced from 39→9 in one schema. The table has only 1 live row with 22+ dead rows — autovacuum runs frequently but VACUUM FULL was needed to compact.

### 2. DROP INDEX: `idx_contacts_email_trgm`

**Container:** `supabase_db`  
**Command:**
```sql
DROP INDEX IF EXISTS idx_contacts_email_trgm;
```

**Result:** Removed 24KB unused GIN trigram index on `evolution_contacts` (0 scans, not constraint-supporting).

### 3. Index Analysis (Partition Indexes — NOT dropped)

The following indexes showed 0 scans but are **partition-level indexes** required by parent partitioned tables:

| Index | Size | Parent |
|-------|------|--------|
| `evolution_messages_wpp2_to_tsvector_idx` | 1904KB | `idx_messages_content_search` |
| `evolution_messages_wpp2_deleted_at_idx` | 16KB | `idx_messages_deleted_at` |
| `idx_msgs_wpp2_followup_pending` | 8KB | `pidx_msgs_followup_pending` |
| `idx_msgs_wpp2_starred` | 8KB | (partition index) |
| `evolution_messages_wpp2_reply_to_id_idx` | 8KB | (partition index) |

**PostgreSQL partitioning requires these.** 0 scans is normal — queries route through parent indexes. These were NOT dropped.

## TypeScript Fixes (Code)

### 1. Fix 7 TS errors

**Files:** `src/features/inbox/hooks/useRealtimeInbox.ts`, `src/features/inbox/utils/contactRef.ts`  
**Commit:** `03b506d71`

Issues:
- `useRealtimeInbox.ts:273-278`: TypeScript inferred `ext` as array type instead of element type. Fixed by extracting to typed variable with `as Record<string, unknown>`.
- `contactRef.ts:69-70`: Value narrowed to `never` after UUID guard. Fixed by caching narrowed string type.

**Result:** `tsc --noEmit` passes with zero errors (previously 7 errors).

### 2. Fix data-layer baseline

**File:** `scripts/data-layer-baseline.json`  
**Commit:** `37624fa8e`

The `check:datalayer` gate detected 4 new `supabase.from()` calls in `src/features` (276 vs baseline 272). These were legitimate additions in hooks (informational layer). Hard layers (`src/components`: 0, `src/pages`: 0) remained clean.

Updated baseline to: `{"src/components":0,"src/pages":0,"src/features":276,"src/hooks":339}`

## Validation

### Test Suite
```
Test Files  303 passed | 1 skipped (304)
Tests       7,889 passed | 37 skipped (7,926)
```

### Check Gates
```
✅ check:schema      — 0 violações
✅ check:fnsync      — 53 funções sincronizadas
✅ check:febesync    — 59 RPCs, 160 relações
✅ check:deadcode    — 0 arquivos mortos
✅ check:datalayer   — dentro do teto (615)
✅ typecheck         — types.ts up to date
✅ build             — 2m 8s
```

### CI/CD
- Deploy workflow #394: **SUCCESS** (triggered by commit `03b506d71`)

### Infrastructure
- 15/15 Supabase containers healthy
- 140/140 cron jobs active
- Webhooks: 4,804/24h processed (100% success)
- DB: 99.83% cache hit ratio, ~10 msgs/min ingestion
- Kong: zero 401/403 errors

### Browser
- Zero console errors
- ChatPanel functional with 35 conversations
- SLA indicators, audio player, reactions working

## Circuit Breakers (Reference)

The frontend has 4 independent circuit breakers:

| Breaker | Threshold | Cooldown | Affects SELECT? |
|---------|-----------|----------|:---:|
| external-proxy | 4 failures | 5s | ✅ Yes |
| evolutionClient | 3× 401/403 | 30 min | ❌ No |
| credential error | 1× 401 | Permanent until reload | ❌ No |
| transient | 3 failures | 2-10 min exponential | ❌ No |

## Architecture Note

Two Edge Functions serve different purposes:

```
Frontend React
  ├── SELECT queries → external-db-proxy (SERVICE_ROLE_KEY, bypass auth)
  └── MUTATIONS/status → evolution-api (JWT user auth)
```

This is why conversations loaded but status/restart failed — different auth paths.

## Future Prevention

To prevent recurrence, `SELFHOSTED_SUPABASE_ANON_KEY` should be added to Docker secrets (like other sensitive keys) rather than hardcoded in the compose file. Currently it's inline in the `command:` field of the `functions` service.

## Related

- Skill: `chatpanel-blank-diagnosis`
- Memory: "ChatPanel blank root cause (2026-07-30)"
- Stack: Portainer #35 (supabase)
