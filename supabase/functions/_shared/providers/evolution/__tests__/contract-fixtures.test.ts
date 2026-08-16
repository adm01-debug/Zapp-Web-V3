/**
 * contract-fixtures.test.ts — CONTRACT ENFORCEMENT do Gateway Evolution
 *
 * Bug alvo: `providers/evolution/contract.zod.ts` define `evolutionGatewayContract`
 * (12 verbos, request+response) mas NENHUM safeParse consumia o contrato no repo —
 * contrato sem enforcement. Este arquivo fecha o gap no CI (deno-contract-tests.yml
 * roda em loop por arquivo; `*.test.ts` entra automaticamente).
 *
 * Estratégia (princípio, não campos em fluxo):
 *   (a) importa `evolutionGatewayContract` de ../contract.zod.ts;
 *   (b) payloads LEGÍTIMOS (shapes reais do repo: client.ts, parity.test.ts,
 *       evolution-response-normalizers.test.ts, v237-fallback.test.ts,
 *       evolution-profile-fallback.ts, connection-health-check, fake provider)
 *       PASSAM no schema de response/request;
 *   (c) lixo ESTRUTURAL (tipo errado em campo conhecido, raiz não-objeto,
 *       elemento de array não-objeto, wrapper com tipo errado, lixo total `{}`
 *       e objetos arbitrários sem campo marcador) FALHA — regra do marcador do
 *       incidente 2026-07-03;
 *   (d) TOLERÂNCIA documentada: unions array-ou-wrapper (listInstances,
 *       listGroups, checkWhatsApp) passam nas formas conhecidas; `null` passa
 *       APENAS em getProfilePicture (shape real v2.3.x/v2.4.x sem foto) — nos demais
 *       verbos `null` não é shape real e FALHA (decisão do fix paralelo).
 *
 * NOTA DE ONDA: o contrato foi corrigido EM PARALELO (listInstances/
 * getProfilePicture + passthrough estrito via refine de campo marcador).
 * Este teste foi escrito contra o comportamento CORRIGIDO — se o contrato
 * regredir para passthrough cego (lixo passando), os asserts abaixo falham.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evolutionGatewayContract } from "../contract.zod.ts";

type Verb = keyof typeof evolutionGatewayContract;
type Side = "request" | "response";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function expectPass(verb: Verb, side: Side, label: string, payload: unknown) {
  const result = evolutionGatewayContract[verb][side].safeParse(payload);
  assert(
    result.success,
    `${verb}.${side} | ${label} | deveria PASSAR no contrato, falhou: ${
      result.success ? "" : result.error.issues.map((i) => `${i.path.join(".")}:${i.code}`).join(", ")
    }`,
  );
}

function expectFail(verb: Verb, side: Side, label: string, payload: unknown) {
  const result = evolutionGatewayContract[verb][side].safeParse(payload);
  assert(
    !result.success,
    `${verb}.${side} | ${label} | deveria FALHAR no contrato, passou`,
  );
}

// ─── Fixtures legítimas (shapes reais do repo) ───────────────────────────────

/**
 * Response fixtures. Cada uma corresponde a um payload real observado no repo:
 *  - sendText/sendMedia/sendSticker: recibo Baileys `{ key, message?, messageTimestamp, status }`
 *    (client.ts envia; fake provider devolve `{ key: { id } }`; parity.test.ts usa
 *    `{ key: { remoteJid, id, fromMe }, message: { conversation } }`).
 *  - getConnectionState: `{ instance, state, statusReason }` (connection-health-check).
 *  - getQrCode: `{ base64, code, count }` / `{ pairingCode, code }` (evolution-api connect);
 *    shape legado `{ qrcode: {...} }` (fake/versões antigas).
 *  - restartInstance: `{ restart: true }`.
 *  - listInstances: array de `{ instance: { instanceName, ownerJid, profileName,
 *    profilePicUrl, profileStatus } }` (v237-fallback.test.ts / evolution-profile-fallback.ts),
 *    array de instâncias "bare" e wrapper `{ instances: [...] }`.
 *  - listGroups: array de grupos (fetchAllGroups getParticipants=false) e wrapper `{ groups: [...] }`.
 *  - checkWhatsApp: array de `{ exists, jid }`, objeto único e wrapper `{ numbers: [...] }`.
 *  - getProfilePicture: `{ profilePictureUrl }` (v2.3.x/v2.4.x real), `{ url }` (v1),
 *    `{ profilePicUrl }` (legado), url vazia/null e payload null (v2.3.x/v2.4.x).
 *  - get/post: payload arbitrário (permissivos por design — contrato é path/query).
 */
