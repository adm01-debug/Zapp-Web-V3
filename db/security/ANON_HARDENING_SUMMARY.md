# Anon hardening - final posture (self-hosted) - 2026-06-30

Goal: the public `anon` key (no login) must be able to read/do NOTHING
sensitive. All changes are on the self-hosted target (**NOT in production until
cutover**) and are reversible via `archive.*` backups + the `*_ROLLBACK.sql`
scripts.

## What anon CAN still do (intentional allowlist)
- Read: `public.cookies_config`, `public.workspaces` (cookie banner / bootstrap)
- Execute (login flow): `record_failed_login`, `clear_login_attempts`,
  `sync_perfil_on_login`
- `USAGE` on schemas: `public`, `storage`, `graphql_public` (platform-required)
- Nothing else.

## What was locked down
| Surface | Revoked from anon | Backup table | Script |
|---|---|---|---|
| Tables / views | 335 | `anon_grant_backup_20260630` | `2026-06-30_anon_hardening_FULL.sql` |
| Materialized views | 7 | (same) | (same) |
| SECURITY DEFINER funcs | 489 | `anon_func_grant_backup_20260630` | `2026-06-30_anon_rpc_hardening.sql` |
| SECURITY INVOKER funcs | 431 | `anon_invoker_func_backup_20260630` | `2026-06-30_anon_hardening_phase2.sql` |
| Schema `USAGE` | zapp, evo, bpm, ai, email_app, monitoring | `anon_schema_usage_backup_20260630` | (same) |
| Sequences | (anon had none) | - | - |

For every function, `authenticated` + `service_role` were GRANTed **before**
`PUBLIC`+`anon` were revoked, so the app (post-login) and backend (edge fns /
n8n) are unaffected. **Verified:** anon executes exactly 3 functions;
authenticated/service_role lost access to **0** functions they previously had.

## Open recommendation (NOT applied - needs Pink; changes migration workflow)
Postgres' built-in default grants `EXECUTE` on every NEW function to `PUBLIC`
(= anon). To stop future functions from re-opening anon access, add as a
one-time policy:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres, supabase_admin
  IN SCHEMA public, zapp, evo, bpm, ai, email_app
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Trade-off: after this, every new function must EXPLICITLY
`GRANT EXECUTE ... TO authenticated` in its migration, or logged-in users get a
404 on the new RPC. That is the secure default, but it is a workflow change -
decide with Pink. Platform-schema defaults (storage / graphql / graphql_public /
supabase_functions) are left untouched (anon legitimately needs them).
