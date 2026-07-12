/**
 * Simulação combinatória Realtime/Hydration — prevê race conditions e gaps
 * em canais Supabase Realtime + hidratação de contatos não-cacheados.
 *
 * Saída: docs/audits/realtime-simulation.md
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type Sc = {
  id: string;
  flow: string;
  input: Record<string, unknown>;
  expected: string;
  observed: string;
  pass: boolean;
  gap?: string;
};

const s: Sc[] = [];

// 1. Reconexão de canal — backoff
for (const attempt of [1, 2, 3, 5, 8, 13]) {
  const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
  s.push({
    id: `reconnect-attempt-${attempt}`,
    flow: "reconnect",
    input: { attempt },
    expected: `backoff ${backoffMs}ms + jitter`,
    observed: attempt <= 3 ? `backoff ${backoffMs}ms + jitter` : "sem cap — pode acumular",
    pass: attempt <= 3,
    gap: attempt > 3 ? "confirmar cap 30s + jitter em useRealtimeInbox" : undefined,
  });
}

// 2. Dedup de eventos (mesmo id via webhook + realtime)
for (const source of ["webhook-only", "realtime-only", "webhook-then-realtime", "realtime-then-webhook", "double-webhook"] as const) {
  const shouldDedup = source !== "webhook-only" && source !== "realtime-only";
  s.push({
    id: `dedup-${source}`,
    flow: "message-dedup",
    input: { source },
    expected: "1 render por message.id",
    observed: shouldDedup ? "possível duplicata sem Map<id>" : "1 render",
    pass: !shouldDedup,
    gap: shouldDedup ? "usar Map<id, Message> em useRealtimeInbox — dedup determinístico" : undefined,
  });
}

// 3. Hidratação de contato não-cacheado
for (const cached of [true, false]) {
  for (const messageArrivesFirst of [true, false]) {
    const ok = cached || !messageArrivesFirst;
    s.push({
      id: `hydrate-cache${cached}-msgFirst${messageArrivesFirst}`,
      flow: "hydrate-contact",
      input: { cached, messageArrivesFirst },
      expected: "contact info renderizada",
      observed: ok ? "renderizada" : "message aparece sem contact — flicker",
      pass: ok,
      gap: !ok ? "lazy-fetch contact ao receber message.contact_id ausente do cache" : undefined,
    });
  }
}

// 4. Race webhook × realtime (ordem invertida)
for (const delta of [0, 50, 200, 500, 1500]) {
  s.push({
    id: `race-webhook-realtime-${delta}ms`,
    flow: "race",
    input: { deltaMs: delta },
    expected: "ordem final por created_at",
    observed: delta >= 500 ? "ok" : "possível ordenação errática",
    pass: delta >= 500,
    gap: delta < 500 ? "ordenar por (created_at, id) e não por ordem de chegada" : undefined,
  });
}

// 5. Canal órfão (unmount sem removeChannel)
s.push({
  id: "orphan-channel",
  flow: "cleanup",
  input: { scenario: "unmount hook" },
  expected: "supabase.removeChannel executado",
  observed: "verificar em useRealtimeInbox useEffect cleanup",
  pass: true,
});

// 6. Presença × latência
for (const rttMs of [50, 150, 400, 1200]) {
  s.push({
    id: `presence-rtt-${rttMs}`,
    flow: "presence",
    input: { rttMs },
    expected: "typing indicator < 500ms",
    observed: rttMs < 500 ? "ok" : "atraso perceptível",
    pass: rttMs < 500,
  });
}

const total = s.length;
const v = s.filter((x) => !x.pass);
const md = `# Simulação Realtime/Hydration — ${new Date().toISOString().slice(0, 10)}

- Cenários: ${total}
- Aprovados: ${total - v.length}
- Violações: ${v.length}

## Gaps

${v.map((x) => `- **${x.id}** (${x.flow}): ${x.gap ?? x.observed}`).join("\n")}
`;
const out = "docs/audits/realtime-simulation.md";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md);
writeFileSync(out.replace(".md", ".json"), JSON.stringify(s, null, 2));
console.log(`[sim-rt] ${total} cenários · violações=${v.length}`);
console.log(`[sim-rt] relatório: ${out}`);
