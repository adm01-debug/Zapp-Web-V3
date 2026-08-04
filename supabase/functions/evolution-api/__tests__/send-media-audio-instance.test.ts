import { assert, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractBlock, readSource } from "./_helpers.ts";

const SOURCE = await readSource();

// Capture each handler block up to the next `action ===` marker, so we never
// truncate before `return await proxy(...)`.
const NEXT_ACTION = /action === '/;

Deno.test("send-media path includes ${instance}", () => {
  const block = extractBlock(SOURCE, "action === 'send-media'", {
    until: NEXT_ACTION,
  });
  assertMatch(block, /\/message\/sendMedia\/\$\{instance\}/);
});

Deno.test("send-audio path includes ${instance} (multi-line block)", () => {
  const block = extractBlock(SOURCE, "action === 'send-audio'", {
    until: NEXT_ACTION,
  });
  assertMatch(block, /\/message\/sendWhatsAppAudio\/\$\{instance\}/);
  assertMatch(block, /return await proxy\(/);
});

Deno.test("instance is resolved from instanceName with fallback", () => {
  // Production code uses safeGet helper (handles both JSON + FormData bodies).
  assertMatch(SOURCE, /safeGet\(body,\s*'instanceName'[^)]*\)\s*\|\|\s*safeGet\(body,\s*'instance'/);
});

Deno.test("proxy() helper forwards path to proxyToEvolution", () => {
  assertMatch(
    SOURCE,
    /const proxy\s*=\s*\(\s*path:\s*string[\s\S]*?proxyToEvolution\(\s*evolutionApiUrl,\s*evolutionApiKey,\s*corsHeaders,\s*path/,
  );
});

Deno.test("send-media and send-audio never call fetch() directly", () => {
  const media = extractBlock(SOURCE, "action === 'send-media'", {
    until: NEXT_ACTION,
  });
  const audio = extractBlock(SOURCE, "action === 'send-audio'", {
    until: NEXT_ACTION,
  });
  assert(!media.includes("fetch("), "send-media must use proxy(), not fetch()");
  assert(!audio.includes("fetch("), "send-audio must use proxy(), not fetch()");
});
