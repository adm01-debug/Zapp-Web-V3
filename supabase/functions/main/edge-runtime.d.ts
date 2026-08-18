// Global do supabase/edge-runtime (main service). Só existe DENTRO do runtime —
// este declare cobre o `deno check main/index.ts` do parse-gate (edge-deploy.yml).
// O TIPO é idêntico ao de main/__tests__/index.test.ts (redeclaração de `var`
// exige tipo igual — TS2451 se divergir). Arquivo .d.ts: zero efeito em prod.
declare global {
  var EdgeRuntime: {
    userWorkers: {
      create: (
        opts: { servicePath: string } & Record<string, unknown>,
      ) => Promise<{ fetch: (req: Request) => Promise<Response> }>
    }
  }
}
export {}
