/**
 * scripts/stress-test-200.ts
 *
 * Stress test com 200+ conexões simultâneas para validar robustez.
 *
 * Uso: bun run scripts/stress-test-200.ts
 */

const SUPABASE_URL = 'https://supabase.atomicabr.com.br';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk';

interface StressTest {
  name: string;
  description: string;
  concurrency: number;
  test: () => Promise<{ success: number; failed: number; avgMs: number; p95Ms: number }>;
}

async function runConcurrent(
  name: string,
  url: string,
  options: RequestInit,
  concurrency: number
): Promise<{ success: number; failed: number; avgMs: number; p95Ms: number }> {
  const start = Date.now();
  const promises: Promise<{ ok: boolean; ms: number }>[] = [];

  for (let i = 0; i < concurrency; i++) {
    const s = Date.now();
    promises.push(
      fetch(url, { ...options, headers: { 'apikey': SUPABASE_KEY, ...options.headers } })
        .then((r) => ({ ok: r.status > 0 && r.status < 500, ms: Date.now() - s }))
        .catch(() => ({ ok: false, ms: Date.now() - s }))
    );
  }

  const results = await Promise.all(promises);
  const totalMs = Date.now() - start;
  const success = results.filter((r) => r.ok).length;
  const failed = results.length - success;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const p95Ms = times[Math.floor(times.length * 0.95)];

  return { success, failed, avgMs, p95Ms };
}

const STRESS_TESTS: StressTest[] = [
  {
    name: 'STRESS-1: 200 concurrent GET /rest/v1/profiles',
    description: '200 concurrent reads to profiles (should all succeed or get RLS 401)',
    concurrency: 200,
    test: async () => runConcurrent(
      'STRESS-1',
      `${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`,
      { method: 'GET' },
      200
    ),
  },
  {
    name: 'STRESS-2: 200 concurrent GET /auth/v1/health',
    description: '200 concurrent auth health checks',
    concurrency: 200,
    test: async () => runConcurrent(
      'STRESS-2',
      `${SUPABASE_URL}/auth/v1/health`,
      { method: 'GET' },
      200
    ),
  },
  {
    name: 'STRESS-3: 100 concurrent GET role_permissions',
    description: '100 concurrent role_permissions queries (FIX #1)',
    concurrency: 100,
    test: async () => runConcurrent(
      'STRESS-3',
      `${SUPABASE_URL}/rest/v1/role_permissions?select=permission_id,permissions!inner(name)&role=in.(admin)&limit=5`,
      { method: 'GET' },
      100
    ),
  },
  {
    name: 'STRESS-4: 100 concurrent GET automation_executions',
    description: '100 concurrent automation_executions (FIX #2)',
    concurrency: 100,
    test: async () => runConcurrent(
      'STRESS-4',
      `${SUPABASE_URL}/rest/v1/automation_executions?select=id,rule_id&status=eq.pending&limit=5`,
      { method: 'GET' },
      100
    ),
  },
  {
    name: 'STRESS-5: 50 concurrent GET contact_intelligence',
    description: '50 concurrent contact_intelligence (FIX #3)',
    concurrency: 50,
    test: async () => runConcurrent(
      'STRESS-5',
      `${SUPABASE_URL}/rest/v1/contact_intelligence?select=id&or=(contact_id.eq.00000000-0000-0000-0000-000000000000,phone.eq.%2B5511999999999)&limit=1`,
      { method: 'GET' },
      50
    ),
  },
  {
    name: 'STRESS-6: 50 concurrent GET evolution_messages',
    description: '50 concurrent evolution_messages (FIX #4)',
    concurrency: 50,
    test: async () => runConcurrent(
      'STRESS-6',
      `${SUPABASE_URL}/rest/v1/evolution_messages?select=id&or=(contact_id.eq.00000000-0000-0000-0000-000000000000,remote_jid.eq.5511999999999@s.whatsapp.net)&limit=1`,
      { method: 'GET' },
      50
    ),
  },
  {
    name: 'STRESS-7: 50 concurrent POST evolution-api/status',
    description: '50 concurrent evolution-api Edge Function calls (FIX #5)',
    concurrency: 50,
    test: async () => runConcurrent(
      'STRESS-7',
      `${SUPABASE_URL}/functions/v1/evolution-api/status`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instance: 'wpp2' }) },
      50
    ),
  },
  {
    name: 'STRESS-8: 200 mixed concurrent (all endpoints)',
    description: '200 mixed requests across all endpoints',
    concurrency: 200,
    test: async () => {
      const endpoints = [
        `${SUPABASE_URL}/auth/v1/health`,
        `${SUPABASE_URL}/rest/v1/profiles?limit=1`,
        `${SUPABASE_URL}/rest/v1/role_permissions?limit=1`,
        `${SUPABASE_URL}/rest/v1/permissions?limit=1`,
        `${SUPABASE_URL}/rest/v1/contacts?limit=1`,
      ];
      const s = Date.now();
      const promises: Promise<{ ok: boolean; ms: number }>[] = [];
      for (let i = 0; i < 200; i++) {
        const url = endpoints[i % endpoints.length];
        const start = Date.now();
        promises.push(
          fetch(url, { headers: { 'apikey': SUPABASE_KEY } })
            .then((r) => ({ ok: r.status > 0 && r.status < 500, ms: Date.now() - start }))
            .catch(() => ({ ok: false, ms: Date.now() - start }))
        );
      }
      const results = await Promise.all(promises);
      const success = results.filter((r) => r.ok).length;
      return {
        success,
        failed: results.length - success,
        avgMs: results.reduce((a, b) => a + b.ms, 0) / results.length,
        p95Ms: results.sort((a, b) => a.ms - b.ms)[Math.floor(results.length * 0.95)].ms,
      };
    },
  },
];

async function main() {
  console.log('\n🧪 STRESS TEST — 200+ CONCURRENT REQUESTS\n');
  console.log('═'.repeat(70));

  let totalSuccess = 0;
  let totalFailed = 0;
  const results: { name: string; success: number; failed: number; avgMs: number; p95Ms: number }[] = [];

  for (const test of STRESS_TESTS) {
    process.stdout.write(`\n⏳ ${test.name}... `);
    const start = Date.now();
    const r = await test.test();
    const elapsed = Date.now() - start;
    results.push({ name: test.name, ...r });
    totalSuccess += r.success;
    totalFailed += r.failed;

    const status = r.failed === 0 ? '✅' : r.success > r.failed ? '⚠️' : '❌';
    console.log(`${status} ${r.success}✓ / ${r.failed}✗ | avg=${r.avgMs.toFixed(0)}ms p95=${r.p95Ms.toFixed(0)}ms | total=${elapsed}ms`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('📊 STRESS TEST SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total requests: ${totalSuccess + totalFailed}`);
  console.log(`✅ Successful: ${totalSuccess}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📈 Success rate: ${((totalSuccess / (totalSuccess + totalFailed)) * 100).toFixed(1)}%`);

  // Top 3 by p95
  const sorted = results.sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 3);
  console.log('\n🐌 Slowest endpoints (p95):');
  for (const r of sorted) {
    console.log(`  - ${r.name}: ${r.p95Ms.toFixed(0)}ms`);
  }

  process.exit(totalFailed > totalSuccess / 4 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
