# Simulation de Falhas — Fixes de Runtime (61 cenários)

**Data:** 2026-08-03 18:38 UTC  
**Repo:** zapp-web-v3 · **Escopo:** 10 fixes auditados (2026-08-03)  
**Método:** modelos computacionais (Monte Carlo, torn-file, overflow math, HMAC replay) + matriz grounded em evidência do repo (leitura de código, migrations, crons, workflows)

## Resumo executivo

- Cenários simulados: **61** (6-7 por fix × 10 fixes) + **10** gaps cross-cutting

- Distribuição por status do fix: **GAP** 24, **PARCIAL** 25, **PROTEGIDO** 12

- Distribuição por severidade: **CRITICO** 17, **ALTO** 23, **MEDIO** 10, **BAIXO** 11

- Fixes mais resilientes: **F1** (ai-usage leaf module), **F10** (bigint) — zero gaps estruturais

- **Fix NÃO APLICADO:** F2/F5 (docker secrets — doc pendente; plaintext `DEEPSEEK_API_KEY` ainda no service spec, P1)

- **Top risco recorrente:** F7 (partições mensais — função fora do repo, sem cheque de índice)

### Top 12 cenários por risco

| # | Cenário | Status | Sev | Lik | Risk |
|---|---------|--------|-----|-----|------|
| S5.1 | Secret exists in Swarm but NOT in compose (current state) | GAP | 9 | 7 | **8.1** |
| S2.3 | Secret file missing at boot (mount failure) | GAP | 9 | 6 | **7.7** |
| S6.1 | Lovable regeneration re-adds process.env to mcp/index.ts | GAP | 9 | 5 | **7.2** |
| S4.4 | Anonymous call (no JWT) — the original P1 | PROTEGIDO | 8 | 6 | **7.1** |
| S7.1 | New partition created WITHOUT index (function body not in repo) | GAP | 8 | 6 | **7.1** |
| S7.3 | Only 1 month created ahead; cron missed a month (lock contention) | GAP | 9 | 4 | **6.8** |
| S8.1 | Two agents deploy DIFFERENT functions while _shared/ changes | GAP | 8 | 5 | **6.7** |
| S2.6 | Plaintext env var NOT removed after mounting secret | GAP | 8 | 4 | **6.2** |
| S3.2 | REVOKE targets service_role too (sweep) | PARCIAL | 8 | 4 | **6.2** |
| S5.2 | Service restart with secret missing (node reboot) | GAP | 8 | 4 | **6.2** |
| S8.2 | Two deploys of the SAME function (torn index.ts) | GAP | 8 | 4 | **6.2** |
| S8.5 | Two CI runs with different SHAs (last-writer-wins tree copy) | GAP | 8 | 4 | **6.2** |

---

## Fix inventory (evidência)

- **F1 ai-usage.ts** — Leaf module — imports ONLY esm.sh supabase-js@2.87.1 (verified: 0 local imports). Importers: ai-proxy:8, ai-router:52, chatbot-l1:3. logAiUsage is fire-and-forget, try/catch, never throws.
- **F2 Secret rotation deepseek_api_key_v2** — docs/infra/2026-08-03_docker_secrets_migration.md — secrets created in Swarm, NOT mounted yet (Acao pendente). Service spec STILL has plaintext DEEPSEEK_API_KEY=<redacted> (P1, audit 2026-08-03). Planned entrypoint: export DEEPSEEK_API_KEY=$(cat /run/secrets/deepseek_api_key_v2).
- **F3 REVOKE race** — increment_webhook_rate_limit exposed in public (13 SECDEF) + zapp wrapper (20260725000006). Grants: authenticated+service_role. rate-limiter.ts: 5s RPC timeout, retries 50/100/200ms, fail-open (FIX-05). Cron runs as owner via pg_cron (not PostgREST).
- **F4 rpc_get_contact overloads** — Overload1 (uuid)->jsonb SECDEF, Overload2 (text, text DEFAULT NULL)->SETOF, both with NEW auth.uid() guard (migration 20260803182053), search_path='', grants re-issued. Front: useFallbackContact, v237Fallbacks, evolutionContactCache (authenticated JWTs).
- **F5 Docker secret mount** — Same as F2 — mount not applied. Entrypoint has NO set -e, NO size check, NO fail-fast on missing secret.
- **F6 Deno.env vs process.env** — mcp/index.ts process.env REMOVED (grep: 0 matches in supabase/functions today). ai-usage.ts uses Deno.env.get with SELFHOSTED_* fallback. NO CI workflow greps process.env in function code.
- **F7 Partition index** — Cron 64 auto-create-monthly-partitions -> evo.fn_auto_create_next_partitions (monthly; evolution_messages/conversations/webhook_events, 25 partitions each). Function BODY not in repo (live DB only) -> index creation UNVERIFIABLE.
- **F8 Concurrent deploys** — Deploys copy to /root/supabase/docker/volumes/functions. Deploy churn evidence: housekeeping.sh prunes 'containers exit 255 de deploys antigos'. edge-drift-check.yml (md5) detects drift AFTER the fact.
- **F9 HMAC clock skew** — verifyHmacSignature (WebCrypto HMAC-SHA256, constant-time) — NO timestamp/expiry validation. Multi-secret rotation (WebhookSecurityService). Evolution native webhook falls back to static x-webhook-secret. webhook-idempotency.ts for duplicates.
- **F10 Counter overflow** — event_count/current_count BIGINT since S8 (20260712000006; confirmed in 20260725000006). Window 60s bucket computed client-side. INSERT..ON CONFLICT DO UPDATE event_count+1, atomic row lock.