const RESPONSE_FIXTURES: Array<[Verb, string, unknown]> = [
  // ── sendText ──
  ["sendText", "recibo Baileys completo (parity.test.ts + client.ts)", {
    key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true, id: "ABC123" },
    message: { conversation: "olá" },
    messageTimestamp: 1755216000,
    status: "PENDING",
  }],
  ["sendText", "recibo v2.3.x/v2.4.x com messageTimestamp string e key.participant (grupo)", {
    key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "XYZ", participant: "5511999999999@broadcast" },
    message: { extendedTextMessage: { text: "oi" } },
    messageTimestamp: "1755216000",
    status: "COMPLETE",
  }],
  ["sendText", "recibo mínimo do fake provider", { key: { id: "fake-msg-id" } }],
  ["sendText", "recibo com message no lugar de key", { message: { conversation: "x" } }],
  // ── sendMedia ──
  ["sendMedia", "recibo de mídia (audio v2)", {
    key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true, id: "MEDIA1" },
    message: { audioMessage: { url: "https://x/a.mp3" } },
    messageTimestamp: 1755216000,
    status: "COMPLETE",
  }],
  // ── sendSticker ──
  ["sendSticker", "recibo de sticker", {
    key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true, id: "STK1" },
    status: "COMPLETE",
  }],
  // ── getConnectionState ──
  ["getConnectionState", "v2 state open com statusReason (connection-health-check)", {
    instance: { instanceName: "wpp2", status: "open", ownerJid: "5511999999999@s.whatsapp.net" },
    state: "open",
    statusReason: { code: 200, message: "Chrome connected" },
  }],
  ["getConnectionState", "v1 minimal sem statusReason", {
    instance: { instanceName: "wpp2" },
    state: "close",
  }],
  ["getConnectionState", "instância com state (v2.3.x/v2.4.x/fake)", {
    instance: { state: "open" },
  }],
  // ── getQrCode ──
  ["getQrCode", "QR base64 (evolution-api connect)", {
    base64: "data:image/png;base64,AAAA",
    code: "2@xxxx",
    count: 1,
  }],
  ["getQrCode", "pairing code (F6-01)", { pairingCode: "ABC-DEF", code: "1@yyyy", count: 0 }],
  ["getQrCode", "shape legado { qrcode: {...} }", { qrcode: { base64: "data:image/png;base64,BB", code: "3@z", count: 2 } }],
  // ── restartInstance ──
  ["restartInstance", "restart true", { restart: true }],
  ["restartInstance", "restart com instance", { restart: true, instance: { instanceName: "wpp2", status: "restarting" } }],
  // ── listInstances ──
  ["listInstances", "array de { instance: {...} } (v237-fallback.test.ts / fetchInstances)", [
    { instance: { instanceName: "wpp2", ownerJid: "5511999999999@s.whatsapp.net", profileName: "Promo Brindes", profilePicUrl: "https://x/pic.jpg", profileStatus: "Disponível" } },
  ]],
  ["listInstances", "array de instâncias bare", [{ instanceName: "wpp2", status: "open" }]],
  ["listInstances", "wrapper { instances: [...] } com wrappers e bare", {
    instances: [
      { instance: { instanceName: "wpp2" }, integration: "WHATSAPP-BAILEYS" },
      { instanceName: "wpp1", status: "close" },
    ],
  }],
  ["listInstances", "array vazio (zero instâncias)", []],
  // ── listGroups ──
  ["listGroups", "array de grupos (fetchAllGroups getParticipants=false)", [{
    id: "1203630123456789@g.us",
    subject: "Grupo Teste",
    subjectOwner: "5511999999999@s.whatsapp.net",
    subjectTime: 1755216000,
    size: 3,
    creation: 1755216000,
    owner: "5511999999999@s.whatsapp.net",
    desc: "descrição",
    participants: [{ id: "5511@s.whatsapp.net" }],
  }]],
  ["listGroups", "wrapper { groups: [...] }", { groups: [{ id: "g@g.us", subject: "X" }] }],
  // ── checkWhatsApp ──
  ["checkWhatsApp", "array de { exists, jid }", [{ exists: true, jid: "5511999999999@s.whatsapp.net" }]],
  ["checkWhatsApp", "objeto único", { exists: false, jid: "" }],
  ["checkWhatsApp", "docs v1 { number, numberExists, jid }", { number: "5511999999999", numberExists: true, jid: "5511999999999@s.whatsapp.net" }],
  ["checkWhatsApp", "wrapper { numbers: [...] }", { numbers: [{ exists: true, jid: "5511999999999@s.whatsapp.net" }] }],
  // ── getProfilePicture (tolerância v2.3.x/v2.4.x) ──
  ["getProfilePicture", "profilePictureUrl preenchida (v2.3.x/v2.4.x real)", { profilePictureUrl: "https://x/pic.jpg" }],
  ["getProfilePicture", "profilePictureUrl null (v2.3.x/v2.4.x sem foto)", { profilePictureUrl: null }],
  ["getProfilePicture", "url preenchida (v1)", { url: "https://x/pic.jpg" }],
  ["getProfilePicture", "url vazia (v2.3.x/v2.4.x sem foto)", { url: "" }],
  ["getProfilePicture", "url null (v2.3.x/v2.4.x)", { url: null }],
  ["getProfilePicture", "profilePicUrl (shape legado)", { profilePicUrl: "https://x/pic.jpg" }],
  ["getProfilePicture", "payload null (v2.3.x/v2.4.x)", null],
  // ── get/post genéricos (permissivos por design) ──
  ["get", "payload arbitrário (findMessages)", { messages: [{ key: { id: "1" } }] }],
  ["post", "payload arbitrário", { ok: true }],
  ["post", "payload primitivo", 42],
];

