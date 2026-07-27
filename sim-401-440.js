const SB = 'https://supabase.atomicabr.com.br';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJtaSI6IDE3MTUwNTA4MDAKfQ.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk';

const results = [];
let pass = 0, fail = 0;

async function test(name, fn) {
  try {
    const r = await fn();
    console.log((r ? '✅' : '❌') + ' ' + name);
    results.push({ name, ok: r });
    if (r) pass++; else fail++;
  } catch(e) {
    console.log('❌ ' + name + ': ' + e.message.substring(0, 100));
    results.push({ name, ok: false });
    fail++;
  }
}

async function run() {

  // --- AUTH + SESSION ---
  await test('AUTH-2: /auth/v1/userinfo with valid token', async () => {
    const r = await fetch(SB + '/auth/v1/userinfo', {
      headers: { 'Authorization': 'Bearer ' + KEY }
    });
    return r.status < 500;
  });

  await test('AUTH-3: /auth/v1/settings responds', async () => {
    const r = await fetch(SB + '/auth/v1/settings', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- HMAC WEBHOOK INTEGRITY ---
  await test('HMAC-1: /functions/v1/evolution-webhook no-signature = 401', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'bad' }
    });
    return r.status === 401;
  });

  await test('HMAC-2: /functions/v1/evolution-webhook empty-body = 400', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return r.status === 400;
  });

  // --- CORS PREFLIGHT ---
  await test('CORS-1: OPTIONS preflight on /functions/v1/ returns 200', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-chatbot', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://zapp.atomicabr.com.br',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,apikey'
      }
    });
    return r.status === 200;
  });

  await test('CORS-2: OPTIONS on /rest/v1/ returns 200', async () => {
    const r = await fetch(SB + '/rest/v1/contacts', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://zapp.atomicabr.com.br' }
    });
    return r.status === 200;
  });

  // --- BROADCAST CHANNELS ---
  await test('BC-1: Broadcast subscriptions on whatsapp_connections', async () => {
    // Test via REST that the table is accessible — actual WS test would need client
    const r = await fetch(SB + '/rest/v1/whatsapp_connections?select=id,status&limit=3', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('BC-2: Broadcast via instance_registry accessible', async () => {
    const r = await fetch(SB + '/rest/v1/instance_registry?select=id,status&limit=5', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- STORAGE BUCKETS ---
  await test('STO-1: /storage/v1/bucket/wa-media accessible', async () => {
    const r = await fetch(SB + '/storage/v1/bucket/wa-media/object', {
      method: 'HEAD',
      headers: { apikey: KEY }
    });
    return r.status < 500; // 400 = no auth, not 500
  });

  await test('STO-2: /storage/v1/bucket/avatars accessible (public)', async () => {
    const r = await fetch(SB + '/storage/v1/bucket/avatars', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('STO-3: /storage/v1/bucket/comprovantes-financeiro accessible', async () => {
    const r = await fetch(SB + '/storage/v1/bucket/comprovantes-financeiro', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- PAGINATION + CURSOR ---
  await test('PAGE-1: evolution_messages paginated cursor < 500ms', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/evolution_messages?select=id,created_at&order=created_at.desc&limit=50&offset=0', { headers: { apikey: KEY } });
    return r.status < 500 && Date.now() - t < 500;
  });

  await test('PAGE-2: contacts paginated < 500ms', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/contacts?select=id&order=created_at.desc&limit=20', { headers: { apikey: KEY } });
    return r.status < 500 && Date.now() - t < 500;
  });

  // --- RPC CALLS ---
  await test('RPC-3: fn_get_vault_secret callable', async () => {
    const r = await fetch(SB + '/rest/v1/rpc/zapp_fn_get_vault_secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ p_name: 'test_key' })
    });
    return r.status < 500;
  });

  await test('RPC-4: fn_system_health_score_cached callable', async () => {
    const r = await fetch(SB + '/rest/v1/rpc/zapp_fn_system_health_score_cached', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ p_queue_id: 1, p_refresh: false })
    });
    return r.status < 500;
  });

  await test('RPC-5: rate_limit_check callable', async () => {
    const r = await fetch(SB + '/rest/v1/rpc/zapp_fn_rate_limit_check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000', p_action: 'test_action', p_window_minutes: 1 })
    });
    return r.status < 500;
  });

  // --- NOTIFICATIONS ---
  await test('NOTIF-1: app_notifications filter by type', async () => {
    const r = await fetch(SB + '/rest/v1/app_notifications?select=id,type&type=eq.connection_alert&limit=5', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('NOTIF-2: app_notifications order by created_at', async () => {
    const r = await fetch(SB + '/rest/v1/app_notifications?select=id,created_at&order=created_at.desc&limit=10', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- SQL INJECTION PROTECTION (MCP fix) ---
  await test('SQLI-1: MCP with special chars in query = not 500', async () => {
    const r = await fetch(SB + '/functions/v1/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'supabase_search_contacts',
          arguments: { query: "'; DROP TABLE contacts; --" }
        }
      })
    });
    return r.status < 500;
  });

  await test('SQLI-2: MCP with empty query = graceful', async () => {
    const r = await fetch(SB + '/functions/v1/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'supabase_search_contacts',
          arguments: { query: '' }
        }
      })
    });
    return r.status < 500;
  });

  // --- GMAIL OAUTH ---
  await test('GMAIL-1: gmail_accounts table accessible', async () => {
    const r = await fetch(SB + '/rest/v1/gmail_accounts?select=id,email&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('GMAIL-2: gmail_threads table accessible', async () => {
    const r = await fetch(SB + '/rest/v1/gmail_threads?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- RATE LIMIT STRESS ---
  await test('RATE-3: 100 rapid requests (mixed) all < 500', async () => {
    const promises = Array.from({ length: 100 }, (_, i) => {
      const endpoints = [
        SB + '/rest/v1/users?select=id&limit=1',
        SB + '/rest/v1/profiles?select=id&limit=1',
        SB + '/rest/v1/whatsapp_connections?select=id&limit=1',
      ];
      const url = endpoints[i % endpoints.length];
      return fetch(url, { headers: { apikey: KEY } }).then(r => r.status);
    });
    const statuses = await Promise.all(promises);
    return statuses.every(s => s < 500);
  });

  // --- NULL SAFETY ---
  await test('NULL-1: contact_intelligence with NULL contact_id = graceful', async () => {
    const r = await fetch(SB + '/rest/v1/contact_intelligence?select=id&contact_id=eq.&limit=1', { headers: { apikey: KEY } });
    return r.status >= 400 && r.status < 500;
  });

  await test('NULL-2: evolution_messages with NULL remote_jid filter', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_messages?select=id&remote_jid=eq.&limit=1', { headers: { apikey: KEY } });
    return r.status >= 400 && r.status < 500;
  });

  // --- EVOLUTION API ---
  await test('EVO-1: /functions/v1/evolution-api instanceStatus accessible', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ action: 'instanceStatus', instanceName: 'wpp2' })
    });
    return r.status < 500;
  });

  await test('EVO-2: /functions/v1/evolution-api connectionState accessible', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ action: 'connectionState', instanceName: 'wpp2' })
    });
    return r.status < 500;
  });

  console.log('');
  console.log('='.repeat(55));
  console.log('SIM 401-440:  PASS: ' + pass + '/' + (pass+fail) + '  FAIL: ' + fail);
  if (fail > 0) results.filter(r => !r.ok).forEach(r => console.log('  ❌ ' + r.name));
}

run().catch(console.error);
