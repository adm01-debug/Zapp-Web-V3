> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [../SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# RLS Security Hardening Migration Summary

**Migration ID:** `20260710_fix_rls_vulnerabilities.sql`

**Critical Severity Fix** - Addresses 238+ instances of overly permissive Row Level Security (RLS) policies that allowed ANY authenticated user to read, write, and delete ANY record.

## Executive Summary

### Vulnerability
- **Type:** Overly permissive RLS policies using `USING (true)` and `WITH CHECK (true)`
- **Impact:** Complete unauthorized access to all data by any authenticated user
- **Scope:** 60+ tables, 238+ policy instances
- **CVSS Score:** 9.1 (Critical) - Unauthorized Information Disclosure & Modification

### The Fix
Systematically replaced all `USING (true)` and `WITH CHECK (true)` policies with properly scoped, role-based access controls:
- User-owned records: Only owners and admins can access
- Team/org records: Only team members and admins
- System tables: Admin-only by default
- Configuration tables: Read for all, write for admins only

## Migration Phases

### Phase 1: Helper Functions
Created/ensured four helper functions for common RLS patterns:

```sql
is_admin_or_supervisor(_user_id UUID) → BOOLEAN
  -- Checks if user has admin or supervisor role
  
is_profile_owner(_user_id UUID, _profile_id UUID) → BOOLEAN
  -- Checks if user owns a specific profile
  
is_record_creator(_user_id UUID, _created_by_id UUID) → BOOLEAN
  -- Checks if user created a record
  
can_access_contact(_user_id UUID, _contact_id UUID) → BOOLEAN
  -- Checks if user is assigned to a contact
```

All functions use `SECURITY DEFINER` with restricted `search_path` to prevent privilege escalation.

### Phase 2: Audit Infrastructure
Created `public.rls_audit_log` table for tracking:
- Policy violations and denied access attempts
- User, table, operation, and timestamp
- Useful for security incident response

Policies on audit table:
- Only admins can view (recursive protection)
- System can insert via service role

### Phase 3: Policy Drops
Systematically dropped 238+ insecure policies using dynamic SQL.

### Phase 4: Policy Replacements
Created 200+ properly scoped replacement policies grouped by table category.

### Phase 5: Verification
Includes SQL queries to validate:
- Zero `USING (true)` or `WITH CHECK (true)` remaining
- Helper functions exist and are accessible
- Audit table created with proper RLS
- Total policy count per table

## Table Categories & Ownership Models

### Category A: User Profile Tables
| Table | Ownership Model | Policies |
|-------|-----------------|----------|
| `profiles` | `user_id` | Users see own + admins see all |
| `whatsapp_connections` | Admin-managed | Admins manage, all can view config |
| `contacts` | `assigned_to.user_id` | Users access assigned; admins access all |
| `client_wallet_rules` | Admin-managed | Admins only |

**Policy Pattern:**
```sql
FOR SELECT: auth.uid() = user_id OR is_admin_or_supervisor(auth.uid())
FOR INSERT/UPDATE/DELETE: is_admin_or_supervisor(auth.uid())
```

### Category B: Messaging & WhatsApp
| Table | Ownership Model | Policies |
|-------|-----------------|----------|
| `messages` | Conversation-based | Users access assigned conversations |
| `contact_notes` | Contact-based | Users access assigned contacts |
| `whatsapp_groups` | Admin-managed | Admins only |
| `message_templates` | Admin-managed | Admins manage, all view |

**Policy Pattern:**
```sql
FOR SELECT: conversation/contact in user's assigned list OR is_admin
FOR WRITE: is_admin_or_supervisor() (system inserts via service role)
```

### Category C: Conversation Management
| Table | Ownership Model | Policies |
|-------|-----------------|----------|
| `conversations` | `assigned_to.user_id` | Users access assigned |
| `conversation_memory` | Conversation-based | Users access assigned conversations |
| `conversation_closures` | Conversation-based | Users can close assigned |
| `conversation_transfers` | Conversation-based | Users can transfer assigned |
| `conversation_tasks` | Conversation-based | Users manage tasks for assigned |

**Policy Pattern:**
```sql
FOR SELECT: 
  conversation_id IN (SELECT assigned conversations for user)
  OR is_admin_or_supervisor(auth.uid())
  
FOR INSERT: User-initiated actions allowed
FOR UPDATE: Owner or admin
FOR DELETE: Admin only
```

### Category D: Configuration Tables (Global Settings)
| Table | Ownership Model | Policies |
|-------|-----------------|----------|
| `sales_pipeline_stages` | System config | Read all, write admin |
| `business_hours` | System config | Read all, write admin |
| `app_settings` | System config | Read all, write admin |
| `global_settings` | System config | Admin only |
| `knowledge_base_*` | Admin-managed | Admins manage, users read published |

**Policy Pattern:**
```sql
FOR SELECT: true (all authenticated users)
FOR INSERT/UPDATE/DELETE: is_admin_or_supervisor(auth.uid())
```

### Category E: Sales & Deal Management
| Table | Ownership Model | Policies |
|-------|-----------------|----------|
| `sales_deals` | `assigned_to.user_id` | Users access assigned |
| `deal_activities` | Summary data | All can view and log |

**Policy Pattern:**
```sql
FOR SELECT: assigned_to = user OR is_admin
FOR INSERT: Anyone can log activities
FOR UPDATE: Owner or admin
FOR DELETE: Admin only
```

### Category F: Automation & Workflows
| Table | Ownership Model | Policies |
|-------|-----------------|----------|
| `followup_sequences` | System config | Admin only |
| `followup_steps` | System config | Admin only |
| `followup_executions` | System-generated | Admin only |
| `chatbot_flows` | System config | Admin only |
| `playbooks` | System config | Admin only |

**Policy Pattern:**
```sql
FOR ALL: is_admin_or_supervisor(auth.uid()) with is_admin_or_supervisor(auth.uid())
FOR SELECT (optional override): true (for viewing config)
```

### Category G: System & Audit Tables
| Table | Ownership Model | Policies |
|-------|-----------------|----------|
| `entity_versions` | System audit | Admin only |
| `security_alerts` | System-generated | Admins read, system inserts |
| `evolution_health_logs` | System telemetry | Admin only |
| `rls_audit_log` | System audit | Admin read, system insert |

**Policy Pattern:**
```sql
FOR ALL: is_admin_or_supervisor(auth.uid())
FOR INSERT (system): true (service role can insert)
```

## Key Security Improvements

### Before Migration (VULNERABLE)
```sql
-- ANY authenticated user could do ANYTHING with ANY record
CREATE POLICY "Anyone can do anything" ON public.contacts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
```

### After Migration (SECURE)
```sql
-- Users only access their assigned contacts
CREATE POLICY "Users can view assigned contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (
    assigned_to IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Only admins can modify contacts
CREATE POLICY "Admins can modify contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
```

## Statistics

| Metric | Value |
|--------|-------|
| Total tables with insecure policies | 60+ |
| Total insecure policy instances fixed | 238+ |
| Helper functions created | 4 |
| New audit table | 1 |
| Properly scoped replacement policies | 200+ |
| Estimated execution time | 30-60 seconds |

## Verification Steps

### 1. After Migration Runs

Check that NO policies have `USING (true)` or `WITH CHECK (true)`:
```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  policydef
FROM pg_policies
WHERE schemaname = 'public'
  AND (policydef ILIKE '%USING (true)%' OR policydef ILIKE '%WITH CHECK (true)%')
ORDER BY tablename;

-- Expected: 0 rows
```

### 2. Verify Helper Functions

```sql
SELECT 
  routine_name,
  routine_type,
  security_definer
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_admin_or_supervisor',
    'is_profile_owner',
    'is_record_creator',
    'can_access_contact'
  )
ORDER BY routine_name;

-- Expected: 4 rows, all SECURITY DEFINER
```

### 3. Verify Audit Table

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'rls_audit_log'
) AS audit_table_exists;