---

## Modelos computacionais

### A. REVOKE race (Monte Carlo)

`rate-limiter.ts`: RPC timeout 5s, retries 50/100/200ms → tolerância efetiva ≈ 5.35s de lock hold. REVOKE = AccessExclusiveLock; chamadas concorrentes bloqueiam (lock_timeout=0).
```
lock_hold=  2.0s | chamadas na janela~= 160 | fail-open (bypass)~=   0 | janela de bypass = 2.0s
lock_hold=  6.0s | chamadas na janela~= 480 | fail-open (bypass)~=  43 | janela de bypass = 6.0s
lock_hold= 15.0s | chamadas na janela~=1200 | fail-open (bypass)~=  43 | janela de bypass = 15.0s
```
Conclusão: o bypass do rate-limit dura exatamente o lock hold; REVOKE em transação curta (<1s) → risco mínimo; risco real = REVOKE de service_role (S3.2) e lock hold longo (S3.3).

### B. Deploy concorrente (torn-file)

```
P(arquivo corrompido por deploy concorrente) ~= 0.0000 por deploy (2 writers, 40 arquivos, 8 chunks)
P(mistura de versões A/B entre funções) ~= 0.50 (last-writer-wins por diretório)
```
Conclusão: corrupção de arquivo é rara (escritas pequenas), mas **version skew é quase certo** (S8.5) — o problema real não é byte-corrupção, é mistura de SHAs.

### C. Overflow do contador

```
int4: overflow em janela de 60s exigiria 3.58e7 eventos/s (impossível p/ webhook WhatsApp; pico real ~2e3/s)
int8: exigiria 1.54e17 eventos/s (~14 ordens de magnitude acima do alcançável)
event_count já é BIGINT desde S8 (migration 20260712000006) → cenário fechado
```
### D. HMAC / clock skew

```
hmac-validation.ts: ZERO validação de timestamp (nenhum header de tempo é lido)
→ HMAC correto com skew > 30s: VÁLIDO (skew é irrelevante para HMAC de payload)
→ Consequência real: replay window infinita; proteção depende só de idempotência (webhook-idempotency.ts)
```

### E. Partição sem índice (seq scan)

```
1e5 rows: ~10ms | 1e6: ~100ms | 5e6: ~500ms | 2e7: ~2s+ (vs <5ms com índice)
→ rollover mensal degrada listagens de mensagens progressivamente; invisível p/ monitoramento atual
```

---


## S1 — ai-usage.ts import / circular deps

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S1.1 | **Import order swap (ai-proxy vs ai-router cold start)** | Two functions import ai-usage.ts in different order at first boot. Deno ES-module graph is order-independent; ai-usage is a leaf with zero local imports -> evaluation order cannot produce TDZ. | **PROTEGIDO** | None — verified leaf (only esm.sh URL import). | Keep ai-usage.ts a leaf: CI rule 'no imports from ../_shared/* inside ai-usage.ts'. | 2 | 2 | **2.0** |
| S1.2 | **Future patch adds auth.ts import to ai-usage.ts** | ai-usage would join a LIVE cycle: auth.ts->validation.ts->hmac-validation.ts->auth.ts (verified in repo). Top-level binding access across the cycle at eval -> 'Cannot access X before initialization' -> all 3 functions (ai-proxy, ai-router, chatbot-l1) fail at boot -> 500/401 storm. | **PARCIAL** | Today protected (leaf), but sibling cycle auth<->validation<->hmac-validation is real; any change to ai-usage imports re-introduces risk. | Break the cycle (auth.ts must not import validation.ts; invert dependency); CI 'deno check' fails on cycle. | 7 | 4 | **5.7** |
| S1.3 | **Barrel re-export via _shared/mod.ts** | If mod.ts later does export * from './ai-usage.ts', a function importing both mod.ts and ai-usage.ts still gets ONE module instance (URL cache). Only risk: name collisions in barrel. | **PROTEGIDO** | None (ES module URL cache guarantees single evaluation). | No action; document barrel policy. | 1 | 2 | **1.5** |
| S1.4 | **Volume/repo drift of ai-usage.ts (old volume, new importer)** | edge-drift-check.yml (md5) exists, but between deploy and check the volume may serve OLD ai-usage.ts (e.g. missing callAiWithTracking) while a NEW function imports it -> boot error 'callAiWithTracking is not exported'. | **PARCIAL** | Drift detection is reactive (separate workflow), not preventive. | Deploy = atomic tree copy + immediate md5 verify in the deploy job (fail pipeline on mismatch). | 6 | 3 | **4.7** |
| S1.5 | **esm.sh unavailable at cold start** | ai-usage.ts imports supabase-js from esm.sh at module eval. esm.sh down/slow (supply-chain SPOF) -> ALL importers fail to boot -> AI chat features down; isolates retry per cold start. | **GAP** | No vendored bundle; deno.lock pins version, not availability. | Vendor supabase-js or mirror esm.sh; warm isolates (keep-alive); health endpoint asserts module load. | 8 | 2 | **5.3** |
| S1.6 | **Volume wipe during deploy forces mass re-fetch of esm.sh** | Deploy replacing the functions volume dir clears Deno's module cache -> every isolate cold-starts re-fetching esm.sh -> thundering herd + boot latency spikes after each deploy. | **GAP** | Cache not preserved across deploys. | Preserve cache dir across deploys (mount cache volume); staged rollout. | 5 | 3 | **4.1** |

