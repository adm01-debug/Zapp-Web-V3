import { createZappAdminClient } from '../_shared/db-client.ts';

import { getCorsHeaders } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { checkRateLimit, isValidUUID } from '../_shared/validation.ts';
import { timingSafeStringEqual } from '../_shared/auth.ts';

/** Signs OAuth state token as base64(userId|nonce|hmac) — prevents Account Binding CSRF. */
async function signOAuthState(userId: string, signingKey: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const payload = `${userId}|${nonce}`;
  const keyMaterial = new TextEncoder().encode(signingKey.slice(0, 32).padEnd(32, '0'));
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return btoa(`${payload}|${sigHex}`);
}

/** Verifies state was signed by signOAuthState for this userId. Returns false on any mismatch. */
async function verifyOAuthState(state: string, userId: string, signingKey: string): Promise<boolean> {
  try {
    const decoded = atob(state);
    const parts = decoded.split('|');
    if (parts.length !== 3) return false;
    const [stateUserId, nonce, sig] = parts;
    if (stateUserId !== userId) return false;
    const payload = `${stateUserId}|${nonce}`;
    const keyMaterial = new TextEncoder().encode(signingKey.slice(0, 32).padEnd(32, '0'));
    const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');
    return timingSafeStringEqual(sig, expectedHex);
  } catch {
    return false;
  }
}