/** Request fixtures — shapes que o gateway ENVIA à Evolution (client.ts). */
const REQUEST_FIXTURES: Array<[Verb, string, unknown]> = [
  ["sendText", "client.sendText", { number: "5511999999999", textMessage: { text: "olá" } }],
  ["sendMedia", "sendMedia audio (campos conhecidos v2)", {
    number: "5511999999999",
    mediatype: "audio",
    media: "base64...",
    caption: "legenda",
    fileName: "a.mp3",
    mimetype: "audio/mpeg",
  }],
  ["sendMedia", "sendMedia opaco com campos aditivos (passthrough de request)", {
    number: "5511999999999",
    url: "https://x/a.mp3",
    someCustom: { deep: true },
  }],
  ["sendSticker", "client.sendSticker", { number: "5511999999999", stickerMessage: { url: "https://x/s.webp" } }],
  ["checkWhatsApp", "client.checkWhatsApp", { numbers: ["5511999999999", "5511888888888"] }],
  ["getProfilePicture", "client.getProfilePicture", { number: "5511999999999" }],
  ["getConnectionState", "GET sem body", {}],
  ["getConnectionState", "GET sem body + campo aditivo (query)", { instanceName: "wpp2" }],
  ["getQrCode", "GET sem body", {}],
  ["restartInstance", "DELETE sem body", {}],
  ["listInstances", "GET sem body", {}],
  ["listGroups", "GET sem body", {}],
];

/**
 * Lixo estrutural: tipo errado em campo conhecido, raiz não-objeto, elemento de
 * array não-objeto, wrapper com tipo errado, lixo total `{}` e objeto arbitrário
 * sem campo marcador (regra do incidente 2026-07-03). Tudo FALHA no contrato.
 */
