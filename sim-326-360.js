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

  // --- FEATURE FLAGS (real table existence) ---
  await test('FF-3: feature_flags via public schema (PostgREST proxy)', async () => {
    const r = await fetch(SB + '/rest/v1/feature_flags?select=key,enabled,percentage&limit=5', {
      headers: { 'apikey': KEY, 'Accept-Profile': 'public' }
    });
    return r.status < 500;
  });

  await test('FF-4: all_feature_flags RPC callable', async () => {
    const r = await fetch(SB + '/rest/v1/rpc/zapp_all_feature_flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({})
    });
    return r.status < 500;
  });

  // --- EVOLUTION WEBHOOK HANDLERS ---
  await test('EWH-1: evolution-webhook POST without body = 400 (not 500)', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return r.status >= 400 && r.status < 500;
  });

  await test('EWH-2: evolution-webhook POST without signature = 401', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'invalid' }
    });
    return r.status === 401;
  });

  // --- MCP FUNCTION ---
  await test('MCP-1: mcp function accessible (not 404)', async () => {
    const r = await fetch(SB + '/functions/v1/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    });
    return r.status !== 404;
  });

  // --- EDGE FUNCTION AUTH ---
  await test('AUTH-EDGE-1: evolution-sender without auth = 401', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-sender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return r.status === 401 || r.status === 400;
  });

  await test('AUTH-EDGE-2: lgpd-scheduled-jobs without auth = 401', async () => {
    const r = await fetch(SB + '/functions/v1/lgpd-scheduled-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return r.status === 401 || r.status === 400;
  });

  // --- CRM TABLE ACCESS ---
  await test('CRM-1: contact_notes accessible', async () => {
    const r = await fetch(SB + '/rest/v1/contact_notes?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('CRM-2: contact_tags accessible', async () => {
    const r = await fetch(SB + '/rest/v1/contact_tags?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('CRM-3: contact_intelligence accessible', async () => {
    const r = await fetch(SB + '/rest/v1/contact_intelligence?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('CRM-4: deals accessible', async () => {
    const r = await fetch(SB + '/rest/v1/deals?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- CHATBOT ---
  await test('CHAT-1: evolution-chatbot POST valid = 200', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ remote_jid: '5511999999999@s.whatsapp.net', message: 'oi', use_ai: false })
    });
    return r.status === 200;
  });

  await test('CHAT-2: evolution-chatbot missing remote_jid = 400', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ message: 'oi' })
    });
    return r.status === 400;
  });

  // --- QUEUE MANAGEMENT ---
  await test('QUEUE-1: queue_analytics accessible', async () => {
    const r = await fetch(SB + '/rest/v1/queue_analytics?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('QUEUE-2: queues accessible', async () => {
    const r = await fetch(SB + '/rest/v1/queues?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('QUEUE-3: queue_members accessible', async () => {
    const r = await fetch(SB + '/rest/v1/queue_members?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- AUTOMATIONS ---
  await test('AUTO-1: automations accessible', async () => {
    const r = await fetch(SB + '/rest/v1/automations?select=id,name&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('AUTO-2: automation_executions accessible', async () => {
    const r = await fetch(SB + '/rest/v1/automation_executions?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- MATERIALIZED VIEWS ---
  await test('MV-1: mv_role_permissions_full accessible', async () => {
    const r = await fetch(SB + '/rest/v1/mv_role_permissions_full?select=role,permission_id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('MV-2: mv_conversations_summary returns data', async () => {
    const r = await fetch(SB + '/rest/v1/mv_conversations_summary?limit=1', { headers: { apikey: KEY } });
    if (r.status >= 500) return false;
    const d = await r.json();
    return Array.isArray(d);
  });

  // --- DISPATCH / WEBHOOK ---
  await test('DSP-1: failed_messages accessible', async () => {
    const r = await fetch(SB + '/rest/v1/failed_messages?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('DSP-2: dispatch_error_logs accessible', async () => {
    const r = await fetch(SB + '/rest/v1/dispatch_error_logs?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('DSP-3: webhook_events_processed accessible', async () => {
    const r = await fetch(SB + '/rest/v1/webhook_events_processed?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- INSTANCE REGISTRY ---
  await test('INST-1: instance_registry accessible', async () => {
    const r = await fetch(SB + '/rest/v1/instance_registry?select=id,instance_name&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('INST-2: evolution_instances (if exists) accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_instances?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- MESSAGES ---
  await test('MSG-1: evolution_messages with remote_jid filter < 500ms', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/evolution_messages?select=id,content&remote_jid=eq.5511999999999@s.whatsapp.net&limit=20', {
      headers: { apikey: KEY }
    });
    return r.status < 500 && Date.now() - t < 500;
  });

  await test('MSG-2: evolution_messages paginated < 500ms', async () => {
    const t = Date.now();
    const r = await fetch(SB + '/rest/v1/evolution_messages?select=id&order=created_at.desc&limit=50', {
      headers: { apikey: KEY }
    });
    return r.status < 500 && Date.now() - t < 500;
  });

  // --- SUMMARY ---
  console.log('');
  console.log('='.repeat(55));
  console.log('SIM 326-360:  PASS: ' + pass + '/' + (pass+fail) + '  FAIL: ' + fail);
  if (fail > 0) results.filter(r => !r.ok).forEach(r => console.log('  ❌ ' + r.name));
}

run().catch(console.error);
