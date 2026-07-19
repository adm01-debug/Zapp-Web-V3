# RLS Ownership Models - Complete Reference

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


This document details the ownership/access model for every table fixed by the `20260710_fix_rls_vulnerabilities.sql` migration.

## Ownership Model Categories

### Type 1: Direct User Ownership
User has direct relationship via `user_id`, `created_by`, or `owner_id` field.

**Tables in this category:**
- `profiles` (via `user_id`)
- `user_settings` (via `user_id`)

**Policy Pattern:**
```sql
FOR SELECT:
  auth.uid() = user_id OR public.is_admin_or_supervisor(auth.uid())

FOR INSERT:
  auth.uid() = user_id

FOR UPDATE:
  auth.uid() = user_id OR public.is_admin_or_supervisor(auth.uid())

FOR DELETE:
  public.is_admin_or_supervisor(auth.uid()) -- Admins only
```

---

### Type 2: Assignment-Based Access
User accesses via profile assignment (user → profile → record).

**Tables in this category:**
- `contacts` (via `assigned_to`)
- `conversations` (via `assigned_to`)
- `sales_deals` (via `assigned_to`)

**Ownership Chain:**
```
User (auth.users.id)
  ↓ has
Profile (profiles.id where profiles.user_id = auth.uid())
  ↓ assigned to
Contact/Conversation/Deal (assigned_to = profiles.id)
```

**Policy Pattern:**
```sql
FOR SELECT:
  assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR public.is_admin_or_supervisor(auth.uid())

FOR INSERT:
  -- May be open or admin-restricted, depends on table

FOR UPDATE:
  assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR public.is_admin_or_supervisor(auth.uid())

FOR DELETE:
  public.is_admin_or_supervisor(auth.uid()) -- Admins only
```

**Implementation Note:** To access these tables, query the profile ID:
```sql
-- In application code:
SELECT profile_id FROM profiles WHERE user_id = auth.uid();

-- Then use in query:
SELECT * FROM contacts WHERE assigned_to = profile_id;
```

---

### Type 3: Conversation-Based Access
User accesses data related to conversations they're assigned to.

**Tables in this category:**
- `messages`
- `contact_notes`
- `conversation_memory`
- `conversation_closures`
- `conversation_transfers`
- `conversation_tasks`

**Ownership Chain:**
```
User (auth.users.id)
  ↓ has
Profile (profiles.id)
  ↓ assigned to
Conversation (conversations.assigned_to)
  ↓ related to
Message/Note/Task (message.conversation_id = conversation.id)
```

**Policy Pattern:**
```sql
FOR SELECT:
  conversation_id IN (
    SELECT c.id FROM conversations c
    WHERE c.assigned_to IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  )
  OR public.is_admin_or_supervisor(auth.uid())

FOR INSERT:
  -- Varies by table, often open for user-initiated actions

FOR UPDATE:
  -- Similar to SELECT constraint

FOR DELETE:
  -- Often admin-only, or restricted to creator
```

**Implementation Note:** Access check should include conversation context:
```sql
-- Verify user can access conversation before returning related data
SELECT * FROM messages
WHERE conversation_id IN (
  SELECT c.id FROM conversations c
  WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  AND conversation_id = $1  -- Specific conversation
);
```

---

### Type 4: Team/Organization Ownership
User accesses data if they're part of the team/organization.

**Tables in this category:**
Currently all team-based tables use admin-only access pattern until team_id relationships are clarified.

**Future Pattern (when team relationships are established):**
```sql
FOR SELECT:
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  OR public.is_admin_or_supervisor(auth.uid())

FOR WRITE:
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  OR public.is_admin_or_supervisor(auth.uid())
```

---

### Type 5: System Configuration (Read-All, Admin-Write)
Configuration tables that all authenticated users can read, but only admins can modify.