const GARBAGE_FIXTURES: Array<[Verb, Side, string, unknown]> = [
  // ── sendText/sendMedia/sendSticker response ──
  ["sendText", "response", "raiz string", "garbage"],
  ["sendText", "response", "raiz array", []],
  ["sendText", "response", "lixo total {}", {}],
  ["sendText", "response", "status sem key/message (sem marcador)", { status: "PENDING" }],
  ["sendText", "response", "messageTimestamp sem key/message", { messageTimestamp: 1755216000 }],
  ["sendText", "response", "key não-objeto", { key: 42 }],
  ["sendText", "response", "key.remoteJid tipo errado", { key: { remoteJid: 42 } }],
  ["sendMedia", "response", "lixo total {}", {}],
  ["sendSticker", "response", "lixo total {}", {}],
  // ── getConnectionState response ──
  ["getConnectionState", "response", "lixo total {}", {}],
  ["getConnectionState", "response", "state tipo errado", { state: 42 }],
  ["getConnectionState", "response", "instance tipo errado", { instance: "open" }],
  ["getConnectionState", "response", "statusReason.code tipo errado", { statusReason: { code: "200" } }],
  // ── getQrCode response ──
  ["getQrCode", "response", "lixo total {}", {}],
  ["getQrCode", "response", "base64 tipo errado", { base64: 42 }],
  ["getQrCode", "response", "count tipo errado", { count: "1" }],
  ["getQrCode", "response", "qrcode não-objeto", { qrcode: "data:image/png" }],
  // ── restartInstance response ──
  ["restartInstance", "response", "lixo total {}", {}],
  ["restartInstance", "response", "restart tipo errado", { restart: "yes" }],
  ["restartInstance", "response", "instance array", { instance: [] }],
  // ── listInstances response ──
  ["listInstances", "response", "raiz number", 42],
  ["listInstances", "response", "raiz string", "str"],
  ["listInstances", "response", "raiz null (não é shape real do fetchInstances)", null],
  ["listInstances", "response", "array de numbers", [42]],
  ["listInstances", "response", "elemento {} (sem marcador)", [{}]],
  ["listInstances", "response", "elemento instance não-objeto", [{ instance: 42 }]],
  ["listInstances", "response", "elemento instance {} (sem marcador)", [{ instance: {} }]],
  ["listInstances", "response", "wrapper instances tipo errado", { instances: "nope" }],
  ["listInstances", "response", "wrapper sem chave instances", { foo: "bar" }],
  ["listInstances", "response", "wrapper instances com elemento inválido", { instances: [42] }],
  // ── listGroups response ──
  ["listGroups", "response", "raiz number", 42],
  ["listGroups", "response", "raiz null (não é shape real do fetchAllGroups)", null],
  ["listGroups", "response", "array de numbers", [42]],
  ["listGroups", "response", "elemento {} (sem marcador)", [{}]],
  ["listGroups", "response", "group id tipo errado", [{ id: 42 }]],
  ["listGroups", "response", "wrapper groups tipo errado", { groups: "nope" }],
  ["listGroups", "response", "wrapper sem chave groups", { foo: "bar" }],
  // ── checkWhatsApp response ──
  ["checkWhatsApp", "response", "raiz string", "str"],
  ["checkWhatsApp", "response", "raiz null (não é shape real do whatsappNumbers)", null],
  ["checkWhatsApp", "response", "array de numbers", [42]],
  ["checkWhatsApp", "response", "objeto {} (sem marcador)", {}],
  ["checkWhatsApp", "response", "campo conhecido com tipo errado (exists)", { exists: "yes" }],
  ["checkWhatsApp", "response", "objeto arbitrário", { foo: 1 }],
  ["checkWhatsApp", "response", "wrapper numbers com elemento inválido", { numbers: [42] }],
  // ── getProfilePicture response ──
  ["getProfilePicture", "response", "lixo total {}", {}],
  ["getProfilePicture", "response", "objeto arbitrário", { foo: "bar" }],
  ["getProfilePicture", "response", "url tipo errado", { url: 42 }],
  ["getProfilePicture", "response", "profilePictureUrl tipo errado", { profilePictureUrl: 42 }],
  ["getProfilePicture", "response", "raiz array", []],
  ["getProfilePicture", "response", "raiz string", "str"],
  // ── requests ──
  ["sendText", "request", "number vazio", { number: "" }],
  ["sendText", "request", "textMessage ausente", { number: "55" }],
  ["sendText", "request", "number numérico", { number: 5, textMessage: { text: "x" } }],
  ["sendText", "request", "textMessage não-objeto", { number: "55", textMessage: "texto" }],
  ["sendText", "request", "text vazio", { number: "55", textMessage: { text: "" } }],
  ["sendMedia", "request", "number tipo errado", { number: 42 }],
  ["sendSticker", "request", "url vazia", { number: "55", stickerMessage: { url: "" } }],
  ["sendSticker", "request", "stickerMessage não-objeto", { number: "55", stickerMessage: "x" }],
  ["checkWhatsApp", "request", "numbers vazio", { numbers: [] }],
  ["checkWhatsApp", "request", "numbers não-array", { numbers: "5511" }],
  ["checkWhatsApp", "request", "numbers elemento errado", { numbers: [42] }],
  ["getProfilePicture", "request", "number vazio", { number: "" }],
  ["getProfilePicture", "request", "number numérico", { number: 42 }],
];

