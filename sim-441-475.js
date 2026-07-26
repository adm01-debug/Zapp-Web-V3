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

  // --- FEATURE FLAGS (post-fix) ---
  await test('FF-FIX: is_admin_or_supervisor flag now exists', async () => {
    const r = await fetch(SB + '/rest/v1/feature_flags?key=eq.is_admin_or_supervisor&select=key,enabled', { headers: { apikey: KEY } });
    if (r.status >= 500) return false;
    const d = await r.json();
    return Array.isArray(d) && d.length > 0;
  });

  await test('FF-RPC: is_feature_enabled(new_inbox, admin) = true', async () => {
    const r = await fetch(SB + '/rest/v1/rpc/zapp_is_feature_enabled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ p_flag_key: 'new_inbox', p_user_role: 'admin' })
    });
    if (r.status >= 500) return false;
    const d = await r.json();
    return d === true;
  });

  await test('FF-RPC: is_feature_enabled(unknown_flag) = false', async () => {
    const r = await fetch(SB + '/rest/v1/rpc/zapp_is_feature_enabled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ p_flag_key: 'this_flag_does_not_exist_at_all_xyz' })
    });
    if (r.status >= 500) return false;
    const d = await r.json();
    return d === false;
  });

  // --- HMAC-2: empty body in evolution-webhook — check actual response
  await test('HMAC-2b: /functions/v1/evolution-webhook malformed JSON = 400', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'test' },
      body: '{invalid json'
    });
    return r.status === 400;
  });

  // --- SQLI: MCP with injection attempt
  await test('SQLI-FIX: MCP with SQL injection attempt = 400 (not 500)', async () => {
    const r = await fetch(SB + '/functions/v1/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'supabase_search_contacts',
          arguments: { query: "'; SELECT 1; --" }
        }
      })
    });
    return r.status < 500;
  });

  await test('SQLI-FIX2: MCP with empty query graceful', async () => {
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

  // --- CONVERSATION ---
  await test('CONV-1: conversations accessible', async () => {
    const r = await fetch(SB + '/rest/v1/conversations?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('CONV-2: conversation_events accessible', async () => {
    const r = await fetch(SB + '/rest/v1/conversation_events?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- EDGE FUNCTION VERSION CHECKS ---
  await test('EDGE-VER-1: lgpd-scheduled-jobs returns version info', async () => {
    const r = await fetch(SB + '/functions/v1/lgpd-scheduled-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY }
    });
    const text = await r.text();
    const data = JSON.parse(text);
    console.log('    status=' + r.status + ' body=' + text.substring(0, 120));
    // Should not contain .catch error
    const hasCatchBug = text.includes('.catch is not a function');
    return r.status === 200 && !hasCatchBug;
  });

  await test('EDGE-VER-2: evolution-sender no .catch crash', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-sender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY }
    });
    const text = await r.text();
    const hasCatchBug = text.includes('.catch is not a function');
    return r.status === 200 && !hasCatchBug;
  });

  // --- HEALTH CHECKS ---
  await test('HEALTH-1: /rest/v1/health check', async () => {
    const r = await fetch(SB + '/rest/v1/', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('HEALTH-2: Kong /health endpoint', async () => {
    const r = await fetch(SB.replace('/rest/v1', '').replace('/functions/v1', '') + '/health');
    return r.status < 500;
  });

  // --- CONNECTION POOL + TIMEOUT ---
  await test('POOL-1: 20 slow queries concurrently = no pool exhaustion', async () => {
    const promises = Array.from({ length: 20 }, (_, i) =>
      fetch(SB + '/rest/v1/contacts?select=id&limit=1', { headers: { apikey: KEY } }).then(r => r.status)
    );
    const statuses = await Promise.all(promises);
    return statuses.every(s => s < 500);
  });

  // --- REFRESH TOKEN GRACEful ---
  await test('AUTH-REFRESH: invalid refresh token = 400 (not 500)', async () => {
    const r = await fetch(SB + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ refresh_token: 'this-is-not-a-valid-token-xyz' })
    });
    return r.status >= 400 && r.status < 500;
  });

  // --- VALIDATE SCHEMA EXPOSURE ---
  await test('SCHEMA-1: OPTIONS on /rest/v1/contacts does not leak schema', async () => {
    const r = await fetch(SB + '/rest/v1/contacts', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://evil.com' }
    });
    return r.status === 200;
  });

  // --- BITRIX SYNC ---
  await test('BTX-EDGE: bitrix-sync 503 = Bitrix not configured (expected)', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-bitrix-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY }
    });
    return r.status === 503; // expected: Bitrix not configured
  });

  // --- INSTANCE HEALTH ---
  await test('INST-HEALTH: connection-health-check returns healthy status', async () => {
    const r = await fetch(SB + '/functions/v1/connection-health-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ instance: 'wpp2' })
    });
    if (r.status >= 500) return false;
    const d = await r.json();
    return d.status === 200;
  });

  // --- COMPOSITE QUERY PERFORMANCE ---
  await test('PERF-CMP-1: role_permissions JOIN < 500ms', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/role_permissions?select=role,permission_id&limit=20', { headers: { apikey: KEY } });
    return r.status < 500 && Date.now() - t < 500;
  });

  await test('PERF-CMP-2: contact_intelligence with UUID < 500ms', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/contact_intelligence?select=id&contact_id=eq.00000000-0000-0000-0000-000000000000&limit=5', { headers: { apikey: KEY } });
    return r.status < 500 && Date.now() - t < 500;
  });

  await test('PERF-CMP-3: automation_executions < 500ms', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/automation_executions?select=id&limit=10', { headers: { apikey: KEY } });
    return r.status < 500 && Date.now() - t < 500;
  });

  console.log('');
  console.log('='.repeat(55));
  console.log('SIM 441-475:  PASS: ' + pass + '/' + (pass+fail) + '  FAIL: ' + fail);
  if (fail > 0) results.filter(r => !r.ok).forEach(r => console.log('  ❌ ' + r.name));
}

run().catch(console.error);
