// supabase/functions/contact-media/index.ts
//
// Returns paginated media (image/video/audio/document) for a given contact.
//
// Supports two pagination modes:
//   - cursor (default, recommended): stable across inserts. Pass `cursor`
//     returned in the previous response. Sorted by (created_at DESC, id DESC).
//   - offset: simple skip/limit. Pass `offset`. Less stable on writes.
//
// Auth: requires a valid Supabase JWT (verified in code).
// RLS on `messages` is enforced via the user-scoped client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface CursorPayload {
  created_at: string;
  id: string;
}

function encodeCursor(c: CursorPayload): string {
  return btoa(JSON.stringify(c));
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(atob(raw));
    if (
      parsed &&
      typeof parsed.created_at === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_TYPES = new Set(["image", "video", "audio", "document", "all"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Accept GET with query params or POST with JSON body.
  let params: Record<string, unknown> = {};
  if (req.method === "GET") {
    const url = new URL(req.url);
    url.searchParams.forEach((v, k) => (params[k] = v));
  } else if (req.method === "POST") {
    try {
      params = (await req.json()) ?? {};
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
  } else {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── Validate input ──────────────────────────────────────────────────
  const contactId = String(params.contact_id ?? "").trim();
  if (!UUID_RE.test(contactId)) {
    return jsonResponse(
      { error: "contact_id is required and must be a UUID" },
      400,
    );
  }

  const limitRaw = Number(params.limit ?? 30);
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 30, 1),
    100,
  );

  const mediaType = String(params.media_type ?? "all").toLowerCase();
  if (!VALID_TYPES.has(mediaType)) {
    return jsonResponse(
      { error: `media_type must be one of: ${[...VALID_TYPES].join(", ")}` },
      400,
    );
  }

  const cursorRaw = params.cursor ? String(params.cursor) : null;
  const offsetRaw =
    params.offset !== undefined && params.offset !== null
      ? Number(params.offset)
      : null;

  let mode: "cursor" | "offset" = "cursor";
  let cursor: CursorPayload | null = null;
  let offset = 0;

  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) return jsonResponse({ error: "Invalid cursor" }, 400);
    mode = "cursor";
  } else if (offsetRaw !== null) {
    if (!Number.isFinite(offsetRaw) || offsetRaw < 0) {
      return jsonResponse({ error: "offset must be a non-negative number" }, 400);
    }
    offset = Math.trunc(offsetRaw);
    mode = "offset";
  }

  // ── Auth: require JWT ───────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // User-scoped client → RLS applies on `messages`.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ── Build query ─────────────────────────────────────────────────────
  // Fetch limit+1 to detect whether there is a next page without a count.
  let q = supabase
    .from("messages")
    .select(
      "id, contact_id, media_url, message_type, content, created_at",
    )
    .eq("contact_id", contactId)
    .not("media_url", "is", null)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (mediaType !== "all") {
    if (mediaType === "audio") {
      q = q.in("message_type", ["audio", "ptt"]);
    } else {
      q = q.eq("message_type", mediaType);
    }
  }

  if (mode === "cursor" && cursor) {
    // Keyset: rows strictly after the cursor in DESC order
    // → (created_at < cursor.created_at) OR (created_at = ... AND id < ...)
    q = q.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
    q = q.limit(limit + 1);
  } else if (mode === "offset") {
    q = q.range(offset, offset + limit); // inclusive → limit+1 rows
  } else {
    q = q.limit(limit + 1);
  }

  const { data, error } = await q;
  if (error) {
    return jsonResponse(
      { error: "Failed to load media", detail: error.message },
      500,
    );
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ created_at: last.created_at, id: last.id })
      : null;
  const nextOffset = hasMore && mode === "offset" ? offset + items.length : null;

  return jsonResponse({
    items,
    page: {
      mode,
      limit,
      count: items.length,
      has_more: hasMore,
      next_cursor: nextCursor,
      next_offset: nextOffset,
    },
  });
});
