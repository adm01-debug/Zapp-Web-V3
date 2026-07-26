/**
 * scripts/validate-query-performance.ts
 *
 * Testa performance de queries críticas.
 *
 * Uso: bun run scripts/validate-query-performance.ts
 */

const SUPABASE_URL = 'https://supabase.atomicabr.com.br';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk';

interface QueryTest {
  name: string;
  url: string;
  thresholdMs: number;
}

const QUERIES: QueryTest[] = [
  { name: 'FIX-1: role_permissions JOIN', url: `${SUPABASE_URL}/rest/v1/role_permissions?select=permission_id,permissions!inner(name)&role=in.(admin,supervisor,agent)&limit=50`, thresholdMs: 1000 },
  { name: 'FIX-2: automation_executions', url: `${SUPABASE_URL}/rest/v1/automation_executions?select=id,rule_id,suggestion_text,status&status=eq.pending&order=created_at.desc&limit=20`, thresholdMs: 1000 },
  { name: 'FIX-3: contact_intelligence UUID', url: `${SUPABASE_URL}/rest/v1/contact_intelligence?select=id&or=(contact_id.eq.00000000-0000-0000-0000-000000000000,phone.eq.%2B5511999999999)&limit=5`, thresholdMs: 1000 },
  { name: 'FIX-4: evolution_messages remote_jid', url: `${SUPABASE_URL}/rest/v1/evolution_messages?select=id&or=(contact_id.eq.00000000-0000-0000-0000-000000000000,remote_jid.eq.5511999999999@s.whatsapp.net)&order=created_at.desc&limit=10`, thresholdMs: 1000 },
  { name: 'FIX-5: evolution-api/status (no auth)', url: `${SUPABASE_URL}/functions/v1/evolution-api/status`, thresholdMs: 2000 },
  { name: 'Permissions table', url: `${SUPABASE_URL}/rest/v1/permissions?select=*&order=category.asc&limit=50`, thresholdMs: 1000 },
  { name: 'WhatsApp connections', url: `${SUPABASE_URL}/rest/v1/whatsapp_connections?select=id,instance_name,status&order=created_at.desc&limit=20`, thresholdMs: 1000 },
  { name: 'Contacts (sample)', url: `${SUPABASE_URL}/rest/v1/contacts?select=id,name,phone&order=updated_at.desc&limit=20`, thresholdMs: 1500 },
];

async function main() {
  console.log('\n⚡ QUERY PERFORMANCE VALIDATION\n');
  console.log('═'.repeat(70));

  let totalPassed = 0;
  let totalFailed = 0;
  const results: { name: string; time: number; threshold: number; ok: boolean }[] = [];

  for (const q of QUERIES) {
    const start = Date.now();
    try {
      const res = await fetch(q.url, {
        method: q.url.includes('functions/') ? 'POST' : 'GET',
        headers: {
          'apikey': SUPABASE_KEY,
          ...(q.url.includes('functions/') ? { 'Content-Type': 'application/json' } : {}),
        },
        body: q.url.includes('functions/') ? JSON.stringify({ instance: 'wpp2' }) : undefined,
      });
      const elapsed = Date.now() - start;
      const ok = res.status < 500 && elapsed < q.thresholdMs;
      const status = ok ? '✅' : '❌';
      console.log(`\n${status} ${q.name}: ${elapsed}ms (threshold: ${q.thresholdMs}ms)`);
      results.push({ name: q.name, time: elapsed, threshold: q.thresholdMs, ok });
      if (ok) totalPassed++;
      else totalFailed++;
    } catch (err) {
      console.log(`\n❌ ${q.name}: error - ${err instanceof Error ? err.message : 'unknown'}`);
      totalFailed++;
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 PERFORMANCE SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total queries: ${QUERIES.length}`);
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);

  // Average
  const avgTime = results.reduce((a, b) => a + b.time, 0) / results.length;
  console.log(`⏱️  Average response time: ${avgTime.toFixed(0)}ms`);

  // Slowest
  const slowest = [...results].sort((a, b) => b.time - a.time).slice(0, 3);
  console.log('\n🐌 Slowest queries:');
  for (const r of slowest) {
    console.log(`  - ${r.name}: ${r.time}ms`);
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
