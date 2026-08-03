#!/usr/bin/env node
/**
 * AUDIT SIM — Semáforo com prioridade de src/integrations/supabase/client.ts
 *
 * Réplica FIEL do algoritmo atual (2026-08-03, working tree):
 *   - _acquireSupabaseSlot(opts?): insere high após o último high (loop reverso
 *     manual, equivalente ao findLastIndex) ou unshift se não há high;
 *     normal faz push.
 *   - _releaseSupabaseSlot(): _supabaseInFlight--; shift(); next.resume() que
 *     faz _supabaseInFlight++ e resolve().
 *
 * Property-based: milhares de interleavings aleatórios de acquire/release
 * com prioridades aleatórias, verificando:
 *   P1: _supabaseInFlight nunca < 0 nem > MAX
 *   P2: fila zera ao final (sem memory leak)
 *   P3: invariante de ordenação: ao resumir, nenhum 'high' está atrás de um
 *       'normal' na fila (high furam; FIFO dentro de cada classe)
 *   P4: cada acquire é resolvido exatamente uma vez
 *   P5: equivalência semântica loop-manual vs Array.findLastIndex
 */
'use strict';

const MAX = 4;

// ---- réplica exata do algoritmo atual (working tree) ----
function makeSemaphore() {
  let inFlight = 0;
  const queue = []; // {resume, priority}
  const log = []; // eventos p/ verificação

  function acquire(opts) {
    const priority = (opts && opts.priority) || 'normal';
    if (inFlight < MAX) {
      inFlight++;
      log.push({ type: 'direct', priority, inFlight });
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const entry = {
        resume: () => { inFlight++; resolve(); log.push({ type: 'resume', priority, inFlight }); },
        priority,
      };
      if (priority === 'high') {
        let lastHighIdx = -1;
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i].priority === 'high') { lastHighIdx = i; break; }
        }
        if (lastHighIdx >= 0) queue.splice(lastHighIdx + 1, 0, entry);
        else queue.unshift(entry);
      } else {
        queue.push(entry);
      }
      log.push({ type: 'queued', priority, queue: queue.map((e) => e.priority).join('') });
    });
  }

  function release() {
    inFlight--;
    log.push({ type: 'release', inFlight });
    const next = queue.shift();
    if (next) next.resume();
  }

  return { acquire, release, get inFlight() { return inFlight; }, get queueLen() { return queue.length; }, get log() { return log; } };
}

// ---- verificação P3: nenhum high atrás de normal ----
function checkOrderInvariant(queue, events) {
  for (const ev of events) {
    if (ev.type === 'resume') {
      // no momento do resume não temos a fila; verificamos via registro 'queued'
    }
  }
  // invariante estrutural: a fila em qualquer ponto registrado não pode ter
  // padrão ...normal...high...
  for (const ev of events) {
    if (ev.type === 'queued' && ev.queue) {
      const s = ev.queue;
      const lastNormal = s.lastIndexOf('n');
      const firstHighAfterNormal = s.indexOf('h', lastNormal + 1);
      if (lastNormal !== -1 && firstHighAfterNormal !== -1 && firstHighAfterNormal > lastNormal) {
        throw new Error(`P3 VIOLADO: fila '${s}' tem high atrás de normal`);
      }
    }
  }
}

// ---- cenários específicos (edge cases do enunciado) ----
function scenarioEmptyQueueHigh() {
  // findLastIndex em fila vazia: inalcançável em produção (só enfileira com
  // inFlight >= MAX), mas o código deve ser seguro se ocorrer.
  const s = makeSemaphore();
  // força estado: MAX em voo → enfileira
  const hold = [];
  for (let i = 0; i < MAX; i++) hold.push(s.acquire());
  s.acquire({ priority: 'high' }); // fila = [h]
  s.acquire();                      // fila = [h, n]
  s.acquire({ priority: 'high' });  // fila = [h, h, n]
  s.release(); s.release(); s.release(); s.release(); // drena
  const order = s.log.filter((e) => e.type === 'resume').map((e) => e.priority).join('');
  if (order !== 'hhn') throw new Error(`ordem esperada hhn, got ${order}`);
  if (s.inFlight !== 0 || s.queueLen !== 0) throw new Error('estado final sujo');
  return `empty→high ok (ordem dreno: ${order})`;
}

