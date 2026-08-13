/**
 * Lint rule: no-direct-evo-url
 * 
 * Impede acesso direto a Deno.env.get('EVOLUTION_API_URL') fora do gateway centralizado.
 * Use evolutionClient de _shared/providers/evolution/client.ts.
 * 
 * ADR-009 — Gateway Pattern para Evolution API
 */
export default {
  name: "no-direct-evo-url",
  message: "Use evolutionClient de _shared/providers/evolution/client.ts em vez de EVOLUTION_API_URL diretamente. (ADR-009)",
  predicate: (src: string, filePath: string) => {
    if (filePath.includes('providers/evolution') || filePath.includes('evolution-api-proxy')) return false;
    if (filePath.includes('.test.ts') || filePath.includes('__tests__')) return false;
    return /Deno\.env\.get\(['"]EVOLUTION_API_URL['"]\)/.test(src);
  }
};
