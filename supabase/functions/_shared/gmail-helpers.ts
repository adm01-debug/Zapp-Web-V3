/**
 * gmail-helpers.ts — Utilitários compartilhados para Edge Functions Gmail
 *
 * Centraliza: token refresh, MIME parsing, header extraction,
 * persistência de mensagem e thread no Supabase.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Gmail Api constant. */
export const GMAIL_API  = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ── Supabase client (service role) ────────────────────────────────────

/** get Supabase Admin function. */
export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')) ?? '',
    (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? '',
    { db: { schema: 'zapp' }, auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// ── CORS ──────────────────────────────────────────────────────────────

/** cors Headers constant. */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** json Response function. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Token Management ───────────────────────────────────────────────────

/** Gmail Account Row interface definition. */
export interface GmailAccountRow {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  history_id: string | null;
  is_active: boolean;
}

/**
 * Obtém um access_token válido para uma conta.
 * Faz refresh automático se expirado ou prestes a expirar (< 5min).
 * Marca a conta como inativa se o refresh_token for inválido.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  accountId: string
): Promise<string | null> {
  const { data: acc, error } = await supabase
    .from('gmail_accounts')
    .select('id, access_token, token_expiry, refresh_token, is_active')
    .eq('id', accountId)
    .single();

  if (error || !acc || !acc.is_active) return null;

  // Token válido por mais de 5 min → retornar diretamente
  const expiry = new Date(acc.token_expiry).getTime();
  if (Date.now() < expiry - 5 * 60 * 1000) return acc.access_token;

  // Precisa de refresh
  return await refreshAccessToken(supabase, acc.id, acc.refresh_token);
}

/**
 * Renova o access_token usando o refresh_token.
 * Persiste o novo token no Supabase e retorna o novo access_token.
 */
export async function refreshAccessToken(
  supabase: SupabaseClient,
  accountId: string,
  refreshToken: string
): Promise<string | null> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  if (!clientId || !clientSecret) {
    console.warn('[gmail-helpers] refreshAccessToken: GOOGLE_CLIENT_ID/SECRET not configured');
    return null;
  }

  let tokens: Record<string, unknown>;
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[gmail-helpers] refreshAccessToken HTTP ${res.status} from Google`);
      return null;
    }
    tokens = await res.json();
  } catch (err) {
    console.warn('[gmail-helpers] refreshAccessToken network/parse error', err instanceof Error ? err.message : String(err));
    return null;
  }

  if (tokens.error) {
    // refresh_token inválido ou revogado → desativar conta
    console.warn(`[gmail-helpers] refresh_token inválido para ${accountId}: ${tokens.error}`);
    await supabase
      .from('gmail_accounts')
      .update({ is_active: false })
      .eq('id', accountId);
    return null;
  }

  const newExpiry = new Date(
    Date.now() + (tokens.expires_in ?? 3600) * 1000
  ).toISOString();

  await supabase.from('gmail_accounts').update({
    access_token: tokens.access_token,
    token_expiry: newExpiry,
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
  }).eq('id', accountId);

  return tokens.access_token;
}

// ── Header parsing ─────────────────────────────────────────────────────

/** parse Headers function. */
export function parseHeaders(
  headers: Array<{ name: string; value: string }>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

/** parse From Header function. */
export function parseFromHeader(from: string): { name: string; email: string } {
  const m = from.match(/^(.*?)\s*<(.+?)>$/) ?? [];
  return {
    name:  (m[1]?.trim() ?? from).replace(/^"|"$/g, ''),
    email: m[2] ?? from,
  };
}

/** parse Email List function. */
export function parseEmailList(raw: string): string[] {
  return (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

// ── MIME / Body extraction ─────────────────────────────────────────────

/** Email Body interface definition. */
export interface EmailBody {
  plain: string;
  html:  string;
  hasAttachments: boolean;
}

/** extract Body function. */
export function extractBody(payload: Record<string, unknown>): EmailBody {
  let plain = '';
  let html  = '';
  let hasAttachments = false;

  function walk(parts: unknown[]): void {
    for (const part of parts ?? []) {
      const p = part as Record<string, unknown>;
      const bodyData = ((p.body as Record<string, string>)?.data ?? '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      if (p.mimeType === 'text/plain' && bodyData) {
        try { plain = atob(bodyData); } catch { /* ignore */ }
      } else if (p.mimeType === 'text/html' && bodyData) {
        try { html = atob(bodyData); } catch { /* ignore */ }
      } else if (p.filename) {
        hasAttachments = true;
      }

      if (Array.isArray(p.parts)) walk(p.parts as unknown[]);
    }
  }

  if (payload?.parts) {
    walk(payload.parts as unknown[]);
  } else if (payload?.body) {
    const data = ((payload.body as Record<string, string>).data ?? '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    if (data) {
      try {
        if (payload.mimeType === 'text/html') html = atob(data);
        else plain = atob(data);
      } catch { /* ignore */ }
    }
  }

  // Check for attachments in top-level parts
  if (!hasAttachments && payload?.parts) {
    hasAttachments = (payload.parts as unknown[]).some(
      (p) => !!(p as Record<string, unknown>).filename
    );
  }

  return { plain, html, hasAttachments };
}

// ── Persist message + thread ───────────────────────────────────────────

/**
 * Persiste uma mensagem Gmail completa no Supabase,
 * criando ou atualizando a thread pai automaticamente.
 */
export async function persistGmailMessage(
  supabase: SupabaseClient,
  accountId: string,
  msg: Record<string, unknown>
): Promise<{ threadDbId: string | null; messageDbId: string | null }> {
  if (!msg || msg.error) return { threadDbId: null, messageDbId: null };

  const headers    = parseHeaders((msg.payload as Record<string, unknown>)?.headers as Array<{ name: string; value: string }> ?? []);
  const threadGmailId = msg.threadId as string;
  const messageId  = msg.id as string;
  const subject    = headers['subject'] ?? '(sem assunto)';
  const fromParsed = parseFromHeader(headers['from'] ?? '');
  const toList     = parseEmailList(headers['to'] ?? '');
  const ccList     = parseEmailList(headers['cc'] ?? '');
  const snippet    = (msg.snippet as string) ?? '';
  const labelIds   = (msg.labelIds as string[]) ?? [];
  const isRead     = !labelIds.includes('UNREAD');
  const isSent     = labelIds.includes('SENT');
  const date       = msg.internalDate
    ? new Date(Number(msg.internalDate)).toISOString()
    : new Date().toISOString();

  const { plain, html, hasAttachments } = extractBody(msg.payload as Record<string, unknown>);

  // Upsert thread
  const { data: thread } = await supabase
    .from('gmail_threads')
    .upsert({
      account_id:          accountId,
      thread_id:           threadGmailId,
      subject,
      snippet,
      label_ids:           labelIds,
      last_message_at:     date,
      unread_count:        isRead ? 0 : 1,
      participant_emails:  [fromParsed.email, ...toList].filter(Boolean),
    }, { onConflict: 'account_id,thread_id' })
    .select('id')
    .single();

  if (!thread) return { threadDbId: null, messageDbId: null };

  // Upsert message
  const { data: savedMsg } = await supabase
    .from('gmail_messages')
    .upsert({
      thread_id_ref:   thread.id,
      account_id:      accountId,
      message_id:      messageId,
      from_email:      fromParsed.email,
      from_name:       fromParsed.name,
      to_emails:       toList,
      cc_emails:       ccList,
      bcc_emails:      [],
      subject,
      body_plain:      plain.substring(0, 50_000),
      body_html:       html.substring(0, 200_000),
      snippet,
      label_ids:       labelIds,
      is_read:         isRead,
      is_sent:         isSent,
      has_attachments: hasAttachments,
      internal_date:   date,
    }, { onConflict: 'account_id,message_id' })
    .select('id')
    .single();

  return { threadDbId: thread.id, messageDbId: savedMsg?.id ?? null };
}

// ── Gmail API fetch helpers ────────────────────────────────────────────

/** fetch Gmail Message function. */
export async function fetchGmailMessage(
  token: string,
  messageId: string
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn('[gmail-helpers] fetchGmailMessage network error', err instanceof Error ? err.message : String(err));
    return { error: { code: 0, message: 'network_error' } };
  }
  if (!res.ok) return { error: { code: res.status, message: res.statusText } };
  return await res.json().catch(() => ({ error: { code: res.status, message: 'invalid JSON' } }));
}

/** fetch Gmail History function. */
export async function fetchGmailHistory(
  token: string,
  startHistoryId: string
): Promise<{ addedMessageIds: string[]; newHistoryId?: string }> {
  let res: Response;
  try {
    res = await fetch(
      `${GMAIL_API}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    );
  } catch (err) {
    console.warn('[gmail-helpers] fetchGmailHistory network error', err instanceof Error ? err.message : String(err));
    return { addedMessageIds: [] };
  }
  if (!res.ok) return { addedMessageIds: [] };
  const data = await res.json().catch(() => ({}));
  if (data.error) return { addedMessageIds: [] };

  const addedMessageIds: string[] = [];
  for (const record of data.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      addedMessageIds.push(added.message.id);
    }
  }

  return {
    addedMessageIds,
    newHistoryId: data.historyId,
  };
}
