/**
 * Exhaustive unit tests for normalizePhone and generatePhoneVariants.
 *
 * Four bugs were identified and have since been fixed:
 *   BUG-1 (normalizePhone)  : double device suffix "5511998765432:5:2@s.whatsapp.net" — the
 *                             regex /:\d+(?=@)/ (even with /g) only strips the suffix
 *                             immediately adjacent to '@'; outer segments like ":5" leak
 *                             into digit extraction and corrupt the phone key.
 *                             FIXED: /(:\d+)+(?=@)/g — grouped quantifier matches the full
 *                             chain of device segments in a single pass.
 *   BUG-2 (generatePhoneVariants): 12-digit numbers whose 8-digit subscriber already
 *                             starts with "9" received an unconditional 9-prefix, producing
 *                             an invalid double-9 subscriber (e.g. "998765432").
 *                             FIXED: added !rest.startsWith('9') guard on the 12-digit branch.
 *   BUG-3 (generatePhoneVariants): the raw `phone` argument (which may be a JID, a
 *                             formatted string with spaces, or contain letters) was always
 *                             included verbatim in the returned variants array.
 *                             FIXED: raw phone no longer seeded into the variants Set.
 *   BUG-4 (generatePhoneVariants): an empty or non-numeric input produced the string "+"
 *                             as a spurious variant.
 *                             FIXED: if (clean) guard prevents "+" when clean is empty.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizePhone,
  generatePhoneVariants,
} from "../evolution-helpers.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Assert normalizePhone(input) === expected */
function np(input: string | null | undefined, expected: string | null, label: string) {
  Deno.test(`normalizePhone | ${label}`, () => {
    assertEquals(normalizePhone(input as string | undefined), expected);
  });
}

