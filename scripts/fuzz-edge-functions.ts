import { parseArgs } from "util";
import fc from "fast-check";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    baseUrl: { type: "string", default: "http://localhost:54321/functions/v1" },
    runs: { type: "string", default: "100" },
    concurrency: { type: "string", default: "10" },
  },
  strict: false,
});

const BASE_URL = values.baseUrl!;
const RUNS = parseInt(values.runs!);
const CONCURRENCY = parseInt(values.concurrency!);

// Critical functions to fuzz
const TARGET_FUNCTIONS = [
  "evolution-webhook",
  "whatsapp-webhook",
  "gmail-webhook",
  "ai-proxy",
  "send-email"
];

const _sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runFuzz(fnName: string) {
  const url = `${BASE_URL}/${fnName}`;
  console.log(`\n🕵️  Fuzzing function: ${fnName} at ${url}`);
  
  let passed = 0;
  let failed = 0;
  let crashes = 0;

  // We use a pool of workers for concurrency
  const runBatch = async (batchSize: number) => {
    const promises = Array.from({ length: batchSize }).map(async () => {
      // Generate a truly random payload
      const payload = fc.sample(fc.anything(), 1)[0];
      const method = fc.sample(fc.constantFrom("POST", "GET", "PUT", "DELETE"), 1)[0];
      const headers = fc.sample(fc.dictionary(fc.string(), fc.string()), 1)[0];

      try {
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
            "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY || 'test-key'}`
          },
          body: method === "GET" ? undefined : JSON.stringify(payload)
        });

        if (res.status >= 500) {
          crashes++;
        } else if (res.status >= 400) {
          failed++;
        } else {
          passed++;
        }
      } catch {
        crashes++;
      }
    });
    await Promise.all(promises);
  };

  const batches = Math.ceil(RUNS / CONCURRENCY);
  for (let i = 0; i < batches; i++) {
    await runBatch(CONCURRENCY);
    process.stdout.write(".");
  }

  console.log(`\n📊 Results for ${fnName}:`);
  console.log(`  - Passed (2xx/3xx): ${passed}`);
  console.log(`  - Handled Errors (4xx): ${failed}`);
  console.log(`  - Critical Failures (5xx/Crashes): ${crashes}`);
  
  return crashes === 0;
}

async function main() {
  console.log(`🚀 Starting Fuzzing Engine (${RUNS} runs per function, concurrency ${CONCURRENCY})`);
  
  let allSuccess = true;
  for (const fn of TARGET_FUNCTIONS) {
    const success = await runFuzz(fn);
    if (!success) allSuccess = false;
  }

  if (allSuccess) {
    console.log("\n✅ Fuzzing complete. No critical failures detected.");
    process.exit(0);
  } else {
    console.log("\n❌ Fuzzing complete. Critical failures detected.");
    process.exit(1);
  }
}

main();
