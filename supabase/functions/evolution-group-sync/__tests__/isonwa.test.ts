/**
 * evolution-group-sync — testes unitários do handleIsonwa (fila IsOnWhatsApp
 * vs Evolution API) com fetch mock + cliente supabase fake. Sem rede/DB.
 *
 * Foco do fix LID (2026-08-12): quando a API retorna jid @lid (fix #2544 da
 * rc2), o PN original é casado POR ÍNDICE (okJids) e a identidade LID→PN é
 * persistida via zapp.fn_upsert_lid_identity (best-effort — erro isolado não
 * derruba o lote).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read evolution-group-sync/__tests__/isonwa.test.ts
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { createZappAdminClient } from "../../_shared/db-client.ts";
import { handleIsonwa } from "../index.ts";

type ZappClient = ReturnType<typeof createZappAdminClient>;

interface RpcCall {
  fn: string;
  args: unknown;
}

/** Supabase fake: grava chamadas e delega o resultado ao handler. */
function fakeSupabase(
  handler: (fn: string, args: unknown) => { data?: unknown; error?: { message: string } | null },
) {
  const calls: RpcCall[] = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve(handler(fn, args));
    },
  };
  return { client: client as unknown as ZappClient, calls };
}

/** Mock de fetch: responde o array passado, alinhado por índice ao request. */
async function withFetchMock(apiResult: Array<{ jid?: string; exists?: boolean }>, fn: () => Promise<void>) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(apiResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
  try {
    // `await` aqui é obrigatório: sem ele o finally restaura o fetch real
    // antes do handler terminar (o fetch da API voltaria a ser o real).
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

const PN1 = "5511999998888@s.whatsapp.net";
const PN2 = "5521988887777@s.whatsapp.net";
const PN3 = "5531888886666@s.whatsapp.net";
const CORS: Record<string, string> = {};

function okRpc(): { data?: unknown; error?: { message: string } | null } {
  return { data: null, error: null };
}

// ─── @lid: match por índice + upsert de identidade LID ─────────────────────

Deno.test("handleIsonwa: API retorna @lid → okJids por índice + fn_upsert_lid_identity chamada", async () => {
  const { client, calls } = fakeSupabase((fn) => {
    if (fn === "zapp_isonwa_pull") return { data: [{ remote_jid: PN1 }, { remote_jid: PN2 }], error: null };
    return okRpc();
  });
  const apiResult = [
    { jid: "10000000000001@lid", exists: true },
    { jid: "10000000000002@lid", exists: true },
  ];

  await withFetchMock(apiResult, async () => {
    const res = await handleIsonwa(client, CORS, "token-x", "wpp2", 10);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.checked, 2);
    assertEquals(body.on_whatsapp, 2);
    assertEquals(body.not_found, 0);
  });

  // mark: p_ok_jids com os PNs ORIGINAIS (não os @lid)
  const mark = calls.find((c) => c.fn === "zapp_isonwa_mark");
  assert(mark, "zapp_isonwa_mark deve ser chamada");
  assertEquals(mark.args, {
    p_jids: [PN1, PN2],
    p_ok_jids: [PN1, PN2],
  });

  // upsert de identidade LID→PN, um por item @lid, com payload do item
  const lids = calls.filter((c) => c.fn === "fn_upsert_lid_identity");
  assertEquals(lids.length, 2);
  assertEquals(lids[0].args, {
    p_lid_jid: "10000000000001@lid",
    p_pn_jid: PN1,
    p_phone_number: "5511999998888",
    p_confidence: "high",
    p_source: "usync",
    p_raw: { jid: "10000000000001@lid", exists: true },
  });
  assertEquals(lids[1].args, {
    p_lid_jid: "10000000000002@lid",
    p_pn_jid: PN2,
    p_phone_number: "5521988887777",
    p_confidence: "high",
    p_source: "usync",
    p_raw: { jid: "10000000000002@lid", exists: true },
  });
});

Deno.test("handleIsonwa: misto @lid + jid normal + não-existente → só existentes no okJids", async () => {
  const { client, calls } = fakeSupabase((fn) => {
    if (fn === "zapp_isonwa_pull") {
      return { data: [{ remote_jid: PN1 }, { remote_jid: PN2 }, { remote_jid: PN3 }], error: null };
    }
    return okRpc();
  });
  const apiResult = [
    { jid: "10000000000001@lid", exists: true },
    { jid: PN2, exists: true },
    { jid: "10000000000003@lid", exists: false },
  ];

  await withFetchMock(apiResult, async () => {
    const res = await handleIsonwa(client, CORS, "token-x", "wpp2", 10);
    const body = await res.json();
    assertEquals(body.on_whatsapp, 2);
    assertEquals(body.not_found, 1);
  });

  const mark = calls.find((c) => c.fn === "zapp_isonwa_mark");
  assert(mark);
  assertEquals(mark.args, { p_jids: [PN1, PN2, PN3], p_ok_jids: [PN1, PN2] });
  // upsert LID apenas para o item @lid com exists=true
  const lids = calls.filter((c) => c.fn === "fn_upsert_lid_identity");
  assertEquals(lids.length, 1);
  assertEquals((lids[0].args as { p_pn_jid: string }).p_pn_jid, PN1);
});

// ─── isolamento de erro ────────────────────────────────────────────────────

Deno.test("handleIsonwa: erro na fn_upsert_lid_identity não derruba o lote", async () => {
  const { client, calls } = fakeSupabase((fn) => {
    if (fn === "zapp_isonwa_pull") return { data: [{ remote_jid: PN1 }], error: null };
    if (fn === "fn_upsert_lid_identity") return { data: null, error: { message: "boom lid" } };
    return okRpc();
  });
  const apiResult = [{ jid: "10000000000001@lid", exists: true }];

  await withFetchMock(apiResult, async () => {
    const res = await handleIsonwa(client, CORS, "token-x", "wpp2", 10);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.on_whatsapp, 1);
    assertEquals(body.errors, 0);
  });

  const mark = calls.find((c) => c.fn === "zapp_isonwa_mark");
  assert(mark);
  assertEquals(mark.args, { p_jids: [PN1], p_ok_jids: [PN1] });
});