/** Assert generatePhoneVariants(input) contains exactly the expected set (order-independent) */
function gv(
  input: string,
  expected: string[],
  label: string,
) {
  Deno.test(`generatePhoneVariants | ${label}`, () => {
    const result = generatePhoneVariants(input);
    const resultSet = new Set(result);
    const expectedSet = new Set(expected);
    assertEquals(result.length, expected.length,
      `Expected ${expected.length} variants, got ${result.length}: ${JSON.stringify(result)}`);
    for (const e of expectedSet) {
      assertEquals(resultSet.has(e), true,
        `Missing expected variant "${e}" in ${JSON.stringify(result)}`);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizePhone — 40 cases
// ─────────────────────────────────────────────────────────────────────────────

// ── N01–N08  Standard JIDs ────────────────────────────────────────────────────

np("5511998765432@s.whatsapp.net",   "5511998765432",       "N01 standard @s.whatsapp.net JID");
np("5511998765432:5@s.whatsapp.net", "5511998765432",       "N02 device suffix :5 stripped");
np("5511998765432:0@s.whatsapp.net", "5511998765432",       "N03 device suffix :0 stripped");
np("120363050625987654@g.us",        "120363050625987654",  "N04 group @g.us JID");
np("5511998765432@broadcast",        "5511998765432",       "N05 @broadcast JID");
np("5511998765432@lid",              "5511998765432",       "N06 @lid JID");
np("+5511998765432",                 "5511998765432",       "N07 leading + stripped");
np("5511998765432",                  "5511998765432",       "N08 plain number passthrough");

// ── N09–N11  Falsy inputs ─────────────────────────────────────────────────────

np("",        null, "N09 empty string → null");
np(null,      null, "N10 null → null");
np(undefined, null, "N11 undefined → null");

// ── N12  Domain-only JID ─────────────────────────────────────────────────────
// After stripping "@s.whatsapp.net", sanitized="" and digitsOnly="" → null.
np("@s.whatsapp.net", null, "N12 domain-only JID → null (both slots empty)");

// ── N13  Non-numeric user part ────────────────────────────────────────────────
// digitsOnly="", sanitized="abc" → returns "abc" (the non-numeric fallback)
np("abc@s.whatsapp.net", "abc", "N13 non-numeric user → returns sanitized string");

// ── N14  Leading/trailing whitespace ─────────────────────────────────────────
np(" 5511998765432@s.whatsapp.net ", "5511998765432", "N14 leading+trailing spaces trimmed");

// ── N15  Formatted number with spaces and dash ───────────────────────────────
// Domain stripped first, leaving "55 11 99876-5432"; digitsOnly extracts clean number.
np("55 11 99876-5432@s.whatsapp.net", "5511998765432", "N15 spaces and dash in phone body");

// ── N16  Double device suffix (BUG-1 fixed) ───────────────────────────────────
// /(:\d+)+(?=@)/g matches the full ":5:2" chain before "@" in a single pass.
// After removing the entire chain and "@s.whatsapp.net", sanitized="5511998765432".
Deno.test("normalizePhone | N16 double device suffix :5:2 — BUG-1 fixed: grouped quantifier strips all", () => {
  const result = normalizePhone("5511998765432:5:2@s.whatsapp.net");
  assertEquals(result, "5511998765432",
    "BUG-1 fixed: (:\\d+)+(?=@) removes every device suffix segment before digit extraction");
});

// ── N17  Unknown domain (digit fallback saves it) ────────────────────────────
np("5511998765432@other.domain", "5511998765432",
   "N17 unknown domain — digit extraction recovers number");

// ── N18  Double @s.whatsapp.net (string replace is non-global) ───────────────
// First occurrence removed; second left behind. digit extraction recovers number.
np("5511998765432@s.whatsapp.net@s.whatsapp.net", "5511998765432",
   "N18 double domain — first removed; digit extraction saves number");

// ── N19  All-zero number ──────────────────────────────────────────────────────
np("0000000000@s.whatsapp.net", "0000000000", "N19 all-zeros number passthrough");

// ── N20–N21  Multi-digit device suffixes ─────────────────────────────────────
np("5511998765432:10@s.whatsapp.net",  "5511998765432", "N20 two-digit suffix :10 stripped");
np("5511998765432:999@s.whatsapp.net", "5511998765432", "N21 three-digit suffix :999 stripped");

// ── N22  Colon but no digits before @ (suffix-only JID) ──────────────────────
// /:\d+(?=@)/ needs at least one digit after ":" — ":@" does NOT match.
// "@s.whatsapp.net" is stripped → sanitized=":", digitsOnly="" → returns ":"
Deno.test("normalizePhone | N22 colon with no digits before @ — returns \":\"", () => {
  assertEquals(normalizePhone(":@s.whatsapp.net"), ":");
});

// ── N23  Whitespace-only input ────────────────────────────────────────────────
// "   " is truthy (bypasses !rawJid), trim() → "", all replacements no-op → null.
np("   ", null, "N23 whitespace-only string → null after trim");

// ── N24  WhatsApp status JID ──────────────────────────────────────────────────
// "status@broadcast" → after @broadcast strip → "status" (non-numeric returned)
np("status@broadcast", "status", "N24 status@broadcast → non-numeric sanitized returned");

// ── N25  Uppercase domain (case-sensitive replace) ────────────────────────────
// '@lid' replace is case-sensitive: '@LID' is NOT stripped.
// digitsOnly = "5511998765432" saves the number value via digit extraction.
np("5511998765432@LID", "5511998765432",
   "N25 uppercase @LID not stripped by case-sensitive replace — digit extraction rescues");

// ── N26  Plus-prefix combined with domain ─────────────────────────────────────
np("+5511998765432@s.whatsapp.net", "5511998765432",
   "N26 + prefix with @s.whatsapp.net domain — both stripped");

// ── N27  @s.whatsapp.net with extra suffix garbage ────────────────────────────
// First @s.whatsapp.net removed, "XYZ" remains; digits extracted.
np("5511998765432@s.whatsapp.netXYZ", "5511998765432",
   "N27 garbage after domain suffix — digit extraction recovers");

// ── N28  Group JID with device suffix ─────────────────────────────────────────
// Unusual but: :5 stripped before @, then @g.us removed.
np("5511998765432:5@g.us", "5511998765432", "N28 group JID with device suffix");

// ── N29  Non-numeric @lid value ───────────────────────────────────────────────
np("newsletter@lid", "newsletter", "N29 non-numeric @lid user → returns sanitized");

// ── N30  Decimal point in phone body ─────────────────────────────────────────
// After @s.whatsapp.net strip: "55119987654.32"; digitsOnly removes the dot.
np("55119987654.32@s.whatsapp.net", "5511998765432",
   "N30 decimal point in number — dot removed by digit extraction");

// ── N31  Lone @ sign ──────────────────────────────────────────────────────────
// "@" is truthy, no replacements match, digitsOnly="" → returns "@" (sanitized fallback)
Deno.test("normalizePhone | N31 bare @ sign — returns \"@\" (sanitized fallback)", () => {
  assertEquals(normalizePhone("@"), "@");
});

// ── N32  Trailing space after domain before strip ─────────────────────────────
// trim() runs first, removing the trailing space → same as N01.
np("5511998765432@s.whatsapp.net ", "5511998765432",
   "N32 trailing space after domain — trim removes it first");

// ── N33  Single zero ──────────────────────────────────────────────────────────
np("0", "0", "N33 single-digit zero → returns '0'");

// ── N34  Single letter ────────────────────────────────────────────────────────
np("a", "a", "N34 single non-digit letter → sanitized fallback");

// ── N35  String literal 'null' ────────────────────────────────────────────────
np("null", "null", "N35 string 'null' → returned as non-numeric sanitized");

// ── N36  Short JID with device suffix ────────────────────────────────────────
// ":5" stripped before @, "55" returned.
np("55:5@s.whatsapp.net", "55", "N36 two-digit phone with device suffix :5");

// ── N37  Plus-only string ─────────────────────────────────────────────────────
// "+" is truthy; /^\+/ strips it → sanitized="", digitsOnly="" → null
Deno.test("normalizePhone | N37 lone '+' string → null", () => {
  assertEquals(normalizePhone("+"), null);
});

// ── N38  Formatted US number with + and domain ────────────────────────────────
np("+1-555-867-5309@s.whatsapp.net", "15558675309",
   "N38 US formatted number — + stripped, dashes removed via digit extraction");

// ── N39  @lid JID with trailing whitespace ───────────────────────────────────
// trim() removes trailing space before any replacement runs.
np("5511998765432@lid ", "5511998765432",
   "N39 @lid JID with trailing space — trim then @lid strip");

// ── N40  Tabs and newlines embedded in phone string ──────────────────────────
// trim() only removes leading/trailing whitespace; internal tabs/newlines stay in sanitized,
// but digitsOnly strips them along with all non-digits.
np("55\t11\n998765432@s.whatsapp.net", "5511998765432",
   "N40 embedded tab and newline — removed by digit extraction");

// ─────────────────────────────────────────────────────────────────────────────
// generatePhoneVariants — 40 cases
// ─────────────────────────────────────────────────────────────────────────────
//
// Reminder on the `clean` computation:
//   clean = phone.replace(/\D/g, '').replace(/^\+/, '')
// The second replace(/^\+/, '') is dead code — /\D/g already removes '+'.
// After BUG-3/BUG-4 fixes the variants Set is seeded as:
//   const variants = new Set([clean]);
//   if (clean) variants.add(`+${clean}`);
// (The raw `phone` argument is no longer included verbatim.)
//
// All expected arrays below reflect the FIXED behaviour.
// ─────────────────────────────────────────────────────────────────────────────

// ── V01  13-digit mobile with 9th digit (canonical case) ─────────────────────
// clean="5511998765432", rest="998765432"[0]='9' → without9="551198765432"
gv("5511998765432",
   ["5511998765432", "+5511998765432", "551198765432"],
   "V01 13-digit BR mobile — without9 variant added");

// ── V02  12-digit where rest ALREADY starts with '9' (BUG-2 fixed) ──────────
// clean="551198765432", rest="98765432" starts with '9'.
// BUG-2 fixed: !rest.startsWith('9') guard prevents double-9 "5511998765432".
gv("551198765432",
   ["551198765432", "+551198765432"],
   "V02 12-digit, rest starts with '9' — fixed: no double-9 variant added");

// ── V03  13-digit mobile DDD=64 ───────────────────────────────────────────────
// clean="5564984450900", rest="984450900"[0]='9' → without9="556484450900"
gv("5564984450900",
   ["5564984450900", "+5564984450900", "556484450900"],
   "V03 13-digit, DDD=64 — without9 variant correct");

// ── V04  12-digit, rest starts with '8' (landline style, correct path) ───────
// rest="84450900"[0]='8' — genuinely missing 9th digit.
// with9 = "5564984450900" — correct.
gv("556484450900",
   ["556484450900", "+556484450900", "5564984450900"],
   "V04 12-digit, rest starts with '8' — with9 variant correct");

// ── V05  13-digit, Rio de Janeiro DDD=21 ─────────────────────────────────────
gv("5521999999999",
   ["5521999999999", "+5521999999999", "552199999999"],
   "V05 13-digit, DDD=21 — without9 variant");

// ── V06  11-digit — below the 12-digit threshold ─────────────────────────────
gv("55219999999",
   ["55219999999", "+55219999999"],
   "V06 11 digits — no BR variant added (below threshold)");

// ── V07  13-digit, DDD=00 (invalid area code, still processed) ───────────────
gv("5500984450900",
   ["5500984450900", "+5500984450900", "550084450900"],
   "V07 13-digit, DDD=00 — processed regardless of DDD validity");

// ── V08  10-digit, no Brazilian prefix ───────────────────────────────────────
gv("1234567890",
   ["1234567890", "+1234567890"],
   "V08 10-digit non-BR number — only clean and +clean variants");

// ── V09  11-digit US number ───────────────────────────────────────────────────
gv("14158675309",
   ["14158675309", "+14158675309"],
   "V09 11-digit US number — starts with '1', no BR handling");

// ── V10  Input with leading '+' ───────────────────────────────────────────────
// clean = "5564984450900" (+ stripped by /\D/g).
// variants starts with {clean}, then "+clean" explicitly added.
// without9 "556484450900" added for 13-digit.
gv("+5564984450900",
   ["5564984450900", "+5564984450900", "556484450900"],
   "V10 + prefix input — clean computation strips +, +clean added explicitly");

// ── V11  Raw JID passed directly (BUG-3 fixed) ───────────────────────────────
// clean="5564984450900" (all non-digits stripped from JID).
// BUG-3 fixed: phone no longer seeded into variants; JID not included.
gv("5564984450900@s.whatsapp.net",
   ["5564984450900", "+5564984450900", "556484450900"],
   "V11 raw JID input — fixed: JID string not included as variant");

// ── V12  Only country code (2 digits) ─────────────────────────────────────────
gv("55",
   ["55", "+55"],
   "V12 only country code '55' — length 2 < 12, no BR handling");

// ── V13  Empty string (BUG-4 fixed) ──────────────────────────────────────────
// clean="", phone="".
// BUG-4 fixed: if (clean) guard prevents "+"; BUG-3 fixed: phone not seeded.
// Set = {""} — only the empty string from clean.
gv("",
   [""],
   "V13 empty string — fixed: '+' no longer emitted; only empty string variant");

// ── V14  Trailing space on input (BUG-3 fixed) ───────────────────────────────
// clean="5564984450900" (space stripped by /\D/g); phone not seeded into variants.
gv("5564984450900 ",
   ["5564984450900", "+5564984450900", "556484450900"],
   "V14 trailing space — fixed: raw string with space not included as variant");

// ── V15  Decimal-point number (clean absorbs extra digit) ────────────────────
// "5564984450900.0" → /\D/g removes '.' → clean="55649844509000" (14 digits).
// 14-digit numbers: neither === 13 nor === 12, no BR variants.
// BUG-3 fixed: phone not seeded, so "5564984450900.0" not included.
gv("5564984450900.0",
   ["55649844509000", "+55649844509000"],
   "V15 decimal-point input — dot removed, extra digit → 14 digits, raw string not included");

// ── V16  14-digit number (one too long) ──────────────────────────────────────
gv("55649844509009",
   ["55649844509009", "+55649844509009"],
   "V16 14 digits — startsWith('55') but neither 12 nor 13, no BR variants");

// ── V17  12-digit, rest starts with '9' (BUG-2 fixed) ───────────────────────
// clean="556498445090", rest="98445090"[0]='9'.
// BUG-2 fixed: guard prevents double-9 "5564998445090" from being added.
gv("556498445090",
   ["556498445090", "+556498445090"],
   "V17 12-digit, rest '98445090' starts with '9' — fixed: no double-9 variant");

// ── V18  Typical 13-digit mobile, DDD=11 ─────────────────────────────────────
gv("5511912345678",
   ["5511912345678", "+5511912345678", "551112345678"],
   "V18 13-digit, DDD=11, rest='912345678' → without9 correct");

// ── V19  13-digit, rest starts with '8' (no without9 variant) ───────────────
// rest="812345678"[0]='8' — code correctly does not strip a non-existent 9.
gv("5511812345678",
   ["5511812345678", "+5511812345678"],
   "V19 13-digit, rest starts with '8' — no without9 added (correct)");

// ── V20  12-digit, rest="99999999" (BUG-2 fixed) ─────────────────────────────
// rest="99999999"[0]='9'; BUG-2 fixed: no invalid "5511999999999" (triple-9) added.
gv("551199999999",
   ["551199999999", "+551199999999"],
   "V20 12-digit, rest='99999999' — fixed: no triple-9 subscriber produced");

// ── V21  12-digit, rest starts with '1' (correct with9 path) ────────────────
// rest="12345678"[0]='1' — genuinely missing 9th digit.
// with9 = "5511912345678" → subscriber "912345678" — valid Brazilian mobile format.
gv("551112345678",
   ["551112345678", "+551112345678", "5511912345678"],
   "V21 12-digit, rest starts with '1' — with9 variant is correct");

// ── V22  Plus-prefixed 12-digit (BUG-2 fixed) ────────────────────────────────
// clean="551198765432", "+clean"="+551198765432".
// BUG-2 fixed: rest="98765432" starts with '9' → no double-9 "5511998765432".
gv("+551198765432",
   ["551198765432", "+551198765432"],
   "V22 plus-prefixed 12-digit — fixed: rest starts with '9', no double-9 added");

// ── V23  JID with device suffix passed directly (BUG-3 fixed) ────────────────
// "5564984450900:5@s.whatsapp.net" → clean removes non-digits → "55649844509005" (14 digits)
// ':5' contributes '5' to clean, giving a wrong 14-digit number.
// Neither 12 nor 13, no BR variants. BUG-3 fixed: raw JID not included.
gv("5564984450900:5@s.whatsapp.net",
   ["55649844509005", "+55649844509005"],
   "V23 JID with device suffix — device digit corrupts clean; fixed: raw JID not included");

// ── V24  Non-numeric string (BUG-3 + BUG-4 fixed) ────────────────────────────
// clean=""; BUG-4 fixed: no "+"; BUG-3 fixed: no "abc".
gv("abc",
   [""],
   "V24 non-numeric string — fixed: only empty string from clean; no '+', no 'abc'");

// ── V25  Country code only with + ────────────────────────────────────────────
// clean="55", "+clean"="+55". length=2 < 12, no BR.
gv("+55",
   ["55", "+55"],
   "V25 '+55' only — +clean added explicitly; no BR variants");

// ── V26  Porto Alegre DDD=51, 13-digit ───────────────────────────────────────
gv("5551998765432",
   ["5551998765432", "+5551998765432", "555198765432"],
   "V26 13-digit, DDD=51 — without9 variant correct");

// ── V27  Maceió DDD=82, 13-digit ─────────────────────────────────────────────
gv("5582998765432",
   ["5582998765432", "+5582998765432", "558298765432"],
   "V27 13-digit, DDD=82 — without9 variant correct");

// ── V28  12-digit, DDD=11, rest="99876543" (BUG-2 fixed) ────────────────────
// rest starts with '9'; BUG-2 fixed: no invalid "5511999876543" added.
gv("551199876543",
   ["551199876543", "+551199876543"],
   "V28 12-digit, rest='99876543' — fixed: no invalid double-9 variant");

// ── V29  5-digit number (starts with '55', too short) ────────────────────────
gv("55649",
   ["55649", "+55649"],
   "V29 5-digit starting with '55' — length < 12, no BR handling");

// ── V30  12-digit + trailing letter (BUG-2 + BUG-3 fixed) ───────────────────
// clean="556498445090" (letter stripped); BUG-3 fixed: phone not seeded.
// rest="98445090"[0]='9'; BUG-2 fixed: no double-9 "5564998445090".
gv("556498445090a",
   ["556498445090", "+556498445090"],
   "V30 12-digit + trailing letter — fixed: no raw string, no double-9 variant");

// ── V31  Input surrounded by spaces (BUG-3 fixed) ────────────────────────────
// clean="5564984450900" (spaces stripped); BUG-3 fixed: phone not seeded.
gv("  5564984450900  ",
   ["5564984450900", "+5564984450900", "556484450900"],
   "V31 spaces around input — fixed: raw string with spaces not in variants");

// ── V32  Single zero ──────────────────────────────────────────────────────────
gv("0",
   ["0", "+0"],
   "V32 single zero — no BR handling; '+0' emitted");

// ── V33  Group JID passed directly (BUG-3 fixed) ─────────────────────────────
// clean="120363050625987654" (18 digits), starts with '1' not '55', no BR.
// BUG-3 fixed: raw JID string not included.
gv("120363050625987654@g.us",
   ["120363050625987654", "+120363050625987654"],
   "V33 group JID — starts with '1', no BR; fixed: raw JID not in variants");

// ── V34  14-digit over-long Brazilian-prefixed number ────────────────────────
gv("55119987654321",
   ["55119987654321", "+55119987654321"],
   "V34 14-digit BR-prefixed — neither 12 nor 13, no BR variants");

// ── V35  Vitória DDD=27, 13-digit ─────────────────────────────────────────────
gv("5527998765432",
   ["5527998765432", "+5527998765432", "552798765432"],
   "V35 13-digit, DDD=27 — without9 correct");

// ── V36  12-digit, rest starts with '0' (uncommon, but correct path) ─────────
// rest="08765432"[0]='0' — no 9 already present.
// with9 = "5511908765432" — subscriber "908765432". Valid format.
gv("551108765432",
   ["551108765432", "+551108765432", "5511908765432"],
   "V36 12-digit, rest starts with '0' — with9 is valid; correct path");

// ── V37  12-digit, rest starts with '5' ──────────────────────────────────────
// rest="58765432"[0]='5' — with9 = "5511958765432"
gv("551158765432",
   ["551158765432", "+551158765432", "5511958765432"],
   "V37 12-digit, rest starts with '5' — with9 correct");

// ── V38  Correct variant count for canonical 13-digit input ───────────────────
// variants = {clean} + "+clean" = 2, then without9 adds third. Total: 3.
Deno.test("generatePhoneVariants | V38 correct variant count for 13-digit canonical input", () => {
  const result = generatePhoneVariants("5511998765432");
  assertEquals(new Set(result).size, result.length, "No duplicate entries");
  assertEquals(result.length, 3); // clean, +clean, without9
});

// ── V39  Reciprocal round-trip: V03↔V04 ──────────────────────────────────────
// V03: "5564984450900" (13) produces without9 "556484450900"
// V04: "556484450900" (12) produces with9 "5564984450900"
// Both values appear in each other's results → bidirectional lookup works.
Deno.test("generatePhoneVariants | V39 round-trip: 13-digit↔12-digit pair covers each other", () => {
  const from13 = generatePhoneVariants("5564984450900");
  const from12 = generatePhoneVariants("556484450900");
  assertEquals(from13.includes("556484450900"), true, "13→12 variant present");
  assertEquals(from12.includes("5564984450900"), true, "12→13 variant present");
});

// ── V40  Dead-code in clean computation (second replace is no-op) ─────────────
// The .replace(/^\+/, '') after /\D/g is dead code: /\D/g already removes '+'.
// Verify that "+5511998765432" produces the same clean as "5511998765432".
Deno.test("generatePhoneVariants | V40 second replace(/^\\+/, '') is dead code — same result as bare digits", () => {
  const withPlus  = generatePhoneVariants("+5511998765432");
  const withoutPlus = generatePhoneVariants("5511998765432");
  // Both should produce the same canonical set (phone slot may differ but core variants match)
  const setWith    = new Set(withPlus);
  const setWithout = new Set(withoutPlus);
  // clean and Brazilian variants must be identical
  assertEquals(setWith.has("5511998765432"), true);
  assertEquals(setWith.has("+5511998765432"), true);
  assertEquals(setWith.has("551198765432"), true);
  assertEquals(setWithout.has("5511998765432"), true);
  assertEquals(setWithout.has("+5511998765432"), true);
  assertEquals(setWithout.has("551198765432"), true);
});
