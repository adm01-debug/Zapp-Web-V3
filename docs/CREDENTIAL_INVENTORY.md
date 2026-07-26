# CREDENTIAL INVENTORY — blast radius assessment

**Last Updated:** 2026-07-26
**Trigger:** Token exposure incident (s-a50174164e4b03ef181a29db65d2db80)

---

## 🔴 HIGH PRIORITY — Token rotation required

### 1. Supabase Service Role Key (COMPROMETIDO)
| Field | Value |
|-------|-------|
| **Token** | `s-a50174164e4b03ef181a29db65d2db80` |
| **Location** | Was in `.mcp.json` (now removed) |
| **Exposure Date** | 2026-07-14 18:39 |
| **Action** | **ROTATE IMMEDIATELY** |
| **How** | Supabase Dashboard → Settings → API → Regenerate |

### 2. Cloudflare Workers — SUPABASE_SERVICE_ROLE_KEY
| Field | Value |
|-------|-------|
| **Current Token** | `s-a50174164e4b03ef181a29db65d2db80` (same as above) |
| **Worker** | `supabase-mcp.atomicabr.com.br` |
| **Action** | Update after Supabase rotation |

### 3. GitHub Secrets (verify + rotate if needed)

| Secret Name | Purpose | Risk | Status |
|-------------|---------|------|--------|
| `VITE_SUPABASE_URL` | Supabase URL | 🟡 MEDIUM | Verify not exposed |
| `VITE_SUPABASE_ANON_KEY` | Public anon key | 🟢 LOW | Safe to keep |
| `VITE_SENTRY_DSN` | Error tracking | 🟡 MEDIUM | Verify not sensitive |
| `PORTAINER_API_TOKEN` | VPS deployment | 🔴 HIGH | **Rotate required** |
| `GITHUB_TOKEN` | CI/CD | 🟢 AUTO | Auto-rotates (GitHub built-in) |
| `GITLEAKS_LICENSE` | Secret scanning | 🟡 MEDIUM | Verify license key |

### 4. Evolution API Credentials
| Field | Value |
|-------|-------|
| **Location** | `docs/infra/supabase-functions.reconciled.yml` |
| **Status** | Need to verify if real values present |
| **Action** | Verify and rotate if exposed |

---

## 🟡 MEDIUM PRIORITY — Verify and document

### 5. Docker Secrets (VPS)
| Secret Name | Purpose | Status |
|-------------|---------|--------|
| `supabase_db_url_v1` | Database connection | ✅ Using Docker secrets (secure) |

### 6. Portainer API Token
| Field | Value |
|-------|-------|
| **Usage** | `deploy-vps.yml` workflow |
| **Secret Name** | `PORTAINER_API_TOKEN` |
| **Action** | Verify token is still valid and rotate if old |

---

## ROTATION CHECKLIST

### Pre-flight
- [ ] List all GitHub secrets: `gh secret list`
- [ ] Verify Supabase token in `.env` files (should not exist in repo)
- [ ] Check for any other Supabase tokens in git history

### Supabase Service Role (IMMEDIATE)
- [ ] Generate new key via Supabase Dashboard
- [ ] Store securely (password manager)
- [ ] Update Cloudflare Worker env var
- [ ] Update local `.mcp.json` with new key
- [ ] Verify old token returns 401

### GitHub Secrets (24-48h)
- [ ] Verify `PORTAINER_API_TOKEN` is not expired
- [ ] Verify `GITLEAKS_LICENSE` is valid
- [ ] Consider rotating `PORTAINER_API_TOKEN` if old (>6 months)
- [ ] Document all secrets with rotation dates

### Evolution API (48-72h)
- [ ] Check `supabase-functions.reconciled.yml` for exposed keys
- [ ] Verify Evolution API key is valid
- [ ] Rotate if exposed or old

---

## CREDENTIAL TYPES REFERENCE

| Type | Rotation Frequency | Auto-Rotate |
|------|-------------------|-------------|
| Supabase Service Role | Every 90 days | ❌ No |
| Supabase Anon Key | Every 180 days | ❌ No |
| GitHub Token (GITHUB_TOKEN) | Per deployment | ✅ Yes |
| GitHub PAT | Every 90 days | ❌ No |
| Portainer API Token | Every 180 days | ❌ No |
| Cloudflare API Token | Every 180 days | ❌ No |
| Sentry DSN | Only on compromise | ❌ No |

---

## INCIDENT RESPONSE CONTACTS

| Role | Action |
|------|--------|
| Security Lead | Coordinate rotation, verify blast radius |
| DevOps | Update Cloudflare Workers, Portainer |
| Dev | Update local `.mcp.json` |
| DPO | LGPD assessment if data accessed |

---

*Document Status: ACTIVE — Awaiting manual rotation confirmation*
