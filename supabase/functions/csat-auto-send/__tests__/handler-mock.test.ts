// csat-auto-send — behavioral contract tests (handler REAL via Deno.serve stub + fetch mock, sem rede/DB).
// Rodar: deno test --allow-read --allow-env supabase/functions/csat-auto-send/__tests__/handler-mock.test.ts
//
// NOTA 2026-08-17: index.ts foi reescrito para v2.0 (SIM-CSAT E2, G2-G8) por worker
// concorrente DURANTE esta tarefa — o contrato testado é o v2.0 ATUAL:
//  - Envio: NÃO enfileira mais em evolution_message_queue (G2: fila sem consumidor).
//    Insere csat_surveys { status:'scheduled', send_at, message_text } — o envio real
//    via evolutionClient.sendText acontece na edge csat-dispatch (spec conferida).
//  - Dedup: survey já existente para conversation_id OU cooldown 30d por contato →
//    { success:false, reason:"already_surveyed" } (spec: "não reenvia para conversation_id já com survey").
//  - LGPD guard REAL (G7): consent_status === "opt_out" → { success:false, reason:"lgpd_opt_out" },
//    sem insert. Plus: 401 sem JWT válido (zero tabelas consultadas) e respostas sem PII.
import { assertEquals } from "jsr:@std/assert";
type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", { value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; }, writable: true, configurable: true });
const UUID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";
const SURVEY_ID = "7c9e4b2a-1f3d-4e5a-9b8c-0d1e2f3a4b5c";
for (const [k, v] of Object.entries({ SELFHOSTED_SUPABASE_URL: "http://mock.local", SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-key" })) Deno.env.set(k, v);
const J = { "content-type": "application/json" };
const Jres = (body: string, status = 200) => new Response(body, { status, headers: J });
// ── estado do mock PostgREST ──────────────────────────────────────────────────
let config: Record<string, unknown> | null = null;
let contact: Record<string, unknown> | null = null;
let existingSurvey: { id: string; conversation_id: string | null } | null = null; // dedup GET csat_surveys
const surveyInserts: Array<Record<string, unknown>> = [];
const touched: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const p = new URL(String(input)).pathname;
  const m = init?.method ?? "GET";
  const b = init?.body ? JSON.parse(String(init.body)) : null;
  touched.push(`${m} ${p}`);
  if (p.endsWith("/csat_auto_config")) return Jres(JSON.stringify(config ? [config] : []));
  if (p.endsWith("/contacts")) return Jres(JSON.stringify(contact ? [contact] : []));
  if (p.endsWith("/csat_surveys") && m === "GET") {
    // simula filtro do handler: .or("conversation_id.eq.X,...") quando há conversa; cooldown 30d sem conversa
    const or = new URL(String(input)).searchParams.get("or") ?? "";
    const reqConv = or.match(/conversation_id\.eq\.([^,\)]+)/)?.[1] ?? null;
    return Jres(JSON.stringify(existingSurvey && existingSurvey.conversation_id === reqConv ? [existingSurvey] : []));
  }
  if (p.endsWith("/csat_surveys") && m === "POST") { surveyInserts.push(b as Record<string, unknown>); return Jres(JSON.stringify({ id: SURVEY_ID, send_at: null }), 201); } // insert+select+maybeSingle: objeto bare (Accept vnd.pgrst.object+json)
  if (p.endsWith("/whatsapp_connections")) return Jres(JSON.stringify([{ instance_name: "wpp1" }]));
  return Jres("[]");
}) as typeof fetch;
await import("../index.ts");
// ── helpers ───────────────────────────────────────────────────────────────────
const b64u = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const JWT = (role: string) => `h.${b64u({ sub: UUID, role })}.s`;
const reset = () => { config = null; contact = null; existingSurvey = null; surveyInserts.length = 0; touched.length = 0; };
const call = (body: unknown, jwt?: string) => h(new Request("http://mock.local/csat-auto-send", {
  method: "POST", body: JSON.stringify(body), headers: { ...J, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
}));
const ENABLED: Record<string, unknown> = { is_enabled: true, message_template: "Olá {nome}, avalie o atendimento {{outro}}", delay_minutes: 5, whatsapp_connection_id: UUID };
const CONTACT: Record<string, unknown> = { phone: "+55 (11) 99999-9999", name: "Maria da Silva", consent_status: "active" };
const BODY = { contact_id: UUID, connection_id: UUID };

// ─── 1. LGPD guard (auth): sem JWT válido → 401, ZERO tabelas consultadas ────
Deno.test("csat-auto-send: sem JWT → 401 sem tocar em nenhuma tabela (PII intocada)", async () => {
  reset();
  const res = await call(BODY);
  assertEquals(res.status, 401);
  assertEquals(touched.length, 0);
  assertEquals(surveyInserts.length, 0);
});
Deno.test("csat-auto-send: JWT role=anon → 401 (anon não passa o guard)", async () => {
  reset();
  assertEquals((await call(BODY, JWT("anon"))).status, 401);
  assertEquals(touched.length, 0);
});

// ─── 2. Config desabilitada → csat_disabled, sem envio e sem PII do contato ──
Deno.test("csat-auto-send: config desabilitada → {success:false, reason:csat_disabled}, sem consultar contato nem inserir survey", async () => {
  reset();
  config = { ...ENABLED, is_enabled: false };
  const res = await call(BODY, JWT("authenticated"));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: false, reason: "csat_disabled" });
  assertEquals(surveyInserts.length, 0);
  assertEquals(touched.some((t) => t.includes("/contacts")), false); // LGPD: PII não consultada
  assertEquals(touched.some((t) => t.includes("/csat_surveys")), false);
});

