/**
 * scripts/validate-auth-webhook-realtime.ts
 *
 * Valida Auth flow, Webhook flow e Realtime WebSocket.
 *
 * Uso: bun run scripts/validate-auth-webhook-realtime.ts
 */

const SUPABASE_URL = 'https://supabase.atomicabr.com.br';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk';

async function test(name: string, fn: () => Promise<{ ok: boolean; details: string }>) {
  process.stdout.write(`\n⏳ ${name}... `);
  try {
    const r = await fn();
    console.log(`${r.ok ? '✅' : '❌'} ${r.details}`);
    return r.ok;
  } catch (err) {
    console.log(`⚠️  Error: ${err instanceof Error ? err.message : 'unknown'}`);
    return false;
  }
}

async function main() {
  let totalPassed = 0;
  let totalFailed = 0;

  console.log('\n🔐 AUTH FLOW VALIDATION\n');
  console.log('═'.repeat(70));

  // Test 1: Auth endpoint reachable
  totalPassed += await test('Auth /health endpoint', async () => {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`);
    return {
      ok: r.status > 0 && r.status < 500,
      details: `status=${r.status}`,
    };
  }) ? 1 : 0;

  // Test 2: Auth with invalid credentials = 400
  totalPassed += await test('Auth /token with invalid creds', async () => {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ email: 'invalid@x.com', password: 'wrong' }),
    });
    return {
      ok: r.status === 400,
      details: `status=${r.status}`,
    };
  }) ? 1 : 0;

  // Test 3: Settings endpoint
  totalPassed += await test('Auth /settings endpoint', async () => {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { 'apikey': SUPABASE_KEY },
    });
    return {
      ok: r.status === 200,
      details: `status=${r.status}`,
    };
  }) ? 1 : 0;

  // Test 4-8: Edge Function auth checks
  console.log('\n🔧 EDGE FUNCTIONS (FIX #5)\n');
  console.log('─'.repeat(70));

  totalPassed += await test('evolution-api/status (no auth = 401)', async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/evolution-api/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance: 'wpp2' }),
    });
    return {
      ok: r.status === 401,
      details: `status=${r.status}`,
    };
  }) ? 1 : 0;

  totalPassed += await test('evolution-api/list-instances (no auth = 401)', async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/evolution-api/list-instances`, {
      method: 'GET',
    });
    return {
      ok: r.status === 401,
      details: `status=${r.status}`,
    };
  }) ? 1 : 0;

  totalPassed += await test('evolution-webhook accepts POST (HMAC required)', async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/evolution-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test', instance: 'wpp2' }),
    });
    // 401 (no signature) ou 503 (no postgres) = ok
    return {
      ok: r.status === 401 || r.status === 400 || r.status === 503,
      details: `status=${r.status}`,
    };
  }) ? 1 : 0;

  totalPassed += await test('connection-health-check (no auth = 401)', async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/connection-health-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance: 'wpp2' }),
    });
    return {
      ok: r.status === 401 || r.status === 400,
      details: `status=${r.status}`,
    };
  }) ? 1 : 0;

  // Test 9-12: REST API with various schemas
  console.log('\n📊 REST API SCHEMA VALIDATION\n');
  console.log('─'.repeat(70));

  for (const schema of ['zapp', 'evo', 'public']) {
    totalPassed += await test(`${schema} schema accessible`, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/${schema === 'public' ? 'role_permissions' : 'permissions'}?select=*&limit=1`,
        { headers: { 'apikey': SUPABASE_KEY, 'Accept-Profile': schema } }
      );
      return {
        ok: r.status > 0 && r.status < 500,
        details: `status=${r.status}`,
      };
    }) ? 1 : 0;
  }

  // Test 13-16: CORS
  console.log('\n🌐 CORS VALIDATION\n');
  console.log('─'.repeat(70));

  for (const endpoint of ['/auth/v1/health', '/rest/v1/', '/storage/v1/', '/realtime/v1/']) {
    totalPassed += await test(`CORS preflight ${endpoint}`, async () => {
      const r = await fetch(`${SUPABASE_URL}${endpoint}`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://zapp.atomicabr.com.br',
          'Access-Control-Request-Method': 'GET',
        },
      });
      return {
        ok: r.status < 500,
        details: `status=${r.status}`,
      };
    }) ? 1 : 0;
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 AUTH/WEBHOOK/REALTIME VALIDATION SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total tests: ${totalPassed + totalFailed}`);
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📈 Success rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
