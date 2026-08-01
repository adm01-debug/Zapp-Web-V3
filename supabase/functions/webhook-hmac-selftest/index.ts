/**
 * webhook-hmac-selftest
 *
 * Gera payloads sintéticos, calcula HMAC-SHA256 com o secret configurado e
 * valida via o mesmo pipeline usado pelo evolution-webhook (createWebhookValidator).
 *
 * Além da validação criptográfica, executa cenários de **proteção contra replay**
 * baseados em `issuedAt` e `nonce` — usando uma janela de tolerância configurável
 * (default 300s) e um cache em memória de nonces já vistos durante a execução.
 *
 * Cenários executados:
 *   1. fresh        — assinatura correta + issuedAt agora       → esperado: aceito
 *   2. tampered     — assinatura adulterada                     → esperado: rejeitado (HMAC)
 *   3. expired      — issuedAt fora da janela (no passado)      → esperado: rejeitado (replay)
 *   4. future       — issuedAt fora da janela (no futuro)       → esperado: rejeitado (skew)
 *   5. replay       — mesmo nonce reutilizado                   → esperado: rejeitado (replay)
 *
 * Retorna diagnóstico — sem expor o secret.
 */
// Import "estrela" + dinâmico para tolerar mudanças no contrato exportado por
// `_shared/hmac-validation.ts`. Resolvemos o validador em runtime via
// `resolveValidator()` — assim, se a API mudar (renomear, virar default export,
// virar classe, etc.) o deploy continua compilando e o self-test cai em
// fallbacks bem definidos em vez de quebrar.
import * as hmacModule from '../_shared/hmac-validation.ts';

/* ─────────────────────────────────────────────────────────────────────────────
 * Adapter de validador HMAC
 *
 * Ao longo do tempo, `_shared/hmac-validation.ts` pode mudar de assinatura
 * (renomes, default export, virar classe-only, mudar arity, retornar
 * `{ ok }` em vez de `{ valid }`, etc.). Para evitar **deploy failures**
 * causados por incompatibilidade de import, resolvemos o validador em
 * runtime e normalizamos a saída para um shape canônico:
 *
 *     ValidatorResult = { valid; signatureFound; error?; payload? }
 *
 * Ordem de tentativas (1ª que existir vence):
 *   1) `createWebhookValidator(secret, strict)` — assinatura atual
 *   2) `createWebhookValidator(secret)`         — sem strict
 *   3) `createValidator(secret)`                — possível rename futuro
 *   4) `default(secret)`                        — possível default export
 *   5) `new WebhookSecurityService(secret).validateRequest`
 *   6) Fallback inline usando `verifyHmacSignature` + `extractSignatureFromHeaders`
 *      (cobre o caso em que sobra apenas a primitiva).
 *
 * Se nenhuma alternativa for utilizável, lançamos um erro claro no boot —
 * melhor falhar cedo no self-test do que em produção.
 * ────────────────────────────────────────────────────────────────────────── */

type ValidatorResult = {
  valid: boolean;
  signatureFound: boolean;
  error?: string;
  payload?: string | null;
};

type ValidatorFn = (req: Request) => Promise<ValidatorResult>;

// deno-lint-ignore no-explicit-any
function normalizeResult(raw: any): ValidatorResult {
  if (raw == null || typeof raw !== 'object') {
    return { valid: false, signatureFound: false, error: 'validator returned non-object' };
  }
  // Aceita aliases: valid|ok|isValid e signatureFound|hasSignature|signature_present
  const valid = Boolean(raw.valid ?? raw.ok ?? raw.isValid ?? false);
  const signatureFound = Boolean(
    raw.signatureFound ?? raw.hasSignature ?? raw.signature_present ?? false,
  );
  const error = typeof raw.error === 'string'
    ? raw.error
    : (typeof raw.reason === 'string' ? raw.reason : undefined);
  const payload = typeof raw.payload === 'string' ? raw.payload : null;
  return { valid, signatureFound, error, payload };
}

