# Zapp Web v3 — Operational Runbook

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


Complete guide for troubleshooting, debugging, and operating Zapp Web v3 in production.

---

## Quick Reference

| Issue | Symptom | Diagnosis | Fix |
|-------|---------|-----------|-----|
| **Webhook delays** | Messages not arriving | Check `webhook_idempotency` table for stuck events | Clear stuck events, restart Evolution API |
| **N+1 queries** | Sidebar loads slowly | Check browser DevTools Network tab for repeated DB calls | Ensure indexes created per `20260713_composite_index_messages.sql` |
| **Auth timeout** | Users logged out unexpectedly | Check httpOnly cookie headers in Network tab | Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set |
| **Rate limiting** | API returns 429 errors | Check `evolution-webhook` logs for rate limit rejections | Increase rate limit buckets in `evolution-webhook/index.ts` (EVENT_RATE_LIMITS) |
| **RLS violations** | "Permission denied" errors | Check active user's team membership in `team_members` | Verify user's `deleted_at IS NULL` and team exists |
| **Memory leaks** | App gets slower over time | Check browser DevTools Memory tab for detached DOM nodes | Verify event listeners removed (useTheme cleanup, Realtime unsubscribe) |

---

## 1. Webhook Processing

### Architecture

```
Meta/Gmail/Evolution → POST /webhook → [Validation] → [Idempotency Check] → [Rate Limit] → [Handler] → DB
```

**Files:**
- `supabase/functions/whatsapp-webhook/index.ts` — WhatsApp status & message handling
- `supabase/functions/gmail-webhook/index.ts` — Gmail Pub/Sub notifications
- `supabase/functions/evolution-webhook/index.ts` — WhatsApp Business evolution API
- `supabase/migrations/20260713_webhook_idempotency.sql` — Deduplication
- `supabase/functions/_shared/sentry.ts` — Error tracking

### Common Issues

#### Messages not appearing in conversation

**Symptoms:**
- User sends message, doesn't appear in chat
- Message appears in logs but not DB

**Diagnosis:**

```sql
-- Check idempotency (duplicate detection)
SELECT * FROM public.webhook_idempotency 
WHERE source = 'whatsapp' 
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check rate limits
SELECT * FROM public.rate_limit_logs 
WHERE instance_id = 'wpp2' 
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check Sentry for edge function errors
-- → Sentry dashboard (SENTRY_DSN configured in secrets)
```

**Fix:**

If stuck in idempotency:
```sql
DELETE FROM public.webhook_idempotency 
WHERE event_id LIKE 'wpp2:%' 
  AND status = 'processing'
  AND created_at < NOW() - INTERVAL '5 minutes';
```

If rate limited, increase buckets in `evolution-webhook/index.ts`:
```typescript
const EVENT_RATE_LIMITS: Record<string, number> = {
  "messages.upsert": 1200,  // ← increase from 600
  // ...
};
```

#### "Invalid signature" errors in logs

**Symptoms:**
- `whatsapp-webhook` logs: "Invalid X-Hub-Signature-256"
- Messages rejected at signature validation step

**Diagnosis:**

1. Verify `WHATSAPP_APP_SECRET` is set:
   ```bash
   # In Supabase dashboard: Settings > Secrets and Env Vars
   # Should contain Meta's App Secret (not the token)
   ```

2. Check if Meta credentials rotated
   ```bash
   # Review Meta app settings for recent secret changes
   ```

**Fix:**

Rotate secret in Supabase:
1. Get new secret from Meta app settings
2. Update Supabase secret: `WHATSAPP_APP_SECRET = <new value>`
3. Webhooks will immediately validate against new secret (no restart needed)

---

## 2. Database & Performance

### Indexes

**Critical indexes created in `20260713_composite_index_messages.sql`:**

```sql
-- Check if indexes exist
SELECT * FROM pg_indexes 
WHERE schemaname = 'evo' 
  AND tablename = 'evolution_messages'
  AND indexname LIKE '%jid_created%';
```

If missing, apply migration:
```bash
# Run locally
supabase migration up

# Or in cloud: Supabase Dashboard → SQL Editor → paste migration
```

### N+1 Query Detection

**Symptoms:**
- Sidebar conversation list takes >2 seconds to load
- Network tab shows dozens of similar requests