// ─── 3. LGPD guard (consentimento): opt_out → lgpd_opt_out, sem insert ───────
Deno.test("csat-auto-send: LGPD — consent_status=opt_out → {success:false, reason:lgpd_opt_out}, sem inserir survey", async () => {
  reset();
  config = { ...ENABLED };
  contact = { ...CONTACT, consent_status: "opt_out" };
  const res = await call(BODY, JWT("authenticated"));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: false, reason: "lgpd_opt_out" });
  assertEquals(surveyInserts.length, 0);
  assertEquals(touched.some((t) => t.startsWith("POST") && t.includes("/csat_surveys")), false);
});

// ─── 4. Contato sem phone → 404 (G5: fetch ANTES do insert — sem survey órfão) ──
Deno.test("csat-auto-send: contato sem phone → 404 {reason:contact_without_phone}, sem insert e sem ecoar PII", async () => {
  reset();
  config = { ...ENABLED };
  contact = { phone: null, name: "João Sem Telefone", consent_status: "active" };
  const res = await call(BODY, JWT("authenticated"));
  assertEquals(res.status, 404);
  const text = await res.text(); // corpo consumido UMA vez (json+text no mesmo Response = TypeError)
  assertEquals(JSON.parse(text), { success: false, reason: "contact_without_phone" });
  assertEquals(surveyInserts.length, 0);
  assertEquals(text.includes("João"), false); // LGPD: nome não vaza
});

// ─── 5. Habilitada → agenda survey (envio via csat-dispatch) com {nome} renderizado ──
Deno.test("csat-auto-send: habilitada → insere csat_surveys status=scheduled com {nome} renderizado e send_at futuro (dispatch envia)", async () => {
  reset();
  config = { ...ENABLED };
  contact = { ...CONTACT };
  const res = await call({ ...BODY, agent_id: UUID, conversation_id: "4f5a6b7c-8d9e-4f0a-b1c2-d3e4f5a6b7c8" }, JWT("authenticated"));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.survey_id, SURVEY_ID);
  assertEquals(body.instance_name, "wpp1");
  assertEquals(new Date(body.send_at).getTime() > Date.now() - 1000, true); // delay 5min da config
  assertEquals(surveyInserts.length, 1);
  const s = surveyInserts[0];
  assertEquals(s.message_text, "Olá Maria, avalie o atendimento"); // {nome}→Maria, token desconhecido removido
  assertEquals(s.status, "scheduled");
  assertEquals(s.send_at, body.send_at);
  assertEquals(s.whatsapp_connection_id, UUID);
  assertEquals(s.contact_id, UUID);
  assertEquals(s.agent_id, UUID);
  assertEquals(s.conversation_id, "4f5a6b7c-8d9e-4f0a-b1c2-d3e4f5a6b7c8");
  assertEquals(touched.some((t) => t.includes("evolution_message_queue")), false); // G2: NÃO enfileira mais
  assertEquals("phone" in body, false); // LGPD: resposta sem PII
  assertEquals("name" in body, false);
});

// ─── 6. Dedup: conversation_id já com survey → already_surveyed, sem novo insert ──
Deno.test("csat-auto-send: dedup — conversation_id já com survey → {success:false, reason:already_surveyed}, sem novo insert", async () => {
  reset();
  config = { ...ENABLED };
  contact = { ...CONTACT };
  existingSurvey = { id: "s-1", conversation_id: "4f5a6b7c-8d9e-4f0a-b1c2-d3e4f5a6b7c8" };
  const res = await call({ ...BODY, conversation_id: "4f5a6b7c-8d9e-4f0a-b1c2-d3e4f5a6b7c8" }, JWT("authenticated"));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: false, reason: "already_surveyed", survey_id: "s-1" });
  assertEquals(surveyInserts.length, 0);
});
Deno.test("csat-auto-send: dedup — outra conversa não colide → agenda normalmente", async () => {
  reset();
  config = { ...ENABLED };
  contact = { ...CONTACT };
  existingSurvey = { id: "s-1", conversation_id: "4f5a6b7c-8d9e-4f0a-b1c2-d3e4f5a6b7c8" };
  const res = await call({ ...BODY, conversation_id: "9a8b7c6d-5e4f-4a3b-9c2d-1e2f3a4b5c6d" }, JWT("authenticated"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).success, true);
  assertEquals(surveyInserts.length, 1);
});
Deno.test("csat-auto-send: dedup — cooldown 30d por contato (sem conversa) → already_surveyed", async () => {
  reset();
  config = { ...ENABLED };
  contact = { ...CONTACT };
  existingSurvey = { id: "s-1", conversation_id: null }; // sem conversa: mock casa o caminho cooldown
  const res = await call(BODY, JWT("authenticated"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).reason, "already_surveyed");
  assertEquals(surveyInserts.length, 0);
});
