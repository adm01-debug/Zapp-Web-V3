# TOKEN ROTATION PROCEDURE — SUPABASE MCP

## Emergency Token Rotation — Step by Step

### Why This Document Exists
The `.mcp.json` file contains a Supabase Service Role Key in the URL path.
If this token is compromised, follow this procedure IMMEDIATELY.

---

## STEP 1: Generate New Token

### Option A: Via Supabase Dashboard (Recommended)
1. Access: `https://supabase.atomicabr.com.br/project/default/settings/api`
2. Navigate to "API Settings"
3. In "Service Role API Key" section, click "Regenerate"
4. **COPY THE NEW KEY IMMEDIATELY** (it will only be shown once)
5. Store securely in your password manager

### Option B: Via Supabase CLI
```bash
supabase login
supabase projects api keys list --project-ref <project-ref>
# Note: CLI regeneration may require dashboard access
```

### Option C: Via Direct Database (Emergency)
```sql
-- Connect to postgres database
-- The Service Role key is stored in pg_settings or retrieved from vault
SELECT * FROM vault.secrets WHERE name LIKE '%service_role%';
```

---

## STEP 2: Update Cloudflare Worker Configuration

The Supabase MCP Server runs on Cloudflare Workers.
Update the worker environment variable:

1. Access Cloudflare Dashboard
2. Navigate to Workers & Pages → supabase-mcp
3. Go to Settings → Environment Variables
4. Update `SUPABASE_SERVICE_ROLE_KEY` with new value
5. Deploy/Redeploy the worker

Or via Wrangler CLI:
```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Paste new key when prompted
```

---

## STEP 3: Update Local Configuration

1. Copy `.mcp.json.example` to `.mcp.json`
2. Replace `<SUPABASE_SERVICE_ROLE_KEY>` with the new key
3. Verify the file is in `.gitignore`

---

## STEP 4: Verify Rotation

Test the new configuration:
```bash
# Restart Claude Code to pick up new MCP config
# Test MCP connection
```

Check that old token returns 401:
```bash
curl -I https://supabase-mcp.atomicabr.com.br/s-OLD_TOKEN/mcp
# Should return 401 or 403
```

---

## STEP 5: Invalidate All Caches

1. Purge Cloudflare cache for supabase-mcp subdomain
2. Check any intermediate proxies or CDNs
3. Verify no residual references to old token in:
   - CI/CD pipelines
   - n8n workflows
   - Other automation systems

---

## SECURITY CHECKLIST

- [ ] New token generated
- [ ] Old token confirmed invalid (returns 401)
- [ ] Cloudflare Worker updated
- [ ] Local `.mcp.json` updated
- [ ] `.mcp.json` is in `.gitignore`
- [ ] `.mcp.json.example` is versioned (no real values)
- [ ] No other systems use old token
- [ ] Security team notified (if required)

---

## INCIDENT RESPONSE

If you suspect the token was used maliciously:

1. **IMMEDIATELY** rotate the token (Steps 1-2)
2. Check Supabase logs for unauthorized access:
   ```sql
   SELECT * FROM auth.audit_log_entries 
   WHERE created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC;
   ```
3. Review storage access logs
4. Check for unauthorized data exports
5. Consider LGPD implications if personal data may have been accessed
6. Document incident in security log

---

## COMPLIANCE NOTES

- LGPD (Brazil): If personal data may have been accessed, consider:
  - Incident documentation
  - Potential ANPD notification (depending on scope)
  - Notification to affected data subjects

---

*Last Updated: 2026-07-26*
*Document Owner: Security Team*
