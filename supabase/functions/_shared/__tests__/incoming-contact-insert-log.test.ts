/**
 * Incoming contact insert failure instrumentation (2026-08-12).
 *
 * Regressão do incidente: o insert de contato NOVO via view public.contacts
 * falhava (ex.: chk_lead_status_vocab) e o erro ≠ 23505 era engolido
 * silenciosamente → contact=null → mensagem descartada SEM log.
 *
 * Estes testes garantem que os 3 caminhos de falha agora LOGAM
 * (console.error / console.warn) e que o caminho de sucesso NÃO loga erro.
 *
 * Run: deno test --allow-net supabase/functions/_shared/__tests__/incoming-contact-insert-log.test.ts
 */
import {
  assertEquals,
  assert,
  assertMatch,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { handleIncomingMessage } from '../evolution-webhook-messages.ts';

// deno-lint-ignore no-explicit-any
type Result = any;

/**
 * Mock fluente do supabase: rastreia a última operação do chain e resolve
 * com o resultado configurado (por tabela + operação final).
 * - maybeSingle/single retornam Promise; update sem método final usa .then.
 */
function makeSupabase(
  tableResults: Record<string, Result>,
  calls: Record<string, number>,
) {
  const builderFor = (table: string) => {
    // deno-lint-ignore no-explicit-any
    let lastOp = '';
    const builder: any = {
      select: () => { lastOp = 'select'; return builder; },
      eq: () => { lastOp = 'eq'; return builder; },
      in: () => { lastOp = 'in'; return builder; },
      or: () => { lastOp = 'or'; return builder; },
      limit: () => { lastOp = 'limit'; return builder; },
      insert: () => { lastOp = 'insert'; return builder; },
      update: () => { lastOp = 'update'; return builder; },
      maybeSingle: () => {
        calls[`${table}:maybeSingle`] = (calls[`${table}:maybeSingle`] ?? 0) + 1;
        return Promise.resolve(tableResults[`${table}:${lastOp}:maybeSingle`]);
      },
      single: () => {
        calls[`${table}:single`] = (calls[`${table}:single`] ?? 0) + 1;
        return Promise.resolve(tableResults[`${table}:${lastOp}:single`]);
      },
      then: (resolve: (v: Result) => void) => {
        calls[`${table}:then`] = (calls[`${table}:then`] ?? 0) + 1;
        resolve(tableResults[`${table}:${lastOp}:then`]);
      },
    };
    return builder;
  };

  return {
    from: (table: string) => {
      calls[`from:${table}`] = (calls[`from:${table}`] ?? 0) + 1;
      return builderFor(table);
    },
    // F3-edge (2026-08-14): ingestão via RPC canônico — mock do sucesso
    rpc: (name: string) => {
      calls[`rpc:${name}`] = (calls[`rpc:${name}`] ?? 0) + 1;
      if (name === 'rpc_insert_message') {
        return Promise.resolve({ data: { id: 'm1', message_id: 'TESTMSG001', contact_id: 'c9' }, error: null });
      }
      if (name === 'rpc_update_incoming_message') {
        return Promise.resolve({ data: { id: 'm1' }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `rpc não mockada: ${name}` } });
    },
  };
}

const KEY = {
  id: 'TESTMSG001',
  fromMe: false,
  remoteJid: '5511943652022@s.whatsapp.net',
  remoteJidAlt: '35382494269532@lid',
  participant: '',
} as const;

const DATA = {
  key: KEY,
  message: { conversation: 'Olá, teste de instrumentação' },
  messageTimestamp: 1700000000,
  pushName: 'Cliente Teste',
};

function baseTableResults(insertResult: Result): Record<string, Result> {
  return {
    // getConnectionByInstance — select().eq().maybeSingle() → lastOp='eq'
    'whatsapp_connections:eq:maybeSingle': { data: { id: 'conn1' } },
    // getContactByPhone (contato NÃO existe) — select().in().eq().limit().maybeSingle() → lastOp='limit'
    'contacts:limit:maybeSingle': { data: null },
    // insert do contato — insert().select().single() → lastOp='select'
    'contacts:select:single': insertResult,
    // recover do 23505 — update().eq() sem método final → .then
    'contacts:eq:then': { error: null },
    // select da mensagem existente — select().eq().eq().maybeSingle() → lastOp='eq'
    'evolution_messages:eq:maybeSingle': { data: null },
    // insert da mensagem — insert().select().maybeSingle() → lastOp='select'
    'evolution_messages:select:maybeSingle': { data: { id: 'm1' } },
  };
}

Deno.test('incoming | insert de contato com erro != 23505 LOGA console.error (não mais silencioso)', async () => {
  const calls: Record<string, number> = {};
  const supabase = makeSupabase(
    {
      ...baseTableResults({ data: null, error: { code: 'PGRST301', message: 'constraint violation', details: 'chk_lead_status_vocab', hint: null } }),
    },
    calls,
  );
  const errorStub = stub(console, 'error');

  try {
    await handleIncomingMessage(supabase as never, 'wpp2', DATA as never, KEY as never, 'http://localhost', 'sk-test');

    assert(errorStub.calls.length > 0, 'console.error DEVE ter sido chamado');
    const firstArg = String(errorStub.calls[0].args[0]);
    assertMatch(firstArg, /\[CONTACT\] Insert FAILED \(non-23505\)/, `mensagem inesperada: ${firstArg}`);
    // A mensagem NÃO foi persistida (handler retornou em `if (!contact) return` antes
    // de tocar evolution_messages) — mas agora há rastro no log.
    assertEquals(calls['from:evolution_messages'] ?? 0, 0, 'handler deve retornar antes do select da mensagem');
  } finally {
    errorStub.restore();
  }
});

Deno.test('incoming | 23505 sem recovery LOGA console.warn', async () => {
  const calls: Record<string, number> = {};
  const supabase = makeSupabase(
    {
      ...baseTableResults({ data: null, error: { code: '23505', message: 'duplicate key', details: '', hint: '' } }),
      // recover: busca variants → não encontra (data null)
      'contacts:limit:maybeSingle': { data: null },
    },
    calls,
  );
  const warnStub = stub(console, 'warn');

  try {
    await handleIncomingMessage(supabase as never, 'wpp2', DATA as never, KEY as never, 'http://localhost', 'sk-test');

    assert(warnStub.calls.length > 0, 'console.warn DEVE ter sido chamado');
    const firstArg = String(warnStub.calls[0].args[0]);
    assertMatch(firstArg, /\[CONTACT\] Duplicate insert conflict \(23505\)/, `mensagem inesperada: ${firstArg}`);
  } finally {
    warnStub.restore();
  }
});

Deno.test('incoming | insert de contato com SUCESSO NÃO loga erro e persiste a mensagem', async () => {
  const calls: Record<string, number> = {};
  const supabase = makeSupabase(
    {
      ...baseTableResults({ data: { id: 'c9', avatar_url: null, assigned_to: null, name: null }, error: null }),
    },
    calls,
  );
  const errorStub = stub(console, 'error');
  const warnStub = stub(console, 'warn');

  try {
    await handleIncomingMessage(supabase as never, 'wpp2', DATA as never, KEY as never, 'http://localhost', 'sk-test');

    assertEquals(errorStub.calls.length, 0, 'console.error NÃO deve ser chamado no sucesso');
    assertEquals(warnStub.calls.length, 0, 'console.warn NÃO deve ser chamado no sucesso');
    // F3-edge (2026-08-14): persistência da mensagem via rpc_insert_message (ingest-port)
    assert((calls['rpc:rpc_insert_message'] ?? 0) >= 1, 'rpc_insert_message deve ter sido chamado');
    assert((calls['from:evolution_messages'] ?? 0) >= 1, 'select da mensagem deve ter sido feito');
  } finally {
    errorStub.restore();
    warnStub.restore();
  }
});
