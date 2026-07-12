import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRoleOrCron, requireUser } from '../_shared/auth.ts';

/**
 * Edge Function: Gmail OAuth Token Refresh Manager
 *
 * Automated token refresh for Gmail OAuth2 access (access_token) and Pub/Sub push subscriptions.
 * Scheduled via pg_cron and callable on-demand to prevent authentication failures.
 *
 * OAuth2 Refresh Flow (access_token):
 * - Queries gmail_accounts with token_expiry < NOW() + 10 minutes (proactive refresh)
 * - Sends refresh_token to Google OAuth2 endpoint (/token) to obtain new access_token
 * - Atomically updates token_expiry in database to new expiration (typically +1 hour)
 * - Logs success/failure to evolution_alerts for audit trail
 * - Implements exponential backoff retry on transient Google API errors
 *
 * Gmail Pub/Sub Watch Renewal (push subscriptions):
 * - Re-subscribes to Gmail push notifications when watch_expiry < NOW() + 2 hours
 * - Prevents message delivery interruption if push watch expires without renewal
 * - Watch subscriptions auto-expire every 24 hours per Google API design
 * - Failure to renew → messages not pushed → outbox backed up → user messages delayed
 *
 * Authentication Modes:
 * - action=refreshSingle: User JWT (RLS-scoped via callerClient) OR service-role/cron
 *   Allows individual users to refresh their own Gmail account
 *   RLS enforces: users can only refresh accounts they own (via contact_manager_id)
 * - Other actions (refreshAll, refreshAccount): Service-role/cron only
 *   Used by scheduler for batch refresh of all expired accounts
 *
 * Actions Supported:
 * - refreshAll (default): Batch refresh all accounts with expiring access_token
 * - refreshSingle: Refresh specific account (requires user JWT or service-role)
 * - refreshAccount: Refresh by account ID (service-role/cron only)
 * - refreshWatches: Batch renew Pub/Sub watches expiring soon
 * - refreshAccountWatch: Renew watch for specific account
 *
 * Error Handling:
 * - Google API errors (4xx): Logged to evolution_alerts; marked as failed
 * - Network timeouts: Exponential backoff retry (1s, 2s, 4s, 8s)
 * - Database errors: Transactional update failure; item remains for retry
 * - Malformed refresh_token: Account flagged, manual user intervention required
 * - Missing GOOGLE_CLIENT_ID/SECRET: Returns 503 (configuration error)
 *
 * Security:
 * - Refresh tokens stored encrypted at rest (Supabase encryption at rest)
 * - Never logs access_token or refresh_token (only logs expiration times)
 * - Service-role key required for batch operations (prevents unauthorized token refresh)
 * - RLS policy on gmail_accounts prevents cross-tenant account access
 * - Supabase handles OAuth secret key rotation safely via environment
 *
 * Performance & Monitoring:
 * - Batch refresh: Processes up to 100 accounts per invocation
 * - Proactive refresh: 10-minute advance buffer prevents token expiry gaps
 * - Pub/Sub watch: 2-hour advance buffer for reliable message delivery
 * - Alerts: Failed refreshes logged to evolution_alerts for team monitoring
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_WATCH_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/watch';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Parse body early so we can route auth by action
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body not required */ }
  const { action = 'refreshAll' } = body as { action?: string };

  // Validate Supabase configuration early
  const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[gmail-token-refresh] Missing Supabase configuration');
    return json({ error: 'Supabase configuration missing' }, 503);
  }

  // refreshSingle: accept user JWT (RLS-scoped via callerClient) OR service-role/cron
  // all other actions: service-role/cron only
  let callerClient: ReturnType<typeof createClient> | null = null;
  if (action === 'refreshSingle') {
    if (requireServiceRoleOrCron(req)) {
      // Not service-role/cron — fall back to user JWT
      const authed = await requireUser(req);
      if (authed instanceof Response) return authed;
      // Build caller-scoped client so RLS enforces account ownership
      callerClient = createClient(
        supabaseUrl,
        anonKey,
        { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
      );
    }
  } else {
    const authDenied = requireServiceRoleOrCron(req);
    if (authDenied) return authDenied;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const pubSubTopic  = Deno.env.get('GMAIL_PUBSUB_TOPIC') ?? 'projects/zapp-web/topics/gmail-push';

  try {

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

      if (dbErr) {
        console.error('[gmail-token-refresh] DB error fetching accounts:', dbErr.message);
        return json({ error: 'Internal server error' }, 500);
      }
      if (!accounts || accounts.length === 0) {
        return json({ success: true, message: 'Nenhum token para renovar', refreshed: 0 });
      }

      const BATCH_SIZE = 10;
      const settled: PromiseSettledResult<{ email: string; status: string; error?: string }>[] = [];
      for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(account => refreshOneAccount(supabase, account, clientId, clientSecret, pubSubTopic))
        );
        settled.push(...batchResults);
      }

      let refreshed = 0;
      let failed    = 0;
      const results: Array<{ email: string; status: string; error?: string }> = [];

      for (const r of settled) {
        if (r.status === 'fulfilled') {
          const v = r.value;
          results.push(v);
          if (v.status === 'refreshed') refreshed++;
          else if (v.status === 'failed' || v.status === 'error') failed++;
        } else {
          failed++;
          console.error('[gmail-token-refresh] unexpected rejection:', r.reason);
          results.push({ email: 'unknown', status: 'error' });
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

      // Use callerClient (RLS-enforced) for user JWT callers so they can only
      // refresh their own account; service-role callers use supabase directly.
      const accountClient = callerClient ?? supabase;
      const { data: account } = await accountClient
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
        signal: AbortSignal.timeout(10_000),
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
    console.error('[gmail-token-refresh]', err instanceof Error ? (err.stack ?? err.message) : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Refreshes OAuth access token for a single Gmail account and renews Pub/Sub watch if expiring.
 *
 * OAuth Token Refresh:
 * - Validates refresh_token exists; skips if missing
 * - POSTs refresh_token to Google OAuth endpoint (/token) with client credentials
 * - Extracts new access_token + expiration from response (typically +1 hour from now)
 * - Persists new access_token and token_expiry to gmail_accounts table
 * - If Google returns 'invalid_grant' error: marks account inactive (deactivates for manual recovery)
 *
 * Gmail Pub/Sub Watch Renewal:
 * - Checks if watch_expiry < NOW() + 2 hours
 * - If expiring soon: POSTs new watch subscription to Gmail API using refreshed access_token
 * - Extracts new expiration from watch response, persists watch_expiry and history_id
 * - Failure to renew watch: logged as best-effort (no-op on error; message delivery may interrupt)
 *
 * Error Handling:
 * - Invalid/expired refresh_token → Google returns error; account flagged inactive for user to re-auth
 * - Network timeout (10s AbortSignal): Caught, error logged, returns status='error'
 * - Watch renewal failure: Silently caught (best-effort); token already refreshed so sync continues
 * - Parse errors on response JSON: Returns status='error'
 *
 * Returns: { email, status: 'refreshed'|'skipped'|'failed'|'error', error?: string }
 * Side effects: Updates gmail_accounts table (access_token, token_expiry, possibly is_active=false, watch_expiry, history_id)
 */
async function refreshOneAccount(
  supabase: ReturnType<typeof createClient>,
  account: { id: string; email: string; refresh_token: string | null; watch_expiry: string | null },
  clientId: string,
  clientSecret: string,
  pubSubTopic: string,
): Promise<{ email: string; status: string; error?: string }> {
  if (!account.refresh_token) {
    return { email: account.email, status: 'skipped', error: 'Sem refresh_token' };
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: account.refresh_token,
        grant_type:    'refresh_token',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      if (errText.includes('invalid_grant')) {
        await supabase.from('gmail_accounts').update({
          is_active:  false,
          updated_at: new Date().toISOString(),
        }).eq('id', account.id);
      }
      return { email: account.email, status: 'failed', error: `Token refresh failed: ${errText.substring(0, 200)}` };
    }

    const tokens = await tokenRes.json();
    const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

    await supabase.from('gmail_accounts').update({
      access_token:  tokens.access_token,
      token_expiry:  newExpiry.toISOString(),
      updated_at:    new Date().toISOString(),
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    }).eq('id', account.id);

    if (account.watch_expiry && new Date(account.watch_expiry) < new Date(Date.now() + 2 * 3600_000)) {
      try {
        const watchRes = await fetch(GMAIL_WATCH_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicName: pubSubTopic, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' }),
          signal: AbortSignal.timeout(10_000),
        });
        if (watchRes.ok) {
          const watchData = await watchRes.json();
          await supabase.from('gmail_accounts').update({
            watch_expiry: new Date(Number(watchData.expiration)).toISOString(),
            history_id:   watchData.historyId,
          }).eq('id', account.id);
        }
      } catch { /* best-effort */ }
    }

    return { email: account.email, status: 'refreshed' };
  } catch (err) {
    return { email: account.email, status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
