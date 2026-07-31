# KONG URL SANITIZATION ROOT CAUSE

**Status:** INVESTIGATION REQUIRED
**Date:** 2026-07-26

---

## Problem

ADR-003 (bucket público) was a workaround for N+1 issue. Root cause is pending:
> "Identificar o fluxo que gera a URL" (runbook admission)

---

## Investigation Steps

### 1. Find the Source

Search for where `SUPABASE_URL` (internal Kong URL) gets written:

```bash
# Search for Kong URL in codebase
grep -r "kong:8000\|supabase-kong\|localhost:8000" --include="*.ts" --include="*.tsx"

# Search for internal URL assignment
grep -r "storage_url\|mediaUrl\|media_url" --include="*.ts"
```

### 2. Find the Workflow

```bash
# Search n8n workflows
grep -r "SUPABASE_URL\|createSignedUrl" n8n/workflows/

# Search Edge Functions
grep -r "createSignedUrl" supabase/functions/
```

### 3. Check Migration History

```bash
# When was the internal URL introduced?
git log -p --all -S "kong:8000" | head -50
```

---

## Known Locations

| File | Purpose | Status |
|------|---------|--------|
| `evo.evolution_media.storage_url` | DB column | ⏳ |
| `n8n workflow` | Writes to storage | ⏳ |
| `Edge Function` | Uploads media | ⏳ |

---

## Solution

Once root cause found:

1. Fix the source (not the symptom)
2. Backfill incorrect URLs
3. Remove sanitization from frontend
4. Monitor for recurrence

---

*Document Status: INVESTIGATION*