**Diagnosis:**

In browser DevTools Network tab, look for repeated requests:
```
GET /rest/v1/messages?select=*&remote_jid=eq.123456789...
GET /rest/v1/messages?select=*&remote_jid=eq.987654321...
```

**Fix:**

Check if batch fetching is working in `src/hooks/useExternalEvolution.ts`:

```typescript
// Should use BATCH_SIZE = 5, not fire all 30 at once
const BATCH_SIZE = 5;  // ← verify this is set
```

If not batched, update the hook to use batching from the codebase audit.

### Row Level Security (RLS)

**Symptoms:**
- Users see data from other teams
- "Permission denied" errors when accessing own data

**Diagnosis:**

```sql
-- Check user's team membership
SELECT * FROM public.team_members 
WHERE user_id = '<current_user_id>' 
  AND deleted_at IS NULL;

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'messages';
```

**Fix:**

If user has no team:
```sql
INSERT INTO public.team_members (user_id, team_id, role)
VALUES ('<user_id>', '<team_id>', 'member');
```

If RLS policy missing, apply migration `20260713_rls_audit_fixes.sql`.

---

## 3. Authentication & Security

### httpOnly Cookie Migration

**Architecture:**
- Auth tokens now in httpOnly cookies (not localStorage)
- XSS-proof: JavaScript cannot access tokens
- Server automatically sends cookies with requests

**Symptoms of failure:**
- Users logged out after page reload
- "Unauthorized" errors on fresh page load

**Diagnosis:**

In browser DevTools → Application → Cookies:
```
Should see:
✓ sb-<project-id>-auth-token (httpOnly, Secure, SameSite=Strict)
✓ sb-<project-id>-auth-token-code-verifier (httpOnly)

Should NOT see:
✗ localStorage with "sb-" keys
```

**Fix:**

Verify Supabase client config in `src/integrations/supabase/client.ts`:
```typescript
// Should use cookieStorage, not localStorage
import { cookieStorage } from './cookieStorage';
// ...
storage: cookieStorage
```

If still using localStorage:
1. Clear localStorage: `localStorage.clear()`
2. Full page reload: Ctrl+Shift+R
3. Supabase client will re-authenticate via cookies

### Verify httpOnly Cookies Active

```typescript
// In browser console:
import { verifyHttpOnlyCookieAuth } from '@/integrations/supabase/cookieStorage';
verifyHttpOnlyCookieAuth();  // Should log ✅ initialized successfully
```

---

## 4. Error Tracking

### Sentry Integration

**Edge Functions (Webhooks):**
- Automatic error capture via `supabase/functions/_shared/sentry.ts`
- Requires: `SENTRY_DSN` env var in Supabase secrets
- No restart needed; active immediately

**Frontend:**
- Automatic error capture via `src/lib/sentry.ts`
- Requires: `VITE_SENTRY_DSN` in `.env.local` (dev) or build vars (prod)

### Accessing Error Reports

```bash
# View logs in Sentry dashboard
# → sentry.io → project → Alerts → Recent Issues

# Check edge function logs (alternative to Sentry)
# → Supabase Dashboard → Functions → whatsapp-webhook → Logs
```

### Common Errors to Watch

| Error | Cause | Fix |
|-------|-------|-----|
| `Non-retryable message error` | Gmail API returned bad request | Normal (already handled) |
| `Rate limit exceeded` | IP or instance hitting rate limit | Increase buckets or wait |
| `HMAC validation failed` | Webhook secret changed | Update `WHATSAPP_APP_SECRET` |
| `Missing instance` | WhatsApp instance deleted | Remove stale instance ref |

---

## 5. Performance Optimization

### React Re-render Prevention

Use optimization utilities from `src/lib/react-optimization.ts`:

```typescript
// Prevent re-render from inline objects
const config = useMemoObject({ mode: 'dark', theme: 'system' });

// Prevent re-render from deps array differences
const callback = useStableCallback(() => { /* ... */ }, [userId]);

// Debounce rapid updates
const searchQuery = useDebouncedValue(rawInput, 300);
```

### Memory Leak Detection

