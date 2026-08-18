// Global do supabase/edge-runtime (main service). Só existe DENTRO do runtime —
// este declare cobre o `deno check` do parse-gate (edge-deploy.yml), que roda
// com o Deno CLI puro. Arquivo .d.ts: zero código gerado, zero efeito em prod.
declare const EdgeRuntime: {
  userWorkers: {
    create(opts: {
      servicePath: string;
      memoryLimitMb: number;
      workerTimeoutMs: number;
      noModuleCache: boolean;
      importMapPath: string | null;
      envVars: string[][];
    }): Promise<{ fetch(req: Request): Promise<Response> }>;
  };
};
