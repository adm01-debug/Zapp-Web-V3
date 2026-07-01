# Authenticated data-isolation posture (self-hosted) - 2026-06-30

This is the ONE remaining structural cutover question, and it is a **DECISION**
(with Pink), not a defect. Read-only audit; nothing was changed.

## Finding: there is effectively NO row-level isolation between logged-in users
A logged-in (`authenticated`) user can read essentially all data, via three
mechanisms:

1. **Permissive policies** - `authenticated USING(true)`:
   public 104, zapp 150, evo 182, bpm 43, ai 31, email_app 21.
   Where RLS is ON, the policy allows every row to every authenticated user.

2. **Views that bypass RLS** - 281 of 541 `public` views are
   `security_invoker=off` (run as owner = postgres), so they return all rows
   regardless of the caller's RLS.

3. **RLS-disabled tables** - 29 base tables with RLS OFF that authenticated can
   read: evo (26), public (3). (zapp / ai / bpm / email_app: RLS on all tables.)

(No table has RLS enabled with zero policies, so nothing is accidentally
deny-all.)

## Is this a problem? -> depends on the product model (decide with Pink)
- If zapp is a **SINGLE-ORG internal tool** (all agents are trusted Promo
  Brindes employees, meant to see all conversations/data): this posture is
  **ACCEPTABLE and cutover can proceed as-is**. The boundary that matters is
  `anon` (public, unauthenticated) - and that is now fully locked.
- If data must be **ISOLATED** between agents / teams / queues: a scoped RLS
  redesign is required, with this scope:
  - replace the ~531 `USING(true)` policies with `auth.uid()` / workspace_id /
    queue scoping,
  - flip the 281 owner-running views to `security_invoker=on`,
  - enable RLS (+ scoped policies) on the 29 RLS-off tables.
  Large, app-behavior-changing project - must be designed against the real
  tenancy model, not applied blind.

## Recommendation
Confirm the model with Pink. If single-org: no action, ship. If isolation is
required: scope it as a dedicated sprint (the numbers above are the work items).
Either way, the `anon` boundary is already closed and independent of this
decision.
