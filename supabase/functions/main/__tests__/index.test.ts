/**
 * Testes source-level do router main (supabase/functions/main/index.ts):
 * função inexistente → 404 JSON estruturado (em vez do 500 genérico), com CORS,
 * e fluxo normal preservado para funções existentes.
 *
 * Caso real: GET /functions/v1/evaluation-health → 500 {"msg":"Internal server error"}
 * (função consolidada em health, sem diretório no volume). O router deve responder
 * 404 {error: 'function_not_found', ...} ANTES de tentar criar o worker.
 *
 * Estratégia: stuba Deno.serve (captura o handler), Deno.stat (controla a
 * existência do diretório da função) e a global EdgeRuntime (worker fake)
 * ANTES do import dinâmico do módulo (o main executa Deno.serve no load).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/main/__tests__/index.test.ts
 */

import { assertEquals, assertMatch } from 'jsr:@std/assert'

// ─── Stubs globais (precisam existir ANTES do import do módulo) ────────────

// EdgeRuntime não existe no Deno CLI — declaração global para o type-check do
// main (o CI roda `deno test` SEM --no-check) + valor fake em runtime.
declare global {
  var EdgeRuntime: {
    userWorkers: {
      create: (
        opts: { servicePath: string } & Record<string, unknown>,
      ) => Promise<{ fetch: (req: Request) => Promise<Response> }>
    }
  }
}

let capturedHandler: ((req: Request) => Promise<Response>) | null = null
const createdServices: string[] = []

const fakeWorker = {
  fetch: async (_req: Request) => new Response('worker-ok', { status: 200 }),
}

Deno.serve = ((handler: (req: Request) => Promise<Response>) => {
  capturedHandler = handler
  return {} as ReturnType<typeof Deno.serve>
}) as typeof Deno.serve

globalThis.EdgeRuntime = {
  userWorkers: {
    create: async (opts: { servicePath: string } & Record<string, unknown>) => {
      createdServices.push(opts.servicePath)
      return fakeWorker
    },
  },
}

// Controle do Deno.stat: NotFound por padrão (função inexistente no volume).
type StatMode = 'notfound' | 'dir' | 'file' | 'other-error'
let statMode: StatMode = 'notfound'
Deno.stat = (async (_path: string) => {
  if (statMode === 'notfound') throw new Deno.errors.NotFound('not found')
  if (statMode === 'other-error') throw new Error('permission denied')
  return { isDirectory: statMode === 'dir' } as Deno.FileInfo
}) as typeof Deno.stat

// Isola o ambiente: sem JWT obrigatório e sem Sentry ativo.
Deno.env.set('VERIFY_JWT', 'false')
Deno.env.set('SENTRY_DSN', '')

// Import do módulo SÓ depois dos stubs (top-level lê env e chama Deno.serve).
await import('../index.ts')

// ─── Helpers ────────────────────────────────────────────────────────────────

// O edge-runtime entrega o pathname SEM o prefixo /functions/v1/ para o main
// (o router lê service_name = path_parts[1]).
const req = (name: string) => new Request(`https://zapp.example/${name}`, { method: 'GET' })

function resetStubs(): void {
  createdServices.length = 0
}

// ─── Função inexistente → 404 ───────────────────────────────────────────────

Deno.test('função inexistente (evaluation-health) → 404 JSON estruturado, worker NÃO criado', async () => {
  resetStubs()
  statMode = 'notfound'
  const res = await capturedHandler!(req('evaluation-health'))
  assertEquals(res.status, 404)
  const body = await res.json()
  assertEquals(body.error, 'function_not_found')
  assertEquals(body.message, 'Edge function não encontrada: evaluation-health')
  assertEquals(res.headers.get('content-type'), 'application/json')
  // CORS presente (mesmo padrão do restante do router)
  assertMatch(res.headers.get('access-control-allow-methods') ?? '', /GET/)
  assertEquals(createdServices.length, 0)
})

// ─── etapa 26 (Bloco 2, 2026-08-21): {msg:...} migrado pra errorEnvelope ────
// (as 2 rotas de JWT — Invalid JWT/Authorization failed — não são exercitáveis
// nesta suíte porque VERIFY_JWT é lido uma vez no import do módulo, linha 64,
// e este arquivo já força 'false'; cobertura dessas 2 ficaria num arquivo
// separado que reimporta o módulo com VERIFY_JWT='true', fora do escopo desta
// etapa — o padrão já existe em outros *-failclosed.test.ts do repo).

Deno.test('nome de função ausente (pathname "/") → 400 envelope canônico', async () => {
  resetStubs()
  const res = await capturedHandler!(new Request('https://zapp.example/', { method: 'GET' }))
  assertEquals(res.status, 400)
  assertEquals(await res.json(), { error: true, code: 'missing_function_name', message: 'missing function name in request' })
  assertEquals(createdServices.length, 0)
})

Deno.test('nome de função inválido (self-invocation "main") → 400 envelope canônico', async () => {
  resetStubs()
  const res = await capturedHandler!(req('main'))
  assertEquals(res.status, 400)
  assertEquals(await res.json(), { error: true, code: 'invalid_function_name', message: 'invalid function name' })
  assertEquals(createdServices.length, 0)
})

Deno.test('caminho existe mas não é diretório → 404', async () => {
  resetStubs()
  statMode = 'file'
  const res = await capturedHandler!(req('health-check'))
  assertEquals(res.status, 404)
  const body = await res.json()
  assertEquals(body.error, 'function_not_found')
})

// ─── Função existente → fluxo atual preservado ──────────────────────────────

Deno.test('função existente → worker criado e request encaminhado (fluxo atual preservado)', async () => {
  resetStubs()
  statMode = 'dir'
  const res = await capturedHandler!(req('health-check'))
  assertEquals(res.status, 200)
  assertEquals(await res.text(), 'worker-ok')
  assertEquals(createdServices, ['/home/deno/functions/health-check'])
})

Deno.test('erro de FS não-NotFound → fluxo atual preservado (worker tenta criar)', async () => {
  resetStubs()
  statMode = 'other-error'
  const res = await capturedHandler!(req('health-check'))
  assertEquals(res.status, 200)
  assertEquals(createdServices.length, 1)
})