function resolveValidator(secret: string, strict = false): ValidatorFn {
  // deno-lint-ignore no-explicit-any
  const mod = hmacModule as any;

  // 1 + 2) createWebhookValidator(secret, strict?) → (req) => Promise<result>
  if (typeof mod.createWebhookValidator === 'function') {
    let factory: (req: Request) => Promise<unknown>;
    try {
      factory = mod.createWebhookValidator(secret, strict);
    } catch {
      factory = mod.createWebhookValidator(secret);
    }
    if (typeof factory === 'function') {
      return async (req) => normalizeResult(await factory(req));
    }
  }

  // 3) createValidator(secret) — possível rename
  if (typeof mod.createValidator === 'function') {
    const factory = mod.createValidator(secret, strict) ?? mod.createValidator(secret);
    if (typeof factory === 'function') {
      return async (req) => normalizeResult(await factory(req));
    }
  }

  // 4) default export como factory
  if (typeof mod.default === 'function') {
    try {
      const factory = mod.default(secret, strict);
      if (typeof factory === 'function') {
        return async (req) => normalizeResult(await factory(req));
      }
    } catch {
      // segue para próximos fallbacks
    }
  }

  // 5) Classe WebhookSecurityService com .validateRequest
  if (typeof mod.WebhookSecurityService === 'function') {
    try {
      const svc = new mod.WebhookSecurityService(secret, strict);
      if (typeof svc?.validateRequest === 'function') {
        return async (req) => normalizeResult(await svc.validateRequest(req));
      }
    } catch {
      // segue para fallback final
    }
  }

  // 6) Fallback bare-bones: monta a validação a partir das primitivas
  if (
    typeof mod.verifyHmacSignature === 'function' &&
    typeof mod.extractSignatureFromHeaders === 'function'
  ) {
    return async (req) => {
      try {
        const sig: string | null = mod.extractSignatureFromHeaders(req.headers);
        const body = await req.text();
        if (!sig) {
          return { valid: !strict, signatureFound: false, payload: body, error: strict ? 'Missing webhook signature' : undefined };
        }
        const ok: boolean = await mod.verifyHmacSignature(body, sig, secret);
        return {
          valid: ok,
          signatureFound: true,
          payload: body,
          error: ok ? undefined : 'Invalid webhook signature',
        };
      } catch (e) {
        return {
          valid: false,
          signatureFound: false,
          error: e instanceof Error ? e.message : 'validator threw',
        };
      }
    };
  }

  throw new Error(
    'hmac-validation module incompatible: nenhuma das assinaturas conhecidas ' +
    '(createWebhookValidator | createValidator | default | WebhookSecurityService | verifyHmacSignature) foi encontrada.',
  );
}

/**
 * CORS headers — definidos inline (sem dependência de pacote externo) para
 * compatibilidade com qualquer versão do runtime do Supabase Edge Functions.
 *
 * Inclui todos os headers que o `@supabase/supabase-js` envia por padrão
 * (incluindo metadados de plataforma/runtime), além de Methods e Max-Age para
 * evitar preflights repetidos.
 */
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': [
    'authorization',
    'x-client-info',
    'apikey',
    'content-type',
    'x-supabase-client-platform',
    'x-supabase-client-platform-version',
    'x-supabase-client-runtime',
    'x-supabase-client-runtime-version',
  ].join(', '),
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
};

const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutos
const MAX_TOLERANCE_SECONDS = 3600;    // 1 hora (cap defensivo)

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeHmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return toHex(sig);
}

/**
 * Fases discretas de validação — usadas no logger e no relatório.
 * Permite identificar onde a falha ocorreu sem expor segredos.
 */
type Phase =
  | 'config'        // leitura/validação do secret no env
  | 'parse-body'    // parse do body recebido pelo cliente
  | 'build-payload' // montagem do payload sintético
  | 'sign'          // computeHmac (importKey + sign)
  | 'mutate'        // mutação opcional pós-assinatura
  | 'request'       // construção do Request com headers
  | 'validate'      // createWebhookValidator (HMAC pipeline)
  | 'signature-presence' // checagem de header presente
  | 'temporal'      // janela issuedAt + cache de nonce
  | 'response';     // serialização final