function scenarioAllHighThenNormal() {
  const s = makeSemaphore();
  const hold = [];
  for (let i = 0; i < MAX; i++) hold.push(s.acquire());
  s.acquire({ priority: 'high' });
  s.acquire({ priority: 'high' });
  s.acquire(); // normal chega com fila toda high → push no fim
  const q = s.log.filter((e) => e.type === 'queued').pop().queue;
  if (q !== 'hhn') throw new Error(`esperado hhn, got ${q}`);
  // drena 4 → 3 resumos restam 2 na fila... verifica ordem
  s.release(); s.release(); s.release(); s.release();
  const order = s.log.filter((e) => e.type === 'resume').map((e) => e.priority).join('');
  if (order !== 'hhn') throw new Error(`ordem hhn esperada, got ${order}`);
  return `all-high+normal ok (${q} → dreno ${order})`;
}

function scenarioInterleaving() {
  const s = makeSemaphore();
  const hold = [];
  for (let i = 0; i < MAX; i++) hold.push(s.acquire());
  s.acquire();                     // n1 → fila [n1]
  s.acquire({ priority: 'high' }); // h1 → unshift → [h1, n1]
  s.acquire({ priority: 'high' }); // h2 → após h1 → [h1, h2, n1]
  s.acquire();                     // n2 → [h1, h2, n1, n2]
  const q = s.log.filter((e) => e.type === 'queued').pop().queue;
  if (q !== 'hhnn') throw new Error(`esperado hhnn, got ${q}`);
  s.release(); // h1 sai
  s.acquire({ priority: 'high' }); // h3 entra após h2 → [h2, h3, n1, n2]
  const q2 = s.log.filter((e) => e.type === 'queued').pop().queue;
  if (q2 !== 'hhnn') throw new Error(`esperado hhnn após h3, got ${q2}`);
  s.release(); s.release(); s.release(); s.release(); s.release();
  const order = s.log.filter((e) => e.type === 'resume').map((e) => e.priority).join('');
  if (order !== 'hhhnn') throw new Error(`ordem hhhnn esperada, got ${order}`);
  return `interleaving ok (${order})`;
}

function scenarioReleaseStorm() {
  // N releases seguidos com fila vazia: inFlight não pode ficar negativo.
  // (em produção releases são pareados 1:1 com acquires — simula violação p/ documentar)
  const s = makeSemaphore();
  const hold = [];
  for (let i = 0; i < MAX; i++) hold.push(s.acquire());
  for (let i = 0; i < MAX; i++) s.release();
  if (s.inFlight !== 0) throw new Error(`inFlight=${s.inFlight} != 0`);
  s.release(); // release órfão
  if (s.inFlight !== -1) throw new Error(`release órfão deveria dar -1 (documenta confiança no pareamento), got ${s.inFlight}`);
  return `release storm ok; release órfão → inFlight=-1 (documentado)`;
}

function scenarioStarvation() {
  // Flood de high com normais enfileirados: normais passam fome (unbounded).
  const s = makeSemaphore();
  const hold = [];
  for (let i = 0; i < MAX; i++) hold.push(s.acquire());
  for (let i = 0; i < 5; i++) s.acquire(); // 5 normais
  for (let i = 0; i < 100; i++) {
    s.release();          // libera 1 slot
    s.acquire({ priority: 'high' }); // high entra na frente
  }
  const resumed = s.log.filter((e) => e.type === 'resume').map((e) => e.priority).join('');
  if (resumed.includes('n')) throw new Error('normal resumiu durante flood de high?!');
  if (s.queueLen < 5) throw new Error('fila deveria manter os normais');
  return `starvation confirmada: ${resumed.length} highs resumidos, ${s.queueLen} normais presos na fila`;
}

function scenarioQueueEmptyInFlightFullEdge() {
  // fila vazia + inFlight cheio → acquire direto? Não: inFlight>=MAX → enfileira.
  const s = makeSemaphore();
  for (let i = 0; i < MAX; i++) s.acquire();
  if (s.queueLen !== 0) throw new Error('fila deveria estar vazia');
  const p = s.acquire();
  if (s.queueLen !== 1) throw new Error('deveria enfileirar com inFlight cheio');
  // release → resume
  s.release();
  return 'fila vazia+cheia ok (enfileira e resuma corretamente)';
}