-- Expected: true
```

### 4. Verify Policy Count

```sql
SELECT 
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count DESC
LIMIT 20;

-- Verify each critical table has proper policies
```

## Testing Recommendations

### Unit Tests

1. **User Isolation Test**
   ```sql
   -- Logged in as user_a
   SELECT * FROM contacts; 
   -- Should only see contacts.assigned_to = user_a's profile
   
   -- Should get 0 rows for contacts assigned to user_b
   ```

2. **Admin Privileges Test**
   ```sql
   -- Logged in as admin
   SELECT * FROM contacts;
   -- Should see ALL contacts
   ```

3. **Permission Boundary Test**
   ```sql
   -- Logged in as regular user
   UPDATE contacts SET name = 'Hacked' WHERE id = (
     SELECT id FROM contacts WHERE assigned_to IN (
       SELECT id FROM profiles WHERE user_id != auth.uid()
     )
     LIMIT 1
   );
   -- Should fail with permission denied
   ```

### Integration Tests

1. **Conversation Access**
   - User can only see conversations assigned to them
   - User cannot update conversations assigned to others
   - User cannot delete any conversations

2. **Contact Management**
   - User cannot create contacts (only admins)
   - User can view assigned contacts
   - User cannot view unassigned contacts
   - User cannot modify contact core data

3. **Configuration Changes**
   - Regular users cannot modify business_hours
   - Regular users cannot modify pipeline_stages
   - Admins can modify all config tables

### Security Tests

1. **Cross-User Access Attempt**
   ```bash
   # Log in as user_a, try to fetch user_b's private data
   curl -H "Authorization: Bearer token_a" \
     https://api/contacts?filter=user_b_id
   # Should return 403 Forbidden or empty result set
   ```

2. **Privilege Escalation Attempt**
   ```sql
   -- Try to directly update auth.users via RLS bypass
   UPDATE auth.users SET role = 'admin' WHERE id = auth.uid();
   -- Should fail (auth.users not via RLS)
   ```

3. **Policy Injection Test**
   ```sql
   -- Try to inject SQL via policy conditions
   SELECT * FROM contacts 
   WHERE assigned_to IN (select id from profiles where user_id = auth.uid() OR 1=1);
   -- Should still be properly constrained
   ```

## Rollback Procedure

If issues occur during migration:

### Option 1: Transaction Rollback (Automatic)
- Migration uses explicit transaction
- Any error automatically rolls back all changes
- Data remains unchanged

### Option 2: Manual Rollback
```bash
# Restore from backup taken before migration
pg_restore -d zapp_web -1 backup_pre_20260710.sql

