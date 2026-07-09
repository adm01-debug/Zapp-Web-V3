import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  EDGE_FUNCTION_NAMES,
  EdgeFunctionContractSchemas,
  getContractSchema,
  getContractLifecycle,
  parseContractRequest,
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

Deno.test(
  'Contract validation: critical webhook schemas expose deterministic invalid field paths',
  () => {
    const cases: Array<{
      name: string;
      version: string;
      payload: unknown;
      expectedPaths: string[];
    }> = [
      {
        name: 'evolution-webhook',
        version: 'v1',
        payload: { event: '', instance: '' },
        expectedPaths: ['event', 'instance'],
      },
      {
        name: 'evolution-webhook',
        version: 'v2',
        payload: { version: '2.0', event: 'messages.upsert', instance: 'wpp1', timestamp: 0 },
        expectedPaths: ['timestamp'],
      },
      {
        name: 'whatsapp-cloud-webhook',
        version: 'v1',
        payload: { object: 'whatsapp_business_account', entry: [] },
        expectedPaths: ['entry'],
      },
      {
        name: 'whatsapp-cloud-webhook',
        version: 'v2',
        payload: {
          version: '2.0',
          object: 'whatsapp_business_account',
          entry: [{ id: '', changes: [] }],
        },
        expectedPaths: ['entry.0.id', 'entry.0.changes'],
      },
    ];

    for (const { name, version, payload, expectedPaths } of cases) {
      const result = validateContractPayload(name, version, payload);
      assertEquals(result.success, false, `${name}@${version} should reject invalid payload`);
      if (!result.success) {
        assertEquals(
          result.error.issues.map((issue) => issue.path.join('.')),
          expectedPaths
        );
      }
    }
  }
);

Deno.test('Contract validation: generic endpoint contracts reject empty object payloads', () => {
  const result = validateContractPayload('send-email', 'v1', {});
  assertEquals(result.success, false);
});

Deno.test(
  'Contract validation: hundreds of adversarial malformed payload simulations are stable',
  () => {
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
      { object: 'whatsapp_business_account', entry: [{ id: '', changes: [] }] },
      { version: '2.0', event: '', instance: '', timestamp: -1 },
    ];
    let scenarios = 0;
    let strictWebhookRejections = 0;

    for (const functionName of EDGE_FUNCTION_NAMES) {
      const result = validateContractPayload(
        functionName,
        'v1',
        malformedPayloads[scenarios % malformedPayloads.length]
      );
      scenarios++;
      if (functionName === 'evolution-webhook' || functionName === 'whatsapp-cloud-webhook') {
        assertEquals(
          result.success,
          false,
          `${functionName} must reject malformed webhook payload`
        );
        strictWebhookRejections++;
      }
    }

    for (const payload of malformedPayloads) {
      for (const [functionName, versions] of Object.entries(EdgeFunctionContractSchemas)) {
        for (const version of Object.keys(versions)) {
          const result = validateContractPayload(functionName, version, payload);
          if (functionName === 'evolution-webhook' || functionName === 'whatsapp-cloud-webhook') {
            assertEquals(
              result.success,
              false,
              `${functionName}@${version} must reject malformed webhook payload ${JSON.stringify(payload)}`
            );
            strictWebhookRejections++;
          }
          scenarios++;
        }
      }
    }

    assert(scenarios >= 500, `expected at least 500 simulated scenarios, got ${scenarios}`);
    assert(
      strictWebhookRejections >= 25,
      `expected strict webhook rejections, got ${strictWebhookRejections}`
    );
  }
);

Deno.test(
  'Contract validation: every registered schema can parse a valid minimal object or no-body shape',
  () => {
    for (const [functionName, versions] of Object.entries(EdgeFunctionContractSchemas)) {
      for (const version of Object.keys(versions)) {
        const schema = getContractSchema(functionName, version);
        assert(schema, `${functionName}@${version} schema should be registered`);
        if (functionName === 'evolution-webhook' && version === 'v2') continue;
        if (functionName === 'whatsapp-cloud-webhook' && version === 'v2') continue;
        schema.safeParse({ smoke: 'ok' });
      }
    }
  }
);

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

Deno.test('Runtime contract gate: valid v1/v2 webhook requests parse consistently', async () => {
  const v1 = await parseContractRequest(
    new Request('https://edge.test/evolution-webhook', {
      method: 'POST',
      body: JSON.stringify({ event: 'messages.upsert', instance: 'wpp1', data: { id: 'msg-1' } }),
    }),
    'evolution-webhook',
    { requestId: 'runtime-v1' }
  );
  assertEquals(v1.success, true);
  if (v1.success) {
    assertEquals(v1.version, 'v1');
    assertEquals(v1.lifecycle.current, 'v2');
  }

  const v2 = await parseContractRequest(
    new Request('https://edge.test/evolution-webhook', {
      method: 'POST',
      body: JSON.stringify({
        version: '2.0',
        event: 'messages.upsert',
        instance: 'wpp1',
        timestamp: 1,
        data: { id: 'msg-1' },
      }),
    }),
    'evolution-webhook',
    { requestId: 'runtime-v2' }
  );
  assertEquals(v2.success, true);
  if (v2.success) {
    assertEquals(v2.version, 'v2');
    assertEquals(v2.lifecycle.deprecated?.v1?.replacement, 'v2');
  }
});

Deno.test(
  'Runtime contract gate: invalid JSON and schema failures return normalized 422 responses',
  async () => {
    const invalidJson = await parseContractRequest(
      new Request('https://edge.test/evolution-webhook', {
        method: 'POST',
        body: '{',
      }),
      'evolution-webhook',
      { requestId: 'bad-json' }
    );
    assertEquals(invalidJson.success, false);
    if (!invalidJson.success) {
      assertEquals(invalidJson.response.status, 422);
      assertEquals(await invalidJson.response.json(), {
        error: true,
        code: 'invalid_json',
        message: 'Invalid JSON body for evolution-webhook@v2',
        requestId: 'bad-json',
        fields: ['body'],
        details: [{ path: 'body', message: 'Request body must be valid JSON' }],
      });
    }

    const invalidSchema = await parseContractRequest(
      new Request('https://edge.test/evolution-webhook', {
        method: 'POST',
        body: JSON.stringify({ event: '', instance: '' }),
      }),
      'evolution-webhook',
      { requestId: 'bad-schema' }
    );
    assertEquals(invalidSchema.success, false);
    if (!invalidSchema.success) {
      assertEquals(invalidSchema.response.status, 422);
      const body = await invalidSchema.response.json();
      assertEquals(body.code, 'contract_violation');
      assertEquals(body.message, 'Payload validation failed for evolution-webhook@v1');
      assertEquals(body.requestId, 'bad-schema');
      assertEquals(body.fields, ['event', 'instance']);
      assertEquals(
        body.details.map((detail: { path: string }) => detail.path),
        ['event', 'instance']
      );
    }
  }
);
