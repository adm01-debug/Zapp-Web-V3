/**
 * scripts/test-realtime-websocket.ts
 *
 * Testa conexão WebSocket Realtime do Supabase self-hosted.
 *
 * Uso: bun run scripts/test-realtime-websocket.ts
 */

const SUPABASE_URL = 'wss://supabase.atomicabr.com.br/realtime/v1/websocket';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk';

let totalPassed = 0;
let totalFailed = 0;

async function testWebSocket(name: string, url: string, options: any): Promise<boolean> {
  process.stdout.write(`\n⏳ ${name}... `);
  return new Promise((resolve) => {
    const hasWebSocket = typeof (global as any).WebSocket !== 'undefined';
    const ws = hasWebSocket
      ? new (global as any).WebSocket(url, options.protocols)
      : null;

    if (!ws) {
      console.log('⚠️  WebSocket not available in this Node version');
      resolve(false);
      return;
    }

    const start = Date.now();
    let connected = false;

    const timeout = setTimeout(() => {
      if (!connected) {
        console.log(`❌ timeout (${Date.now() - start}ms)`);
        totalFailed++;
        ws.close();
        resolve(false);
      }
    }, 10000);

    ws.on('open', () => {
      connected = true;
      const elapsed = Date.now() - start;
      console.log(`✅ connected (${elapsed}ms)`);
      totalPassed++;
      ws.close();
      resolve(true);
    });

    ws.on('error', (err: any) => {
      console.log(`❌ error: ${err.message}`);
      totalFailed++;
      clearTimeout(timeout);
      resolve(false);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

async function main() {
  console.log('\n🔌 WEBSOCKET REALTIME TESTS\n');
  console.log('═'.repeat(70));

  // Test 1: Conexão básica
  await testWebSocket(
    'Realtime WebSocket connection',
    `${SUPABASE_URL}?apikey=${SUPABASE_KEY}&vsn=2.0.0`,
    []
  );

  // Test 2: Phoenix heartbeat protocol
  await testWebSocket(
    'Realtime with heartbeat',
    `${SUPABASE_URL}?apikey=${SUPABASE_KEY}&vsn=2.0.0&heartbeat_interval=30000`,
    []
  );

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 WEBSOCKET REALTIME SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
