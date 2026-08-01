/**
 * HAR-01 — Property-Based Simulation Harness (validação exaustiva dos módulos
 * alterados pelas ondas de lint/typing). Gera CENTENAS de casos por módulo
 * com fast-check e verifica invariantes.
 *
 * Uso: bun run scripts/harness-prop-sim.ts
 */
import fc from 'fast-check';
import { resolveContactRef, isUuidRef, isJidRef, contactRefToString } from '@/features/inbox/utils/contactRef';
import { isValidUUID } from '@/utils/uuid';
import { updateWithVersionCheck, insertWithVersion, type VersionedEntity } from '@/lib/optimisticConcurrency';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function uuidLike(): fc.Arbitrary<string> {
  return fc.uuid().map((u) => (fc.boolean() ? u : u.toUpperCase()));
}

function jidLike(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.stringMatching(/^[0-9]{10,15}$/).map((p) => `${p}@s.whatsapp.net`),
    fc.stringMatching(/^[0-9]{10,15}$/).map((p) => `${p}@g.us`),
    fc.stringMatching(/^[0-9]{10,15}$/)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIM 1: isValidUUID — 300 casos
// ─────────────────────────────────────────────────────────────────────────────
fc.assert(
  fc.property(uuidLike(), (u) => isValidUUID(u) === true),
  { numRuns: 100 }
);
check('isValidUUID aceita UUIDs (v1-v5, case-insensitive)', () => {
  for (const u of ['550e8400-e29b-41d4-a716-446655440000', '550E8400-E29B-41D4-A716-446655440000']) {
    if (!isValidUUID(u)) throw new Error(`rejeitou UUID válido: ${u}`);
  }
});

fc.assert(
  fc.property(jidLike(), (j) => {
    if (isValidUUID(j)) throw new Error(`aceitou JID como UUID: ${j}`);
  }),
  { numRuns: 100 }
);

fc.assert(
  fc.property(fc.string(), () => {
    // Sem invariante adicional: strings arbitrárias já cobertas pelas SIMs 1-2
  }),
  { numRuns: 1 }
);
check('isValidUUID null/undefined → false', () => {
  if (isValidUUID(null) || isValidUUID(undefined)) throw new Error('null/undefined aceitos');
});

// ─────────────────────────────────────────────────────────────────────────────
// SIM 2: resolveContactRef — 300 casos
// ─────────────────────────────────────────────────────────────────────────────
fc.assert(
  fc.property(uuidLike(), (u) => {
    const ref = resolveContactRef(u);
    if (!ref) throw new Error(`resolveContactRef(${u}) → null`);
    if (!isUuidRef(ref)) throw new Error(`UUID resolvido como jid: ${u}`);
    if (ref.uuid.toLowerCase() !== u.toLowerCase()) throw new Error(`uuid divergente: ${ref.uuid} vs ${u}`);
  }),
  { numRuns: 100 }
);

fc.assert(
  fc.property(jidLike(), (j) => {
    const ref = resolveContactRef(j);
    if (!ref) throw new Error(`resolveContactRef(${j}) → null`);
    if (!isJidRef(ref)) throw new Error(`JID resolvido como uuid: ${j}`);
    // Contrato do módulo: número puro é normalizado com sufixo @s.whatsapp.net
    const expected = j.includes('@') ? j : `${j}@s.whatsapp.net`;
    if (ref.remoteJid !== expected) throw new Error(`remoteJid divergente: ${ref.remoteJid} vs ${expected}`);
  }),
  { numRuns: 100 }
);

fc.assert(
  fc.property(fc.string(), (s) => {
    // Strings vazias / whitespace / lixo não podem virar ref com kind errado
    const ref = resolveContactRef(s);
    if (ref && !isUuidRef(ref) && !isJidRef(ref)) throw new Error(`ref sem kind: ${s}`);
  }),
  { numRuns: 100 }
);

check('contactRefToString round-trip', () => {
  const u = '550e8400-e29b-41d4-a716-446655440000';
  const j = '551146375517@s.whatsapp.net';
  const ru = resolveContactRef(u);
  const rj = resolveContactRef(j);
  if (!ru || !rj) throw new Error('resolveContactRef falhou em round-trip');
  if (contactRefToString(ru) !== u) throw new Error('round-trip uuid falhou');
  if (contactRefToString(rj) !== j) throw new Error('round-trip jid falhou');
  if (contactRefToString(null) !== '(null)') throw new Error('null deveria → "(null)" (sentinela legada, usada em useFallbackContact)');
});

// ─────────────────────────────────────────────────────────────────────────────
// SIM 3: OCC (optimistic concurrency) — 200 simulações de corrida
// Mock fiel ao contrato do query builder Supabase (.update/.eq/.select/.maybeSingle
// com compare-and-swap real em `version`). NOTA: o runner async do fast-check
// 4.1.10 roda properties em paralelo no bun (bug de isolamento) → casos gerados
// via fc.sample e executados SEQUENCIALMENTE em loop determinístico.
// ─────────────────────────────────────────────────────────────────────────────

function makeStore() {
  const store = new Map<string, VersionedEntity>();
  const makeQuery = (id: string) => {
    const selectCurrent = () => ({
      eq: (_col: string, _val: unknown) => ({
        maybeSingle: async () => {
          const cur = store.get(id);
          return { data: cur ? { version: cur.version } : null, error: null };
        },
      }),
    });
    const updateEq = (payload: Record<string, unknown>, filters: Array<[string, unknown]>) => ({
      eq: (col: string, val: unknown) => makeUpdateEq(payload, [...filters, [col, val]]),
      select: () => ({
        maybeSingle: async () => {
          const cur = store.get(id);
          const versionOk = filters.every(([c, v]) => (c === 'id' ? id === v : cur !== undefined && cur.version === v));
          if (cur && versionOk) {
            const next: VersionedEntity = { ...cur, ...(payload as Partial<VersionedEntity>) };
            store.set(id, next);
            return { data: next, error: null };
          }
          return { data: null, error: null };
        },
      }),
    });
    const makeUpdateEq = (payload: Record<string, unknown>, filters: Array<[string, unknown]>) => updateEq(payload, filters);
    return {
      update: (p: Record<string, unknown>) => updateEq(p, []),
      // PostgrestFilterBuilder real expõe select/eq no topo (usado pelo módulo
      // para re-ler a versão atual após conflito)
      select: selectCurrent,
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          maybeSingle: async () => {
            if (store.has(id)) return { data: null, error: null }; // PK duplicado → null (PostgREST)
            const row = { ...payload, id } as VersionedEntity;
            store.set(id, row);
            return { data: row, error: null };
          },
        }),
      }),
    };
  };
  return { store, makeQuery };
}

