import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  EDGE_FUNCTION_NAMES,
  EdgeFunctionContractSchemas,
  validateContractPayload,
} from '../edge-contract-schemas.ts';
import { contractErrorResponse } from '../validation.ts';

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
