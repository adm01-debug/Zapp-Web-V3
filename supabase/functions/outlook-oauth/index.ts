import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const clientId     = Deno.env.get('MICROSOFT_CLIENT_ID');
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  const redirectUri  = Deno.env.get('MICROSOFT_REDIRECT_URI') ??
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/outlook-oauth`;

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ── getAuthUrl — gera URL de autorização OAuth2 ────────────────────
    if (action === 'getAuthUrl') {
      if (!clientId) return json({ error: 'MICROSOFT_CLIENT_ID não configurado' }, 500);

      const state  = crypto.randomUUID();
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

    // ── exchangeCode — troca code por access_token + refresh_token ─────
    if (action === 'exchangeCode') {
      const { code, userId } = body;
      if (!code || !userId) return json({ error: 'code e userId obrigatórios' }, 400);
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
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return json({ error: `Token exchange failed: ${err}` }, 400);
      }

      const tokens = await tokenRes.json();

      // Buscar informações do usuário via Graph API
      const profileRes = await fetch(`${GRAPH_BASE}/me?$select=mail,displayName,userPrincipalName`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      const profile = profileRes.ok ? await profileRes.json() : {};
      const email   = profile.mail ?? profile.userPrincipalName ?? '';

      // Salvar credenciais na tabela imap_smtp_accounts
      const { data, error } = await supabase
        .from('imap_smtp_accounts')
        .upsert({
          user_id:      userId,
          email,
          provider:     'outlook',
          imap_host:    'outlook.office365.com', // IMAP não usado com Graph API
          imap_port:    993,
          imap_use_ssl: true,
          smtp_host:    'smtp-mail.outlook.com',
          smtp_port:    587,
          smtp_use_tls: true,
          username:     email,
          password_hash: JSON.stringify({
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in:    tokens.expires_in,
            acquired_at:   Date.now(),
            provider_type: 'microsoft_graph',
          }),
          is_active:   true,
        }, { onConflict: 'user_id,email' })
        .select('id, email')
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, accountId: data.id, email: data.email, displayName: profile.displayName });
    }

    // ── syncInbox — sincroniza inbox via Graph API ─────────────────────
    if (action === 'syncInbox') {
      const { accountId, pageSize = 50, nextLink } = body;
      if (!accountId) return json({ error: 'accountId obrigatório' }, 400);

      const { data: account } = await supabase
        .from('imap_smtp_accounts')
        .select('email, password_hash')
        .eq('id', accountId)
        .single();

      if (!account) return json({ error: 'Conta não encontrada' }, 404);

      const creds = JSON.parse(account.password_hash);
      const accessToken = await refreshTokenIfNeeded(creds, clientId!, clientSecret!);

      // Buscar mensagens via Graph API
      const url = nextLink ?? `${GRAPH_BASE}/me/mailFolders/inbox/messages?$top=${pageSize}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,hasAttachments,conversationId`;

      const msgsRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgsRes.ok) return json({ error: 'Falha ao buscar mensagens' }, 502);
      const msgsData = await msgsRes.json();

      return json({
        messages: msgsData.value ?? [],
        nextLink: msgsData['@odata.nextLink'] ?? null,
        total:    msgsData['@odata.count'] ?? null,
      });
    }

    // ── sendMessage — envia email via Graph API ───────────────────────
    if (action === 'sendMessage') {
      const { accountId, to, cc, bcc, subject, bodyHtml, attachments } = body;
      if (!accountId || !to || !subject) return json({ error: 'accountId, to e subject obrigatórios' }, 400);

      const { data: account } = await supabase
        .from('imap_smtp_accounts')
        .select('email, password_hash')
        .eq('id', accountId)
        .single();

      if (!account) return json({ error: 'Conta não encontrada' }, 404);

      const creds = JSON.parse(account.password_hash);
      const accessToken = await refreshTokenIfNeeded(creds, clientId!, clientSecret!);

      const message = {
        subject,
        body: { contentType: 'HTML', content: bodyHtml ?? '' },
        toRecipients: toAddresses(to),
        ccRecipients: toAddresses(cc),
        bccRecipients: toAddresses(bcc),
        attachments: attachments?.map((a: { name: string; contentType: string; content: string }) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.name,
          contentType: a.contentType,
          contentBytes: a.content,
        })) ?? [],
      };

      const sendRes = await fetch(`${GRAPH_BASE}/me/sendMail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, saveToSentItems: true }),
      });

      if (!sendRes.ok) {
        const err = await sendRes.text();
        return json({ error: `Envio falhou: ${err}` }, 502);
      }

      return json({ success: true });
    }

    // ── markAsRead — marca mensagem como lida ──────────────────────────
    if (action === 'markAsRead') {
      const { accountId, messageId, isRead = true } = body;
      if (!accountId || !messageId) return json({ error: 'accountId e messageId obrigatórios' }, 400);

      const { data: account } = await supabase
        .from('imap_smtp_accounts')
        .select('password_hash')
        .eq('id', accountId)
        .single();

      if (!account) return json({ error: 'Conta não encontrada' }, 404);

      const creds = JSON.parse(account.password_hash);
      const accessToken = await refreshTokenIfNeeded(creds, clientId!, clientSecret!);

      await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isRead }),
      });

      return json({ success: true });
    }

    // ── getMessageBody — busca corpo completo de uma mensagem ──────────
    if (action === 'getMessageBody') {
      const { accountId, messageId } = body;
      if (!accountId || !messageId) return json({ error: 'accountId e messageId obrigatórios' }, 400);

      const { data: account } = await supabase
        .from('imap_smtp_accounts')
        .select('password_hash')
        .eq('id', accountId)
        .single();

      if (!account) return json({ error: 'Conta não encontrada' }, 404);

      const creds = JSON.parse(account.password_hash);
      const accessToken = await refreshTokenIfNeeded(creds, clientId!, clientSecret!);

      const msgRes = await fetch(`${GRAPH_BASE}/me/messages/${messageId}?$select=id,subject,body,from,toRecipients,ccRecipients,receivedDateTime,isRead`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgRes.ok) return json({ error: 'Mensagem não encontrada' }, 404);
      const msg = await msgRes.json();
      return json({ message: msg });
    }

    // ── listProviderSupport ────────────────────────────────────────────
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

    return json({ error: `Ação desconhecida: ${action}` }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[outlook-oauth]', msg);
    return json({ error: msg }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function toAddresses(emails?: string | string[]): Array<{ emailAddress: { address: string } }> {
  if (!emails) return [];
  const list = Array.isArray(emails) ? emails : [emails];
  return list.filter(Boolean).map(e => ({ emailAddress: { address: e } }));
}

async function refreshTokenIfNeeded(
  creds: { access_token: string; refresh_token?: string; expires_in: number; acquired_at: number },
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const expiryMs = (creds.acquired_at ?? 0) + (creds.expires_in ?? 3600) * 1000;
  const isExpiring = Date.now() > expiryMs - 300_000; // Refresh 5min antes

  if (!isExpiring) return creds.access_token;
  if (!creds.refresh_token) return creds.access_token;

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:    clientId,
      client_secret: clientSecret,
      refresh_token: creds.refresh_token,
      grant_type:   'refresh_token',
      scope:        SCOPES,
    }),
  });

  if (!res.ok) return creds.access_token;
  const tokens = await res.json();
  return tokens.access_token ?? creds.access_token;
}
