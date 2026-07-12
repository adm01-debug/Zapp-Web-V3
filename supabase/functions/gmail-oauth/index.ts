import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_USERINFO  = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_REVOKE    = 'https://oauth2.googleapis.com/revoke';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrlHosted = Deno.env.get('SELFHOSTED_SUPABASE_URL');
  const supabaseUrlDefault = Deno.env.get('SUPABASE_URL');
  const supabaseUrl = (typeof supabaseUrlHosted === 'string' && supabaseUrlHosted.length > 0)
    ? supabaseUrlHosted
    : (typeof supabaseUrlDefault === 'string' && supabaseUrlDefault.length > 0 ? supabaseUrlDefault : '');

  const supabaseServiceKeyHosted = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY');
  const supabaseServiceKeyDefault = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseServiceKey = (typeof supabaseServiceKeyHosted === 'string' && supabaseServiceKeyHosted.length > 0)
    ? supabaseServiceKeyHosted
    : (typeof supabaseServiceKeyDefault === 'string' && supabaseServiceKeyDefault.length > 0 ? supabaseServiceKeyDefault : '');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 503, headers: jsonHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const clientIdRaw = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecretRaw = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const clientId = typeof clientIdRaw === 'string' && clientIdRaw.length > 0 ? clientIdRaw : '';
  const clientSecret = typeof clientSecretRaw === 'string' && clientSecretRaw.length > 0 ? clientSecretRaw : '';

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 503, headers: jsonHeaders });
  }

  const redirectUriRaw = Deno.env.get('GMAIL_REDIRECT_URI');
  const redirectUri = (typeof redirectUriRaw === 'string' && redirectUriRaw.length > 0)
    ? redirectUriRaw
    : `${supabaseUrl}/functions/v1/gmail-oauth`;

  try {
    let bodyRaw: unknown;
    try {
      bodyRaw = await req.json();
    } catch {
      bodyRaw = {};
    }

    if (!bodyRaw || typeof bodyRaw !== 'object' || Array.isArray(bodyRaw)) {
      bodyRaw = {};
    }
    const body = bodyRaw as Record<string, unknown>;

    // Normalize action: accept both camelCase and kebab-case
    const rawAction = typeof body.action === 'string' ? body.action : undefined;
    const actionMap: Record<string, string> = {
      'get-auth-url': 'getAuthUrl',
      'exchange-code': 'exchangeCode',
      'refresh-token': 'refresh',
      'disconnect': 'revoke',
      'list-accounts': 'listAccounts',
    };
    const action = rawAction && actionMap[rawAction] ? actionMap[rawAction] : rawAction;

    // ── 1. getAuthUrl ──────────────────────────────────────────────────
    if (action === 'getAuthUrl') {
      const state    = crypto.randomUUID();
      const params   = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  redirectUri,
        response_type: 'code',
        scope:         GMAIL_SCOPES,
        access_type:   'offline',
        prompt:        'consent',
        state,
      });

      return new Response(
        JSON.stringify({ url: `${GOOGLE_AUTH_URL}?${params}`, state }),
        { headers: jsonHeaders }
      );
    }

    // ── 2. exchangeCode — troca code por tokens ────────────────────────
    if (action === 'exchangeCode') {
      const code = typeof body.code === 'string' ? body.code : '';
      const userId = typeof body.userId === 'string' ? body.userId : '';
      if (!code || !userId) {
        return new Response(JSON.stringify({ error: 'code e userId obrigatórios' }), { status: 400, headers: jsonHeaders });
      }

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
        }),
        signal: AbortSignal.timeout(10_000),
      });

      let tokensRaw: unknown;
      try {
        tokensRaw = await tokenRes.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid token response' }), { status: 400, headers: jsonHeaders });
      }

      if (!tokensRaw || typeof tokensRaw !== 'object' || Array.isArray(tokensRaw)) {
        return new Response(JSON.stringify({ error: 'Invalid token response' }), { status: 400, headers: jsonHeaders });
      }
      const tokens = tokensRaw as Record<string, unknown>;

      if (tokens.error) {
        const errorDesc = typeof tokens.error_description === 'string' ? tokens.error_description : (typeof tokens.error === 'string' ? tokens.error : 'Unknown error');
        return new Response(JSON.stringify({ error: errorDesc }), { status: 400, headers: jsonHeaders });
      }

      const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
      if (!accessToken) {
        return new Response(JSON.stringify({ error: 'No access token received' }), { status: 400, headers: jsonHeaders });
      }

      // Busca perfil do usuário
      const profileRes = await fetch(GOOGLE_USERINFO, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      let profileRaw: unknown;
      try {
        profileRaw = await profileRes.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid profile response' }), { status: 400, headers: jsonHeaders });
      }

      if (!profileRaw || typeof profileRaw !== 'object' || Array.isArray(profileRaw)) {
        return new Response(JSON.stringify({ error: 'Invalid profile response' }), { status: 400, headers: jsonHeaders });
      }
      const profile = profileRaw as Record<string, unknown>;

      // Upsert na tabela gmail_accounts
      const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const profileEmail = typeof profile.email === 'string' ? profile.email : '';
      const profileName = typeof profile.name === 'string' ? profile.name : '';
      const profilePicture = typeof profile.picture === 'string' ? profile.picture : null;
      const refreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null;
      const tokenScope = typeof tokens.scope === 'string' ? tokens.scope : '';

      if (!profileEmail) {
        return new Response(JSON.stringify({ error: 'Profile email not available' }), { status: 400, headers: jsonHeaders });
      }

      const { data: account, error: upsertErr } = await supabase
        .from('gmail_accounts')
        .upsert({
          user_id:       userId,
          email:         profileEmail,
          display_name:  profileName,
          picture_url:   profilePicture,
          access_token:  accessToken,
          refresh_token: refreshToken,
          token_expiry:  expiresAt,
          scope:         tokenScope,
          is_active:     true,
        }, { onConflict: 'user_id,email' })
        .select('id, email')
        .single();

      if (upsertErr) {
        const errorMsg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr);
        console.error('[gmail-oauth] account upsert failed', errorMsg);
        return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: jsonHeaders });
      }

      if (!account || typeof account !== 'object' || Array.isArray(account)) {
        return new Response(JSON.stringify({ error: "Failed to create account" }), { status: 500, headers: jsonHeaders });
      }
      const accountObj = account as Record<string, unknown>;
      const accountId = typeof accountObj.id === 'string' ? accountObj.id : null;
      const accountEmail = typeof accountObj.email === 'string' ? accountObj.email : null;

      if (!accountId || !accountEmail) {
        return new Response(JSON.stringify({ error: "Invalid account response" }), { status: 500, headers: jsonHeaders });
      }

      return new Response(
        JSON.stringify({ success: true, accountId, email: accountEmail }),
        { headers: jsonHeaders }
      );
    }

    // ── 3. refresh — renova access_token ──────────────────────────────
    if (action === 'refresh') {
      const accountId = typeof body.accountId === 'string' ? body.accountId : '';
      if (!accountId) {
        return new Response(JSON.stringify({ error: 'accountId obrigatório' }), { status: 400, headers: jsonHeaders });
      }

      const { data: accountData, error: fetchErr } = await supabase
        .from('gmail_accounts')
        .select('refresh_token')
        .eq('id', accountId)
        .single();

      if (fetchErr || !accountData || typeof accountData !== 'object' || Array.isArray(accountData)) {
        return new Response(JSON.stringify({ error: 'Conta não encontrada' }), { status: 404, headers: jsonHeaders });
      }
      const account = accountData as Record<string, unknown>;
      const refreshToken = typeof account.refresh_token === 'string' ? account.refresh_token : '';
      if (!refreshToken) {
        return new Response(JSON.stringify({ error: 'Refresh token não encontrado' }), { status: 404, headers: jsonHeaders });
      }

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
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

      let tokensRaw: unknown;
      try {
        tokensRaw = await tokenRes.json();
      } catch {
        await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
        return new Response(JSON.stringify({ error: 'refresh token inválido — reconecte a conta' }), { status: 401, headers: jsonHeaders });
      }

      if (!tokensRaw || typeof tokensRaw !== 'object' || Array.isArray(tokensRaw)) {
        await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
        return new Response(JSON.stringify({ error: 'refresh token inválido — reconecte a conta' }), { status: 401, headers: jsonHeaders });
      }
      const tokens = tokensRaw as Record<string, unknown>;

      if (tokens.error && (typeof tokens.error === 'string' || (typeof tokens.error === 'object' && tokens.error !== null))) {
        // Token revogado — marcar conta inativa
        await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
        return new Response(JSON.stringify({ error: 'refresh_token inválido — reconecte a conta' }), { status: 401, headers: jsonHeaders });
      }

      const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const newAccessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
      if (!newAccessToken) {
        return new Response(JSON.stringify({ error: 'No access token in refresh response' }), { status: 400, headers: jsonHeaders });
      }

      const newRefreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null;
      await supabase.from('gmail_accounts').update({
        access_token: newAccessToken,
        token_expiry: expiresAt,
        ...(newRefreshToken ? { refresh_token: newRefreshToken } : {}),
      }).eq('id', accountId);

      return new Response(
        JSON.stringify({ access_token: newAccessToken, token_expiry: expiresAt }),
        { headers: jsonHeaders }
      );
    }

    // ── 4. revoke — revoga acesso e remove conta ──────────────────────
    if (action === 'revoke') {
      const accountId = typeof body.accountId === 'string' ? body.accountId : '';
      if (!accountId) {
        return new Response(JSON.stringify({ error: 'accountId obrigatório' }), { status: 400, headers: jsonHeaders });
      }

      const { data: accountData } = await supabase
        .from('gmail_accounts')
        .select('access_token')
        .eq('id', accountId)
        .single();

      if (accountData && typeof accountData === 'object' && !Array.isArray(accountData)) {
        const account = accountData as Record<string, unknown>;
        const accessToken = typeof account.access_token === 'string' ? account.access_token : '';
        if (accessToken) {
          // Best-effort — a network failure or timeout must not block account deletion
          try {
            await fetch(GOOGLE_REVOKE, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ token: accessToken }),
              signal: AbortSignal.timeout(10_000),
            });
          } catch (revokeErr) {
            console.warn('[gmail-oauth] Google revoke failed (continuing with DB deletion)', revokeErr instanceof Error ? revokeErr.message : String(revokeErr));
          }
        }
      }

      await supabase.from('gmail_accounts').delete().eq('id', accountId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 5. callback — recebido após redirect OAuth (GET) ──────────────
    // Usado quando redirect_uri aponta para este endpoint
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.has('code')) {
      const code = url.searchParams.get('code');
      const _state = url.searchParams.get('state');
      const errorP = url.searchParams.get('error');

      if (typeof errorP === 'string' && errorP.length > 0) {
        const errorMsg = JSON.stringify(errorP);
        return new Response(
          `<script>window.opener?.postMessage({type:'gmail-oauth-error',error:${errorMsg}},'*');window.close()</script>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      if (typeof code !== 'string' || code.length === 0) {
        return new Response(
          `<script>window.opener?.postMessage({type:'gmail-oauth-error',error:'No code received'},'*');window.close()</script>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      // Retorna o code para o popup processar via exchangeCode
      const codeEscaped = JSON.stringify(code);
      return new Response(
        `<script>
          window.opener?.postMessage({type:'gmail-oauth-code',code:${codeEscaped}},'*');
          window.close();
        </script>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), { status: 400, headers: jsonHeaders });

  } catch (err) {
    console.error('[gmail-oauth]', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: jsonHeaders });
  }
});