```javascript
// Browser DevTools → Memory tab
// 1. Record heap snapshot
// 2. Navigate around app
// 3. Force garbage collect (trash icon)
// 4. Record snapshot again
// 5. Compare: detached DOM nodes should be ~0
```

Common sources:
- Event listeners not cleaned up (fixed in useTheme via removeEventListener)
- Realtime subscriptions not unsubscribed (check useExternalEvolution cleanup)
- Timers not cleared (use useEffect return cleanup)

---

## 6. Deployment Checklist

### Before Pushing to Production

```bash
# 1. Run type check
npm run typecheck

# 2. Run tests
npm test

# 3. Build
npm run build

# 4. Check for secrets in code
grep -r "PLACEHOLDER\|TODO.*secret\|sk_live" src/ supabase/

# 5. Review migrations
git diff HEAD~1 supabase/migrations/
```

### Secrets to Configure

```
Supabase (Settings > Secrets and Env Vars):
- SENTRY_DSN (error tracking for edge functions)
- WHATSAPP_APP_SECRET (Meta signature validation)
- WHATSAPP_VERIFY_TOKEN (Meta webhook verification)
- EVOLUTION_WEBHOOK_SECRETS (Evolution API)
- GMAIL_PUBSUB_TOKEN (Gmail Pub/Sub)
- ENVIRONMENT (prod/dev)
```

### Database Migrations

```bash
# Check pending migrations
supabase migration list

# Apply locally
supabase migration up

# Verify in Supabase cloud
# → Dashboard → SQL Editor → Check schema
```

### Post-Deploy Verification

```sql
-- Verify indexes exist
SELECT * FROM pg_indexes WHERE tablename = 'evolution_messages';

-- Verify RLS policies
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';

-- Verify idempotency table exists
SELECT * FROM public.webhook_idempotency LIMIT 1;
```

---

## 7. Troubleshooting Decision Tree

```
App slow?
├─ Check sidebar load time (should be <2s)
│  ├─ DevTools Network: repeated requests?
│  │  └─ Missing composite indexes (apply migration)
│  └─ DevTools Performance: long task?
│     └─ Unnecessary component re-renders (use useMemo)
│
├─ Check messages not appearing
│  ├─ Webhook logs show errors?
│  │  └─ Check Sentry or function logs
│  ├─ Idempotency stuck?
│  │  └─ Clear stuck events (SQL above)
│  └─ Rate limited?
│     └─ Check rate_limit_logs table
│
└─ Check auth issues
   ├─ Cookie not set?
   │  └─ Verify cookieStorage in client.ts
   ├─ Unauthorized errors?
   │  └─ Check team membership (team_members table)
   └─ Session expires too quickly?
      └─ Verify SUPABASE_URL is correct
```

---

## 8. Emergency Recovery

### Webhook Backlog

If thousands of messages are stuck:

```sql
-- Dangerous: only if truly stuck
-- 1. BACKUP DATABASE FIRST
-- 2. Review which events are actually stuck (created >1 hour ago, status=processing)

DELETE FROM public.webhook_idempotency 
WHERE status = 'processing' 
  AND created_at < NOW() - INTERVAL '1 hour';

-- 3. Webhooks will retry these (Evolution will resend)
-- 4. Monitor Sentry for new errors
```

### RLS Lockout

If user can't see any data:

```sql
-- Check team exists
SELECT * FROM public.teams WHERE id = '<team_id>';

-- Add user if missing
INSERT INTO public.team_members (user_id, team_id, role)
VALUES ('<user_id>', '<team_id>', 'member')
ON CONFLICT DO NOTHING;

-- Logout and re-login user (forces RLS re-evaluation)
```

### Database Connection Issues

```sql
-- Check active connections
SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;

-- Check locks
SELECT * FROM pg_locks WHERE granted = false;

-- Kill slow query (use with caution)
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE query LIKE '%specific_query%'
  AND pid <> pg_backend_pid();
```

---

## Contact & Resources

- **Error Dashboard:** Sentry (see SENTRY_DSN)
- **Database:** Supabase Dashboard → SQL Editor
- **Logs:** Supabase → Functions → [function name] → Logs
- **Git Issues:** [GitHub repo]
- **Documentation:** docs/ directory (this runbook)

---

**Last updated:** 2026-07-13
**Version:** Zapp Web v3
**Maintained by:** Engineering team