## S2 — Secret rotation deepseek_api_key_v2

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S2.1 | **Rotate secret value while edge-runtime running (no redeploy)** | Container env captured at process boot. New secret value in Swarm is INERT until service redeploy -> old key keeps working (rotation not effective), or if old key revoked at provider: ALL AI calls 401 until redeploy. | **PARCIAL** | No dual-key (new+old) support for DEEPSEEK_API_KEY — unlike webhook secrets (multi-secret rotation exists in hmac-validation.ts). | Dual-key support in ai-proxy/ai-router (try new, fallback old) OR mandate: rotate provider-side, then redeploy immediately. | 7 | 5 | **6.1** |
| S2.2 | **Rolling redeploy mid-request with mixed isolates** | During rolling update some isolates hold old key, some new. Both valid at provider: transparent. Old key already revoked: intermittent 401s (~50%) — hard to diagnose as key issue. | **PARCIAL** | No key-version telemetry; 401s look like provider errors. | Keep old key valid >=24h after rotation; log key fingerprint (sha256 prefix) per request; alert on 401 rate. | 6 | 4 | **5.1** |
| S2.3 | **Secret file missing at boot (mount failure)** | Entrypoint `export DEEPSEEK_API_KEY=$(cat /run/secrets/...)` — cat fails -> EMPTY string exported (export still exits 0) -> edge-runtime boots healthy-looking; ai-proxy sends 'Bearer ' -> 401. No crash, no alert. | **GAP** | Fix NOT applied yet (doc: secrets nao montados). Entrypoint lacks set -e / size check; ai-proxy lacks key-presence guard. | Entrypoint: `test -s /run/secrets/deepseek_api_key_v2 || exit 1`; strip newline; health endpoint asserts env non-empty; extend edge-env-completeness.yml to DEEPSEEK_API_KEY. | 9 | 6 | **7.7** |
| S2.4 | **Secret value with trailing newline** | `cat` includes trailing \n -> key has newline -> HTTP Authorization header malformed / HMAC mismatch -> 100% 401 on AI calls after redeploy. | **GAP** | No whitespace stripping in planned entrypoint; no post-deploy smoke test for key validity. | `export KEY=$(cat ... | tr -d '\r\n')`; post-deploy smoke: call ai-proxy with valid auth -> expect 200 (extend edge-auth-smoke.yml). | 7 | 4 | **5.7** |
| S2.5 | **Secret renamed during rotation (v2->v3) but compose still references v2** | Swarm secret deleted after rotation; service spec still references it -> mount fails at next task start -> same silent-empty-env as S2.3. | **GAP** | Name-based references with no deploy-time validation. | `docker secret ls` pre-flight in deploy script: fail deploy if referenced secret missing; keep old secret until all tasks rolled. | 7 | 3 | **5.2** |
| S2.6 | **Plaintext env var NOT removed after mounting secret** | If DEEPSEEK_API_KEY stays in service env AND entrypoint exports from secret, a failed cat OVERWRITES the good plaintext with empty -> the fallback env is destroyed by the very export meant to replace it. | **GAP** | Entrypoint export semantics: empty substitution clobbers existing env. | Only export when file non-empty: `[ -s file ] && export KEY=$(cat file)`; remove plaintext env in same deploy. | 8 | 4 | **6.2** |

