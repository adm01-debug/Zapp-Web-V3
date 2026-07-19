-- Migração: índices de performance em hot paths identificados por seq_scan alto
-- Data: 2026-07-16
-- Contexto: audit de performance pós-consolidação single-DB
--
-- Problemas identificados:
-- 1. login_attempts.email: edge function faz SELECT/DELETE WHERE email=? sem índice
-- 2. workspaces.created_at: view zapp.contacts faz ORDER BY created_at LIMIT 1 sem índice
-- 3. profiles.name: fetchProfiles() faz ORDER BY name sem índice (40k seq_scans)
-- 4. user_roles: 18k seq_scans vs 2 idx_scans — sem índice em user_id/role_key
-- 5. role_permissions: 18k seq_scans, zero índices em colunas de filtro

-- login_attempts: busca + lock check por email
CREATE INDEX IF NOT EXISTS idx_login_attempts_email
  ON zapp.login_attempts USING btree (email);

-- login_attempts: lookup rápido por email quando está lockado
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_locked
  ON zapp.login_attempts USING btree (email, locked_until)
  WHERE (locked_until IS NOT NULL);

-- workspaces: ORDER BY created_at LIMIT 1 na CTE ws da view contacts
CREATE INDEX IF NOT EXISTS idx_workspaces_created_at
  ON zapp.workspaces USING btree (created_at);

-- profiles: ORDER BY name nas queries de agentes
CREATE INDEX IF NOT EXISTS idx_profiles_name
  ON zapp.profiles USING btree (name);

-- profiles: filtros WHERE is_active = true
CREATE INDEX IF NOT EXISTS idx_profiles_is_active
  ON zapp.profiles USING btree (is_active)
  WHERE (is_active = true);

-- user_roles: lookups por user_id (autenticação, RBAC)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON zapp.user_roles USING btree (user_id);

-- user_roles: filtros por role_key
CREATE INDEX IF NOT EXISTS idx_user_roles_role_key
  ON zapp.user_roles USING btree (role_key);

-- role_permissions: filtros por role (enum)
CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON zapp.role_permissions USING btree (role);
