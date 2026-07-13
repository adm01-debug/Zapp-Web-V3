/**
 * @file src/lib/index.ts
 * @description Curated barrel for frequently-used, leaf-level lib utilities.
 *
 * ⚠️  STRICT RULES FOR THIS FILE ⚠️
 * 1. Only include files that import exclusively from external packages (never from @/lib/*)
 * 2. Adding a file here that imports from @/lib/* creates CIRCULAR DEPENDENCIES → runtime crash
 * 3. This barrel must stay small and focused — heavy utilities should be imported directly
 * 4. When in doubt, leave it out (direct imports are always safe)
 *
 * Current safe exports:
 *   utils       → cn()          (clsx + tailwind-merge)
 *   formatters  → formatDate, formatPhone, formatRelativeTime, formatBytes…
 *   normalizers → normalizePhone, normalizeEmail, normalizeWhatsAppPhone…
 *   phoneUtils  → isValidBrazilianPhone, formatBrazilianPhone, extractDDD…
 *   jid         → parseJid, normalizeJid, buildJid, isGroupJid, isNewsletterJid…
 *   sanitize    → sanitizeText, sanitizeHtml, sanitizeUrl, sanitizeContactFields…
 *
 * Excluded intentionally (see commit message for reasons):
 *   sanitize-v2, avatar-colors, contact-health, web-vitals, react-refs
 */

// ─── Core UI helpers ───────────────────────────────────────────────────────────
// cn() combines class names with Tailwind deduplication. This is the single
// most-imported lib function in the entire codebase.
export { cn } from './utils';

// ─── Data formatters ──────────────────────────────────────────────────────────
// Human-readable formatting for dates, phones, file sizes, etc.
// All imports are from external packages (date-fns, intl), no intra-lib deps.
export * from './formatters';

// ─── Data normalizers ─────────────────────────────────────────────────────────
// Input normalization for phones, emails, and WhatsApp numbers.
// Pure functions, no intra-lib deps.
export * from './normalizers';

// ─── Phone validation & formatting ────────────────────────────────────────────
// Brazilian phone number utilities (DDDs, mobile vs landline detection, etc.)
// Pure functions, no intra-lib deps.
export * from './phoneUtils';

// ─── WhatsApp JID utilities ──────────────────────────────────────────────────
// Parse, normalize, and build WhatsApp JIDs (@s.whatsapp.net, @g.us, etc.)
// Pure functions, no intra-lib deps.
export * from './jid';

// ─── HTML sanitization (DOMPurify) ───────────────────────────────────────────
// sanitizeText, sanitizeHtml (→ string), sanitizeUrl, sanitizeContactFields,
// sanitizeForSearch, sanitizePostgrestFilter, truncateText.
// Uses DOMPurify from external npm package, no intra-lib deps.
//
// ✅ sanitize-v2.ts now exports: sanitizeHtmlStrict() → SanitizeResult (strict DOM sanitizer)
// Do NOT barrel-export sanitize-v2 here — consumers should import directly for clarity:
// Consumers needing the v2 API must import directly:
//   import { sanitizeHtmlStrict, sanitizeHtmlWithHooks } from '@/lib/sanitize-v2';
export * from './sanitize';
