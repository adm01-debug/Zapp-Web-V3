import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_USERINFO  = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_REVOKE    = 'https://oauth2.googleapis.com/revoke';
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.compose','https://www.googleapis.com/auth/gmail.labels','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'].join(' ');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  const jsonHeaders = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };
  const supabase = createClient((Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!, (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!, { db: { schema: "zapp" } });
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const redirectUri = Deno.env.get('GMAIL_REDIRECT_URI') ?? `${(Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))}/functions/v1/gmail-oauth`;
  try {
    const body = await req.json().catch(() => ({}));
    const rawAction = body.action as string | undefined;
    const actionMap: Record<string, string> = { 'get-auth-url': 'getAuthUrl', 'exchange-code': 'exchangeCode', 'refresh-token': 'refresh', 'disconnect': 'revoke', 'list-accounts': 'listAccounts' };
    const action = rawAction && actionMap[rawAction] ? actionMap[rawAction] : rawAction;
    if (action === 'getAuthUrl') {
      const state = crypto.randomUUID();
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: GMAIL_SCOPES, access_type: 'offline', prompt: 'consent', state });
      return new Response(JSON.stringify({ url: `${GOOGLE_AUTH_URL}?${params}`, state }), { headers: jsonHeaders });
    }
    if (action === 'exchangeCode') {
      const { code, userId } = body;
      if (!code || !userId) return new Response(JSON.stringify({ error: 'code e userId obrigat\u00f3rios' }), { status: 400, headers: jsonHeaders });
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(10_000) });
      const tokens = await tokenRes.json();
      if (tokens.error) return new Response(JSON.stringify({ error: tokens.error_description ?? tokens.error }), { status: 400, headers: jsonHeaders });
      const profileRes = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10_000) });
      const profile = await profileRes.json();
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
      const { data: account, error: upsertErr } = await supabase.from('gmail_accounts').upsert({ user_id: userId, email: profile.email, display_name: profile.name, picture_url: profile.picture, access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expiry: expiresAt, scope: tokens.scope, is_active: true }, { onConflict: 'user_id,email' }).select('id, email').single();
      if (upsertErr) { console.error('[gmail-oauth] account upsert failed', upsertErr.message); return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: jsonHeaders }); }
      return new Response(JSON.stringify({ success: true, accountId: account.id, email: account.email }), { headers: jsonHeaders });
    }
    if (action === 'refresh') {
      const { accountId } = body;
      if (!accountId) return new Response(JSON.stringify({ error: 'accountId obrigat\u00f3rio' }), { status: 400, headers: jsonHeaders });
      const { data: account, error: fetchErr } = await supabase.from('gmail_accounts').select('refresh_token').eq('id', accountId).single();
      if (fetchErr || !account) return new Response(JSON.stringify({ error: 'Conta n\u00e3o encontrada' }), { status: 404, headers: jsonHeaders });
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: account.refresh_token, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(10_000) });
      const tokens = await tokenRes.json();
      if (tokens.error) { await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId); return new Response(JSON.stringify({ error: 'refresh_token inv\u00e1lido \u2014 reconecte a conta' }), { status: 401, headers: jsonHeaders }); }
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
      await supabase.from('gmail_accounts').update({ access_token: tokens.access_token, token_expiry: expiresAt, ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}) }).eq('id', accountId);
      return new Response(JSON.stringify({ access_token: tokens.access_token, token_expiry: expiresAt }), { headers: jsonHeaders });
    }
    if (action === 'revoke') {
      const { accountId } = body;
      if (!accountId) return new Response(JSON.stringify({ error: 'accountId obrigat\u00f3rio' }), { status: 400, headers: jsonHeaders });
      const { data: account } = await supabase.from('gmail_accounts').select('access_token').eq('id', accountId).single();
      if (account?.access_token) {
        try { await fetch(GOOGLE_REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: account.access_token }), signal: AbortSignal.timeout(10_000) }); }
        catch (revokeErr) { console.warn('[gmail-oauth] Google revoke failed (continuing with DB deletion)', revokeErr instanceof Error ? revokeErr.message : String(revokeErr)); }
      }
      await supabase.from('gmail_accounts').delete().eq('id', accountId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.has('code')) {
      const code = url.searchParams.get('code')!;
      const state = url.searchParams.get('state');
      const errorP = url.searchParams.get('error');
      const safeJsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');
      if (errorP) return new Response(`<script>window.opener?.postMessage({type:'gmail-oauth-error',error:${safeJsonForScript(errorP)},state:${safeJsonForScript(state)}},'*');window.close()</script>`, { headers: { 'Content-Type': 'text/html' } });
      return new Response(`<script>\n          window.opener?.postMessage({type:'gmail-oauth-code',code:${safeJsonForScript(code)},state:${safeJsonForScript(state)}},'*');\n          window.close();\n        </script>`, { headers: { 'Content-Type': 'text/html' } });
    }
    return new Response(JSON.stringify({ error: 'A\u00e7\u00e3o desconhecida' }), { status: 400, headers: jsonHeaders });
  } catch (err) {
    console.error('[gmail-oauth]', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: jsonHeaders });
  }
});