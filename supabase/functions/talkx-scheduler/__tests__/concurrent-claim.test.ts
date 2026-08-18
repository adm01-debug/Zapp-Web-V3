// talkx-scheduler — CLAIM ATÔMICO sob concorrência (teste de validação E61/E62).
// Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/talkx-scheduler/__tests__/concurrent-claim.test.ts
//
// Prova o contrato de atomicidade do claim: 2 invocações CONCORRENTES do
// scheduler (pg_cron pode sobrepor ticks / retries) disputam a MESMA campanha
// e exatamente UMA vence. O mock do PostgREST emula o banco real: o PATCH
// condicional (id + status=eq.scheduled) é atômico (single-threaded) e devolve
// Content-Range */1 (claimou) ou */0 (já claimada). Com o claim QUEBRADO
// (padrão antigo `.select("id", { count, head })` → count sempre undefined →
// `!claimed` sempre verdadeiro → campanha NUNCA claimada), este teste fica RED:
// started=0 e ZERO dispatches — o mesmo sintoma do bug E61 em produção.
import { assertEquals, assert } from "jsr:@std/assert";

type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", {
  value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; },
  writable: true,
  configurable: true,
});

// ── env (escopo de módulo, ANTES do import do index.ts) ──────────────────────
const SUPABASE_URL = "http://mock.local";
const SERVICE_KEY = "svc-test-key-1234567890abcdef";
const CRON_SECRET = "cron-test-secret";
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: SUPABASE_URL,
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  CRON_SECRET,
  EVOLUTION_API_URL: "http://evo.mock",
  EVOLUTION_API_KEY: "evo-key",
})) Deno.env.set(k, v);

const J = { "content-type": "application/json" };
const Jres = (body: string, status = 200) => new Response(body, { status, headers: J });

// ── "Banco" compartilhado entre as invocações concorrentes ───────────────────
// status por campanha; o PATCH de claim é ATÔMICO no mock (uma única volta do
// event loop): primeira atualização vence, as seguintes veem status != scheduled.
type DbRow = { id: string; name: string; scheduled_at: string; status: string };
let db: Map<string, DbRow> = new Map();
const dispatches: string[] = []; // campaignIds enviados ao talkx-send
const claimPatches: Array<{ id: string; allParams: string }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";

  if (url.pathname.endsWith("/functions/v1/talkx-send")) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    dispatches.push(body?.campaignId);
    return Jres(JSON.stringify({ success: true, sent: 1 }));
  }

  if (url.pathname.endsWith("/rest/v1/talkx_campaigns")) {
    if (method === "GET") {
      // status=eq.scheduled + scheduled_at=lte.<now> → lista vencidas do "banco"
      const rows = [...db.values()].filter((r) => r.status === "scheduled");
      return Jres(JSON.stringify(rows));
    }
    if (method === "PATCH") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      const statusFilter = url.searchParams.get("status") ?? "";
      const row = db.get(id);
      claimPatches.push({ id, allParams: url.search });
      const claimed = row !== undefined && row.status === "scheduled" && statusFilter === "eq.scheduled";
      if (claimed) {
        row!.status = "processing";
        return new Response(null, { status: 204, headers: { "content-range": "*/1" } });
      }
      return new Response(null, { status: 204, headers: { "content-range": "*/0" } });
    }
  }
  return Jres("[]");
}) as typeof fetch;

await import("../index.ts");

const reset = (rows: DbRow[]) => {
  db = new Map(rows.map((r) => [r.id, { ...r }]));
  dispatches.length = 0;
  claimPatches.length = 0;
};

const cronCall = () =>
  h(new Request("http://mock.local/functions/v1/talkx-scheduler", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { ...J, "x-cron-secret": CRON_SECRET },
  }));

const dueRow = (id: string, name: string, scheduled_at = "2026-08-18T10:00:00.000Z"): DbRow =>
  ({ id, name, scheduled_at, status: "scheduled" });

// ─── 1. Duas invocações concorrentes, 1 campanha → exatamente 1 claim + 1 dispatch ──
Deno.test("claim atômico: 2 schedulers concorrentes na MESMA campanha → 1 claim, 1 dispatch, 0 duplicado", async () => {
  reset([dueRow("c-1", "Campanha 1")]);
  const [r1, r2] = await Promise.all([cronCall(), cronCall()]);
  const j1 = await r1.json();
  const j2 = await r2.json();

  // agregado das duas invocações: 1 campanha iniciada, 0 falhas, 1 dispatch
  const startedTotal = (j1.started ?? 0) + (j2.started ?? 0);
  const failedTotal = (j1.failed ?? 0) + (j2.failed ?? 0);
  assertEquals(startedTotal, 1, "exatamente UMA invocação deve claimar e iniciar a campanha");
  assertEquals(failedTotal, 0);
  assertEquals(dispatches.length, 1, "talkx-send deve ser chamado exatamente 1x (sem envio duplicado)");
  assertEquals(dispatches[0], "c-1");
  // claim condicional: filtro id + status=eq.scheduled em AMBAS as tentativas
  assertEquals(claimPatches.length, 2, "ambas as invocações tentam o claim");
  for (const p of claimPatches) {
    assert(p.allParams.includes("id=eq.c-1"), "claim filtrado por id");
    assert(p.allParams.includes("status=eq.scheduled"), "claim condicionado a status=scheduled (atômico)");
  }
});

// ─── 2. Duas invocações concorrentes, 3 campanhas → cada campanha exatamente 1x ──
Deno.test("claim atômico: 2 schedulers × 3 campanhas → cada campanha claimada/disparada exatamente 1x", async () => {
  reset([
    dueRow("c-1", "C1", "2026-08-18T10:00:00.000Z"),
    dueRow("c-2", "C2", "2026-08-18T10:01:00.000Z"),
    dueRow("c-3", "C3", "2026-08-18T10:02:00.000Z"),
  ]);
  const [r1, r2] = await Promise.all([cronCall(), cronCall()]);
  const j1 = await r1.json();
  const j2 = await r2.json();

  assertEquals((j1.started ?? 0) + (j2.started ?? 0), 3, "3 campanhas iniciadas no total");
  assertEquals(dispatches.length, 3, "3 dispatches no total");
  // sem dispatch duplicado por campanha
  const seen = new Set<string>();
  for (const cid of dispatches) {
    assert(!seen.has(cid), `campanha ${cid} disparada 2x (double-send)`);
    seen.add(cid);
  }
  assertEquals(seen.size, 3);
});

// ─── 3. Terceira invocação após 2 concorrentes → nada a claimar (estado final íntegro) ──
Deno.test("claim atômico: invocação posterior não re-dispara campanha já 'processing'", async () => {
  reset([dueRow("c-1", "Campanha 1")]);
  await Promise.all([cronCall(), cronCall()]);
  dispatches.length = 0; // zera o histórico das 2 primeiras
  const r3 = await cronCall();
  const j3 = await r3.json();
  assertEquals(j3.started ?? 0, 0, "campanha em processing não é re-claimada");
  assertEquals(dispatches.length, 0, "sem novo dispatch para campanha em processing");
});