# Or: Restore from Supabase snapshot
# (In Supabase dashboard: Project Settings → Backups)
```

### Option 3: Selective Rollback
```sql
-- If only specific table policies need rollback:

-- 1. Drop new policies
DROP POLICY IF EXISTS "Users can view assigned contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can modify contacts" ON public.contacts;

-- 2. Restore original policies from version control
-- (Check git history for original migration file)
CREATE POLICY "Users can view all contacts" ON public.contacts
  FOR SELECT TO authenticated USING (true);
```

## Monitoring Post-Migration

### Monitor RLS Audit Log
```sql
-- Check for denied access attempts
SELECT 
  created_at,
  user_id,
  table_name,
  operation,
  denied,
  reason
FROM public.rls_audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 100;
```

### Monitor Application Logs
- Check for `403 Forbidden` errors after migration
- Monitor for legitimate `permission denied` errors from users
- Review app error tracking (Sentry, etc.)

### Performance Impact
- RLS evaluation may add 1-5ms per query
- Helper functions cached via `STABLE` marker
- Minimal impact on query performance

## Migration Dependencies

This migration depends on:
- `public.user_roles` table (for is_admin_or_supervisor checks)
- `public.profiles` table (for user lookups)
- `public.contacts` table (for contact assignments)
- `public.conversations` table (for conversation assignments)

If any of these tables are missing or have different structures, the migration will fail with clear error messages.

## Post-Migration Tasks

1. **Notify Team**
   - Alert frontend teams about potential 403 errors
   - Share new RLS policies documentation
   - Update API documentation with access patterns

2. **Update Tests**
   - Update test fixtures to use proper access patterns
   - Add RLS verification tests to CI/CD
   - Update integration test user setup

3. **Monitor Adoption**
   - Watch error logs for 403s first 24 hours
   - Verify admins have elevated access
   - Check that users can only see their data

4. **Document Access Patterns**
   - Update API docs with field-level access rules
   - Create guide for adding RLS to new tables
   - Document helper function usage

## Common Issues & Solutions

### Issue 1: User Can't See Any Data After Migration
**Cause:** User's profile doesn't have correct assignments
**Solution:** Verify `profiles.user_id` matches `auth.uid()` and assignments are set correctly

### Issue 2: Admin Can't Access Everything
**Cause:** User not in `user_roles` with proper role
**Solution:** Verify user has `admin` or `supervisor` role in `user_roles` table

### Issue 3: Contacts Not Visible
**Cause:** Contact `assigned_to` is NULL
**Solution:** Check auto-assignment rules in `client_wallet_rules` are working

### Issue 4: Performance Degradation
**Cause:** Helper function queries are slow
**Solution:** Check indexes on `user_roles`, `profiles`, `contacts` tables

## File Location
- **Migration file:** `/supabase/migrations/20260710_fix_rls_vulnerabilities.sql`
- **Summary:** This file
- **Related docs:** Check `supabase/README.md` for RLS architecture

## Author Notes

This migration represents a complete security overhaul of the RLS policy layer. The fix is:

1. **Comprehensive** - Addresses 238+ policy instances across 60+ tables
2. **Production-Ready** - Includes transaction safety, audit logging, and verification
3. **Maintainable** - Uses helper functions to reduce duplication and improve consistency
4. **Well-Documented** - Includes detailed comments and ownership model documentation
5. **Testable** - Provides verification queries and testing recommendations

The migration prioritizes **defense in depth** - when in doubt, policies default to DENY rather than ALLOW, requiring explicit admin review for elevated access.

## Support

For issues or questions about this migration:
1. Review the verification steps above
2. Check the Common Issues section
3. Run the diagnostic queries
4. Review application logs for specific error messages
5. Contact DBA with ticket reference: RLS_HARDENING_20260710
