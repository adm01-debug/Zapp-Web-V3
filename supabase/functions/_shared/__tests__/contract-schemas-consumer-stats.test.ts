// E89 (2026-08-16): contrato evolution-consumer-stats — regressão do fix parsed.data
// (PGRST202: parseOrReject retorna {ok, data}, não {ok, body} — edge usava parsed.body
// → p_row undefined → PostgREST procurava função sem parâmetros).
import { assert, assertEquals } from 'jsr:@std/assert';
import {
  EdgeFunctionContractSchemas,
  getContractLifecycle,
  validateContractPayload,
} from '../edge-contract-schemas.ts';

const FN = 'evolution-consumer-stats';

Deno.test(`E89: contrato ${FN} registrado com v1`, () => {
  const versions = EdgeFunctionContractSchemas[FN];
  assert(versions, `${FN} deve estar no registry de contratos`);
  assert(versions.v1, `${FN} deve manter v1`);
});

Deno.test(`E89: payload de stats válido passa no contrato v1`, () => {
  const r = validateContractPayload(FN, 'v1', {
    collected_at: '2026-08-16T15:00:00Z',
    replica: 'consumer.1',
    ok: 123,
    shadow: 0,
    retry: 1,
    drop: 0,
    err: 0,
    pg_log_ok: 5,
    pg_log_err: 0,
    sentry_sent: 2,
    resub: 0,
    pg_stats_ok: 3,
    pg_stats_err: 0,
    drop_by: { '4xx:404': 1 },
    retry_by: {},
  });
  assertEquals(r.success, true);
});

Deno.test(`E89: payload vazio (sem campos) passa — passthrough permissivo`, () => {
  const r = validateContractPayload(FN, 'v1', {});
  assertEquals(r.success, true);
});

Deno.test(`E89: lifecycle registrado para ${FN}`, () => {
  const lc = getContractLifecycle(FN);
  assert(lc, `${FN} deve ter lifecycle`);
});
