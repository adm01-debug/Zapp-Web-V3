/**
 * evolution-group-sync — testes unitários do núcleo (normalizeParticipant +
 * processGroups com RPC fake). Sem rede/DB: roda em CI com qualquer env.
 *
 * Rodar: deno test evolution-group-sync/__tests__/groups-sync.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeParticipant, processGroups, type GroupUpsertParams } from "../index.ts";

// ─── normalizeParticipant ───────────────────────────────────────────────────

Deno.test("normalizeParticipant: string direta passa limpa", () => {
  assertEquals(normalizeParticipant("5511999998888@c.us"), "5511999998888@c.us");
});

Deno.test("normalizeParticipant: string com espaços é trimada", () => {
  assertEquals(normalizeParticipant("  5511999998888@c.us  "), "5511999998888@c.us");
});

Deno.test("normalizeParticipant: string vazia → null", () => {
  assertEquals(normalizeParticipant("   "), null);
  assertEquals(normalizeParticipant(""), null);
});

Deno.test("normalizeParticipant: objeto { id } (formato getParticipants=true)", () => {
  assertEquals(normalizeParticipant({ id: "5511999998888@c.us" }), "5511999998888@c.us");
  assertEquals(normalizeParticipant({ id: " 5511999998888@c.us " }), "5511999998888@c.us");
});

Deno.test("normalizeParticipant: objetos sem id / id não-string / null / número → null", () => {
  assertEquals(normalizeParticipant({}), null);
  assertEquals(normalizeParticipant({ id: "" }), null);
  assertEquals(normalizeParticipant({ id: 123 }), null);
  assertEquals(normalizeParticipant(null), null);
  assertEquals(normalizeParticipant(42), null);
  assertEquals(normalizeParticipant(["x"]), null);
});

// ─── processGroups ──────────────────────────────────────────────────────────

const CONN_ID = "11111111-1111-1111-1111-111111111111";

function fakeRpc(results: Array<{ error: { message: string } | null }>) {
  const calls: GroupUpsertParams[] = [];
  const fn = (params: GroupUpsertParams) => {
    calls.push(params);
    return results[Math.min(calls.length - 1, results.length - 1)];
  };
  return { fn, calls };
}

Deno.test("processGroups: sucesso total — participantes string e {id} mapeados", async () => {
  const { fn, calls } = fakeRpc([{ error: null }, { error: null }]);
  const groups = [
    {
      id: "g1@newsletter",
      subject: "Grupo Teste",
      desc: "descrição",
      participants: ["5511999998888@c.us", { id: "5521988887777@c.us" }, { id: "" }, "  "],
    },
    { id: "g2@newsletter", subject: "Sem participantes" },
  ];

  const stats = await processGroups(groups, fn, CONN_ID, "wpp2");

  assertEquals(stats, { fetched: 2, upserted: 2, errors: 0, primeiro_erro: null });
  assertEquals(calls.length, 2);
  assertEquals(calls[0], {
    p_connection_id: CONN_ID,
    p_group_id: "g1@newsletter",
    p_name: "Grupo Teste",
    p_desc: "descrição",
    p_participants: ["5511999998888@c.us", "5521988887777@c.us"],
    p_instance: "wpp2",
  });
  assertEquals(calls[1].p_participants, []);
});

Deno.test("processGroups: fallback desc → description; name vazio vira ''", async () => {
  const { fn, calls } = fakeRpc([{ error: null }]);
  await processGroups(
    [{ id: "g1", description: "via description" }],
    fn, CONN_ID, "wpp2",
  );
  assertEquals(calls[0].p_desc, "via description");
  assertEquals(calls[0].p_name, "");
});

Deno.test("processGroups: erro de RPC é contado sem derrubar o lote; primeiro_erro preserva o 1º", async () => {
  const { fn } = fakeRpc([
    { error: { message: "falha rpc" } },
    { error: null },
    { error: { message: "outra falha" } },
  ]);
  const groups = [
    { id: "g1" },
    { id: "g2" },
    { id: "g3" },
  ];

  const stats = await processGroups(groups, fn, CONN_ID, "wpp2");

  assertEquals(stats.upserted, 1);
  assertEquals(stats.errors, 2);
  assertEquals(stats.primeiro_erro, "RPC zapp_upsert_group_from_event(g1): falha rpc");
});

Deno.test("processGroups: grupo sem id vira erro (sem chamar RPC)", async () => {
  const { fn, calls } = fakeRpc([{ error: null }]);
  const stats = await processGroups([{ subject: "sem id" }, { id: "g2" }], fn, CONN_ID, "wpp2");

  assertEquals(stats, { fetched: 2, upserted: 1, errors: 1, primeiro_erro: "grupo sem campo 'id'" });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].p_group_id, "g2");
});

Deno.test("processGroups: exceção na RPC é capturada (erro isolado)", async () => {
  const throwing = () => {
    throw new Error("boom");
  };
  const stats = await processGroups([{ id: "g1" }], throwing, CONN_ID, "wpp2");
  assertEquals(stats.errors, 1);
  assertEquals(stats.primeiro_erro, "boom");
});

Deno.test("processGroups: lista vazia → zeros sem chamadas", async () => {
  const { fn, calls } = fakeRpc([{ error: null }]);
  const stats = await processGroups([], fn, CONN_ID, "wpp2");
  assertEquals(stats, { fetched: 0, upserted: 0, errors: 0, primeiro_erro: null });
  assertEquals(calls.length, 0);
});
