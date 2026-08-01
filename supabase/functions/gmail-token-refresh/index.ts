import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * gmail-token-refresh — Renovação automática de tokens Gmail
 *
 * Chamada pelo pg_cron ou manualmente para renovar tokens OAuth2
 * que estão prestes a expirar ou já expiraram.
 *
 * Fluxo:
 * 1. Busca contas com token_expiry < NOW() + 10min
 * 2. Usa refresh_token para obter novo access_token
 * 3. Atualiza token_expiry no banco
 * 4. Registra resultado em evolution_alerts
 *
 * Também renova Pub/Sub watch quando watch_expiry < NOW() + 2h
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_WATCH_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/watch';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const pubSubTopic  = Deno.env.get('GMAIL_PUBSUB_TOPIC') ?? 'projects/zapp-web/topics/gmail-push';

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'refreshAll' } = body;

    // ── refreshAll — renova todos os tokens prestes a expirar ────────────
    if (action === 'refreshAll') {
      if (!clientId || !clientSecret) {
        return json({ error: 'GOOGLE_CLIENT_ID/SECRET não configurados' }, 500);
      }

      // Buscar contas com token expirando em < 10 min
      const { data: accounts, error: dbErr } = await supabase
        .from('gmail_accounts')
        .select('id, email, refresh_token, token_expiry, watch_expiry')
        .eq('is_active', true)
        .lt('token_expiry', new Date(Date.now() + 10 * 60_000).toISOString());

      if (dbErr) return json({ error: dbErr.message }, 500);
      if (!accounts || accounts.length === 0) {
        return json({ success: true, message: 'Nenhum token para renovar', refreshed: 0 });
      }

      let refreshed = 0;
      let failed    = 0;
      const results: Array<{ email: string; status: string; error?: string }> = [];

      for (const account of accounts) {
        try {
          if (!account.refresh_token) {
            results.push({ email: account.email, status: 'skipped', error: 'Sem refresh_token' });
            continue;
          }

          // Chamar Google OAuth2 token endpoint
          const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     clientId,
              client_secret: clientSecret,
              refresh_token: account.refresh_token,
              grant_type:    'refresh_token',
            }),
          });

          if (!tokenRes.ok) {
            const err = await tokenRes.text();
            failed++;
            results.push({ email: account.email, status: 'failed', error: `Token refresh failed: ${err.substring(0, 200)}` });

            // Se invalid_grant, marcar conta como inativa
            if (err.includes('invalid_grant')) {
              await supabase.from('gmail_accounts').update({
                is_active: false,
                updated_at: new Date().toISOString(),
              }).eq('id', account.id);
            }
            continue;
          }

          const tokens = await tokenRes.json();
          const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

          // Atualizar no banco
          await supabase.from('gmail_accounts').update({
            access_token:  tokens.access_token,
            token_expiry:  newExpiry.toISOString(),
            updated_at:    new Date().toISOString(),
            ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
          }).eq('id', account.id);

          refreshed++;
          results.push({ email: account.email, status: 'refreshed' });

          // Se watch também está expirando, renovar
          if (account.watch_expiry && new Date(account.watch_expiry) < new Date(Date.now() + 2 * 3600_000)) {
            try {
              const watchRes = await fetch(GMAIL_WATCH_URL, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${tokens.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  topicName:  pubSubTopic,
                  labelIds:   ['INBOX'],
                  labelFilterBehavior: 'INCLUDE',
                }),
              });

              if (watchRes.ok) {
                const watchData = await watchRes.json();
                await supabase.from('gmail_accounts').update({
                  watch_expiry: new Date(Number(watchData.expiration)).toISOString(),
                  history_id:  watchData.historyId,
                }).eq('id', account.id);
              }
            } catch {
              // Watch renewal é best-effort
            }
          }

        } catch (err) {
          failed++;
          results.push({
            email: account.email,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Registrar resultado
      if (refreshed > 0 || failed > 0) {
        await supabase.from('evolution_alerts').insert({
          alert_type: 'gmail_token_refresh',
          severity:   failed > 0 ? 'warning' : 'info',
          message:    `Token refresh: ${refreshed} renovados, ${failed} falhas`,
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: 'gmail-token-refresh-fn',
        });
      }

      return json({
        success:   true,
        refreshed,
        failed,
        total:     accounts.length,
        results,
      });
    }

    // ── refreshSingle — renova token de uma conta específica ──────────────
    if (action === 'refreshSingle') {
      const { accountId } = body;
      if (!accountId) return json({ error: 'accountId obrigatório' }, 400);
      if (!clientId || !clientSecret) return json({ error: 'Credenciais não configuradas' }, 500);

      const { data: account } = await supabase
        .from('gmail_accounts')
        .select('id, email, refresh_token')
        .eq('id', accountId)
        .single();

      if (!account) return json({ error: 'Conta não encontrada' }, 404);
      if (!account.refresh_token) return json({ error: 'Sem refresh_token' }, 400);

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     clientId,
          client_secret: clientSecret,
          refresh_token: account.refresh_token,
          grant_type:    'refresh_token',
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return json({ error: `Falha ao renovar: ${err.substring(0, 200)}` }, 400);
      }

      const tokens = await tokenRes.json();
      const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

      await supabase.from('gmail_accounts').update({
        access_token: tokens.access_token,
        token_expiry: newExpiry.toISOString(),
        updated_at:   new Date().toISOString(),
      }).eq('id', accountId);

      return json({ success: true, newExpiry: newExpiry.toISOString() });
    }

    // ── status — verificar status de todos os tokens ─────────────────────
    if (action === 'status') {
      const { data: accounts } = await supabase
        .from('gmail_accounts')
        .select('id, email, is_active, token_expiry, watch_expiry')
        .eq('is_active', true)
        .order('email');

      const status = (accounts ?? []).map(a => ({
        email:          a.email,
        tokenExpiry:    a.token_expiry,
        tokenStatus:    !a.token_expiry ? 'no_token' :
                        new Date(a.token_expiry) < new Date() ? 'expired' :
                        new Date(a.token_expiry) < new Date(Date.now() + 5 * 60_000) ? 'expiring_soon' :
                        'valid',
        watchExpiry:    a.watch_expiry,
        watchStatus:    !a.watch_expiry ? 'no_watch' :
                        new Date(a.watch_expiry) < new Date() ? 'expired' :
                        new Date(a.watch_expiry) < new Date(Date.now() + 3600_000) ? 'expiring_soon' :
                        'active',
      }));

      return json({ accounts: status, count: status.length });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gmail-token-refresh]', msg);
    return json({ error: msg }, 500);
  }
});
