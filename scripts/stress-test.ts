import { parseArgs } from "util";

/**
 * Advanced Multi-Endpoint Stress Test Script
 */

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    endpoints: { type: "string", default: "health-check,status,connection-health-check" },
    baseUrl: { type: "string", default: "http://localhost:54321/functions/v1" },
    concurrency: { type: "string", default: "20" },
    duration: { type: "string", default: "10" }, // seconds
  },
  strict: false,
});

const BASE_URL = values.baseUrl!;
const endpoints = values.endpoints!.split(",");
const concurrency = parseInt(values.concurrency!);
const duration = parseInt(values.duration!);

console.log(`\n🔥 Starting Multi-Endpoint Stress Test`);
console.log(`📍 Base URL: ${BASE_URL}`);
console.log(`🔗 Endpoints: ${endpoints.join(", ")}`);
console.log(`👥 Concurrency: ${concurrency}`);
console.log(`⏱️  Duration: ${duration}s\n`);

interface Stats {
  requests: number;
  success: number;
  failure: number;
  latencies: Record<string, number[]>;
}

const stats: Stats = {
  requests: 0,
  success: 0,
  failure: 0,
  latencies: Object.fromEntries(endpoints.map(e => [e, []])),
};

let active = true;

async function worker() {
  while (active) {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const url = `${BASE_URL}/${endpoint}`;
    const start = performance.now();
    
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY || ''}`,
        }
      });
      if (resp.ok) stats.success++;
      else stats.failure++;
    } catch {
      stats.failure++;
    } finally {
      const end = performance.now();
      stats.latencies[endpoint].push(end - start);
      stats.requests++;
    }
  }
}

// Start workers
const _workers = Array.from({ length: concurrency }).map(() => worker());

// Set timeout to stop
setTimeout(() => {
  active = false;
  console.log(`🏁 Stopping test...\n`);
  report();
}, duration * 1000);

function report() {
  const totalRequests = stats.requests;
  const tps = totalRequests / duration;
  
  console.log(`📈 Overall Stats:`);
  console.log(`- Total Requests: ${totalRequests}`);
  console.log(`- Success Rate: ${((stats.success / totalRequests) * 100).toFixed(2)}%`);
  console.log(`- Throughput: ${tps.toFixed(2)} req/s\n`);

  console.log(`📋 Per Endpoint Latency (P95):`);
  for (const [endpoint, latencies] of Object.entries(stats.latencies)) {
    const sorted = latencies.sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    console.log(`- /${endpoint}: ${p95.toFixed(2)}ms (${latencies.length} reqs)`);
  }

  console.log(`\n✅ Stress test complete.`);
  process.exit(0);
}