**Tables in this category:**
- `business_hours`
- `app_settings`
- `global_settings` (read may be restricted)
- `sales_pipeline_stages`
- `knowledge_base_articles` (published)
- `knowledge_base_files`
- `followup_sequences`
- `followup_steps`
- `whatsapp_flows`
- `chatbot_flows`
- `message_templates`
- `whatsapp_groups`
- `whatsapp_connections`

**Policy Pattern:**
```sql
FOR SELECT:
  true  -- All authenticated users can read config

FOR INSERT:
  public.is_admin_or_supervisor(auth.uid())

FOR UPDATE:
  public.is_admin_or_supervisor(auth.uid())

FOR DELETE:
  public.is_admin_or_supervisor(auth.uid())
```

**Rationale:** Configuration is centralized and shouldn't vary per user. Allowing all authenticated users to read prevents "permission denied" errors when querying config.

---

### Type 6: System-Generated Audit & Logging
System (service role) generates data; users query with restrictions.

**Tables in this category:**
- `entity_versions`
- `security_alerts`
- `evolution_health_logs`
- `rls_audit_log`

**Policy Pattern:**
```sql
FOR SELECT:
  public.is_admin_or_supervisor(auth.uid())

FOR INSERT:
  true  -- Service role can insert

FOR UPDATE:
  public.is_admin_or_supervisor(auth.uid())

FOR DELETE:
  public.is_admin_or_supervisor(auth.uid())
```

**Rationale:** Audit logs are sensitive and should only be accessible to admins. Service role (not a real user) can insert for audit trail purposes.

---

### Type 7: Admin-Only System Tables
Critical system tables with no user access.

**Tables in this category:**
- `instance_alerts`
- `instance_auth_events`
- `instance_processing_pauses`
- `instance_registry`
- `instance_credentials`
- `evolution_instance_credentials`
- `evolution_retry_metrics`
- `rate_limit_configs`
- `ip_whitelist`
- `permissions`
- `role_permissions`

**Policy Pattern:**
```sql
FOR ALL:
  public.is_admin_or_supervisor(auth.uid())
  WITH CHECK public.is_admin_or_supervisor(auth.uid())
```

**Rationale:** These tables should never be directly queried by non-admin users.

---

## Detailed Table Ownership Matrix

