import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
/**
 * email-imap-bridge — Suporte a provedores IMAP/SMTP genéricos (Outlook, Yahoo, etc.)
 *
 * Ações suportadas:
 * - test: Testa credenciais IMAP/SMTP
 * - fetchInbox: Busca emails via IMAP (simulado via Edge Function)
 * - sendMessage: Envia email via SMTP
 * - saveCredentials: Persiste credenciais (criptografadas) no Supabase
 *
 * NOTA: Esta Edge Function serve como foundation para provedores não-Gmail.
 * A integração real com IMAP/SMTP requer um worker externo com acesso TCP
 * (as Edge Functions Supabase são HTTP-only).
 * Para produção, use um serviço como Nylas, EmailEngine ou MailSlurp.
 */

interface ImapSmtpConfig {
  id?: string;
  email: string;
  provider: 'outlook' | 'yahoo' | 'custom';
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  username: string;
  password: string;  // Será criptografado antes de salvar
}

// Configurações pré-definidas por provedor
const PROVIDER_CONFIGS: Record<string, Partial<ImapSmtpConfig>> = {
  outlook: {
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: 'smtp-mail.outlook.com',
    smtp_port: 587,
    smtp_use_tls: true,
  },
  yahoo: {
    imap_host: 'imap.mail.yahoo.com',
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: 'smtp.mail.yahoo.com',
    smtp_port: 587,
    smtp_use_tls: true,
  },
  gmail: {
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_use_tls: true,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const supabaseUrlSelfHosted = Deno.env.get('SELFHOSTED_SUPABASE_URL');
    const supabaseUrlDefault = Deno.env.get('SUPABASE_URL');
    const supabaseUrl = (typeof supabaseUrlSelfHosted === 'string' && supabaseUrlSelfHosted.length > 0)
      ? supabaseUrlSelfHosted
      : (typeof supabaseUrlDefault === 'string' && supabaseUrlDefault.length > 0 ? supabaseUrlDefault : '');

    const supabaseServiceKeyHosted = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY');
    const supabaseServiceKeyDefault = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseServiceKey = (typeof supabaseServiceKeyHosted === 'string' && supabaseServiceKeyHosted.length > 0)
      ? supabaseServiceKeyHosted
      : (typeof supabaseServiceKeyDefault === 'string' && supabaseServiceKeyDefault.length > 0 ? supabaseServiceKeyDefault : '');

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: 'Server configuration error' }, 503);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { db: { schema: "zapp" } });

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

    // ── getProviderConfig — retorna configuração pré-definida ─────────────
    if (action === 'getProviderConfig') {
      const provider = typeof body.provider === 'string' ? body.provider : '';
      if (!provider) {
        return json({ error: `Provider required. Provedores suportados: ${Object.keys(PROVIDER_CONFIGS).join(', ')}` }, 400);
      }
      const config = PROVIDER_CONFIGS[provider.toLowerCase()];
      if (!config) {
        return json({ error: `Provedor desconhecido: ${provider}. Provedores suportados: ${Object.keys(PROVIDER_CONFIGS).join(', ')}` }, 400);
      }
      return json({ config, supported_providers: Object.keys(PROVIDER_CONFIGS) });
    }

    // ── saveCredentials — salva credenciais IMAP/SMTP de forma segura ─────
    if (action === 'saveCredentials') {
      const configRaw = body.config;
      if (!configRaw || typeof configRaw !== 'object' || Array.isArray(configRaw)) {
        return json({ error: 'config object required' }, 400);
      }
      const config = configRaw as Record<string, unknown>;

      // Always bind writes to the authenticated user — never trust body.userId.
      const authUserProp = authed.user;
      if (!authUserProp || typeof authUserProp !== 'object') {
        return json({ error: 'Unauthorized' }, 401);
      }
      const authUserObj = authUserProp as Record<string, unknown>;
      const userId = typeof authUserObj.id === 'string' ? authUserObj.id : '';
      if (!userId) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const configEmail = typeof config.email === 'string' ? config.email : '';
      const configPassword = typeof config.password === 'string' ? config.password : '';

      if (!configEmail || !configPassword) {
        return json({ error: 'config.email e config.password são obrigatórios' }, 400);
      }

      // Encrypt the password with AES-GCM before persisting.
      // IMAP_ENCRYPTION_KEY must be a base64-encoded 32-byte random key set in Supabase secrets.
      const encKeyB64 = Deno.env.get('IMAP_ENCRYPTION_KEY');
      if (!encKeyB64 || typeof encKeyB64 !== 'string' || encKeyB64.length === 0) {
        console.error('[email-imap-bridge] IMAP_ENCRYPTION_KEY not configured — refusing to store credentials in plaintext');
        return json({ error: 'Encryption key not configured' }, 500);
      }

      let passwordEncrypted: string;
      try {
        const rawKey = Uint8Array.from(atob(encKeyB64), c => c.charCodeAt(0));
        const cryptoKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoder.encode(configPassword));
        const combined = new Uint8Array(12 + cipherBuf.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(cipherBuf), 12);
        passwordEncrypted = btoa(String.fromCharCode(...combined));
      } catch (encErr) {
        console.error('[email-imap-bridge] password encryption failed', encErr instanceof Error ? encErr.message : String(encErr));
        return json({ error: 'Internal server error' }, 500);
      }

      // Mescla com configurações do provedor se disponível
      const configProvider = typeof config.provider === 'string' ? config.provider : 'custom';
      const providerDefaults = PROVIDER_CONFIGS[configProvider] ?? {};
      const merged = { ...providerDefaults, ...config };

      const mergedObj = merged as Record<string, unknown>;
      const mergedEmail = typeof mergedObj.email === 'string' ? mergedObj.email : configEmail;
      const mergedProvider = typeof mergedObj.provider === 'string' ? mergedObj.provider : 'custom';
      const mergedImapHost = typeof mergedObj.imap_host === 'string' ? mergedObj.imap_host : '';
      const mergedImapPort = typeof mergedObj.imap_port === 'number' ? mergedObj.imap_port : 993;
      const mergedImapUseSsl = typeof mergedObj.imap_use_ssl === 'boolean' ? mergedObj.imap_use_ssl : true;
      const mergedSmtpHost = typeof mergedObj.smtp_host === 'string' ? mergedObj.smtp_host : '';
      const mergedSmtpPort = typeof mergedObj.smtp_port === 'number' ? mergedObj.smtp_port : 587;
      const mergedSmtpUseTls = typeof mergedObj.smtp_use_tls === 'boolean' ? mergedObj.smtp_use_tls : true;
      const mergedUsername = typeof mergedObj.username === 'string' ? mergedObj.username : mergedEmail;

      if (!mergedImapHost || !mergedSmtpHost) {
        return json({ error: 'imap_host and smtp_host are required' }, 400);
      }

      // Persiste na tabela imap_smtp_accounts
      const { data, error } = await supabase
        .from('imap_smtp_accounts')
        .upsert({
          user_id:       userId,
          email:         mergedEmail,
          provider:      mergedProvider,
          imap_host:     mergedImapHost,
          imap_port:     mergedImapPort,
          imap_use_ssl:  mergedImapUseSsl,
          smtp_host:     mergedSmtpHost,
          smtp_port:     mergedSmtpPort,
          smtp_use_tls:  mergedSmtpUseTls,
          username:      mergedUsername,
          // AES-GCM encrypted: base64(12-byte IV || ciphertext); decrypt with IMAP_ENCRYPTION_KEY.
          // Stored in password_encrypted (not password_hash) to avoid column collision with
          // outlook-oauth, which stores JSON tokens in password_hash and calls JSON.parse() on it.
          password_encrypted: passwordEncrypted,
          is_active:     true,
        }, { onConflict: 'user_id,email' })
        .select('id, email, provider')
        .single();

      if (error) {
        const errMsg = typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string'
          ? (error as Record<string, unknown>).message
          : 'Internal server error';
        console.error('[email-imap-bridge] upsert error', errMsg);
        return json({ error: 'Internal server error' }, 500);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return json({ error: 'Invalid response from database' }, 500);
      }

      const dataObj = data as Record<string, unknown>;
      const accountId = typeof dataObj.id === 'string' ? dataObj.id : null;
      const email = typeof dataObj.email === 'string' ? dataObj.email : null;

      if (!accountId || !email) {
        return json({ error: 'Invalid response from database' }, 500);
      }

      return json({ success: true, accountId, email });
    }

    // ── testConnection — testa se as credenciais são válidas ──────────────
    if (action === 'testConnection') {
      const configRaw = body.config;
      if (!configRaw || typeof configRaw !== 'object' || Array.isArray(configRaw)) {
        return json({ error: 'config object required' }, 400);
      }
      const config = configRaw as Record<string, unknown>;

      const configImapHost = typeof config.imap_host === 'string' ? config.imap_host : '';
      const configSmtpHost = typeof config.smtp_host === 'string' ? config.smtp_host : '';

      if (!configImapHost || !configSmtpHost) {
        return json({ error: 'imap_host e smtp_host são obrigatórios para teste' }, 400);
      }

      // Em Edge Functions, não podemos abrir conexões TCP diretamente.
      // Validação básica de formato e recomendação de uso de serviço externo.
      const issues: string[] = [];

      const configEmail = typeof config.email === 'string' ? config.email : '';
      const configPassword = typeof config.password === 'string' ? config.password : '';
      const configImapPort = typeof config.imap_port === 'number' ? config.imap_port : 993;
      const configSmtpPort = typeof config.smtp_port === 'number' ? config.smtp_port : 587;

      if (!configEmail || !configEmail.includes('@')) issues.push('Email inválido');
      if (!configPassword || configPassword.length < 6) issues.push('Senha muito curta');
      if (configImapPort < 1 || configImapPort > 65535) issues.push('Porta IMAP inválida');
      if (configSmtpPort < 1 || configSmtpPort > 65535) issues.push('Porta SMTP inválida');

      if (issues.length > 0) {
        return json({ valid: false, issues });
      }

      // Para teste real de conexão IMAP/SMTP, recomendamos integração com:
      // - Nylas (nylas.com) — Multi-provider email API
      // - EmailEngine (emailengine.app) — Self-hosted IMAP bridge
      // - MailSlurp — Testing only
      const configProvider = typeof config.provider === 'string' ? config.provider : 'custom';
      const providerConfig = PROVIDER_CONFIGS[configProvider] ?? null;

      return json({
        valid: true,
        message: 'Credenciais válidas (formato). Teste de conectividade TCP não disponível em Edge Functions.',
        recommendation: 'Para suporte completo a IMAP/SMTP, configure EmailEngine ou Nylas como broker.',
        provider_config: providerConfig,
      });
    }

    // ── listProviders — lista provedores suportados ───────────────────────
    if (action === 'listProviders') {
      return json({
        providers: Object.entries(PROVIDER_CONFIGS).map(([key, config]) => {
          const configObj = config as Record<string, unknown>;
          const imapHost = typeof configObj.imap_host === 'string' ? configObj.imap_host : '';
          const smtpHost = typeof configObj.smtp_host === 'string' ? configObj.smtp_host : '';
          return {
            id:    key,
            name:  key.charAt(0).toUpperCase() + key.slice(1),
            imap_host: imapHost,
            smtp_host: smtpHost,
          };
        }),
        note: 'Para Gmail, use a Edge Function gmail-oauth para autenticação OAuth2 (recomendado)',
      });
    }

    return json({ error: `Ação desconhecida: ${action}. Ações válidas: getProviderConfig, saveCredentials, testConnection, listProviders` }, 400);

  } catch (err) {
    console.error('[email-imap-bridge]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});
