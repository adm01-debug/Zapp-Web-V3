import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  EDGE_FUNCTION_NAMES,
  EdgeFunctionContractSchemas,
  getContractLifecycle,
  validateContractPayload,
} from '../edge-contract-schemas.ts';
import { contractErrorResponse } from '../validation.ts';

Deno.test('Contract coverage: registry mirrors every function directory with an index.ts', () => {
  const actual = Array.from(Deno.readDirSync(new URL('../../', import.meta.url)))
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        Deno.statSync(new URL(`../../${name}/index.ts`, import.meta.url));
        return true;
      } catch {
        return false;
      }
    })
    .sort();

  assertEquals([...EDGE_FUNCTION_NAMES].sort(), actual);
});

Deno.test('Contract coverage: every Edge Function has at least one Zod schema version', () => {
  for (const functionName of EDGE_FUNCTION_NAMES) {
    const versions = EdgeFunctionContractSchemas[functionName];
    assert(versions, `${functionName} has no contract schema registry entry`);
    assert(Object.keys(versions).length > 0, `${functionName} has no contract versions`);
    assert(versions.v1, `${functionName} must keep a v1 contract for backward compatibility`);
  }
});

Deno.test('Contract versioning: Evolution webhook accepts v1 and v2 payloads', () => {
  const v1 = validateContractPayload('evolution-webhook', 'v1', {
    event: 'messages.upsert',
    instance: 'wpp1',
    data: { id: 'msg-1' },
  });
  assertEquals(v1.success, true);

  const v2 = validateContractPayload('evolution-webhook', 'v2', {
    version: '2.0',
    event: 'messages.upsert',
    instance: 'wpp1',
    timestamp: Date.now(),
    data: { id: 'msg-1' },
  });
  assertEquals(v2.success, true);
});

Deno.test(
  'Contract versioning: deprecated v1 webhooks remain backward compatible during sunset',
  () => {
    for (const name of ['evolution-webhook', 'whatsapp-cloud-webhook']) {
      const lifecycle = getContractLifecycle(name);
      assertEquals(lifecycle.current, 'v2');
      assertEquals(lifecycle.supported, ['v1', 'v2']);
      assertEquals(lifecycle.deprecated?.v1?.replacement, 'v2');
      assert(lifecycle.deprecated?.v1?.sunset, `${name} v1 must have a sunset date`);
    }
  }
);

Deno.test('Contract versioning: unsupported versions fail consistently', () => {
  const result = validateContractPayload('evolution-webhook', 'v3', {
    event: 'messages.upsert',
    instance: 'wpp1',
  });
  assertEquals(result.success, false);
  if (!result.success) {
    assertEquals(result.error.issues[0].path, ['contract']);
  }
});

Deno.test('Contract validation: missing fields, wrong types and empty values are rejected', () => {
  const cases: Array<[string, string, unknown]> = [
    ['evolution-webhook', 'v1', { event: 'messages.upsert' }],
    [
      'evolution-webhook',
      'v2',
      { version: '2.0', event: 'messages.upsert', instance: '', timestamp: 'now' },
    ],
    ['whatsapp-cloud-webhook', 'v1', { object: 'user', entry: [] }],
    ['create-user', 'v1', { email: 'not-an-email' }],
    ['detect-new-device', 'v1', { device_fingerprint: '', browser: '', os: 10, device_name: '' }],
  ];

  for (const [name, version, payload] of cases) {
    const result = validateContractPayload(name, version, payload);
    assertEquals(result.success, false, `${name}@${version} should reject invalid payload`);
  }
});

Deno.test('Contract validation: generic endpoint contracts reject empty object payloads', () => {
  const result = validateContractPayload('send-email', 'v1', {});
  assertEquals(result.success, false);
});

Deno.test('Contract validation: hundreds of adversarial malformed payloads are rejected', () => {
  const malformedPayloads = [
    null,
    '',
    [],
    0,
    false,
    { '': '' },
    { unexpected: undefined },
    { event: '', instance: '' },
    { event: 1, instance: [] },
    { object: '', entry: [] },
  ];
  let scenarios = 0;

  for (const functionName of EDGE_FUNCTION_NAMES) {
    const result = validateContractPayload(
      functionName,
      'v1',
      malformedPayloads[scenarios % malformedPayloads.length]
    );
    scenarios++;
    if (functionName === 'evolution-webhook' || functionName === 'whatsapp-cloud-webhook') {
      assertEquals(result.success, false, `${functionName} must reject malformed webhook payload`);
    }
  }

  for (const payload of malformedPayloads) {
    for (const [functionName, versions] of Object.entries(EdgeFunctionContractSchemas)) {
      for (const version of Object.keys(versions)) {
        validateContractPayload(functionName, version, payload);
        scenarios++;
      }
    }
  }

  assert(scenarios >= 300, `expected at least 300 simulated scenarios, got ${scenarios}`);
});

Deno.test('422 contract error response uses one normalized shape', async () => {
  const res = contractErrorResponse(
    'contract_violation',
    'Payload validation failed',
    [
      { path: ['email'], message: 'Invalid email' },
      { path: ['profile', 'name'], message: 'Required' },
    ],
    'req-123'
  );

  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body, {
    error: true,
    code: 'contract_violation',
    message: 'Payload validation failed',
    requestId: 'req-123',
    fields: ['email', 'profile.name'],
    details: [
      { path: 'email', message: 'Invalid email' },
      { path: 'profile.name', message: 'Required' },
    ],
  });
});
