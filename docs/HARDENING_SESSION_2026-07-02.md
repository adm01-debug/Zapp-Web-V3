# Hardening & Quality Session — 2026-07-02

Scope: a "simulate first, then fix" pass over CI honesty, the test/lint toolchain,
and the database. Every DB change was measured on the live database before and
after, and is codified as an idempotent migration so staging reproduces it.

## Scorecard (before → after)

| Dimension | Before | After |
|---|---|---|
| **`anon`-readable secret tables in `public`** | **1** (`cookies_config`: live LinkedIn + Lusha session cookies/tokens, reachable with the public anon key) | **0** |
| `public` tables with RLS off | 3 | 0 |
| Tables RLS-on-but-no-policy with a stray broad grant | 2 | 0 |
| `SECURITY DEFINER` fns w/o `search_path` (app schemas) | 0 | 0 |
| Unindexed FKs on append-heavy hot tables | 12 | 0 (12 indexed; 15 on tiny/config tables deliberately deferred) |
| Vitest failures | 6 (2 files) | 0 (2088 passed) |
| Vitest run stability | OOM in single process | forks pool, memory bounded |
| TypeScript errors (`tsc --noEmit`) | 0 on CI (lock has react-day-picker v10) | 0, now a **blocking** gate |
| CI TypeScript gate | advisory | **blocking** |
| CI unit-test gate | advisory | **blocking** |
| Quality-gate "Smoke Tests" step | false green (collected 0 tests) | removed |
| ESLint toolchain | crashes on CI (eslint 10 + typescript-eslint 8) | root-caused; fix verified locally, lock regen deferred (see below) |

## 1. Security — the live credential leak (most important finding)

A role-simulation matrix over the `public` schema (the 2026-07-02 audit hardened
`zapp` and explicitly left `public`/`evo`/`email_app` out of scope) found:

- `public.cookies_config` had `anon` USAGE + SELECT grant **and** a
  `USING(true)` policy named "anon pode ler cookies". Anyone with the public
  anon key (shipped in the frontend bundle) could `GET /rest/v1/cookies_config`
  and read live third-party session state — measured: a 367-char LinkedIn
  session cookie + csrf_token, and a 3202-char Lusha cookie + token + cnpj.
  The prior migration assumed this table was intentionally anon-facing based on
  its name; the actual columns proved it was a leak. Neither `src/` nor
  `supabase/functions/` read it (it's maintained by service_role automations),
  so revoking anon breaks nothing.

Fixes (migrations `20260702180000`, `20260702182000`), all monotonic:
1. `cookies_config`: dropped the anon policy, revoked anon + PUBLIC + authenticated → **service_role only**.
2. `whatsapp_connections`: dropped a dead-but-latent `wconn_select_anon` policy.
3. `n8n_variables`: retargeted a mislabeled `service_role_all` policy that actually granted PUBLIC ALL/`USING(true)` → authenticated.
4. `_system_health_history` / `_system_health_log` / `_vault_corrupted_quarantine`: RLS was off → enabled RLS + admin-only (`is_admin_painel()`) read.
5. `email_health_logs`: revoked the latent anon grant.

## 2. Performance — FK covering indexes

12 covering indexes on append-heavy / app-queried tables whose foreign keys had
no index (`team_messages`, `sla_history`, `conversation_events`, `sales_deals`,
`security_audit_logs`, `conversation_audit_logs`, `contact_notes`,
`followup_executions`, `chatbot_executions`). The tables are empty today, so
creating the indexes now is instant and lock-free — versus an expensive
`CONCURRENTLY` build once they are large. The remaining 15 unindexed FKs are on
tiny/static config tables and are deliberately deferred.

## 3. Tests

Two files failed from Supabase-mock drift, not product bugs:
- `useRealtimeSentimentAlerts`: mock missing the `isSupabaseConfigured` /
  `warnSupabaseUnconfigured` exports the hook now imports.
- `useQueues`: mock stubbed the old `contacts` waiting-count source; the hook was
  corrected to read `queue_positions`.

Also switched Vitest to the forks pool (bounded memory) so the ~2.1k-test suite
stops OOMing and can be a blocking gate.

## 4. CI honesty

- TypeScript and unit tests flip from advisory to **blocking** (both green).
- Removed the quality-gate "Smoke Tests" step: it ran
  `playwright test tests/e2e/smoke.spec.ts` against a config whose `testDir` is
  `./src/tests/e2e`, so it collected **zero** tests and always passed. The smoke
  suite needs real credentials + a backend and belongs in a pre-deploy job.
- Fuzzing relabeled honestly (no edge runtime at localhost:54321 in CI).

## Deferred (with reasons — not silently dropped)

- **ESLint toolchain swap.** `eslint@10` is incompatible with `typescript-eslint@8`
  (peer `^8.57 || ^9`); ESLint 10 removed the internal class its utils extend, so
  `npm run lint` crashes on CI (hidden by the advisory step). `@eslint/js` is
  already on 9.x, so the intended state is `eslint@9`. The fix is verified
  locally (eslint 9.39.4 lints cleanly, the pre-commit hook runs), but it needs a
  `bun install` to regenerate `bun.lock`, which this environment's npm mirror
  (europe-west4 pull-through cache) could not complete (persistent
  `ConnectionClosed`). Landing it needs one `bun install` in a stable-registry
  environment; package.json was reverted to keep the lockfile consistent so CI
  stays green in the meantime. Real ESLint backlog once it runs: ~995 errors /
  ~1037 warnings (top: `no-explicit-any`, `no-unused-vars`) — a dedicated cleanup.
- **E2E against the production build** (CodeRabbit nitpick). Evaluated by actually
  running it: `vite build` + `vite preview` serves fine, but `page.goto` on the
  catch-all route times out waiting for `load` on the preview bundle (a
  long-lived realtime socket keeps `load` from settling). Low value per the
  reviewer; not worth destabilizing the green dev-server E2E gate. Reverted.
- **Owner-scoping the 158 `authenticated` `USING(true)` policies in `zapp`** —
  unchanged, per the prior audit's reasoning (88 tables have no owner column;
  restricting would break non-admin agents in a single-org shared inbox).