| Table | Ownership Type | Owner Field | Access Pattern | Notes |
|-------|---|---|---|---|
| **User Profile Tables** |
| `profiles` | Direct User | `user_id` | User sees own, admin sees all | Primary identity table |
| `user_settings` | Direct User | `user_id` | User modifies own | Personal preferences |
| **Contact Management** |
| `contacts` | Assignment | `assigned_to` | User → Profile → Contact | Agent/seller owns contact |
| `contact_notes` | Assignment | `contact_id` → `assigned_to` | User access via contact | Notes on contacts |
| `contact_custom_fields` | Assignment | `contact_id` → `assigned_to` | User access via contact | Custom field values |
| `contact_tags` | Global | N/A | All users can tag | Collaborative tagging |
| **Messaging & Communication** |
| `messages` | Conversation | `conversation_id` → `assigned_to` | User access via conversation | Chat messages |
| `message_templates` | Admin Config | N/A | All read, admin write | Template library |
| `whatsapp_groups` | Admin Config | N/A | All read, admin write | WhatsApp group config |
| `whatsapp_connections` | Admin Config | N/A | All read, admin write | WhatsApp account setup |
| `whatsapp_flows` | Admin Config | N/A | All read, admin write | WhatsApp flow definitions |
| **Conversation Management** |
| `conversations` | Assignment | `assigned_to` | User → Profile → Conversation | Main conversation records |
| `conversation_memory` | Conversation | `conversation_id` → `assigned_to` | User access via conversation | Message history/context |
| `conversation_closures` | Conversation | `conversation_id` → `assigned_to` | User access via conversation | Closure records |
| `conversation_transfers` | Conversation | `conversation_id` → `assigned_to` | User access via conversation | Transfer history |
| `conversation_tasks` | Conversation | `conversation_id` → `assigned_to` | User access via conversation | Task items |
| `conversation_sla` | Admin Config | N/A | All read, admin write | SLA configurations |
| **Sales & Deals** |
| `sales_deals` | Assignment | `assigned_to` | User → Profile → Deal | Sales deal records |
| `deal_activities` | Global | N/A | All users can log | Activity stream |
| `sales_pipeline_stages` | Admin Config | N/A | All read, admin write | Pipeline stages |
| **Automation & Workflows** |
| `followup_sequences` | Admin Config | N/A | All read, admin write | Automation sequences |
| `followup_steps` | Admin Config | N/A | All read, admin write | Automation steps |
| `followup_executions` | Admin Only | N/A | Admin only | System execution logs |
| `chatbot_flows` | Admin Config | N/A | All read, admin write | Chatbot configurations |
| `playbooks` | Admin Config | N/A | All read, admin write | Playbook definitions |
| **Configuration & System** |
| `business_hours` | Admin Config | N/A | All read, admin write | Business hours config |
| `app_settings` | Admin Config | N/A | All read, admin write | Application settings |
| `global_settings` | Admin Config | N/A | Admin only | Global system settings |
| `rate_limit_configs` | Admin Config | N/A | Admin only | Rate limiting rules |
| `ip_whitelist` | Admin Config | N/A | Admin only | IP allow list |
| **Audit & Logging** |
| `entity_versions` | System Audit | N/A | Admin only | Entity change history |
| `security_alerts` | System Audit | N/A | Admin read, system insert | Security events |
| `evolution_health_logs` | System Audit | N/A | Admin only | Health check logs |
| `rls_audit_log` | System Audit | N/A | Admin only | RLS violation logs |
| **System & Integration** |
| `instance_alerts` | System Only | N/A | Admin only | Alert configurations |
| `instance_registry` | System Only | N/A | Admin only | Instance registry |
| `evolution_instance_credentials` | System Only | N/A | Admin only | API credentials |
| `permissions` | System Only | N/A | Admin only | Permission definitions |
| `role_permissions` | System Only | N/A | Admin only | Role-permission mappings |

## Access Control Decision Tree

Use this decision tree when adding RLS to a new table:

```
1. Is this table user data (contacts, messages, deals)?
   ├─ YES: Does it have user_id or created_by?
   │  ├─ YES: Use Type 1 - Direct User Ownership
   │  └─ NO: Is it related to a user via assignment?
   │     ├─ YES: Use Type 2 - Assignment-Based Access
   │     └─ NO: Is it related to conversations?
   │        ├─ YES: Use Type 3 - Conversation-Based Access
   │        └─ NO: ESCALATE - unclear ownership model
   └─ NO: Is this a configuration table?
      ├─ YES: Should users modify it?
      │  ├─ YES: Use Type 5 - Config, Admin-Only Write
      │  └─ NO: Use Type 5 - Config, Admin-Only Write
      └─ NO: Is this system/audit data?
         ├─ YES: Use Type 6 or 7 - System/Admin Only
         └─ NO: ESCALATE - unclear purpose
```

## Implementation Checklist for New Tables

When adding RLS to a new table:

- [ ] 1. Determine ownership model from decision tree above
- [ ] 2. Identify all foreign key relationships
- [ ] 3. Write SELECT policy with ownership constraint
- [ ] 4. Write INSERT policy (usually permissive or admin-only)
- [ ] 5. Write UPDATE policy (usually same as SELECT)
- [ ] 6. Write DELETE policy (usually admin-only)
- [ ] 7. Add helper function if new pattern needed
- [ ] 8. Document in this file
- [ ] 9. Test with multiple user roles
- [ ] 10. Test with admin user
- [ ] 11. Add to test suite

## Examples

### Example 1: User Can View Own Profile
```sql
-- User profile: direct user ownership
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_supervisor(auth.uid()));

-- Test:
SELECT * FROM profiles;  -- User sees only their profile
-- Admin sees all profiles
```

