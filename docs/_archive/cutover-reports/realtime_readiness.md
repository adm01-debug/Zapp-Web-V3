# Realtime cutover readiness (self-hosted) - 2026-06-30

**VERDICT: realtime is ready.** Live chat (insert + update + delete) will
deliver after cutover. No DB change required. One frontend note below.

## Why it works end-to-end
- `evo.evolution_messages` and `evo.evolution_conversations` are LIST-PARTITIONED
  by instance/department (artes, comercial_01..15, compras, financeiro,
  gravacao, logistica, marketing, default, wpp2, wpp_pink_test).
- Publication `supabase_realtime` has `publish_via_partition_root = true` and the
  PARENT tables are published -> changes in every partition roll up to the
  parent, so a subscription on `evo.evolution_messages` receives events from ALL
  departments (not just wpp2).
- Events enabled on the publication: insert + update + delete + truncate.
- UPDATE/DELETE old-row identity: with `pubviaroot=true` the ROOT's replica
  identity governs. Both parents are `replica identity default` AND have a
  PRIMARY KEY `(id, instance_name)` -> UPDATE/DELETE events carry that key.
  Verified.
- The other 26 published tables: 25 `default(pk)` + 1 `full`, all with a PK.

## Frontend note for the realtime repoint (fold into the code PR)
The PK of messages/conversations is **COMPOSITE**: `(id, instance_name)`. The
realtime payload's `old` record on UPDATE/DELETE carries both. The subscription
handler must match rows on the composite key `(id, instance_name)`, NOT on `id`
alone, or it will update/remove the wrong row (ids can repeat across instances).
This is in addition to the raw-evo-columns -> UI mapping the handler already
needs (realtime payload = raw table columns, not the public view shape).

## Net
Realtime needs nothing changed in the DB for cutover. Only the frontend
composite-key matching note above.