interface ScenarioReport {
  name: string;
  description: string;
  expected: 'accept' | 'reject';
  outcome: 'accept' | 'reject';
  passed: boolean;
  reason: string | null;
  /** Fase em que a validação falhou (null quando passou). */
  failed_phase: Phase | null;
  /** Trilha de fases percorridas até concluir o cenário (com latências). */
  phases: Array<{ phase: Phase; status: 'ok' | 'fail' | 'skip'; duration_ms: number }>;
  issuedAt: string;
  ageSeconds: number;
  nonce: string;
}

/**
 * Valida janela temporal (issuedAt) + replay (nonce).
 * É independente do HMAC; complementa a verificação criptográfica.
 */
function checkTemporal(
  parsed: { issuedAt?: string; nonce?: string },
  toleranceSec: number,
  seenNonces: Set<string>,
  now: number,
): { ok: boolean; ageSeconds: number; reason: string | null } {
  if (!parsed.issuedAt || !parsed.nonce) {
    return { ok: false, ageSeconds: 0, reason: 'Missing issuedAt or nonce' };
  }
  const issued = Date.parse(parsed.issuedAt);
  if (Number.isNaN(issued)) {
    return { ok: false, ageSeconds: 0, reason: 'Invalid issuedAt format' };
  }
  const ageSeconds = Math.round((now - issued) / 1000);
  if (ageSeconds > toleranceSec) {
    return { ok: false, ageSeconds, reason: `Payload expired (age ${ageSeconds}s > ${toleranceSec}s)` };
  }
  if (-ageSeconds > toleranceSec) {
    return { ok: false, ageSeconds, reason: `Payload from the future (skew ${-ageSeconds}s > ${toleranceSec}s)` };
  }
  if (seenNonces.has(parsed.nonce)) {
    return { ok: false, ageSeconds, reason: 'Replay detected: nonce already seen' };
  }
  seenNonces.add(parsed.nonce);
  return { ok: true, ageSeconds, reason: null };
}

/**
 * Logger estruturado em JSON (uma linha por evento).
 * Sai via console.log para aparecer nos logs da edge function.
 * NUNCA loga o secret — apenas seu comprimento e prefixo de hash.
 */