## S3 — REVOKE race (increment_webhook_rate_limit)

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S3.1 | **REVOKE EXECUTE FROM authenticated while cron fires** | pg_cron jobs run as job-owner role (zapp/evo), NOT via PostgREST — REVOKE from authenticated/anon does NOT affect cron. Cron calls continue; zero impact. | **PROTEGIDO** | None — cron bypasses PostgREST grants entirely. | Verify: select rolname from cron.job join pg_roles; document owner roles. | 2 | 2 | **2.0** |
| S3.2 | **REVOKE targets service_role too (sweep)** | Edges call increment_webhook_rate_limit via service_role -> permission denied -> rate-limiter retries 3x -> fail-open -> RATE LIMIT BYPASSED (protection lifted) during incident; webhook floods not throttled. | **PARCIAL** | Fail-open is by design (availability>enforcement, FIX-05) — but the bypass is silent. | Alert on fail-open events (warn already logged — wire to Sentry); revoke in phases: freeze new calls, revoke, re-grant after edges migrate. | 8 | 4 | **6.2** |
| S3.3 | **DDL lock contention during REVOKE** | REVOKE takes AccessExclusiveLock; concurrent RPC calls block (lock_timeout=0). Long transaction / queued DDL -> calls wait >5s -> RPC_TIMEOUT x3 -> fail-open window = lock hold duration. | **PARCIAL** | Monte Carlo (6s lock): calls in window failed open; bypass window == lock hold. | REVOKE in its own fast transaction; lock_timeout=2s on migration session; monitor pg_stat_activity blocked rpc calls during migrations. | 7 | 4 | **5.7** |
| S3.4 | **REVOKE vs CREATE OR REPLACE deadlock (two migrations)** | Simultaneous migrations (REVOKE + CREATE OR REPLACE same function from 20260803182053) -> lock inversion -> deadlock_timeout=1s aborts one -> partial apply -> inconsistent grants. | **PARCIAL** | Migration runner has no advisory-lock serialization. | Wrap migration runner in pg_advisory_lock; CI gate 'one migration job at a time'. | 6 | 3 | **4.7** |
| S3.5 | **PostgREST schema cache stale after REVOKE** | PostgREST caches function metadata; after REVOKE calls may return PGRST202/206/404 instead of clean permission error. rate-limiter retry predicate matches only 'lock'/'timeout'/PGRST116 -> PGRST2xx treated as PERMANENT -> fail-open WITHOUT retry. | **PARCIAL** | Error taxonomy in rate-limiter.ts incomplete for PostgREST cache artifacts. | Add PGRST2xx + 'permission denied'/'42501' to transient list; reload PostgREST schema cache after DDL (NOTIFY pgrst, reload schema). | 5 | 3 | **4.1** |
| S3.6 | **REVOKE at month boundary colliding with partition cron (00:00 1st)** | Cron 64 (0 0 1 * *) creates partitions while migration REVOKEs rate-limit fn -> both take DDL locks on evo/zapp catalogs -> serialization delay; if migration runs at midnight, window extends. | **PARCIAL** | No scheduling policy for migrations vs cron. | Run migrations 03:00-05:00; add overlap check in migration preflight. | 4 | 2 | **3.1** |