// ─── Testes ──────────────────────────────────────────────────────────────────

Deno.test("meta: evolutionGatewayContract expõe 12 verbos com request+response", () => {
  const verbs = Object.keys(evolutionGatewayContract);
  assertEquals(verbs.length, 12, "contrato deve cobrir exatamente os 12 verbos do client");
  for (const verb of verbs) {
    const entry = evolutionGatewayContract[verb as Verb];
    assert(entry.request, `${verb} sem schema de request`);
    assert(entry.response, `${verb} sem schema de response`);
  }
});

Deno.test("fixtures legítimas PASSAM no response schema (payloads reais do repo)", () => {
  for (const [verb, label, payload] of RESPONSE_FIXTURES) {
    expectPass(verb, "response", label, payload);
  }
});

Deno.test("fixtures legítimas PASSAM no request schema (shapes do client.ts)", () => {
  for (const [verb, label, payload] of REQUEST_FIXTURES) {
    expectPass(verb, "request", label, payload);
  }
});

Deno.test("tolerância: unions array-ou-wrapper passam; null só em getProfilePicture (v2.3.x/v2.4.x)", () => {
  // listInstances: array puro, array de wrappers E wrapper
  expectPass("listInstances", "response", "array puro", [{ instanceName: "wpp2" }]);
  expectPass("listInstances", "response", "array de wrappers", [{ instance: { instanceName: "wpp2" } }]);
  expectPass("listInstances", "response", "wrapper", { instances: [{ instanceName: "wpp2" }] });
  // listGroups: array puro E wrapper
  expectPass("listGroups", "response", "array puro", [{ id: "g@g.us" }]);
  expectPass("listGroups", "response", "wrapper", { groups: [{ id: "g@g.us" }] });
  // checkWhatsApp: array, objeto único E wrapper
  expectPass("checkWhatsApp", "response", "array", [{ exists: true, jid: "55@s.whatsapp.net" }]);
  expectPass("checkWhatsApp", "response", "objeto único", { exists: false, jid: "" });
  expectPass("checkWhatsApp", "response", "wrapper", { numbers: [{ exists: true, jid: "55@s.whatsapp.net" }] });
  // getProfilePicture: url vazia/null, profilePictureUrl null e payload null (v2.3.x/v2.4.x)
  expectPass("getProfilePicture", "response", "{ url: \"\" }", { url: "" });
  expectPass("getProfilePicture", "response", "{ url: null }", { url: null });
  expectPass("getProfilePicture", "response", "{ profilePictureUrl: null }", { profilePictureUrl: null });
  expectPass("getProfilePicture", "response", "null", null);
});

Deno.test("lixo estrutural FALHA no contrato (tipo errado, raiz não-objeto, wrapper errado)", () => {
  for (const [verb, side, label, payload] of GARBAGE_FIXTURES) {
    expectFail(verb, side, label, payload);
  }
});

Deno.test("marcador obrigatório: lixo total {} e objeto arbitrário FALHAM (regra incidente 2026-07-03)", () => {
  // Sem a regra do marcador, `{}` e `{ foo: 'bar' }` passariam via passthrough
  // cego — payload que nunca existe no provedor real. O contrato corrigido
  // exige ≥1 campo marcador conhecido em todo response permissivo.
  for (const verb of ["sendText", "sendMedia", "sendSticker", "getConnectionState", "getQrCode", "restartInstance", "listInstances", "listGroups", "checkWhatsApp", "getProfilePicture"] as Verb[]) {
    expectFail(verb, "response", "lixo total {}", {});
  }
  expectFail("listInstances", "response", "objeto arbitrário no lugar do wrapper", { foo: "bar" });
  expectFail("listGroups", "response", "objeto arbitrário no lugar do wrapper", { foo: "bar" });
  expectFail("checkWhatsApp", "response", "objeto arbitrário", { foo: 1 });
  expectFail("getProfilePicture", "response", "objeto arbitrário", { foo: "bar" });
  expectFail("sendText", "response", "só status (sem key/message)", { status: "PENDING" });
  expectFail("getConnectionState", "response", "só campo desconhecido", { foo: "bar" });
});
