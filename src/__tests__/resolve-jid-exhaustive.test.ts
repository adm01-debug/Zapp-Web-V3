/**
 * Exhaustive unit tests for resolveBestJid and resolveEventJid.
 *
 * Functions live in supabase/functions/_shared/evolution-helpers.ts.
 * They are pure TypeScript with no Deno-specific imports at module level,
 * so they load cleanly under Vitest/Node.
 *
 * Run:
 *   npx vitest run src/__tests__/resolve-jid-exhaustive.test.ts
 */

// The functions under test use no Deno-specific APIs at module scope, so a
// relative import works fine in a Node/Vitest environment.
import {
  resolveBestJid,
  resolveEventJid,
} from "../../supabase/functions/_shared/evolution-helpers.ts";

// ─────────────────────────────────────────────────────────────────────────────
// resolveBestJid — 30 cases
// ─────────────────────────────────────────────────────────────────────────────
//
// Priority (highest → lowest):
//   1. includes('@s.whatsapp.net')
//   2. matches /^\+?\d{10,15}$/
//   3. includes('@g.us')
//   4. does NOT include('@lid')
//   5. valid[0] (last resort — when every candidate has '@lid')
//
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveBestJid — priority order", () => {
  // R01: @s.whatsapp.net wins over @g.us
  it("R01 @s.whatsapp.net beats @g.us when listed first", () => {
    expect(resolveBestJid("5511@s.whatsapp.net", "5511@g.us")).toBe("5511@s.whatsapp.net");
  });

  // R02: order-independent — @s.whatsapp.net always wins regardless of position
  it("R02 @s.whatsapp.net beats @g.us when listed second", () => {
    expect(resolveBestJid("5511@g.us", "5511@s.whatsapp.net")).toBe("5511@s.whatsapp.net");
  });

  // R03: @s.whatsapp.net beats @lid
  it("R03 @s.whatsapp.net beats @lid", () => {
    expect(resolveBestJid("5511@lid", "5511@s.whatsapp.net")).toBe("5511@s.whatsapp.net");
  });

  // R04: @g.us beats @lid when no @s.whatsapp.net or phone present
  it("R04 @g.us beats @lid", () => {
    expect(resolveBestJid("5511@lid", "5511@g.us")).toBe("5511@g.us");
  });

  // R05: bare phone number (priority 2) beats @lid (priority 5 fallback)
  it("R05 bare phone number beats @lid", () => {
    expect(resolveBestJid("5511@lid", "+15551234567")).toBe("+15551234567");
  });

  // R06: lone @lid candidate — returned as last resort via valid[0]
  it("R06 single @lid candidate returned as valid[0] fallback", () => {
    expect(resolveBestJid("5511@lid")).toBe("5511@lid");
  });

  // R07: null and undefined are filtered, @s.whatsapp.net returned
  it("R07 null/undefined filtered; valid candidate returned", () => {
    expect(resolveBestJid(null, undefined, "5511@s.whatsapp.net")).toBe(
      "5511@s.whatsapp.net",
    );
  });

  // R08: all inputs falsy — null returned
  it("R08 all falsy inputs → null", () => {
    expect(resolveBestJid(null, undefined, "")).toBeNull();
  });

  // R09: whitespace is trimmed before filtering and matching
  it("R09 leading/trailing whitespace trimmed before priority matching", () => {
    expect(resolveBestJid("  5511@s.whatsapp.net  ")).toBe(
      "5511@s.whatsapp.net",
    );
  });

  // R10: among multiple @s.whatsapp.net, the first one encountered is returned
  it("R10 first @s.whatsapp.net wins when multiple present", () => {
    expect(resolveBestJid("5511@s.whatsapp.net", "5522@s.whatsapp.net")).toBe(
      "5511@s.whatsapp.net",
    );
  });
});