/** Validates that a nextLink URL is from Microsoft Graph API only — prevents SSRF. */
function validateGraphNextLink(link: string): string | null {
  try {
    const u = new URL(link);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'graph.microsoft.com') return null;
    return link;
  } catch {
    return null;
  }
}
/**
 * outlook-oauth — Integração Microsoft Graph API para Outlook / Office 365
 *
 * Suporte completo a email Outlook via HTTP (sem IMAP TCP):
 * - Autenticação OAuth2 com PKCE
 * - Sincronização de caixa de entrada
 * - Envio de emails
 * - Leitura de mensagens
 *
 * Requer no Supabase Vault / env vars:
 *   MICROSOFT_CLIENT_ID     — Azure AD App Client ID
 *   MICROSOFT_CLIENT_SECRET — Azure AD App Client Secret
 *   MICROSOFT_REDIRECT_URI  — https://[project].supabase.co/functions/v1/outlook-oauth
 *
 * Scopes necessários no Azure AD:
 *   Mail.ReadWrite, Mail.Send, offline_access, openid, profile, email
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE  = 'https://login.microsoftonline.com/common/oauth2/v2.0';

const SCOPES = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'offline_access',
  'openid',
  'profile',
  'email',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? '';

  const supabase = createZappAdminClient();

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  // All actions (including getAuthUrl) require a valid Supabase JWT
  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;
  const authenticatedUserId = authed.user.id;

  const rl = checkRateLimit(`outlook-oauth:${authenticatedUserId}`, 20, 60_000);
  if (!rl.allowed) return json({ error: 'Rate limit exceeded' }, 429);

  const clientIdRaw = Deno.env.get('MICROSOFT_CLIENT_ID');
  const clientSecretRaw = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  const clientId = typeof clientIdRaw === 'string' && clientIdRaw.length > 0 ? clientIdRaw : '';
  const clientSecret = typeof clientSecretRaw === 'string' && clientSecretRaw.length > 0 ? clientSecretRaw : '';

  const redirectUriRaw = Deno.env.get('MICROSOFT_REDIRECT_URI');
  const redirectUri = (typeof redirectUriRaw === 'string' && redirectUriRaw.length > 0)
    ? redirectUriRaw
    : `${supabaseUrl}/functions/v1/outlook-oauth`;

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
    const action = typeof body.action === 'string' ? body.action : '';

    // ── getAuthUrl — gera URL de autorização OAuth2 ────────────────────
    // State token is HMAC-signed with userId — prevents Account Binding CSRF
    if (action === 'getAuthUrl') {
      if (!clientId) return json({ error: 'MICROSOFT_CLIENT_ID não configurado' }, 500);

      const state  = await signOAuthState(authenticatedUserId, supabaseServiceKey);
      const params = new URLSearchParams({
        client_id:    clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope:        SCOPES,
        state,
        response_mode: 'query',
        prompt:       'select_account',
      });

      return json({
        authUrl: `${AUTH_BASE}/authorize?${params}`,
        state,
      });
    }

    // ── listProviderSupport — informational, no auth needed ───────────
    if (action === 'listProviderSupport') {
      return json({
        providers: [
          { id: 'outlook', name: 'Microsoft Outlook / Office 365', method: 'microsoft_graph', note: 'OAuth2 via Microsoft Graph API — sem IMAP TCP' },
          { id: 'gmail',   name: 'Gmail / Google Workspace',       method: 'google_oauth2',   note: 'OAuth2 via Gmail API — use gmail-oauth function' },
          { id: 'yahoo',   name: 'Yahoo Mail',                     method: 'imap_password',   note: 'App Password + IMAP (requer worker externo)' },
          { id: 'custom',  name: 'Servidor SMTP/IMAP customizado', method: 'imap_password',   note: 'App Password + IMAP (requer worker externo)' },
        ],
        note: 'Gmail e Outlook têm suporte completo via APIs HTTP. Yahoo e IMAP customizado requerem proxy TCP externo.',
      });
    }

    // ── exchangeCode — troca code por access_token + refresh_token ─────
    if (action === 'exchangeCode') {
      const code = typeof body.code === 'string' ? body.code : '';
      const userId = typeof body.userId === 'string' ? body.userId : '';
      const state = typeof body.state === 'string' ? body.state : '';
      if (!code || !userId) return json({ error: 'code e userId obrigatórios' }, 400);
      // Prevent token hijacking: caller may only bind the OAuth code to their own account
      if (userId !== authenticatedUserId) return json({ error: 'Forbidden: userId does not match authenticated user' }, 403);
      // Verify HMAC-signed state — prevents Account Binding CSRF
      if (!state || !await verifyOAuthState(state, authenticatedUserId, supabaseServiceKey)) return json({ error: 'Invalid or missing OAuth state' }, 403);
      if (!clientId || !clientSecret) return json({ error: 'Credenciais Microsoft não configuradas' }, 500);

      const tokenRes = await fetch(`${AUTH_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:    clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type:   'authorization_code',
          scope:        SCOPES,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return json({ error: `Token exchange failed: ${err}` }, 400);
      }

      let tokensRaw: unknown;
      try {
        tokensRaw = await tokenRes.json();
      } catch {
        return json({ error: 'Invalid token response' }, 400);
      }

      if (!tokensRaw || typeof tokensRaw !== 'object' || Array.isArray(tokensRaw)) {
        return json({ error: 'Invalid token response' }, 400);
      }
      const tokens = tokensRaw as Record<string, unknown>;

      const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
      if (!accessToken) {
        return json({ error: 'No access token received' }, 400);
      }

      // Buscar informações do usuário via Graph API
      const profileRes = await fetch(`${GRAPH_BASE}/me?$select=mail,displayName,userPrincipalName`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });

      let profile: Record<string, unknown> = {};
      if (profileRes.ok) {
        try {
          const profileData = await profileRes.json();
          if (profileData && typeof profileData === 'object' && !Array.isArray(profileData)) {
            profile = profileData as Record<string, unknown>;
          }
        } catch {
          // Profile fetch failed, continue with empty profile
        }
      }
      const email = (typeof profile.mail === 'string' ? profile.mail : null) ||
                    (typeof profile.userPrincipalName === 'string' ? profile.userPrincipalName : '');

      // Salvar credenciais na tabela imap_smtp_accounts
      const refreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null;
      const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;

      const { data, error } = await supabase
        .from('imap_smtp_accounts')
        .upsert({
          user_id:      authenticatedUserId,
          email,
          provider:     'outlook',
          imap_host:    'outlook.office365.com',
          imap_port:    993,
          imap_use_ssl: true,
          smtp_host:    'smtp-mail.outlook.com',
          smtp_port:    587,
          smtp_use_tls: true,
          username:     email,
          password_encrypted: JSON.stringify({
            access_token:  accessToken,
            refresh_token: refreshToken,
            expires_in:    expiresIn,
            acquired_at:   Date.now(),
            provider_type: 'microsoft_graph',
          }),
          is_active:   true,
        }, { onConflict: 'user_id,email' })
        .select('id, email')
        .single();

      if (error) {
        const errMsg = typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string'
          ? (error as Record<string, unknown>).message
          : 'Internal server error';
        console.error('[outlook-oauth] upsert error', errMsg);
        return json({ error: 'Internal server error' }, 500);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return json({ error: 'Failed to create account' }, 500);
      }
      const accountData = data as Record<string, unknown>;
      const accountId = typeof accountData.id === 'string' ? accountData.id : null;
      const accountEmail = typeof accountData.email === 'string' ? accountData.email : null;
      const displayName = typeof profile.displayName === 'string' ? profile.displayName : '';

      if (!accountId || !accountEmail) {
        return json({ error: 'Invalid account response' }, 500);
      }

      return json({ success: true, accountId, email: accountEmail, displayName });
    }

    // ── syncInbox — sincroniza inbox via Graph API ─────────────────────
    if (action === 'syncInbox') {
      const accountId = typeof body.accountId === 'string' ? body.accountId : '';
      const pageSize = typeof body.pageSize === 'number' ? Math.max(1, Math.min(body.pageSize, 500)) : 50;
      const nextLink = typeof body.nextLink === 'string' ? body.nextLink : '';
      if (!accountId) return json({ error: 'accountId obrigatório' }, 400);

      const { data: accountData } = await supabase
        .from('imap_smtp_accounts')
        .select('email, password_encrypted')
        .eq('id', accountId)
        .eq('user_id', authenticatedUserId)
        .single();

      if (!accountData || typeof accountData !== 'object' || Array.isArray(accountData)) {
        return json({ error: 'Conta não encontrada' }, 404);
      }
      const account = accountData as Record<string, unknown>;
      const passwordEncrypted = typeof account.password_encrypted === 'string' ? account.password_encrypted : '';

      if (!passwordEncrypted) {
        return json({ error: 'Credentials not found' }, 404);
      }

      let creds: Record<string, unknown>;
      try {
        const credsRaw = JSON.parse(passwordEncrypted);
        if (!credsRaw || typeof credsRaw !== 'object' || Array.isArray(credsRaw)) {
          return json({ error: 'Invalid credentials format' }, 400);
        }
        creds = credsRaw as Record<string, unknown>;
      } catch {
        return json({ error: 'Invalid credentials format' }, 400);
      }

      if (!clientId || !clientSecret) {
        return json({ error: 'Microsoft credentials not configured' }, 500);
      }

      const accessToken = await refreshTokenIfNeeded(creds, clientId, clientSecret);
      if (!accessToken) {
        return json({ error: 'Failed to get access token' }, 401);
      }

      // Buscar mensagens via Graph API — validate nextLink to prevent SSRF
      const safeNextLink = nextLink ? validateGraphNextLink(nextLink) : null;
      if (nextLink && !safeNextLink) return json({ error: 'Invalid nextLink: must be a Microsoft Graph URL' }, 400);
      const url = safeNextLink || `${GRAPH_BASE}/me/mailFolders/inbox/messages?$top=${pageSize}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,hasAttachments,conversationId`;

      const msgsRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!msgsRes.ok) return json({ error: 'Falha ao buscar mensagens' }, 502);

      let msgsDataRaw: unknown;
      try {
        msgsDataRaw = await msgsRes.json();
      } catch {
        return json({ error: 'Invalid response from Microsoft Graph' }, 502);
      }

      if (!msgsDataRaw || typeof msgsDataRaw !== 'object' || Array.isArray(msgsDataRaw)) {
        return json({ error: 'Invalid response from Microsoft Graph' }, 502);
      }
      const msgsData = msgsDataRaw as Record<string, unknown>;

      return json({
        messages: Array.isArray(msgsData.value) ? msgsData.value : [],
        nextLink: typeof msgsData['@odata.nextLink'] === 'string' ? msgsData['@odata.nextLink'] : null,
        total:    typeof msgsData['@odata.count'] === 'number' ? msgsData['@odata.count'] : null,
      });
    }

    // ── sendMessage — envia email via Graph API ───────────────────────
    if (action === 'sendMessage') {
      const accountId = typeof body.accountId === 'string' ? body.accountId : '';
      const to = body.to;
      const cc = body.cc;
      const bcc = body.bcc;
      const subject = typeof body.subject === 'string' ? body.subject : '';
      const bodyHtml = typeof body.bodyHtml === 'string' ? body.bodyHtml : '';
      const attachments = Array.isArray(body.attachments) ? body.attachments : [];

      if (!accountId || !to || !subject) return json({ error: 'accountId, to e subject obrigatórios' }, 400);

      const { data: accountData } = await supabase
        .from('imap_smtp_accounts')
        .select('email, password_encrypted')
        .eq('id', accountId)
        .eq('user_id', authenticatedUserId)
        .single();

      if (!accountData || typeof accountData !== 'object' || Array.isArray(accountData)) {
        return json({ error: 'Conta não encontrada' }, 404);
      }
      const account = accountData as Record<string, unknown>;
      const passwordEncrypted = typeof account.password_encrypted === 'string' ? account.password_encrypted : '';

      if (!passwordEncrypted) {
        return json({ error: 'Credentials not found' }, 404);
      }

      let creds: Record<string, unknown>;
      try {
        const credsRaw = JSON.parse(passwordEncrypted);
        if (!credsRaw || typeof credsRaw !== 'object' || Array.isArray(credsRaw)) {
          return json({ error: 'Invalid credentials format' }, 400);
        }
        creds = credsRaw as Record<string, unknown>;
      } catch {
        return json({ error: 'Invalid credentials format' }, 400);
      }

      if (!clientId || !clientSecret) {
        return json({ error: 'Microsoft credentials not configured' }, 500);
      }

      const accessToken = await refreshTokenIfNeeded(creds, clientId, clientSecret);
      if (!accessToken) {
        return json({ error: 'Failed to get access token' }, 401);
      }

      const validatedAttachments = attachments.map((a: unknown) => {
        if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
        const att = a as Record<string, unknown>;
        return {
          name: typeof att.name === 'string' ? att.name : 'file',
          contentType: typeof att.contentType === 'string' ? att.contentType : 'application/octet-stream',
          content: typeof att.content === 'string' ? att.content : '',
        };
      }).filter((a) => a && typeof a.content === 'string' && a.content.length > 0);

      const message = {
        subject,
        body: { contentType: 'HTML', content: bodyHtml },
        toRecipients: toAddresses(to),
        ccRecipients: toAddresses(cc),
        bccRecipients: toAddresses(bcc),
        attachments: validatedAttachments.map((a) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.name,
          contentType: a.contentType,
          contentBytes: a.content,
        })),
      };

      const sendRes = await fetch(`${GRAPH_BASE}/me/sendMail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, saveToSentItems: true }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!sendRes.ok) {
        let err = '';
        try {
          err = await sendRes.text();
        } catch {
          err = `HTTP ${sendRes.status}`;
        }
        const errorMsg = typeof err === 'string' ? err.slice(0, 200) : String(err).slice(0, 200);
        return json({ error: `Envio falhou: ${errorMsg}` }, 502);
      }

      return json({ success: true });
    }

    // ── markAsRead — marca mensagem como lida ──────────────────────────
    if (action === 'markAsRead') {
      const accountId = typeof body.accountId === 'string' ? body.accountId : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId : '';
      const isRead = typeof body.isRead === 'boolean' ? body.isRead : true;
      if (!accountId || !messageId) return json({ error: 'accountId e messageId obrigatórios' }, 400);

      const { data: accountData } = await supabase
        .from('imap_smtp_accounts')
        .select('password_encrypted')
        .eq('id', accountId)
        .eq('user_id', authenticatedUserId)
        .single();

      if (!accountData || typeof accountData !== 'object' || Array.isArray(accountData)) {
        return json({ error: 'Conta não encontrada' }, 404);
      }
      const account = accountData as Record<string, unknown>;
      const passwordEncrypted = typeof account.password_encrypted === 'string' ? account.password_encrypted : '';

      if (!passwordEncrypted) {
        return json({ error: 'Credentials not found' }, 404);
      }

      let creds: Record<string, unknown>;
      try {
        const credsRaw = JSON.parse(passwordEncrypted);
        if (!credsRaw || typeof credsRaw !== 'object' || Array.isArray(credsRaw)) {
          return json({ error: 'Invalid credentials format' }, 400);
        }
        creds = credsRaw as Record<string, unknown>;
      } catch {
        return json({ error: 'Invalid credentials format' }, 400);
      }

      if (!clientId || !clientSecret) {
        return json({ error: 'Microsoft credentials not configured' }, 500);
      }

      const accessToken = await refreshTokenIfNeeded(creds, clientId, clientSecret);
      if (!accessToken) {
        return json({ error: 'Failed to get access token' }, 401);
      }

      const patchRes = await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isRead }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!patchRes.ok) {
        return json({ error: `Graph API error: ${patchRes.status}` }, 502);
      }

      return json({ success: true });
    }

    // ── getMessageBody — busca corpo completo de uma mensagem ──────────
    if (action === 'getMessageBody') {
      const accountId = typeof body.accountId === 'string' ? body.accountId : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId : '';
      if (!accountId || !messageId) return json({ error: 'accountId e messageId obrigatórios' }, 400);

      const { data: accountData } = await supabase
        .from('imap_smtp_accounts')
        .select('password_encrypted')
        .eq('id', accountId)
        .eq('user_id', authenticatedUserId)
        .single();

      if (!accountData || typeof accountData !== 'object' || Array.isArray(accountData)) {
        return json({ error: 'Conta não encontrada' }, 404);
      }
      const account = accountData as Record<string, unknown>;
      const passwordEncrypted = typeof account.password_encrypted === 'string' ? account.password_encrypted : '';

      if (!passwordEncrypted) {
        return json({ error: 'Credentials not found' }, 404);
      }

      let creds: Record<string, unknown>;
      try {
        const credsRaw = JSON.parse(passwordEncrypted);
        if (!credsRaw || typeof credsRaw !== 'object' || Array.isArray(credsRaw)) {
          return json({ error: 'Invalid credentials format' }, 400);
        }
        creds = credsRaw as Record<string, unknown>;
      } catch {
        return json({ error: 'Invalid credentials format' }, 400);
      }

      if (!clientId || !clientSecret) {
        return json({ error: 'Microsoft credentials not configured' }, 500);
      }

      const accessToken = await refreshTokenIfNeeded(creds, clientId, clientSecret);
      if (!accessToken) {
        return json({ error: 'Failed to get access token' }, 401);
      }

      const msgRes = await fetch(`${GRAPH_BASE}/me/messages/${messageId}?$select=id,subject,body,from,toRecipients,ccRecipients,receivedDateTime,isRead`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!msgRes.ok) return json({ error: 'Mensagem não encontrada' }, 404);

      let msgRaw: unknown;
      try {
        msgRaw = await msgRes.json();
      } catch {
        return json({ error: 'Invalid message response' }, 502);
      }

      if (!msgRaw || typeof msgRaw !== 'object' || Array.isArray(msgRaw)) {
        return json({ error: 'Invalid message response' }, 502);
      }

      return json({ message: msgRaw });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);

  } catch (err) {
    console.error('[outlook-oauth]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function toAddresses(emails?: string | string[]): Array<{ emailAddress: { address: string } }> {
  if (!emails) return [];
  const list = Array.isArray(emails) ? emails : [emails];
  return list
    .filter((e): e is string => typeof e === 'string' && e.length > 0)
    .map(e => ({ emailAddress: { address: e } }));
}

async function refreshTokenIfNeeded(
  creds: Record<string, unknown>,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const accessToken = typeof creds.access_token === 'string' && creds.access_token.length > 0 ? creds.access_token : '';
  const refreshToken = typeof creds.refresh_token === 'string' && creds.refresh_token.length > 0 ? creds.refresh_token : '';
  const acquiredAt = typeof creds.acquired_at === 'number' && Number.isFinite(creds.acquired_at) ? creds.acquired_at : 0;
  const expiresIn = typeof creds.expires_in === 'number' && Number.isFinite(creds.expires_in) ? creds.expires_in : 3600;

  if (!accessToken) return '';

  const expiryMs = acquiredAt + expiresIn * 1000;
  const nowMs = Date.now();
  const isExpiring = Number.isFinite(nowMs) && Number.isFinite(expiryMs) ? nowMs > expiryMs - 300_000 : false; // Refresh 5min antes

  if (!isExpiring) return accessToken;
  if (!refreshToken) return accessToken;

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:    clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:   'refresh_token',
      scope:        SCOPES,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return accessToken;

  let tokensRaw: unknown;
  try {
    tokensRaw = await res.json();
  } catch {
    return accessToken;
  }

  if (!tokensRaw || typeof tokensRaw !== 'object' || Array.isArray(tokensRaw)) {
    return accessToken;
  }
  const tokens = tokensRaw as Record<string, unknown>;
  const newAccessToken = typeof tokens.access_token === 'string' && tokens.access_token.length > 0 ? tokens.access_token : '';
  return newAccessToken || accessToken;
}