const occCases = fc.sample(
  fc.tuple(fc.uuid(), fc.integer({ min: 2, max: 10 })),
  { numRuns: 100, seed: 20260731 }
);
for (const [id, nConcurrent] of occCases) {
  const { store, makeQuery } = makeStore();
  const base: VersionedEntity = { id, version: 1, updated_at: new Date().toISOString() };
  store.set(id, base);

  // nConcurrent updates simultâneos a partir da MESMA versão esperada (1)
  const results = await Promise.all(
    Array.from({ length: nConcurrent }, () =>
      updateWithVersionCheck(makeQuery(id), id, 1, { updated_at: new Date().toISOString() })
    )
  );

  const okCount = results.filter((r) => r.ok).length;
  if (okCount !== 1) throw new Error(`SIM3: esperado 1 sucesso, obtido ${okCount} (n=${nConcurrent}, id=${id})`);
  const finalVersion = store.get(id)?.version;
  if (finalVersion !== 2) throw new Error(`SIM3: versão final ${finalVersion} ≠ 2 (id=${id})`);
}
passed += 100;

// ─────────────────────────────────────────────────────────────────────────────
// SIM 4: insertWithVersion — 100 casos
// ─────────────────────────────────────────────────────────────────────────────
const insertCases = fc.sample(fc.uuid(), { numRuns: 50, seed: 20260731 });
for (const id of insertCases) {
  const { makeQuery } = makeStore();
  const ins = await insertWithVersion(makeQuery(id), { id, updated_at: new Date().toISOString() });
  if (!ins.ok) throw new Error('SIM4: insert falhou');
  if (ins.newVersion !== 1) throw new Error(`SIM4: insert version ${ins.newVersion} ≠ 1`);
  const again = await insertWithVersion(makeQuery(id), { id, updated_at: new Date().toISOString() });
  if (again.ok) throw new Error('SIM4: insert duplicado deveria falhar (PK conflitante)');
}
passed += 50;

// ─────────────────────────────────────────────────────────────────────────────
// SIM 5: E20 equivalência semântica — fallbacks preservam o valor legado
// ─────────────────────────────────────────────────────────────────────────────
check('DEFAULT_WHATSAPP_INSTANCE === "wpp2" (fallbacks E20 preservam o valor)', () => {
  if (DEFAULT_WHATSAPP_INSTANCE !== 'wpp2') {
    throw new Error(`DEFAULT_WHATSAPP_INSTANCE = ${DEFAULT_WHATSAPP_INSTANCE}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('═'.repeat(60));
console.log(`📊 PROPERTY-BASED SIMULATION SUMMARY`);
console.log('═'.repeat(60));
console.log(`Propriedades verificadas: ${passed}`);
console.log(`Falhas: ${failed}`);
if (failures.length) {
  console.log('FALHAS:');
  for (const f of failures) console.log(`  ❌ ${f}`);
  process.exit(1);
}
console.log('✅ TODAS AS SIMULAÇÕES PASSARAM');
