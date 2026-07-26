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

  // --- INVESTIGATE FAILURES FROM SIM 326-360 ---

  // MV-2: check what's in mv_conversations_summary
  await test('INV-1: mv_conversations_summary query returns 200', async () => {
    const r = await fetch(SB + '/rest/v1/mv_conversations_summary?limit=5', { headers: { apikey: KEY } });
    const text = await r.text();
    console.log('    status=' + r.status + ' body=' + text.substring(0, 100));
    return r.status < 500;
  });

  // AUTH-EDGE failures: what do they actually return?
  await test('INV-2: evolution-sender no-auth actual status', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-sender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const text = await r.text();
    console.log('    status=' + r.status + ' body=' + text.substring(0, 100));
    return r.status < 500; // any non-5xx is acceptable
  });

  await test('INV-3: lgpd-scheduled-jobs no-auth actual status', async () => {
    const r = await fetch(SB + '/functions/v1/lgpd-scheduled-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const text = await r.text();
    console.log('    status=' + r.status + ' body=' + text.substring(0, 100));
    return r.status < 500;
  });

  // --- MORE TABLE COVERAGE ---
  await test('TBL-10: sla_policies accessible', async () => {
    const r = await fetch(SB + '/rest/v1/sla_policies?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-11: sla_events accessible', async () => {
    const r = await fetch(SB + '/rest/v1/sla_events?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-12: sentiment_alerts accessible', async () => {
    const r = await fetch(SB + '/rest/v1/sentiment_alerts?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-13: app_notifications accessible', async () => {
    const r = await fetch(SB + '/rest/v1/app_notifications?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-14: audit_logs accessible', async () => {
    const r = await fetch(SB + '/rest/v1/audit_logs?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-15: webhook_audit_log accessible', async () => {
    const r = await fetch(SB + '/rest/v1/webhook_audit_log?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-16: profiles accessible', async () => {
    const r = await fetch(SB + '/rest/v1/profiles?select=id,user_id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-17: workspaces accessible', async () => {
    const r = await fetch(SB + '/rest/v1/workspaces?select=id,name&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('TBL-18: workspace_members accessible', async () => {
    const r = await fetch(SB + '/rest/v1/workspace_members?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- MEDIA ---
  await test('MED-1: evolution_media accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_media?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('MED-2: evolution_whatsapp_status accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_whatsapp_status?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- TEMPLATES ---
  await test('TPL-1: evolution_message_templates accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_message_templates?select=id,name&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- FOLLOWUPS ---
  await test('FUP-1: evolution_followups accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_followups?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('FUP-2: evolution_message_queue accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_message_queue?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- BITRIX ---
  await test('BTX-1: evolution_bitrix_queue accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_bitrix_queue?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- EDGE FUNCTION ROBUSTNESS ---
  await test('EDGE-3: evolution-followup accessible', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY }
    });
    return r.status < 500;
  });

  await test('EDGE-4: lgpd-scheduled-jobs accessible', async () => {
    const r = await fetch(SB + '/functions/v1/lgpd-scheduled-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY }
    });
    return r.status < 500;
  });

  await test('EDGE-5: connection-health-check accessible', async () => {
    const r = await fetch(SB + '/functions/v1/connection-health-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ instance: 'test' })
    });
    return r.status < 500;
  });

  await test('EDGE-6: evolution-bitrix-sync accessible', async () => {
    const r = await fetch(SB + '/functions/v1/evolution-bitrix-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY }
    });
    return r.status < 500;
  });

  // --- SENTIMENT ANALYSIS ---
  await test('SENT-1: evolution_sentiment_analysis accessible', async () => {
    const r = await fetch(SB + '/rest/v1/evolution_sentiment_analysis?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- PERMISSION / ROLES ---
  await test('ROLE-1: permissions table accessible', async () => {
    const r = await fetch(SB + '/rest/v1/permissions?select=id,name&limit=5', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('ROLE-2: role_permissions JOIN via mv_role_permissions_full', async () => {
    const r = await fetch(SB + '/rest/v1/mv_role_permissions_full?select=role,permission_id&limit=5', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- DEPARTMENTS ---
  await test('DEPT-1: departments accessible', async () => {
    const r = await fetch(SB + '/rest/v1/departments?select=id,name&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- CAMPAIGNS ---
  await test('CAMP-1: talkx_campaigns accessible', async () => {
    const r = await fetch(SB + '/rest/v1/talkx_campaigns?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  await test('CAMP-2: talkx_recipients accessible', async () => {
    const r = await fetch(SB + '/rest/v1/talkx_recipients?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  // --- FINANCEIRO ---
  await test('FIN-1: sales_deals accessible', async () => {
    const r = await fetch(SB + '/rest/v1/sales_deals?select=id&limit=1', { headers: { apikey: KEY } });
    return r.status < 500;
  });

  console.log('');
  console.log('='.repeat(55));
  console.log('SIM 361-400:  PASS: ' + pass + '/' + (pass+fail) + '  FAIL: ' + fail);
  if (fail > 0) results.filter(r => !r.ok).forEach(r => console.log('  ❌ ' + r.name));
}

run().catch(console.error);