## S4 — rpc_get_contact overload ambiguity

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S4.1 | **UUID-formatted string passed as p_remote_jid** | Param names are distinct (p_contact_id vs p_remote_jid) -> only ONE overload matches per param set. UUID-looking JID hits text overload -> WHERE remote_jid='uuid' -> no row -> fallback chain continues. No ambiguity, no break. | **PROTEGIDO** | None — PostgREST resolves by parameter NAME, not type coercion. | No action; keep param names stable (they are the contract). | 1 | 3 | **1.9** |
| S4.2 | **Call with no arguments** | Both overloads require >=1 arg (uuid no default; text default only on p_instance) -> PostgREST 400 — no silent wrong-overload execution. | **PROTEGIDO** | None. | No action. | 1 | 2 | **1.5** |
| S4.3 | **Call with BOTH p_contact_id and p_remote_jid** | No overload accepts both -> PostgREST 400 ambiguity error (pre-existing behavior, unchanged by fix). | **PROTEGIDO** | None (explicit error, not silent). | Audit frontend callers never pass both (grep useFallbackContact/v237Fallbacks). | 2 | 2 | **2.0** |
| S4.4 | **Anonymous call (no JWT) — the original P1** | NEW guard: auth.uid() IS NULL -> RAISE 28000 -> 401. Before: full CRM dump (contact+deals+messages+tasks) by any anon. FIX WORKS for anon. | **PROTEGIDO** | Anon blocked. BUT guard is authentication-only, NOT authorization — any AUTHENTICATED user can still dump any contact by guessed UUID/JID (no workspace/visibility check). | Add workspace/visibility filter (join user's workspace membership) or migrate frontend to RLS-safe path; P1 follow-up. | 8 | 6 | **7.1** |
| S4.5 | **service_role caller (edge functions) now rejected by guard** | service_role JWT has no sub -> auth.uid() NULL -> NEW GUARD BREAKS legitimate edge calls. external-db-proxy allowlists rpc_get_contact (OK only if it forwards the USER JWT, not service_role). Any direct service_role call -> 500. | **PARCIAL** | Guard does not distinguish 'no auth' from 'service role'; needs verification that external-db-proxy forwards user JWT. | Guard exempts service_role explicitly: `IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN RAISE`; smoke test calling with service_role key. | 7 | 5 | **6.1** |
| S4.6 | **PostgREST overload resolution with DEFAULT args** | Overload2 (text, text DEFAULT NULL): PostgREST versions differ on default-arg overload matching; bare {p_remote_jid} call could hit PGRST200 ambiguity in some versions. | **PARCIAL** | Depends on PostgREST version in the stack; untested against running version. | Smoke test both call shapes against live PostgREST after deploy (extend edge-auth-smoke.yml). | 4 | 3 | **3.6** |
| S4.7 | **search_path='' breaks unqualified references in new body** | Body uses evo.evolution_contacts (qualified ok), auth.uid() (qualified ok), jsonb_build_object/to_jsonb (pg_catalog — implicitly searchable ok). Verified safe. | **PROTEGIDO** | None. | Keep convention: fully qualify all non-pg_catalog objects. | 1 | 2 | **1.5** |

## S5 — Docker secret mount failure

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S5.1 | **Secret exists in Swarm but NOT in compose (current state)** | docs/infra/2026-08-03: 'Secrets existem no Swarm, NAO montados no servico'. Service runs on PLAINTEXT env (P1 exposure in `docker service inspect`). The fix is NOT deployed. | **GAP** | Fix not applied; exposure remains; no automation enforcing it. | Apply compose change + entrypoint in ONE deploy; verify `docker service inspect` shows no plaintext key after. | 9 | 7 | **8.1** |
| S5.2 | **Service restart with secret missing (node reboot)** | Task recreated after node reboot; compose references a deleted Swarm secret -> task starts without mount -> empty key -> AI 401s until manual fix. Silent. | **GAP** | No restart-time validation; health endpoint doesn't check key presence. | Entrypoint fail-fast (S2.3) + Docker healthcheck that also asserts env key non-empty. | 8 | 4 | **6.2** |
| S5.3 | **Secret file present but EMPTY (0 bytes)** | cat succeeds -> export empty -> identical failure to missing file, but harder to detect (file exists). | **GAP** | No size/content validation. | test -s in entrypoint; secret tooling refuses empty secrets. | 7 | 3 | **5.2** |
| S5.4 | **Secret mounted but service spec stale (name drift)** | Rotation renamed secret; compose not updated -> mount error at task start; old tasks keep old key until restarted — mixed behavior across replicas. | **GAP** | Name-based references, no drift check. | Deploy-time preflight: docker secret ls grep referenced names; fail-fast. | 6 | 3 | **4.7** |
| S5.5 | **Edge-runtime boots 'healthy' with broken key (monitoring blind spot)** | status/health-check functions (allowlisted, no auth) return 200 regardless of DEEPSEEK_API_KEY — monitoring cannot see the failure. | **GAP** | Health endpoints don't assert outbound-key presence. | Add key-presence boolean to /functions/v1/status; alert on ai-proxy 401 spike. | 6 | 4 | **5.1** |
| S5.6 | **Swarm converge transient mount errors (node failover)** | During node drain/failover new tasks may briefly start without mounts -> intermittent 401s in the failover window. | **PARCIAL** | Restart policy eventually remounts, but window is silent. | Healthcheck-gated restart (start_period) so bad tasks never join the LB. | 5 | 2 | **3.6** |

## S6 — Deno.env.get vs process.env

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S6.1 | **Lovable regeneration re-adds process.env to mcp/index.ts** | mcp/index.ts is auto-generated (@lovable.dev/mcp-js). Any regeneration can re-introduce process.env.SUPABASE_URL (it did before — audit P1). Deno: ReferenceError -> 500 for authenticated callers of /functions/v1/mcp. | **GAP** | Fix applied once (manual), but NO CI gate prevents regression (edge-guard.yml/edge-env-completeness.yml don't grep process.env in function code). | Add to edge-guard.yml: `grep -rn 'process\.env' supabase/functions/ --include='*.ts'` -> fail build. | 9 | 5 | **7.2** |
| S6.2 | **New Lovable function scaffold ships process.env** | Any newly generated function using the template (SUPABASE_URL pattern) deploys with process.env -> silent 500 on that function's code path only. | **GAP** | Same as S6.1 — no gate. | Same CI gate + edge-env-completeness.yml extended to assert Deno.env.get pattern. | 7 | 4 | **5.7** |
| S6.3 | **process.env in a _shared module (blast radius xN)** | If a shared helper (e.g. new vault.ts function) uses process.env, EVERY importer breaks — one regeneration x dozens of functions. | **GAP** | No shared-module lint. | CI gate scans _shared/* too; unit test imports every _shared module under Deno. | 8 | 3 | **5.8** |
| S6.4 | **process.env inside try/catch vs top-level** | Wrapped in try/catch: degrades silently (feature disabled). Top-level: boot failure. Both non-obvious in production logs. | **PARCIAL** | Code review only. | deno check in CI (catches undefined 'process' as type error when types configured); runtime smoke tests. | 5 | 3 | **4.1** |
| S6.5 | **Deno.env.get returns null for unmounted key** | Even with correct Deno.env.get, missing secret -> null -> 'Bearer null' 401, or throw -> 500. Wrong failure mode (should be 503 + alert). | **PARCIAL** | No explicit null-guard pattern enforced across functions. | Standard helper getRequiredEnv(name) throwing clear 503; enforce via lint rule. | 6 | 4 | **5.1** |
| S6.6 | **Vitest/Node test environment has no Deno global** | ai-usage.ts calls Deno.env.get without typeof guard (hmac-validation.ts HAS the guard; ai-usage relies on try/catch inside logAiUsage). Module-scope call under Node -> ReferenceError. | **PARCIAL** | Inconsistent guards across shared modules. | Standardize `const denoEnv = typeof Deno !== 'undefined' ? Deno.env : null` in all _shared modules. | 4 | 3 | **3.6** |

## S7 — Index bloat (auto-create partitions)

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S7.1 | **New partition created WITHOUT index (function body not in repo)** | fn_auto_create_next_partitions lives only in the live DB — index creation UNVERIFIABLE. If skipped: first queries on new month = seq scans; at 5-20M rows, message-list queries go from ms to 1-2s+ -> chat pages stall at each month rollover. | **GAP** | Cannot audit the function; no drift check asserts index parity across partitions. | db-invariants.yml: SQL comparing index set of newest partition vs reference partition; move function body into migrations. | 8 | 6 | **7.1** |
| S7.2 | **Index creation fails mid-cron (name collision/permissions)** | CREATE INDEX without IF NOT EXISTS + stale index name -> exception; partition may exist but index silently absent (error handling unknown — function not in repo). | **GAP** | Error handling of cron function unknown. | CREATE INDEX IF NOT EXISTS with deterministic names; check cron.job_run_details for failures (CRONS.md already tracks health). | 6 | 3 | **4.7** |
| S7.3 | **Only 1 month created ahead; cron missed a month (lock contention)** | If function creates just next month and the 1st-of-month run fails (midnight contention) -> inserts into new month: 'no partition of relation found for row' -> WEBHOOK INGESTION FAILS (messages lost) until manual partition creation. | **GAP** | Failure mode is data loss; recovery is manual. | Create 2 months ahead; default partition or routing trigger; alert if partition count < expected (db-invariants). | 9 | 4 | **6.8** |
| S7.4 | **Mixed index coverage: old partitions indexed, new not** | Older months fast, current month slow -> EXPLAIN shows seq scan on newest partition only -> confusing perf regressions that look like load issues. | **PARCIAL** | No per-partition index monitoring. | Weekly pg_indexes-per-partition parity query; slow-query alert on evolution_messages_% seq scans. | 6 | 3 | **4.7** |
| S7.5 | **Partition bloat from archived partitions not dropped** | archive-old-wpp2-messages (12m) archives rows but partitions accumulate -> catalog bloat, autovacuum overhead on 25+ partitions x 3 tables; ANALYZE drift on old partitions. | **PARCIAL** | Retention policy exists for rows, not partitions. | Partition drop policy (detach+drop after N months) in the same cron; monitor table count. | 4 | 3 | **3.6** |
| S7.6 | **Partition pruning broken by expression in WHERE** | Queries filtering created_at::date or wrapping the key defeat pruning -> ALL 25 partitions scanned -> x25 cost. Multiplies S7.1 impact. | **PARCIAL** | No pruning audit. | EXPLAIN-based pruning check for hot queries in db-invariants; forbid expressions on partition keys in app queries. | 5 | 3 | **4.1** |

## S8 — Concurrent deploys (volume)

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S8.1 | **Two agents deploy DIFFERENT functions while _shared/ changes** | Deploys copy _shared/. Deploy A (new _shared) + deploy B (old _shared tree) interleave -> shared modules torn or downgraded -> functions importing them fail to boot with confusing errors. | **GAP** | No file lock, no staging dir, no atomic tree swap on the volume. | Deploy to staging dir + atomic mv/rsync --delete-after with flock; single-writer policy enforced by CI (deploy queue). | 8 | 5 | **6.7** |
| S8.2 | **Two deploys of the SAME function (torn index.ts)** | Interleaved writes to index.ts -> syntax error -> intermittent 500s; lazy isolates make failures non-deterministic. | **GAP** | No atomic per-file writes. | Deploy script: write .tmp then mv (atomic on same FS); verify md5 after copy; fail deploy on mismatch. | 8 | 4 | **6.2** |
| S8.3 | **Deploy while edge-runtime serves (cached isolates)** | Running isolates keep OLD code; new requests may get old OR new code until restart -> version skew (A new, B old) -> contract mismatches (new function calls RPC old volume lacks). | **PARCIAL** | edge-drift-check catches AFTER deploy; no coordinated restart. | Graceful isolate restart in deploy job; contract tests post-deploy (edge-contract-tests.yml exists). | 7 | 4 | **5.7** |
| S8.4 | **Concurrent deploy + housekeeping prune (exit 255 evidence)** | housekeeping.sh removes 'containers exit 255 de deploys antigos' — deploy in progress while housekeeping prunes -> mid-copy container killed -> torn volume state. | **PARCIAL** | Housekeeping manual; no mutual exclusion with deploys. | Serialize housekeeping and deploys (lock file / fixed schedule); exclude deploy containers from prune by label. | 6 | 4 | **5.1** |
| S8.5 | **Two CI runs with different SHAs (last-writer-wins tree copy)** | Deploy workflow pulls git, copies tree. Two runs -> mixed tree: function A from SHA1, function B from SHA2 -> incompatible pairs -> intermittent 500s. | **GAP** | No version manifest deployed with the tree; no single-writer queue. | Write FUNCTIONS_MANIFEST.json (SHA + per-function md5) into volume; edge-drift-check verifies whole-tree consistency. | 8 | 4 | **6.2** |
| S8.6 | **Manual ssh deploy racing CI deploy** | Operators ssh-ing to copy a single function while CI deploys the full tree -> same torn/shared risks as S8.1, plus no audit trail. | **GAP** | No deploy provenance tracking. | All deploys through CI only; log who/when/SHA; RBAC note in runbooks. | 6 | 3 | **4.7** |

## S9 — HMAC timing / clock skew

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S9.1 | **Correct HMAC + clock skew > 30s (the asked scenario)** | hmac-validation.ts performs NO timestamp/expiry check on any header (verified: zero timestamp validation code). A correct HMAC is valid REGARDLESS of clock skew — request accepted. No break. | **PROTEGIDO** | Clock skew is irrelevant to HMAC validity (stateless signature of payload). | None needed for skew. If a timestamp check is EVER added, include leeway >=5min. | 1 | 4 | **2.4** |
| S9.2 | **Replay of captured webhook (infinite window)** | No timestamp/nonce -> captured valid request replayable FOREVER. Protection relies solely on webhook-idempotency.ts (markEventProcessed). | **PARCIAL** | Replay window unbounded at HMAC layer; idempotency keys may be purged (purge-processed-webhook-events 30 3 * * *). | Add x-evolution-timestamp + window (leeway 5min) + nonce cache for HMAC path; keep idempotency as second layer. | 8 | 4 | **6.2** |
| S9.3 | **Host clock jumps backward (server-side skew)** | Server clock step affects gateway JWT validation (VERIFY_JWT exp/nbf) -> 401 storm for ALL authenticated calls until clock corrected; cron schedules misfire. | **GAP** | No NTP/chrony monitoring; no JWT leeway configured. | Monitor clock offset (chrony stats -> alert >1s); configure JWT leeway (e.g. 30s) in edge-runtime env. | 7 | 3 | **5.2** |
| S9.4 | **A future fix adds timestamp check WITHOUT leeway** | Regression risk: `Date.now() - ts > 30s -> reject` while Evolution's clock drifts -> legitimate webhooks rejected -> message loss. (Today: no such code -> skew harmless.) | **PARCIAL** | No guardrail documenting leeway requirement. | If added: leeway >=5min, alert-only mode first; document in hmac-validation.ts header. | 6 | 2 | **4.2** |
| S9.5 | **Replay after idempotency purge** | Purge job wipes processed-event markers; a replayed old webhook (S9.2) now passes idempotency -> duplicate processing (double send/reply). | **PARCIAL** | Purge retention vs replay window mismatch. | HMAC timestamp window (once added) SHORTER than idempotency retention; alert on duplicate event IDs. | 7 | 3 | **5.2** |
| S9.6 | **Static shared-secret path (Evolution native webhook) is replayable** | x-webhook-secret static bearer — anyone who ever observed the header can replay indefinitely; no per-event signature, no clock check possible. | **GAP** | By design (Evolution native webhook can't sign per-request); no compensating control. | Source-IP allowlist at Traefik for Evolution webhook routes; rotate shared secret regularly; prefer HMAC webhook mode in Evolution config. | 8 | 4 | **6.2** |

## S10 — Rate limit counter overflow

| ID | Cenário | O que quebra | Fix protege? | Gap | Guard adicional | Sev | Lik | Risk |
|----|---------|--------------|--------------|-----|-----------------|-----|-----|------|
| S10.1 | **int4 overflow (as originally feared)** | event_count is BIGINT since S8 fix (20260712000006; confirmed in 20260725000006 comment). If still int4: overflow needs 2^31-1 events in one 60s window = 35.8M events/s per instance — physically unreachable for a WhatsApp webhook pipeline. | **PROTEGIDO** | Overflow mathematically unreachable AND type already bigint. | None (keep bigint; never revert to int4). | 2 | 2 | **2.0** |
| S10.2 | **bigint overflow** | 2^63-1 events per 60s window = 1.5e17 events/s — unreachable by ~14 orders of magnitude. | **PROTEGIDO** | None. | None. | 1 | 1 | **1.0** |
| S10.3 | **Future-dated window_start (client clock jump) breaks reset logic** | Bucket computed client-side (rate-limiter.ts:40 Math.floor(now/60000)*60000). Host clock steps forward -> requests accumulate in a FUTURE bucket that never expires -> counter grows, window reset never fires for real traffic -> rate limiting misapplies. | **PARCIAL** | Server RPC detects expiry only for the bucket it receives; a future bucket never 'expires'. | Compute bucket server-side or validate p_window_start within +/-2min of now() inside the RPC; clamp. | 5 | 3 | **4.1** |
| S10.4 | **Client-supplied p_limit abused (negative/zero)** | p_limit comes from the caller. p_limit=0/negative -> is_allowed always false -> legitimate events 429'd -> events dropped for a victim instance (DoS). RPC succeeds so fail-open never triggers. | **GAP** | Server trusts client limit; no per-event-type server-side cap. | Ignore client p_limit: look up per-(event_type, instance) configured limit server-side; clamp p_limit to [1, 1e6]. | 8 | 3 | **5.8** |
| S10.5 | **Counter table row bloat / purge gap** | One row per (instance,event_type,window_start): 80 instances x ~10 types x 1440 windows/day ~= 1.1M rows/day. cleanup-rate-limit-logs exists; if schedule/retention drifts -> table grows -> insert contention on hot rows -> lock waits -> RPC_TIMEOUT -> fail-open. | **PARCIAL** | Purge exists but no size alert. | Monitor table size (size-snapshot cron 63); alert >2GB; index on (window_start) for purge efficiency. | 6 | 3 | **4.7** |
| S10.6 | **event_count+1 overflow inside ON CONFLICT DO UPDATE** | Overflow raises -> RPC error -> rate-limiter fail-open -> limit bypassed. Only reachable at int4; bigint makes it unreachable (this WAS the pre-S8 risk). | **PROTEGIDO** | S8 already converted to bigint (verified in migration archive comments). | Regression test asserting column type bigint in db-invariants.yml. | 3 | 2 | **2.6** |

---

## Gaps cross-cutting (não cobertos pelos 10 fixes)

| ID | Gap | Impacto | Guard recomendado | Sev | Lik | Risk |
|----|-----|---------|-------------------|-----|-----|------|
| G1 | **ai_usage_logs writes are fire-and-forget with NO retry/DLQ** | logAiUsage swallows all errors (by design — never break main flow). Under DB pressure/RLS misconfig, token-usage accounting silently vanishes -> billing/metrics drift with no visibility. | In-memory retry (1 retry, 500ms) or durable local queue; alert on consecutive failures (module counter). | 6 | 4 | **5.1** |
| G2 | **No deploy provenance / audit for volume writes** | Volume contents already drifted (external-db-proxy v1.10 volume vs v1.11 repo — audit P2). No record of WHO deployed WHAT SHA. | Deploy-only-via-CI + manifest (S8.5) + SHA in GitHub Actions; extend edge-drift-check to ALL functions, not 8 critical. | 7 | 5 | **6.1** |
| G3 | **Secret rotation patterns inconsistent: webhooks have multi-secret rotation; outbound API keys (DeepSeek/Evolution) do NOT** | hmac-validation.ts supports [new,old]; DEEPSEEK_API_KEY/EVOLUTION_API_KEY are single-value -> rotation requires a deploy window (S2.1/S2.2). | Adopt dual-key support in ai-proxy (env DEEPSEEK_API_KEYS=new,old) mirroring WebhookSecurityService pattern. | 7 | 4 | **5.7** |
| G4 | **Rate-limiter fail-open is silent to ops** | Every fail-open path logs console.warn — if Sentry capture isn't wired for these, a limiter-disabled incident (S3.2/S3.3/S10.5) goes unnoticed while protection is down. | Wire [rate-limiter] warns to Sentry (sentry.ts exists) + alert on fail-open count > 5/min. | 6 | 4 | **5.1** |
| G5 | **rpc_get_contact guard = authentication, not authorization** | Any logged-in user can still dump any contact (S4.4). The P1 data-exposure class is only partially closed. | Workspace-membership filter inside both overloads or replace frontend fallbacks with RLS-safe views; re-audit. | 8 | 5 | **6.7** |
| G6 | **esm.sh is a supply-chain + availability SPOF for ALL edge functions** | Every function imports from esm.sh; registry incident or compromised package version affects the whole runtime (S1.5/S1.6). | Pin exact versions (done @2.87.1) + vendor critical deps; enforce deno.lock with --frozen lockfile in CI. | 7 | 3 | **5.2** |
| G7 | **HMAC layer has no replay protection at all (S9.2/S9.5/S9.6)** | Correct-HMAC requests are valid forever; only idempotency + purge schedule stand between a replay and duplicate processing. | Timestamp + nonce; source-IP pinning for Evolution routes; rotate static shared secrets. | 8 | 4 | **6.2** |
| G8 | **Partition lifecycle is a black box (S7.1/S7.3)** | fn_auto_create_next_partitions exists only in the live DB; no repo copy, no index-parity check, no partition-count alert. Month rollover = single highest-impact recurring event. | Move body into migrations; db-invariants: partition count per table, index parity, newest-partition exists. | 9 | 5 | **7.2** |
| G9 | **Concurrent deploy windows are unguarded (S8.1-S8.6)** | No lock/atomicity/provenance on the functions volume; CI + manual ssh can interleave. | flock-based deploy script, staging dir + atomic mv, CI-only deploys, manifest verification. | 8 | 4 | **6.2** |
| G10 | **Migration runner has no advisory-lock serialization (S3.4)** | Two migration executions can deadlock (REVOKE vs CREATE OR REPLACE); deadlock_timeout=1s aborts one -> partial state. | pg_advisory_lock around migration runner + CI gate 'one migration job at a time'. | 6 | 3 | **4.7** |

---

## Ações prioritárias (top 5)

1. **Aplicar F2/F5** — montar secrets no serviço + entrypoint fail-fast (`test -s` + `tr -d '\r\n'`) e remover plaintext env (P1 exposure hoje).

2. **F7/G8** — trazer `fn_auto_create_next_partitions` para o repo + db-invariants: paridade de índices entre partições e alerta de partição faltante (rollover mensal = maior risco recorrente).

3. **S6.1** — CI gate `grep process\.env supabase/functions/` (regressão Lovable, custo ~zero).

4. **S4.4/G5** — rpc_get_contact: guard de autenticação → autorização (workspace membership); exempt explícito de service_role (S4.5) para não quebrar edges.

5. **S9.2/G7** — timestamp + nonce no HMAC (leeway 5min) e pin de source-IP para webhooks Evolution.


*Gerado por simulação Python determinística. Evidências: ai-usage.ts, rate-limiter.ts, hmac-validation.ts, migrations 20260704210700/20260712000006/20260725000006/20260803182053, docs/infra/2026-08-03_docker_secrets_migration.md, .hermes/security-auth-audit-2026-08-03.md, docs/db/CRONS.md.*