describe("resolveBestJid — phone regex boundary conditions", () => {
  // R11: 14 digits — within {10,15} range
  it("R11 14-digit number matches phone regex /^\\+?\\d{10,15}$/", () => {
    expect(resolveBestJid("12345678901234")).toBe("12345678901234");
  });

  // R12: exactly 10 digits — lower boundary of regex
  it("R12 exactly 10 digits — lower boundary, matches phone regex", () => {
    expect(resolveBestJid("1234567890")).toBe("1234567890");
  });

  // R13: exactly 15 digits — upper boundary of regex
  it("R13 exactly 15 digits — upper boundary, matches phone regex", () => {
    expect(resolveBestJid("123456789012345")).toBe("123456789012345");
  });

  // R14: + prefix with 10 digits — /^\+?\d{10,15}$/ allows leading +
  it("R14 + prefix with 11 digits matches phone regex", () => {
    expect(resolveBestJid("+15551234567")).toBe("+15551234567");
  });

  // R15: 13 bare digits (no +) — typical Brazilian mobile — matches phone regex
  it("R15 13-digit number without + matches phone regex", () => {
    expect(resolveBestJid("5511998765432")).toBe("5511998765432");
  });

  // R16: 10 non-digit chars — does NOT match phone regex; falls to priority-4
  it("R16 10-char alphabetic string does not match phone regex; returned via priority-4 (non-@lid)", () => {
    expect(resolveBestJid("abcdefghij")).toBe("abcdefghij");
  });

  // Extra: 9 digits — one below the minimum; phone regex must NOT match
  it("R-extra-9digits 9-digit number is below regex minimum — falls to @g.us priority if present", () => {
    expect(resolveBestJid("123456789", "120363@g.us")).toBe("120363@g.us");
  });

  // Extra: 16 digits — one above the maximum; phone regex must NOT match
  it("R-extra-16digits 16-digit number exceeds regex maximum — falls to @g.us priority if present", () => {
    expect(resolveBestJid("1234567890123456", "120363@g.us")).toBe("120363@g.us");
  });
});

describe("resolveBestJid — null / empty edge cases", () => {
  // R17: zero arguments
  it("R17 no arguments → null", () => {
    expect(resolveBestJid()).toBeNull();
  });

  // R18: only undefined/null args
  it("R18 only null/undefined candidates → null", () => {
    expect(resolveBestJid(undefined, null, undefined)).toBeNull();
  });

  // R19: zero-prefixed JID still has @s.whatsapp.net → priority 1
  it("R19 '0@s.whatsapp.net' still has @s.whatsapp.net suffix — returned via priority-1", () => {
    expect(resolveBestJid("0@s.whatsapp.net")).toBe("0@s.whatsapp.net");
  });
});

