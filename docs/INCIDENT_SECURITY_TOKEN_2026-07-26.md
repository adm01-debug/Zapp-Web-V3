# SECURITY INCIDENT REPORT — Token Exposure in .mcp.json

**Report Date:** 2026-07-26
**Severity:** CRITICAL (P0)
**Status:** IN PROGRESS — Awaits Manual Token Rotation

---

## INCIDENT SUMMARY

| Field | Value |
|-------|-------|
| **Type** | Credential Exposure in Version Control |
| **Location** | `.mcp.json` (versioned in git) |
| **Exposed Token** | `s-a50174164e4b03ef181a29db65d2db80` |
| **Token Type** | Supabase Service Role Key (URL-embedded) |
| **First Commit** | `3937abec724a` (2026-07-14) |
| **Repository Visibility** | PUBLIC |
| **Secret Scanning** | DISABLED |
| **Push Protection** | DISABLED |

---

## EXPOSURE ANALYSIS

### What This Token Provides

The exposed Supabase Service Role Key grants **full administrative access** to:
- All database operations (read/write/delete on ALL tables)
- User management and authentication
- Storage operations (files)
- Realtime subscriptions
- Row Level Security bypass
- Schema modifications
- Function execution

### Attack Surface

```
Token: s-a50174164e4b03ef181a29db65d2db80
Endpoint: https://supabase-mcp.atomicabr.com.br/s-a50174164e4b03ef181a29db65d2db80/mcp

Capabilities exposed via MCP tools:
- supabase_db_query (arbitrary SQL)
- supabase_storage_* (file operations)
- supabase_auth_delete_user
- supabase_meta_delete_table
- All CRUD operations on ALL schemas
```

---

## BLAST RADIUS ASSESSMENT

### Confirmed Locations

| Location | Token Present | Risk Level |
|----------|---------------|------------|
| `.mcp.json` (git history) | ✅ YES | 🔴 CRITICAL |
| Cloudflare Worker env | ✅ YES | 🔴 CRITICAL |
| GitHub Secrets (unverified) | ❓ UNKNOWN | 🔴 HIGH |
| CI/CD Variables (unverified) | ❓ UNKNOWN | 🔴 HIGH |
| n8n Workflows (unverified) | ❓ UNKNOWN | 🔴 HIGH |
| Portainer MCP | ⚠️ Related | 🟡 MEDIUM |

### Data at Risk

Based on database schema analysis:

| Data Category | Records (est.) | Sensitivity |
|--------------|----------------|-------------|
| WhatsApp Messages | ~2,500+ | 🔴 HIGH (LGPD) |
| User Profiles | Unknown | 🔴 HIGH |
| Evolution Media | ~2,500+ | 🔴 HIGH (LGPD) |
| Auth Sessions | Unknown | 🟡 MEDIUM |
| Business Data | Unknown | 🟡 MEDIUM |

---

## ACTIONS REQUIRED

### IMMEDIATE (Within 1 Hour)

- [ ] **1. Generate new Supabase Service Role Key**
  - Access: `https://supabase.atomicabr.com.br/project/default/settings/api`
  - Click "Regenerate" in Service Role section
  - Store securely (password manager)

- [ ] **2. Update Cloudflare Worker**
  - Access: Cloudflare Dashboard → Workers
  - Update `SUPABASE_SERVICE_ROLE_KEY` environment variable
  - Redeploy worker

- [ ] **3. Verify old token is invalid**
  ```bash
  curl -I https://supabase-mcp.atomicabr.com.br/s-a50174164e4b03ef181a29db65d2db80/mcp
  # Must return 401/403
  ```

### SHORT-TERM (Within 24 Hours)

- [ ] **4. Audit GitHub Secrets**
  ```bash
  gh secret list
  # Check for any stored credentials
  ```

- [ ] **5. Audit n8n Workflows**
  - Check all workflows for Supabase credentials
  - Update any found credentials

- [ ] **6. Check database access logs**
  ```sql
  SELECT * FROM auth.audit_log_entries 
  WHERE created_at > '2026-07-14'
  ORDER BY created_at DESC;
  ```

- [ ] **7. Review storage access logs**
  - Check for unauthorized file access
  - Verify no unexpected data exports

### COMPLIANCE (Within 72 Hours)

- [ ] **8. LGPD Assessment**
  - Evaluate if personal data was accessed
  - Document incident
  - Determine if ANPD notification required
  - Consider notification to affected data subjects

---

## INVESTIGATION CHECKLIST

### Git History Analysis
```
First commit: 3937abec724a (2026-07-14 18:39:58)
Author: adm01 <adm01@debug.com>
Message: "chore: configure MCPs (Portainer, Evolution, Supabase x2, GitHub) + deploy guide"

Total commits with token in history: 3
- 3937abec7: Initial addition
- cab779542: Feature commit
- 48ca5b716: Auth fix
```

### Duration of Exposure
```
Start: 2026-07-14 18:39:58
End: Present (2026-07-26) — NOT YET ROTATED
Duration: ~12 days
```

---

## SECURITY CONTROLS TO ENABLE

These controls were DISABLED and must be ENABLED:

| Control | Current | Required |
|---------|---------|----------|
| Secret Scanning | ❌ OFF | ✅ ON |
| Push Protection | ❌ OFF | ✅ ON |
| Branch Protection | ❌ OFF | ✅ ON |
| Dependabot Security | ❌ OFF | ✅ ON |
| Repository Visibility | ⚠️ PUBLIC | ✅ PRIVATE |

---

## REMEDIATION TIMELINE

| Phase | Action | Owner | Deadline |
|-------|--------|-------|----------|
| P0 | Rotate token | Security | IMMEDIATE |
| P0 | Update Cloudflare | DevOps | IMMEDIATE |
| P1 | Audit blast radius | Security | +24h |
| P1 | Enable controls | DevOps | +48h |
| P2 | LGPD assessment | DPO | +72h |
| P2 | Document lessons | Security | +1 week |

---

## EVIDENCE

### Original .mcp.json Content
```json
{
  "mcpServers": {
    "portainer": { "url": "https://portainer-mcp.atomicabr.com.br/mcp" },
    "evolution": { "url": "https://evolution-mcp.adm01.workers.dev/mcp" },
    "supabase-selfhosted": { 
      "url": "https://supabase-mcp.atomicabr.com.br/s-a50174164e4b03ef181a29db65d2db80/mcp"
    },
    "github": { "url": "https://github-mcp-server.adm01.workers.dev/mcp" }
  }
}
```

### Git Commit Evidence
```
commit 3937abec724a1a87e4a055a2abe5bbf8a20e09b4
Author: adm01 <adm01@debug.com>
Date:   Tue Jul 14 18:39:58 2026 -0300

    chore: configure MCPs (Portainer, Evolution, Supabase x2, GitHub) + deploy guide
```

---

## SIGN-OFF

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Lead | | | |
| DevOps Lead | | | |
| DPO (LGPD) | | | |

---

*Document Status: ACTIVE INCIDENT*
*Next Update: After token rotation confirmation*