// ---- property-based: interleavings aleatórios ----
function propertyRun(seed) {
  let seedState = seed;
  const rnd = () => {
    seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
    return seedState / 0x7fffffff;
  };
  const s = makeSemaphore();
  const active = new Set(); // acquires pendentes (promises)
  const resolved = [];
  const totalOps = 2000;
  for (let op = 0; op < totalOps; op++) {
    const r = rnd();
    if (r < 0.5 || active.size === 0) {
      // acquire (bursts de até 10 no mesmo "tick")
      const n = 1 + Math.floor(rnd() * 10);
      for (let i = 0; i < n; i++) {
        const priority = rnd() < 0.4 ? 'high' : 'normal';
        s.acquire({ priority }).then(() => resolved.push(priority));
        active.add(op + ':' + i);
      }
    } else {
      // release de 1..3 slots
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        if (s.inFlight === 0 && s.queueLen === 0) break; // nada a liberar
        s.release();
      }
    }
    // P1: inFlight nunca fora de [0, MAX]
    if (s.inFlight < 0 || s.inFlight > MAX) throw new Error(`P1 VIOLADO (seed ${seed}): inFlight=${s.inFlight}`);
    // P3: invariante de ordenação estrutural
    const q = s.log.filter((e) => e.type === 'queued').pop();
    if (q && q.queue) {
      const lastNormal = q.queue.lastIndexOf('n');
      const firstHighAfter = q.queue.indexOf('h', lastNormal + 1);
      if (lastNormal !== -1 && firstHighAfter !== -1 && firstHighAfter > lastNormal) {
        throw new Error(`P3 VIOLADO (seed ${seed}): fila '${q.queue}'`);
      }
    }
  }
  // drena tudo
  while (s.queueLen > 0 || s.inFlight > 0) {
    if (s.inFlight === 0 && s.queueLen > 0) throw new Error(`P5 VIOLADO (seed ${seed}): fila com inFlight=0 (deadlock)`);
    s.release();
  }
  // P2: estado final limpo
  if (s.inFlight !== 0 || s.queueLen !== 0) throw new Error(`P2 VIOLADO (seed ${seed}): inFlight=${s.inFlight} fila=${s.queueLen}`);
  // P4: resolved count == acquires totais
  const totalAcquires = s.log.filter((e) => e.type === 'direct' || e.type === 'queued').length;
  if (resolved.length !== totalAcquires) throw new Error(`P4 VIOLADO (seed ${seed}): resolved ${resolved.length} != acquires ${totalAcquires}`);
  return true;
}

// ---- P5: equivalência findLastIndex vs loop manual ----
function findLastIndexEq() {
  const arrs = [[], ['n'], ['h'], ['n', 'n'], ['h', 'h'], ['n', 'h', 'n', 'h', 'n'], ['h', 'n', 'h'], ['n', 'n', 'n', 'h']];
  for (const arr of arrs) {
    const fli = arr.map((p) => p === 'h').lastIndexOf(true);
    let manual = -1;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] === 'h') { manual = i; break; } }
    if (fli !== manual) throw new Error(`P5 VIOLADO: ${arr.join('')} fli=${fli} manual=${manual}`);
  }
  return 'findLastIndex ≡ loop manual (8 combinações)';
}

// ---- runner ----
let failures = 0;
const results = [];
for (const [name, fn] of Object.entries({
  scenarioEmptyQueueHigh, scenarioAllHighThenNormal, scenarioInterleaving,
  scenarioReleaseStorm, scenarioStarvation, scenarioQueueEmptyInFlightFullEdge, findLastIndexEq,
})) {
  try { results.push(`  ✓ ${name}: ${fn()}`); }
  catch (e) { failures++; results.push(`  ✗ ${name}: ${e.message}`); }
}

const SEEDS = 5000;
let ok = 0, fail = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  try { propertyRun(seed); ok++; }
  catch (e) { fail++; if (fail <= 3) results.push(`  ✗ propertyRun seed ${seed}: ${e.message}`); }
}
results.push(`\nProperty-based: ${ok}/${SEEDS} seeds OK, ${fail} falhas`);

console.log('=== AUDIT SIM — semáforo com prioridade ===');
console.log(results.join('\n'));
process.exit(failures + fail > 0 ? 1 : 0);
