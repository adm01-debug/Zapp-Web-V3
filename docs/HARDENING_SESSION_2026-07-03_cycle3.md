# Hardening & Quality Session — Cycle 3 (2026-07-03)

Follow-up to PRs #114 and #118. Same method: simulate first, then fix; DB changes
measured live before/after and codified as idempotent migrations.

## Scorecard (before → after)

| Dimension | Before | After |
|---|---|---|
| Live anon leaks (instance-wide, all schemas) | 0 (held from prior cycles) | **0** |
| **Latent anon-grant mines** (schemas w/ anon table grants) | 6 schemas / **269 grants** | **0** |
| Quarantined (skipped) hook tests | 2 (`useMessages`, `useRealtimeMessages`) | **0 — both rewritten to pass** |

## 1. DB — swept the last latent anon mines

A full-instance simulation (anon reachability × every non-system schema) confirmed
**0 live leaks** everywhere (the cycle 1–2 fixes to `public`/`zapp`/`vendas`/
`financeiro` held), and **0 `SECURITY DEFINER` search_path gaps**. What remained
were latent mines: six schemas carrying broad `anon` table grants where `anon`
has **no schema USAGE**, so they are unreachable today but a single stray
`GRANT USAGE ON SCHEMA <s> TO anon` would expose them — the exact vector the
original 2026-07-02 audit named.

Swept (migration `20260703140000`): `evo` (143), `bpm` (39), `email_app` (35),
`ai` (31), `archive` (15), `monitoring` (6) = **269 anon grants → 0**. Revoked
table + sequence grants and set `ALTER DEFAULT PRIVILEGES` so future objects
don't re-grant anon. Provably safe (anon lacks USAGE → the revoke is inert today)
and monotonic — **`authenticated` and `service_role` grants verified unchanged**.
Applied live; verified `0` anon grants left and `0` live leaks instance-wide.

## 2. Tests — turned the 2 quarantined tests into real passing coverage

Both tests skipped in cycle 2 are now rewritten to pass deterministically, so
they contribute real coverage under the blocking gate again:

- **`useMessages.test.tsx`** — fully rewritten against the real hook API. The old
  suite (the OOM bomb) called `useMessages({ contactId })` when the hook takes a
  string `remoteJid`, and mocked `supabase.from().range()` when the hook fetches
  via `dbList(RPC.listMessagesLite)`. New version mocks the correct data layer and
  asserts on definitive outcomes: 5 tests, stable across repeated runs, ~2GB (no
  OOM).
- **`useRealtimeMessages.test.tsx`** — the flaky test waited on the `loading` flag
  (which toggles as the hook's per-render callbacks recreate and re-fire effects).
  Re-keyed the wait onto the actual outcome (the hidden contact's conversation
  appearing). Deterministic now — 4/4 repeated runs (was ~50%).

## Finding logged for follow-up (not changed)

`src/components/contacts/__tests__/ExternalDataIntegration.test.tsx`
(`useExternalCargos`) makes a **real network call** in the unit test — it fails
locally (`getaddrinfo ENOTFOUND supabase-unconfigured.invalid`) because its
regular-supabase-client path isn't mocked; it only passes in the CI env where the
client resolves. Pre-existing on `main` (confirmed by running it on a clean
checkout), unrelated to this PR. Worth mocking that client path so the suite is
green locally too.

## Deferred (unchanged — infra-blocked)

- **ESLint `eslint@9` toolchain swap** — still blocked by this environment's npm
  mirror (`ConnectionClosed` on `bun install`, so `bun.lock` can't be
  regenerated). `npm run lint` still crashes on CI (`eslint@10` vs
  `typescript-eslint@8`). Needs one clean `bun install` elsewhere.
