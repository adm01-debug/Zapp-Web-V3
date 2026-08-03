/**
 * Unit tests for the response normalizers shared by `find-chats`,
 * `find-contacts` and `fetch-profile`. The normalizers guarantee a
 * deterministic shape regardless of the upstream payload, so the primary
 * (Evolution v2.3.7) and the Evolution DB RPC fallback both yield the same
 * contract for the frontend (`[]` for lists, `null` for an absent profile).
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeChatList,
  normalizeContactList,
  normalizeProfile,
} from "../../_shared/evolution-response-normalizers.ts";

// ──────────────────────────────────────────────────────────────────────────
// normalizeChatList
// ──────────────────────────────────────────────────────────────────────────

Deno.test("normalizeChatList: array direto passa intacto", () => {
  const arr = [{ id: "1" }, { id: "2" }];
  assertEquals(normalizeChatList(arr), arr);
});

Deno.test("normalizeChatList: { records: [...] } extrai records", () => {
  assertEquals(normalizeChatList({ records: [{ id: "a" }] }), [{ id: "a" }]);
});

Deno.test("normalizeChatList: { chats: [...] } extrai chats", () => {
  assertEquals(normalizeChatList({ chats: [{ id: "x" }] }), [{ id: "x" }]);
});

Deno.test("normalizeChatList: { chats: { records: [...] } } extrai aninhado", () => {
  assertEquals(
    normalizeChatList({ chats: { records: [{ id: "y" }] } }),
    [{ id: "y" }],
  );
});

Deno.test("normalizeChatList: null/undefined → []", () => {
  assertEquals(normalizeChatList(null), []);
  assertEquals(normalizeChatList(undefined), []);
});

Deno.test("normalizeChatList: objeto vazio (mesmo com version envelope) → []", () => {
  assertEquals(normalizeChatList({}), []);
  assertEquals(normalizeChatList({ version: 1 }), []);
});

Deno.test("normalizeChatList: tipos inválidos → []", () => {
  assertEquals(normalizeChatList("string"), []);
  assertEquals(normalizeChatList(42), []);
  assertEquals(normalizeChatList({ chats: "not-array" }), []);
});

// ──────────────────────────────────────────────────────────────────────────
// normalizeContactList
// ──────────────────────────────────────────────────────────────────────────

Deno.test("normalizeContactList: array direto passa intacto", () => {
  const arr = [{ remoteJid: "11@s.whatsapp.net" }];
  assertEquals(normalizeContactList(arr), arr);
});

Deno.test("normalizeContactList: { records } / { contacts } / { contacts.records }", () => {
  assertEquals(normalizeContactList({ records: [{ id: 1 }] }), [{ id: 1 }]);
  assertEquals(normalizeContactList({ contacts: [{ id: 2 }] }), [{ id: 2 }]);
  assertEquals(
    normalizeContactList({ contacts: { records: [{ id: 3 }] } }),
    [{ id: 3 }],
  );
});

Deno.test("normalizeContactList: ausente/vazio → []", () => {
  assertEquals(normalizeContactList(null), []);
  assertEquals(normalizeContactList(undefined), []);
  assertEquals(normalizeContactList({}), []);
  assertEquals(normalizeContactList({ version: 1 }), []);
  assertEquals(normalizeContactList({ contacts: null }), []);
});

// ──────────────────────────────────────────────────────────────────────────
// normalizeProfile
// ──────────────────────────────────────────────────────────────────────────

Deno.test("normalizeProfile: objeto raiz com campos válidos é retornado", () => {
  const p = { wuid: "55@s.whatsapp.net", name: "Foo", picture: "url" };
  assertEquals(normalizeProfile(p), p);
});

Deno.test("normalizeProfile: { profile: {...} } extrai profile aninhado", () => {
  const inner = { wuid: "x", name: "Y" };
  assertEquals(normalizeProfile({ profile: inner }), inner);
});

Deno.test("normalizeProfile: { data: {...} } extrai data aninhado (compat fallback)", () => {
  const inner = { wuid: "z" };
  assertEquals(normalizeProfile({ data: inner }), inner);
});

Deno.test("normalizeProfile: ausente/vazio → null", () => {
  assertEquals(normalizeProfile(null), null);
  assertEquals(normalizeProfile(undefined), null);
  assertEquals(normalizeProfile({}), null);
  // só envelope `version` (fallback stamp) → null, nunca vaza marker como profile
  assertEquals(normalizeProfile({ version: 1 }), null);
});

Deno.test("normalizeProfile: tipos inválidos (array/primitivo) → null", () => {
  assertEquals(normalizeProfile([{ wuid: "x" }]), null);
  assertEquals(normalizeProfile("string"), null);
  assertEquals(normalizeProfile(42), null);
});

Deno.test("normalizeProfile: profile/data não-objeto cai no fallback raiz", () => {
  // se `profile` não é objeto válido, mas a raiz tem outros campos, devolve raiz
  const root = { profile: null, wuid: "55", name: "Z" };
  assertEquals(normalizeProfile(root), root);
});