describe("resolveBestJid — mixed candidate lists (R20-R30)", () => {
  // R20: unknown domain — no @s, no phone, no @g.us, no @lid → priority-4 (non-@lid match)
  it("R20 unknown domain without @lid — returned via priority-4 (not-@lid)", () => {
    expect(resolveBestJid("5511@other.net")).toBe("5511@other.net");
  });

  // R21: phone number (priority 2) beats @g.us (priority 3)
  it("R21 bare phone number (priority-2) beats @g.us (priority-3)", () => {
    expect(resolveBestJid("120363@g.us", "15551234567")).toBe("15551234567");
  });

  // R22: all @lid candidates → valid[0] returned via last-resort
  it("R22 multiple @lid candidates — valid[0] returned as last resort", () => {
    expect(resolveBestJid("5511@lid", "5522@lid")).toBe("5511@lid");
  });

  // R23: whitespace-only strings are filtered out; valid candidate returned
  it("R23 whitespace-only candidates filtered; remaining @g.us returned", () => {
    expect(resolveBestJid("   ", "\t", "5511@g.us")).toBe("5511@g.us");
  });

  // R24: + prefix with 14-digit body — within phone regex range
  it("R24 +14-digit phone matches phone regex", () => {
    expect(resolveBestJid("+12345678901234")).toBe("+12345678901234");
  });

  // R25: 9-digit number does NOT match phone regex
  it("R25 9-digit number does not match phone regex — priority-4 applies instead", () => {
    expect(resolveBestJid("123456789")).toBe("123456789");
  });

  // R26: 16-digit number does NOT match phone regex
  it("R26 16-digit number does not match phone regex — priority-4 applies instead", () => {
    expect(resolveBestJid("1234567890123456")).toBe("1234567890123456");
  });

  // R27: + prefix with 10 digits — lower boundary for + form
  it("R27 +10-digit phone matches phone regex (lower boundary with +)", () => {
    expect(resolveBestJid("+1234567890")).toBe("+1234567890");
  });

  // R28: @s.whatsapp.net wins over @g.us and phone together; first @s is returned
  it("R28 @s.whatsapp.net beats both @g.us and bare phone; first @s returned", () => {
    expect(
      resolveBestJid("5522@s.whatsapp.net", "5511@s.whatsapp.net", "120363@g.us"),
    ).toBe("5522@s.whatsapp.net");
  });

  // R29: non-@lid unknown domain beats @lid via priority-4
  it("R29 non-@lid unknown domain wins over @lid via priority-4 (first non-@lid candidate)", () => {
    expect(resolveBestJid("5511@lid", "5511@other.net")).toBe("5511@other.net");
  });

  // R30: all null — returns null
  it("R30 all-null array → null", () => {
    expect(resolveBestJid(null, null, null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEventJid — 30 cases
// ─────────────────────────────────────────────────────────────────────────────
//
// The function deep-scans nested Evolution API payloads via a fixed set of
// "directFields" and traverses: source.key, source.contextInfo,
// source.messageContextInfo, source.message — and one level of their
// sub-values including sub-value.contextInfo / .messageContextInfo / .message.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveEventJid — top-level directFields", () => {
  // E01: simplest case — remoteJid at top level
  it("E01 top-level remoteJid resolved", () => {
    expect(resolveEventJid({ remoteJid: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  // E02: remoteJid inside source.key (one level of nesting)
  it("E02 remoteJid inside source.key resolved", () => {
    expect(
      resolveEventJid({
        key: { remoteJid: "5511@s.whatsapp.net", fromMe: false },
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E03: group message — remoteJid is @g.us but participant is @s → @s wins
  it("E03 participant @s.whatsapp.net wins over remoteJid @g.us", () => {
    expect(
      resolveEventJid({
        remoteJid: "120363@g.us",
        participant: "5511@s.whatsapp.net",
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E04: data is NOT in the traversed nested paths — only key/contextInfo/messageContextInfo/message are
  it("E04 payload.data is NOT traversed — only key.remoteJid is found", () => {
    expect(
      resolveEventJid({
        key: { remoteJid: "120363@g.us" },
        data: { participant: "5511@s.whatsapp.net" }, // <-- data is NOT a traversal path
      }),
    ).toBe("120363@g.us"); // @s.whatsapp.net in data is never seen
  });

  // E05: remoteJid inside source.contextInfo
  it("E05 remoteJid inside source.contextInfo resolved", () => {
    expect(
      resolveEventJid({ contextInfo: { remoteJid: "5511@s.whatsapp.net" } }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E06: deep nesting — message → extendedTextMessage → contextInfo → remoteJid
  it("E06 remoteJid inside message.extendedTextMessage.contextInfo resolved", () => {
    expect(
      resolveEventJid({
        message: {
          extendedTextMessage: {
            contextInfo: { remoteJid: "5511@s.whatsapp.net" },
          },
        },
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E07: empty object → null
  it("E07 empty source object → null", () => {
    expect(resolveEventJid({})).toBeNull();
  });

  // E08: null source → null
  it("E08 null source → null", () => {
    expect(resolveEventJid(null)).toBeNull();
  });

  // E09: string source — pushed directly as a candidate
  it("E09 string source treated as bare JID candidate", () => {
    expect(resolveEventJid("5511@s.whatsapp.net")).toBe("5511@s.whatsapp.net");
  });

  // E10: key with id and fromMe fields that are NOT in directFields, plus remoteJid
  it("E10 key.id and key.fromMe ignored; key.remoteJid resolved", () => {
    expect(
      resolveEventJid({
        key: {
          id: "ABCDEF123",
          fromMe: true,
          remoteJid: "5511@s.whatsapp.net",
        },
      }),
    ).toBe("5511@s.whatsapp.net");
  });
});

describe("resolveEventJid — messageContextInfo and additional nested paths", () => {
  // E11: remoteJid inside source.messageContextInfo
  it("E11 remoteJid inside source.messageContextInfo resolved", () => {
    expect(
      resolveEventJid({
        messageContextInfo: { remoteJid: "5511@s.whatsapp.net" },
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E12: deduplication across two sources — same JID only appears once in candidates
  it("E12 same JID across two sources is deduplicated; second unique JID also collected", () => {
    const result = resolveEventJid(
      { remoteJid: "5511@s.whatsapp.net" },
      { participant: "5511@s.whatsapp.net", sender: "5522@s.whatsapp.net" },
    );
    // First @s.whatsapp.net wins; dedup ensures "5511@s.whatsapp.net" appears only once
    expect(result).toBe("5511@s.whatsapp.net");
  });

  // E13: only @lid JID in payload — returned as last resort via valid[0]
  it("E13 only @lid JID present — returned as last-resort fallback", () => {
    expect(resolveEventJid({ remoteJid: "5511@lid" })).toBe("5511@lid");
  });

  // E14: @g.us in key.remoteJid, no participant — returned via @g.us priority
  it("E14 key.remoteJid @g.us returned when no @s or phone present", () => {
    expect(
      resolveEventJid({
        key: { remoteJid: "120363@g.us" },
        message: { conversation: "hello" },
      }),
    ).toBe("120363@g.us");
  });

  // E15: sender field at top level
  it("E15 top-level sender field resolved", () => {
    expect(resolveEventJid({ sender: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  // E16: from field at top level
  it("E16 top-level from field resolved", () => {
    expect(resolveEventJid({ from: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  // E17: jid field at top level
  it("E17 top-level jid field resolved", () => {
    expect(resolveEventJid({ jid: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  // E18: author field inside a nested message sub-object (e.g., audioMessage.author)
  it("E18 author inside message.audioMessage resolved", () => {
    expect(
      resolveEventJid({
        message: {
          audioMessage: { author: "5511@s.whatsapp.net" },
        },
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E19: key with both remoteJid (@g.us) and participant (@s) — @s wins
  it("E19 key.participant @s wins over key.remoteJid @g.us", () => {
    expect(
      resolveEventJid({
        key: {
          remoteJid: "120363@g.us",
          participant: "5511@s.whatsapp.net",
        },
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E20: participant inside message.imageMessage.contextInfo
  it("E20 participant inside message.imageMessage.contextInfo resolved", () => {
    expect(
      resolveEventJid({
        message: {
          imageMessage: {
            contextInfo: { participant: "5511@s.whatsapp.net" },
          },
        },
      }),
    ).toBe("5511@s.whatsapp.net");
  });
});

describe("resolveEventJid — multi-source, deduplication, and tricky types", () => {
  // E21: two sources — @s in second source wins over @g.us in first
  it("E21 @s.whatsapp.net from second source wins over @g.us from first", () => {
    expect(
      resolveEventJid(
        { from: "120363@g.us" },
        { sender: "5522@s.whatsapp.net" },
      ),
    ).toBe("5522@s.whatsapp.net");
  });

  // E22: non-string remoteJid (number) is ignored; string participant is found
  it("E22 numeric remoteJid ignored; string participant resolved", () => {
    expect(
      resolveEventJid({
        remoteJid: 12345 as unknown as string, // number, not a string
        participant: "5511@s.whatsapp.net",
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E23: array source — isRecord returns false for arrays; null returned
  it("E23 array source is not a Record — treated as non-traversable → null", () => {
    expect(
      resolveEventJid([{ remoteJid: "5511@s.whatsapp.net" }] as unknown),
    ).toBeNull();
  });

  // E24: primitive number source — not string, not Record → null
  it("E24 number source → null", () => {
    expect(resolveEventJid(42 as unknown)).toBeNull();
  });

  // E25: deep contextInfo in message path (imageMessage → contextInfo)
  it("E25 remoteJid in message.imageMessage.contextInfo resolved", () => {
    expect(
      resolveEventJid({
        message: {
          imageMessage: {
            contextInfo: { remoteJid: "5511@s.whatsapp.net" },
          },
        },
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E26: value.message inside a nested record (third-level message traversal)
  it("E26 remoteJid inside message.imageMessage.message resolved via value.message path", () => {
    expect(
      resolveEventJid({
        message: {
          imageMessage: {
            message: { remoteJid: "5511@s.whatsapp.net" },
          },
        },
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E27: same JID in remoteJid and participant — dedup ensures one candidate
  it("E27 duplicate JID across remoteJid and participant deduplicated to single candidate", () => {
    // Both fields hold the same value; only one candidate should enter the pool.
    // Result is still correct; this confirms seen Set prevents double-entry.
    expect(
      resolveEventJid({
        remoteJid: "5511@s.whatsapp.net",
        participant: "5511@s.whatsapp.net",
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // E28: string source with surrounding whitespace — pushCandidate trims it
  it("E28 string source with surrounding whitespace trimmed before candidate collection", () => {
    expect(resolveEventJid("  5511@s.whatsapp.net  ")).toBe(
      "5511@s.whatsapp.net",
    );
  });

  // E29: real-world Evolution API group message payload
  it("E29 real-world group message — key.participant @s wins over key.remoteJid @g.us", () => {
    expect(
      resolveEventJid({
        event: "messages.upsert",
        key: {
          remoteJid: "120363050625987654@g.us",
          fromMe: false,
          id: "ABCDEF123",
          participant: "5511998765432@s.whatsapp.net",
        },
        message: { conversation: "hello" },
        messageTimestamp: 1700000000,
      }),
    ).toBe("5511998765432@s.whatsapp.net");
  });

  // E30: senderLid field is in directFields — collected and returned as @lid fallback
  it("E30 senderLid in directFields — collected; returned as @lid last-resort", () => {
    expect(resolveEventJid({ senderLid: "5511@lid" })).toBe("5511@lid");
  });
});

describe("resolveEventJid — owner, recipient, userJid, chatId, chatJid, jidAlt, fromJid, senderJid", () => {
  it("owner field at top level", () => {
    expect(resolveEventJid({ owner: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("recipient field at top level", () => {
    expect(resolveEventJid({ recipient: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("userJid field at top level", () => {
    expect(resolveEventJid({ userJid: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("chatId field at top level — @g.us returned via @g.us priority", () => {
    expect(resolveEventJid({ chatId: "120363@g.us" })).toBe("120363@g.us");
  });

  it("chatJid field at top level", () => {
    expect(resolveEventJid({ chatJid: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("jidAlt field at top level", () => {
    expect(resolveEventJid({ jidAlt: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("fromJid field at top level", () => {
    expect(resolveEventJid({ fromJid: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("senderJid field at top level", () => {
    expect(resolveEventJid({ senderJid: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("remoteJidAlt and participantAlt fields at top level", () => {
    expect(
      resolveEventJid({
        remoteJidAlt: "120363@g.us",
        participantAlt: "5511@s.whatsapp.net",
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  it("authorAlt field at top level", () => {
    expect(resolveEventJid({ authorAlt: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("user field at top level", () => {
    expect(resolveEventJid({ user: "5511@s.whatsapp.net" })).toBe(
      "5511@s.whatsapp.net",
    );
  });

  it("fromAlt and senderAlt fields", () => {
    expect(
      resolveEventJid({
        fromAlt: "120363@g.us",
        senderAlt: "5511@s.whatsapp.net",
      }),
    ).toBe("5511@s.whatsapp.net");
  });
});

describe("resolveEventJid — no-arg / boolean / undefined sources", () => {
  it("no arguments → null", () => {
    expect(resolveEventJid()).toBeNull();
  });

  it("boolean source → null (not string, not Record)", () => {
    expect(resolveEventJid(true as unknown)).toBeNull();
  });

  it("undefined source → null", () => {
    expect(resolveEventJid(undefined)).toBeNull();
  });

  it("multiple null/undefined sources → null", () => {
    expect(resolveEventJid(null, undefined, null)).toBeNull();
  });
});

describe("resolveEventJid — messageContextInfo value path", () => {
  // value.messageContextInfo inside a nested record
  it("remoteJid inside message.imageMessage.messageContextInfo resolved", () => {
    expect(
      resolveEventJid({
        message: {
          imageMessage: {
            messageContextInfo: { remoteJid: "5511@s.whatsapp.net" },
          },
        },
      }),
    ).toBe("5511@s.whatsapp.net");
  });

  // contextInfo at top level is traversed
  it("participant inside source.contextInfo resolved", () => {
    expect(
      resolveEventJid({ contextInfo: { participant: "5511@s.whatsapp.net" } }),
    ).toBe("5511@s.whatsapp.net");
  });

  // messageContextInfo at top level is traversed
  it("sender inside source.messageContextInfo resolved", () => {
    expect(
      resolveEventJid({
        messageContextInfo: { sender: "5511@s.whatsapp.net" },
      }),
    ).toBe("5511@s.whatsapp.net");
  });
});

describe("resolveEventJid — deduplication set correctness", () => {
  // Same JID appears across three sources — candidates Set prevents triple counting
  it("same JID across three sources deduplicated; resolveBestJid still returns it", () => {
    const jid = "5511@s.whatsapp.net";
    expect(
      resolveEventJid(
        { remoteJid: jid },
        { participant: jid },
        { sender: jid },
      ),
    ).toBe(jid);
  });

  // When dedup prevents a lower-priority duplicate from shadowing a higher-priority unique
  it("dedup: @g.us from source-1 does not shadow @s from source-2 due to set mechanics", () => {
    expect(
      resolveEventJid(
        { chatId: "120363@g.us" },
        { remoteJid: "120363@g.us", participant: "5511@s.whatsapp.net" },
      ),
    ).toBe("5511@s.whatsapp.net");
  });
});