### Example 2: User Can View Assigned Contacts
```sql
-- Contact: assignment-based ownership
CREATE POLICY "Users can view assigned contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (
    assigned_to IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Test:
SELECT * FROM contacts;  
-- User sees only contacts assigned to their profile
-- Query must join through profiles table internally
```

### Example 3: User Can View Messages in Assigned Conversations
```sql
-- Message: conversation-based ownership
CREATE POLICY "Users can view conversation messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Test:
SELECT * FROM messages WHERE conversation_id = $1;
-- User only gets messages from conversations they're assigned to
```

### Example 4: Configuration Table - All Read, Admin Write
```sql
-- Configuration: admin-controlled
CREATE POLICY "Everyone can read settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can modify settings" ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can update settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Test:
SELECT * FROM app_settings;  -- All users can read
UPDATE app_settings SET value = 'new';  
-- Only admins can update
```

### Example 5: System Audit - Admin Read, System Insert
```sql
-- Audit: system-generated, admin-visible
CREATE POLICY "Admins can view audit logs" ON public.security_alerts
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "System can log alerts" ON public.security_alerts
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Test:
SELECT * FROM security_alerts;  
-- Regular user gets 0 rows
-- Admin sees all alerts
-- Service role (backend) can insert
```

## Security Principles Applied

1. **Default Deny** - Policies default to denying access unless explicitly allowed
2. **Principle of Least Privilege** - Users only see data they need to see
3. **No Data Leakage** - Users cannot infer existence of data via errors
4. **Admin Oversight** - All sensitive operations visible to admins
5. **Immutable Audit Trail** - Audit logs append-only for admins
6. **Clear Ownership** - Every record can be traced to an owner
7. **Single Source of Truth** - Helper functions centralize access logic

## Common Mistakes to Avoid

❌ **WRONG:**
```sql
CREATE POLICY "Anyone can see everything" ON public.contacts
  FOR SELECT USING (true);
```

✅ **RIGHT:**
```sql
CREATE POLICY "Users can see their contacts" ON public.contacts
  FOR SELECT USING (
    assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
```

---

❌ **WRONG:**
```sql
CREATE POLICY "Admins can do anything" ON public.contacts
  FOR ALL USING (true) WITH CHECK (true);
```

✅ **RIGHT:**
```sql
CREATE POLICY "Admins can manage contacts" ON public.contacts
  FOR ALL USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
```

---

❌ **WRONG:**
```sql
-- Checking role in application code
CREATE POLICY "Authenticated users can access" ON public.contacts
  FOR SELECT USING (true);  -- No RLS check!
```

✅ **RIGHT:**
```sql
-- Checking role in RLS policy (enforced at DB layer)
CREATE POLICY "Authenticated users can access" ON public.contacts
  FOR SELECT USING (
    assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );
```

## Migration Path for Existing Tables

When migrating an existing table to proper RLS:

1. **Create new helper function** (if needed)
2. **Drop all permissive policies** (USING (true), WITH CHECK (true))
3. **Create restrictive policies** (ownership-based)
4. **Test thoroughly** with all user roles
5. **Monitor logs** for legitimate access denials
6. **Adjust as needed** based on real usage patterns

## Performance Considerations

- Helper functions use `STABLE` marker for query caching
- Indexes on `user_id`, `created_by`, `assigned_to` critical
- RLS evaluation adds ~1-5ms per query (acceptable)
- Consider materialized views for complex ownership chains
- Use EXPLAIN ANALYZE to debug slow RLS queries

## Questions & Escalations

If unclear about a table's ownership model:

1. Review the decision tree above
2. Check the detailed matrix
3. Examine the table's foreign keys
4. Look at existing similar tables
5. Escalate to DBA with: table name, purpose, and typical access patterns

---

**Last Updated:** 2026-07-10  
**Related:** `20260710_fix_rls_vulnerabilities.sql`