Deno.test("handleIsonwa: exceção na fn_upsert_lid_identity também não derruba o lote", async () => {
  const { client, calls } = fakeSupabase((fn) => {
    if (fn === "zapp_isonwa_pull") return { data: [{ remote_jid: PN1 }], error: null };
    if (fn === "fn_upsert_lid_identity") throw new Error("explode");
    return okRpc();
  });
  const apiResult = [{ jid: "10000000000001@lid", exists: true }];

  await withFetchMock(apiResult, async () => {
    const res = await handleIsonwa(client, CORS, "token-x", "wpp2", 10);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.on_whatsapp, 1);
  });

  const mark = calls.find((c) => c.fn === "zapp_isonwa_mark");
  assert(mark);
  assertEquals((mark.args as { p_ok_jids: string[] }).p_ok_jids, [PN1]);
});

// ─── regressão: jids normais (sem @lid) ────────────────────────────────────

Deno.test("handleIsonwa: jids normais continuam casados por índice (regressão)", async () => {
  const { client, calls } = fakeSupabase((fn) => {
    if (fn === "zapp_isonwa_pull") {
      return { data: [{ remote_jid: PN1 }, { remote_jid: PN2 }], error: null };
    }
    return okRpc();
  });
  const apiResult = [
    { jid: PN1, exists: true },
    { jid: PN2, exists: false },
  ];

  await withFetchMock(apiResult, async () => {
    const res = await handleIsonwa(client, CORS, "token-x", "wpp2", 10);
    const body = await res.json();
    assertEquals(body.on_whatsapp, 1);
    assertEquals(body.not_found, 1);
  });

  const mark = calls.find((c) => c.fn === "zapp_isonwa_mark");
  assert(mark);
  assertEquals(mark.args, { p_jids: [PN1, PN2], p_ok_jids: [PN1] });
  // sem @lid → nenhuma chamada de upsert de identidade
  assertEquals(calls.filter((c) => c.fn === "fn_upsert_lid_identity").length, 0);
});
