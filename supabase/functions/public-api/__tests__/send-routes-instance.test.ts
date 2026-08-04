import { assert, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractBlock,
  hasMarker,
  readSourceFrom,
} from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");
// Schema constraints live in the shared helper (refactored from inline).
const SCHEMA_SOURCE = await readSourceFrom(
  import.meta.url,
  "../../_shared/criticalPayloadSchemas.ts",
);

// ---------------------------------------------------------------------------
// 1. Input validation contract (Zod schema)
// ---------------------------------------------------------------------------

Deno.test("SendActionSchema validates required fields via Zod", () => {
  // Schema is defined in _shared/criticalPayloadSchemas.ts (publicApiSendSchema).
  // number uses normalizedPhoneSchema = z.string().min(6, ...).
  // message uses messageTextSchema = z.string().trim().min(1, ...).
  assert(
    SCHEMA_SOURCE.includes(".min(6,"),
    "phone number schema must enforce .min(6, ...) constraint",
  );
  assert(
    SCHEMA_SOURCE.includes(".min(1,"),
    "message schema must enforce .min(1, ...) constraint",
  );
  // index.ts must wire up the schema from the shared helper.
  assertMatch(
    SOURCE,
    /createCriticalPayloadSchemas/,
    "index.ts must delegate to createCriticalPayloadSchemas()",
  );
  assertMatch(
    SOURCE,
    /publicApiSendSchema/,
    "index.ts must use publicApiSendSchema for validation",
  );
});

// ---------------------------------------------------------------------------
// 2. 'send' (text) handler forwards instanceName via evolution-api invoke
// ---------------------------------------------------------------------------

Deno.test("'send' handler invokes evolution-api with action: 'send-text'", () => {
  const block = extractBlock(SOURCE, "action !== 'send'", {
    until: /action === '/,
    maxSize: 4000,
  });
  assertMatch(
    block,
    /functions\.invoke\(\s*['"]evolution-api['"]/,
    "must call supabase.functions.invoke('evolution-api', ...)",
  );
  assertMatch(
    block,
    /action:\s*['"]send-text['"]/,
    "invoke body must declare action: 'send-text'",
  );
  assertMatch(
    block,
    /instanceName:\s*connection\.instance_id/,
    "invoke body must forward instanceName from connection.instance_id",
  );
});

Deno.test("'send' handler does not call fetch() directly", () => {
  const block = extractBlock(SOURCE, "action !== 'send'", {
    until: /action === '/,
    maxSize: 4000,
  });
  assert(
    !/fetch\(/.test(block),
    "send handler must route via invoke, not fetch()",
  );
});

// ---------------------------------------------------------------------------
// 3. Future-proof: when send-media-* / send-audio-* land, they MUST forward
//    instanceName through the same invoke contract. No-op until implemented.
// ---------------------------------------------------------------------------

const FUTURE_MEDIA_ACTIONS = [
  "send-media",
  "send-audio",
  "send-image",
  "send-document",
  "send-video",
];

for (const action of FUTURE_MEDIA_ACTIONS) {
  Deno.test(
    `if '${action}' handler exists, it must forward instanceName via evolution-api invoke`,
    () => {
      const marker = `action === '${action}'`;
      if (!hasMarker(SOURCE, marker)) return; // not implemented yet — pass
      const block = extractBlock(SOURCE, marker, {
        until: /action === '/,
        maxSize: 3000,
      });
      assertMatch(
        block,
        /functions\.invoke\(\s*['"]evolution-api['"]/,
        `'${action}' must call supabase.functions.invoke('evolution-api', ...)`,
      );
      assertMatch(
        block,
        /instanceName:/,
        `'${action}' invoke body must include instanceName`,
      );
      assert(
        !/fetch\(/.test(block),
        `'${action}' must not call fetch() directly`,
      );
    },
  );
}
