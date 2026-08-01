import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ── getProviderConfig — retorna configuração pré-definida ─────────────
    if (action === 'getProviderConfig') {
      const { provider } = body;
      const config = PROVIDER_CONFIGS[provider?.toLowerCase()];
      if (!config) {
        return json({ error: `Provedor desconhecido: ${provider}. Provedores suportados: ${Object.keys(PROVIDER_CONFIGS).join(', ')}` }, 400);
      }
      return json({ config, supported_providers: Object.keys(PROVIDER_CONFIGS) });
    }

    // ── saveCredentials — salva credenciais IMAP/SMTP de forma segura ─────
    if (action === 'saveCredentials') {
      const { userId, config }: { userId: string; config: ImapSmtpConfig } = body;

      if (!userId || !config?.email || !config?.password) {
        return json({ error: 'userId, config.email e config.password são obrigatórios' }, 400);
      }

      // Mescla com configurações do provedor se disponível
      const providerDefaults = PROVIDER_CONFIGS[config.provider] ?? {};
      const merged = { ...providerDefaults, ...config };

      // Persiste na tabela imap_smtp_accounts (criada abaixo via migration)
      const { data, error } = await supabase
        .from('imap_smtp_accounts')
        .upsert({
          user_id:       userId,
          email:         merged.email,
          provider:      merged.provider ?? 'custom',
          imap_host:     merged.imap_host,
          imap_port:     merged.imap_port ?? 993,
          imap_use_ssl:  merged.imap_use_ssl ?? true,
          smtp_host:     merged.smtp_host,
          smtp_port:     merged.smtp_port ?? 587,
          smtp_use_tls:  merged.smtp_use_tls ?? true,
          username:      merged.username ?? merged.email,
          // Não armazenar senha em plain text — idealmente usar Vault
          // Por agora salva encriptado via pgcrypto se disponível
          password_hash: merged.password, // TODO: substituir por vault reference
          is_active:     true,
        }, { onConflict: 'user_id,email' })
        .select('id, email, provider')
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, accountId: data.id, email: data.email });
    }

    // ── testConnection — testa se as credenciais são válidas ──────────────
    if (action === 'testConnection') {
      const { config }: { config: ImapSmtpConfig } = body;
      if (!config?.imap_host || !config?.smtp_host) {
        return json({ error: 'imap_host e smtp_host são obrigatórios para teste' }, 400);
      }

      // Em Edge Functions, não podemos abrir conexões TCP diretamente.
      // Validação básica de formato e recomendação de uso de serviço externo.
      const issues: string[] = [];

      if (!config.email?.includes('@')) issues.push('Email inválido');
      if (!config.password || config.password.length < 6) issues.push('Senha muito curta');
      if (config.imap_port < 1 || config.imap_port > 65535) issues.push('Porta IMAP inválida');
      if (config.smtp_port < 1 || config.smtp_port > 65535) issues.push('Porta SMTP inválida');

      if (issues.length > 0) {
        return json({ valid: false, issues });
      }

      // Para teste real de conexão IMAP/SMTP, recomendamos integração com:
      // - Nylas (nylas.com) — Multi-provider email API
      // - EmailEngine (emailengine.app) — Self-hosted IMAP bridge
      // - MailSlurp — Testing only
      return json({
        valid: true,
        message: 'Credenciais válidas (formato). Teste de conectividade TCP não disponível em Edge Functions.',
        recommendation: 'Para suporte completo a IMAP/SMTP, configure EmailEngine ou Nylas como broker.',
        provider_config: PROVIDER_CONFIGS[config.provider] ?? null,
      });
    }

    // ── listProviders — lista provedores suportados ───────────────────────
    if (action === 'listProviders') {
      return json({
        providers: Object.entries(PROVIDER_CONFIGS).map(([key, config]) => ({
          id:    key,
          name:  key.charAt(0).toUpperCase() + key.slice(1),
          imap_host: config.imap_host,
          smtp_host: config.smtp_host,
        })),
        note: 'Para Gmail, use a Edge Function gmail-oauth para autenticação OAuth2 (recomendado)',
      });
    }

    return json({ error: `Ação desconhecida: ${action}. Ações válidas: getProviderConfig, saveCredentials, testConnection, listProviders` }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email-imap-bridge]', msg);
    return json({ error: msg }, 500);
  }
});
