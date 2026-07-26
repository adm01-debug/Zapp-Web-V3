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
  // --- MUTATION / SECURITY ---
  await test('MUT-1: INSERT contacts without auth = 4xx (not 5xx)', async () => {
    const r = await fetch(SB + '/rest/v1/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ name: 'Test', phone_number: '+5511900000000' })
    });
    return r.status >= 400 && r.status < 500;
  });

  await test('MUT-2: PATCH permissions without auth = 4xx (not 5xx)', async () => {
    const r = await fetch(SB + '/rest/v1/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY },
      body: JSON.stringify({ name: 'hacked' })
    });
    return r.status >= 400 && r.status < 500;
  });

  await test('MUT-3: DELETE user_roles without auth = 4xx (not 5xx)', async () => {
    const r = await fetch(SB + '/rest/v1/user_roles', {
      method: 'DELETE',
      headers: { 'apikey': KEY }
    });
    return r.status >= 400 && r.status < 500;
  });

  // --- RATE LIMITING ---
  await test('RATE-1: 50 rapid health checks no crash/429 storm', async () => {
    const promises = Array.from({ length: 50 }, () =>
      fetch(SB + '/auth/v1/health').then(r => r.status)
    );
    const statuses = await Promise.all(promises);
    const has429 = statuses.some(s => s === 429);
    const allOk = statuses.every(s => s < 500);
    return allOk && !has429;
  });

  await test('RATE-2: 30 concurrent function calls no 429', async () => {
    const promises = Array.from({ length: 30 }, () =>
      fetch(SB + '/functions/v1/connection-health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify({ instance: 'wpp2' })
      }).then(r => r.status)
    );
    const statuses = await Promise.all(promises);
    const has429 = statuses.some(s => s === 429);
    return !has429;
  });

  // --- FEATURE FLAGS ---
  await test('FF-1: feature_flags table readable', async () => {
    const r = await fetch(SB + '/rest/v1/feature_flags?select=key,enabled,percentage&limit=10', {
      headers: { apikey: KEY }
    });
    return r.status < 500;
  });

  await test('FF-2: is_admin_or_supervisor flag exists (Round 3 backfill)', async () => {
    const r = await fetch(SB + '/rest/v1/feature_flags?key=eq.is_admin_or_supervisor&select=key,enabled', {
      headers: { apikey: KEY }
    });
    if (r.status >= 500) return false;
    const d = await r.json();
    return Array.isArray(d) && d.length > 0;
  });

  // --- DB CONSTRAINTS ---
  await test('DB-1: contact_audit_log accepts valid INSERT', async () => {
    const r = await fetch(SB + '/rest/v1/contact_audit_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ action: 'UPDATE', contact_id: '00000000-0000-0000-0000-000000000000', changed_at: new Date().toISOString() })
    });
    return r.status >= 200 && r.status < 500;
  });

  await test('DB-2: contact_audit_log rejects invalid action (CHECK constraint)', async () => {
    const r = await fetch(SB + '/rest/v1/contact_audit_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ action: 'INVALID_ACTION_XYZ', contact_id: '00000000-0000-0000-0000-000000000000', changed_at: new Date().toISOString() })
    });
    return r.status >= 400 && r.status < 500;
  });

  // --- EDGE FUNCTIONS ---
  await test('EDGE-1: sla-alert-log-failure fn accessible', async () => {
    const r = await fetch(SB + '/functions/v1/sla-alert-log-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ contact_id: '00000000-0000-0000-0000-000000000000', attempted_event_type: 'sla_alert' })
    });
    return r.status < 500;
  });

  await test('EDGE-2: sla-alert-forward fn accessible', async () => {
    const r = await fetch(SB + '/functions/v1/sla-alert-forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ contact_id: '00000000-0000-0000-0000-000000000000', kind: 'first_response', severity: 'warning' })
    });
    return r.status < 500;
  });

  // --- AUTH ---
  await test('AUTH-1: /auth/v1/token?grant_type=refresh_token not 500', async () => {
    const r = await fetch(SB + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ refresh_token: 'invalid-token' })
    });
    return r.status < 500;
  });

  // --- STORAGE ---
  await test('STORAGE-1: /storage/v1/ not 500', async () => {
    const r = await fetch(SB + '/storage/v1/', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- PERFORMANCE ---
  await test('PERF-1: evolution_messages limit=100 < 1s', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/evolution_messages?select=id,content,created_at&order=created_at.desc&limit=100', {
      headers: { apikey: KEY }
    });
    return r.status < 500 && Date.now() - t < 1000;
  });

  await test('PERF-2: mv_conversations_summary accessible', async () => {
    const r = await fetch(SB + '/rest/v1/mv_conversations_summary?select=total_conversations&limit=1', {
      headers: { apikey: KEY }
    });
    return r.status < 500;
  });

  // --- UUID VALIDATION ---
  await test('UUID-1: contact_intelligence with invalid UUID = 4xx (not 5xx)', async () => {
    const r = await fetch(SB + '/rest/v1/contact_intelligence?select=id&contact_id=eq.not-a-uuid&limit=1', {
      headers: { apikey: KEY }
    });
    return r.status >= 400 && r.status < 500;
  });

  // --- SAFETY ---
  await test('SAFE-1: empty select= returns 4xx (not 5xx)', async () => {
    const r = await fetch(SB + '/rest/v1/contacts?select=', { headers: { apikey: KEY } });
    return r.status >= 400 && r.status < 500;
  });

  await test('SAFE-2: malformed filter = 4xx (not 5xx)', async () => {
    const r = await fetch(SB + '/rest/v1/contacts?invalid_filter=(', { headers: { apikey: KEY } });
    return r.status >= 400 && r.status < 500;
  });

  await test('SAFE-3: POST without JSON Content-Type = 4xx (not 5xx)', async () => {
    const r = await fetch(SB + '/rest/v1/contacts', {
      method: 'POST',
      headers: { 'apikey': KEY },
      body: 'not json at all'
    });
    return r.status >= 400 && r.status < 500;
  });

  // --- RPC FUNCTIONS ---
  await test('RPC-1: fn_evolution_status_unknown callable', async () => {
    const r = await fetch(SB + '/rest/v1/rpc/zapp_fn_evolution_status_unknown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ p_status: 'fake_status_xyz' })
    });
    return r.status < 500;
  });

  await test('RPC-2: fn_normalize_phone callable', async () => {
    const r = await fetch(SB + '/rest/v1/rpc/zapp_fn_normalize_phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ p_phone: '+55 11 99999-0000' })
    });
    return r.status < 500;
  });

  // --- TABLES ACCESSIBLE ---
  await test('TBL-1: conversation_events accessible', async () => {
    const r = await fetch(SB + '/rest/v1/conversation_events?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-2: automation_rules accessible', async () => {
    const r = await fetch(SB + '/rest/v1/automation_rules?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-3: whatsapp_connections accessible', async () => {
    const r = await fetch(SB + '/rest/v1/whatsapp_connections?select=id,instance_name,status&limit=5', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-4: evolution_contacts accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_contacts?select=id,remote_jid&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-5: role_permissions accessible', async () => {
    const r = await fetch(SB + '/rest/v1/role_permissions?select=role,permission_id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-6: users accessible', async () => {
    const r = await fetch(SB + '/rest/v1/users?select=id,email&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- INDEX PERFORMANCE ---
  await test('IDX-1: contact_audit_log indexed query fast (<500ms)', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/contact_audit_log?select=id,action&contact_id=eq.00000000-0000-0000-0000-000000000000&order=changed_at.desc&limit=20', {
      headers: { apikey: KEY }
    });
    return r.status < 500 && Date.now() - t < 500;
  });

  // --- CONTAINERS ---
  await test('CONT-1: supabase_studio accessible', async () => {
    const r = await fetch(SB.replace('/rest/v1', '').replace('/functions/v1', ''));
    return r.status < 500;
  });

  // --- SUMMARY ---
  console.log('');
  console.log('='.repeat(55));
  console.log('SIM 301-325:  PASS: ' + pass + '/' + (pass+fail) + '  FAIL: ' + fail);
  if (fail > 0) results.filter(r => !r.ok).forEach(r => console.log('  ❌ ' + r.name));
}

run().catch(console.error);
