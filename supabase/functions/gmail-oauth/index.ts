import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const redirectUri  = Deno.env.get('GMAIL_REDIRECT_URI') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-oauth`;

  try {
    const body = await req.json().catch(() => ({}));
    // Normalize action: accept both camelCase and kebab-case
    const rawAction = body.action as string | undefined;
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. exchangeCode — troca code por tokens ────────────────────────
    if (action === 'exchangeCode') {
      const { code, userId } = body;
      if (!code || !userId) {
        return new Response(JSON.stringify({ error: 'code e userId obrigatórios' }), { status: 400, headers: corsHeaders });
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
      });

      const tokens = await tokenRes.json();
      if (tokens.error) {
        return new Response(JSON.stringify({ error: tokens.error_description ?? tokens.error }), { status: 400, headers: corsHeaders });
      }

      // Busca perfil do usuário
      const profileRes = await fetch(GOOGLE_USERINFO, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json();

      // Upsert na tabela gmail_accounts
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

      const { data: account, error: upsertErr } = await supabase
        .from('gmail_accounts')
        .upsert({
          user_id:       userId,
          email:         profile.email,
          display_name:  profile.name,
          picture_url:   profile.picture,
          access_token:  tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry:  expiresAt,
          scope:         tokens.scope,
          is_active:     true,
        }, { onConflict: 'user_id,email' })
        .select('id, email')
        .single();

      if (upsertErr) {
        return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: corsHeaders });
      }

      return new Response(
        JSON.stringify({ success: true, accountId: account.id, email: account.email }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 3. refresh — renova access_token ──────────────────────────────
    if (action === 'refresh') {
      const { accountId } = body;
      if (!accountId) {
        return new Response(JSON.stringify({ error: 'accountId obrigatório' }), { status: 400, headers: corsHeaders });
      }

      const { data: account, error: fetchErr } = await supabase
        .from('gmail_accounts')
        .select('refresh_token')
        .eq('id', accountId)
        .single();

      if (fetchErr || !account) {
        return new Response(JSON.stringify({ error: 'Conta não encontrada' }), { status: 404, headers: corsHeaders });
      }

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: account.refresh_token,
          client_id:     clientId,
          client_secret: clientSecret,
          grant_type:    'refresh_token',
        }),
      });

      const tokens = await tokenRes.json();
      if (tokens.error) {
        // Token revogado — marcar conta inativa
        await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
        return new Response(JSON.stringify({ error: 'refresh_token inválido — reconecte a conta' }), { status: 401, headers: corsHeaders });
      }

      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

      await supabase.from('gmail_accounts').update({
        access_token: tokens.access_token,
        token_expiry: expiresAt,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      }).eq('id', accountId);

      return new Response(
        JSON.stringify({ access_token: tokens.access_token, token_expiry: expiresAt }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 4. revoke — revoga acesso e remove conta ──────────────────────
    if (action === 'revoke') {
      const { accountId } = body;
      if (!accountId) {
        return new Response(JSON.stringify({ error: 'accountId obrigatório' }), { status: 400, headers: corsHeaders });
      }

      const { data: account } = await supabase
        .from('gmail_accounts')
        .select('access_token')
        .eq('id', accountId)
        .single();

      if (account?.access_token) {
        await fetch(GOOGLE_REVOKE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: account.access_token }),
        });
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
      const code    = url.searchParams.get('code')!;
      const _state  = url.searchParams.get('state');
      const errorP  = url.searchParams.get('error');

      if (errorP) {
        return new Response(
          `<script>window.opener?.postMessage({type:'gmail-oauth-error',error:'${errorP}'},'*');window.close()</script>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      // Retorna o code para o popup processar via exchangeCode
      return new Response(
        `<script>
          window.opener?.postMessage({type:'gmail-oauth-code',code:'${code}'},'*');
          window.close();
        </script>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
