/**
 * Testes unitários do getClientIP (validation.ts) — resolução do IP real do
 * cliente no chain Traefik → Kong → Edge Function.
 *
 * Cobertura:
 * - x-real-ip presente → priorizado (não controlável pelo cliente)
 * - XFF com 3 entries (Client → Traefik → Kong) → 3º a partir do fim = cliente real
 * - XFF com 2 entries → primeiro entry (chain menor)
 * - XFF com 1 entry → único entry
 * - XFF vazio/ausente → 'unknown'
 * - IPv6 normalizado para forma canônica
 * - Anti-spoofing: entry forjada na FRENTE não altera o resultado
 * - Asserts de posição no source: documenta o trade-off e não usa rightmost (.at(-1))
 *
 * Run: deno test --allow-read supabase/functions/_shared/__tests__/get-client-ip.test.ts
 */
import { assert, assertMatch, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { getClientIP } from '../validation.ts';
import { readSourceFrom } from '../test-helpers.ts';

const VALIDATION = await readSourceFrom(import.meta.url, '../validation.ts');

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://zapp.local/', { headers });
}

Deno.test('getClientIP: x-real-ip presente é priorizado sobre o XFF', () => {
  assertEquals(
    getClientIP(reqWith({
      'x-real-ip': '203.0.113.9',
      'x-forwarded-for': '1.2.3.4, 10.0.1.25, 10.0.1.211',
    })),
    '203.0.113.9',
  );
});

Deno.test('getClientIP: XFF com 3 entries → 3º a partir do fim (cliente real, não Traefik/Kong)', () => {
  // Chain: 1.2.3.4 (cliente) → 10.0.1.25 (Traefik) → 10.0.1.211 (Kong)
  assertEquals(
    getClientIP(reqWith({ 'x-forwarded-for': '1.2.3.4, 10.0.1.25, 10.0.1.211' })),
    '1.2.3.4',
  );
});

Deno.test('getClientIP: XFF com 4 entries → 3º a partir do fim (ignora entry forjada na frente)', () => {
  // Cliente forja "6.6.6.6" na FRENTE; os 2 últimos continuam sendo Traefik+Kong
  // (append no fim não é forjável) → 3º a partir do fim = cliente real 1.2.3.4.
  assertEquals(
    getClientIP(reqWith({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4, 10.0.1.25, 10.0.1.211' })),
    '1.2.3.4',
  );
});

Deno.test('getClientIP: XFF com 2 entries → primeiro entry (chain sem Kong)', () => {
  assertEquals(
    getClientIP(reqWith({ 'x-forwarded-for': '203.0.113.7, 10.0.1.25' })),
    '203.0.113.7',
  );
});

Deno.test('getClientIP: XFF com 1 entry → único entry (acesso direto)', () => {
  assertEquals(
    getClientIP(reqWith({ 'x-forwarded-for': '203.0.113.7' })),
    '203.0.113.7',
  );
});

Deno.test('getClientIP: XFF com só separadores/empty → unknown', () => {
  assertEquals(
    getClientIP(reqWith({ 'x-forwarded-for': ' , , ' })),
    'unknown',
  );
});

Deno.test('getClientIP: sem headers → unknown', () => {
  assertEquals(getClientIP(new Request('https://zapp.local/')), 'unknown');
});

Deno.test('getClientIP: IPv6 do cliente normalizado para forma canônica', () => {
  assertEquals(
    getClientIP(reqWith({ 'x-forwarded-for': '2001:0DB8:0:0:0:0:0:1, 10.0.1.25, 10.0.1.211' })),
    '2001:db8::1',
  );
});

Deno.test('getClientIP: IPv6 via x-real-ip também normalizado', () => {
  assertEquals(
    getClientIP(reqWith({ 'x-real-ip': '2001:0DB8:0:0:0:0:0:1' })),
    '2001:db8::1',
  );
});

Deno.test('getClientIP: source documenta trade-off anti-spoofing e não usa rightmost', () => {
  const block = VALIDATION.slice(VALIDATION.indexOf('* Extract and normalize client IP'));
  assertMatch(block, /length\s*-\s*3/, 'deve contar hops confiáveis a partir do fim');
  assertMatch(block, /x-real-ip/, 'deve continuar preferindo x-real-ip');
  assertMatch(block, /anti-spoofing|forjar|spoof/i, 'deve documentar o trade-off anti-spoofing');
  assert(!/\.at\(-1\)/.test(block), 'não deve mais usar o rightmost do XFF (IP interno do Traefik)');
  assert(!/split\(','\)\.at\(-1\)/.test(block), 'rightmost removido da cadeia de fallback');
});