function structuredLog(event: {
  level: 'info' | 'warn' | 'error';
  fn: 'webhook-hmac-selftest';
  request_id: string;
  phase: Phase;
  scenario?: string;
  status: 'ok' | 'fail' | 'skip';
  duration_ms?: number;
  reason?: string | null;
  meta?: Record<string, unknown>;
}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  if (event.level === 'error') console.error(line);
  else if (event.level === 'warn') console.warn(line);
  else console.log(line);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  // ── Fase: config ─────────────────────────────────────────────
  const configStart = Date.now();
  const secretSource = Deno.env.get('EVOLUTION_WEBHOOK_SECRET')
    ? 'EVOLUTION_WEBHOOK_SECRET'
    : (Deno.env.get('WEBHOOK_SECRET') ? 'WEBHOOK_SECRET' : null);
  const secret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET')
    ?? Deno.env.get('WEBHOOK_SECRET')
    ?? '';

  if (!secret) {
    structuredLog({
      level: 'error', fn: 'webhook-hmac-selftest', request_id: requestId,
      phase: 'config', status: 'fail', duration_ms: Date.now() - configStart,
      reason: 'No webhook secret configured',
    });
    return new Response(
      JSON.stringify({
        ok: false,
        configured: false,
        request_id: requestId,
        failed_phase: 'config' as Phase,
        error: 'No webhook secret configured (EVOLUTION_WEBHOOK_SECRET / WEBHOOK_SECRET).',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  structuredLog({
    level: 'info', fn: 'webhook-hmac-selftest', request_id: requestId,
    phase: 'config', status: 'ok', duration_ms: Date.now() - configStart,
    meta: { secret_source: secretSource, secret_length: secret.length },
  });

  // ── Fase: parse-body ─────────────────────────────────────────
  const parseStart = Date.now();
  let body: Record<string, unknown> = {};
  let parseFailed = false;
  try {
    if (req.method === 'POST') body = await req.json();
    structuredLog({
      level: 'info', fn: 'webhook-hmac-selftest', request_id: requestId,
      phase: 'parse-body', status: 'ok', duration_ms: Date.now() - parseStart,
    });
  } catch (e) {
    parseFailed = true;
    structuredLog({
      level: 'warn', fn: 'webhook-hmac-selftest', request_id: requestId,
      phase: 'parse-body', status: 'fail', duration_ms: Date.now() - parseStart,
      reason: e instanceof Error ? e.message : 'invalid json',
    });
    // segue com defaults — não é fatal
  }

  const instance = (body?.instance as string) ?? 'selftest';
  const requested = Number(body?.tolerance_seconds);
  const toleranceSec = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), MAX_TOLERANCE_SECONDS)
    : DEFAULT_TOLERANCE_SECONDS;
  const includeNegative = body?.include_negative !== false;

  // Resolve em runtime — sobrevive a renomes/refactors no shared module.
  const validate = resolveValidator(secret, false);
  const seenNonces = new Set<string>();
  const now = Date.now();

  // Helper: monta payload, assinatura e Request com várias opções de adulteração.
  // Retorna também a trilha de fases internas (build → sign → mutate → request).
  async function makeReq(opts: {
    issuedAt: Date;
    nonce: string;
    wrongSecret?: boolean;
    mutatePayload?: (parsed: Record<string, unknown>) => Record<string, unknown>;
    omitSignature?: boolean;
    scenarioName: string;
  }): Promise<{
    payload: string; req: Request; sig: string; parsed: Record<string, unknown>;
    trail: ScenarioReport['phases'];
    failedPhase: Phase | null; failReason: string | null;
  }> {
    const trail: ScenarioReport['phases'] = [];

    // build-payload
    const tBuild = Date.now();
    const synthetic: Record<string, unknown> = {
      event: 'self.test', instance, nonce: opts.nonce, issuedAt: opts.issuedAt.toISOString(),
    };
    const originalPayload = JSON.stringify(synthetic);
    trail.push({ phase: 'build-payload', status: 'ok', duration_ms: Date.now() - tBuild });

    // sign
    const tSign = Date.now();
    let sig = '';
    try {
      const signingSecret = opts.wrongSecret ? secret + 'X' : secret;
      sig = await computeHmac(originalPayload, signingSecret);
      trail.push({ phase: 'sign', status: 'ok', duration_ms: Date.now() - tSign });
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'sign failed';
      trail.push({ phase: 'sign', status: 'fail', duration_ms: Date.now() - tSign });
      structuredLog({
        level: 'error', fn: 'webhook-hmac-selftest', request_id: requestId,
        phase: 'sign', scenario: opts.scenarioName, status: 'fail',
        duration_ms: Date.now() - tSign, reason,
      });
      return {
        payload: originalPayload, req: new Request('https://selftest.local/'),
        sig: '', parsed: synthetic, trail, failedPhase: 'sign', failReason: reason,
      };
    }

    // mutate (opcional)
    const tMutate = Date.now();
    const finalParsed = opts.mutatePayload ? opts.mutatePayload({ ...synthetic }) : synthetic;
    const finalPayload = opts.mutatePayload ? JSON.stringify(finalParsed) : originalPayload;
    trail.push({
      phase: 'mutate',
      status: opts.mutatePayload ? 'ok' : 'skip',
      duration_ms: Date.now() - tMutate,
    });

    // request
    const tReq = Date.now();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (!opts.omitSignature) headers['x-hub-signature-256'] = `sha256=${sig}`;
    const r = new Request('https://selftest.local/', { method: 'POST', headers, body: finalPayload });
    trail.push({ phase: 'request', status: 'ok', duration_ms: Date.now() - tReq });

    return { payload: finalPayload, req: r, sig, parsed: finalParsed, trail, failedPhase: null, failReason: null };
  }

  // Helper: roda um cenário (HMAC + temporal) e produz relatório com trilha completa
  async function runScenario(args: {
    name: string;
    description: string;
    expected: 'accept' | 'reject';
    issuedAt: Date;
    nonce: string;
    wrongSecret?: boolean;
    mutatePayload?: (parsed: Record<string, unknown>) => Record<string, unknown>;
    omitSignature?: boolean;
    preSeed?: string;
  }): Promise<ScenarioReport> {
    if (args.preSeed) seenNonces.add(args.preSeed);

    const built = await makeReq({ ...args, scenarioName: args.name });
    const phases = built.trail;
    let outcome: 'accept' | 'reject';
    let reason: string | null;
    let failedPhase: Phase | null = built.failedPhase;

    if (built.failedPhase) {
      // Falha já dentro de makeReq (ex.: sign)
      outcome = 'reject';
      reason = built.failReason;
    } else {
      // validate
      const tVal = Date.now();
      const hmacResult = await validate(built.req);
      phases.push({
        phase: 'validate',
        status: hmacResult.valid ? 'ok' : 'fail',
        duration_ms: Date.now() - tVal,
      });
      outcome = hmacResult.valid ? 'accept' : 'reject';
      reason = hmacResult.error ?? null;
      if (!hmacResult.valid) failedPhase = 'validate';

      // signature-presence
      if (outcome === 'accept' && !hmacResult.signatureFound) {
        phases.push({ phase: 'signature-presence', status: 'fail', duration_ms: 0 });
        outcome = 'reject';
        reason = 'Missing signature header';
        failedPhase = 'signature-presence';
      } else {
        phases.push({ phase: 'signature-presence', status: 'ok', duration_ms: 0 });
      }

      // temporal
      if (outcome === 'accept') {
        const tTemp = Date.now();
        const temporal = checkTemporal(
          built.parsed as { issuedAt?: string; nonce?: string },
          toleranceSec, seenNonces, now,
        );
        phases.push({
          phase: 'temporal',
          status: temporal.ok ? 'ok' : 'fail',
          duration_ms: Date.now() - tTemp,
        });
        if (!temporal.ok) {
          outcome = 'reject';
          reason = temporal.reason;
          failedPhase = 'temporal';
        }
      } else {
        phases.push({ phase: 'temporal', status: 'skip', duration_ms: 0 });
      }
    }

    const passed = outcome === args.expected;
    const ageSeconds = Math.round((now - args.issuedAt.getTime()) / 1000);

    structuredLog({
      level: passed ? 'info' : 'warn',
      fn: 'webhook-hmac-selftest', request_id: requestId,
      phase: failedPhase ?? 'response',
      scenario: args.name, status: passed ? 'ok' : 'fail',
      reason,
      meta: { expected: args.expected, outcome, age_seconds: ageSeconds },
    });

    return {
      name: args.name,
      description: args.description,
      expected: args.expected,
      outcome,
      passed,
      reason,
      failed_phase: passed ? null : failedPhase,
      phases,
      issuedAt: args.issuedAt.toISOString(),
      ageSeconds,
      nonce: args.nonce,
    };
  }

  const sharedNonce = crypto.randomUUID();
  const scenarios: ScenarioReport[] = [];

  // Cenários base
  scenarios.push(await runScenario({
    name: 'fresh',
    description: 'Assinatura válida + issuedAt agora',
    expected: 'accept',
    issuedAt: new Date(now),
    nonce: crypto.randomUUID(),
  }));

  scenarios.push(await runScenario({
    name: 'tampered',
    description: 'Assinatura adulterada (secret errado)',
    expected: 'reject',
    issuedAt: new Date(now),
    nonce: crypto.randomUUID(),
    wrongSecret: true,
  }));

  scenarios.push(await runScenario({
    name: 'expired',
    description: `issuedAt antigo (${toleranceSec + 60}s no passado)`,
    expected: 'reject',
    issuedAt: new Date(now - (toleranceSec + 60) * 1000),
    nonce: crypto.randomUUID(),
  }));

  scenarios.push(await runScenario({
    name: 'future',
    description: `issuedAt no futuro (${toleranceSec + 60}s à frente)`,
    expected: 'reject',
    issuedAt: new Date(now + (toleranceSec + 60) * 1000),
    nonce: crypto.randomUUID(),
  }));

  scenarios.push(await runScenario({
    name: 'replay',
    description: 'Mesmo nonce reutilizado dentro da janela',
    expected: 'reject',
    issuedAt: new Date(now),
    nonce: sharedNonce,
    preSeed: sharedNonce,
  }));

  // Cenários negativos adicionais (opt-in, default ON)
  if (includeNegative) {
    scenarios.push(await runScenario({
      name: 'wrong-secret',
      description: 'Assinatura computada com secret diferente do servidor',
      expected: 'reject',
      issuedAt: new Date(now),
      nonce: crypto.randomUUID(),
      wrongSecret: true,
    }));

    scenarios.push(await runScenario({
      name: 'payload-mutated',
      description: 'Payload alterado após a assinatura (sem recomputar)',
      expected: 'reject',
      issuedAt: new Date(now),
      nonce: crypto.randomUUID(),
      mutatePayload: (p) => ({ ...p, event: 'self.test.tampered', extra: 'injected' }),
    }));

    scenarios.push(await runScenario({
      name: 'missing-signature',
      description: 'Request enviado sem o header x-hub-signature-256',
      expected: 'reject',
      issuedAt: new Date(now),
      nonce: crypto.randomUUID(),
      omitSignature: true,
    }));
  }

  const allPassed = scenarios.every((s) => s.passed);
  const fresh = scenarios[0];
  const tampered = scenarios[1];
  const failedScenarios = scenarios.filter((s) => !s.passed);
  // Fase agregada onde a 1ª falha ocorreu (útil para alertas)
  const firstFailedPhase: Phase | null = failedScenarios[0]?.failed_phase ?? null;
  const totalDuration = Date.now() - startedAt;

  // Log final agregado
  structuredLog({
    level: allPassed ? 'info' : 'warn',
    fn: 'webhook-hmac-selftest', request_id: requestId,
    phase: firstFailedPhase ?? 'response',
    status: allPassed ? 'ok' : 'fail',
    duration_ms: totalDuration,
    reason: allPassed ? null : `${failedScenarios.length}/${scenarios.length} cenários falharam`,
    meta: {
      tolerance_seconds: toleranceSec,
      include_negative: includeNegative,
      parse_body_failed: parseFailed,
      failed_scenarios: failedScenarios.map((s) => ({ name: s.name, phase: s.failed_phase })),
    },
  });

  return new Response(
    JSON.stringify({
      ok: allPassed,
      configured: true,
      request_id: requestId,
      secret_length: secret.length,
      duration_ms: totalDuration,
      tolerance_seconds: toleranceSec,
      /** Fase agregada da 1ª falha (config|parse-body|sign|validate|signature-presence|temporal|...) */
      failed_phase: firstFailedPhase,
      scenarios,
      good: {
        accepted: fresh.outcome === 'accept',
        signatureFound: true,
        error: fresh.reason,
      },
      tampered: {
        accepted: tampered.outcome === 'accept',
        signatureFound: true,
        error: tampered.reason,
      },
      payload_preview: {
        event: 'self.test',
        instance,
        nonce: '<random>',
        issuedAt: new Date(now).toISOString(),
      },
      message: allPassed
        ? `HMAC + replay protection OK: ${scenarios.length} cenários passaram (janela ${toleranceSec}s).`
        : `Falha em ${failedScenarios.length}/${scenarios.length} cenários (1ª fase com erro: ${firstFailedPhase ?? 'desconhecida'}).`,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
