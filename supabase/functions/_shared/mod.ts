// Barrel de conveniência do _shared. Mantém apenas os re-exports estáveis e
// não-legacy. Novos consumidores devem importar diretamente dos módulos-fonte
// (auth.ts, validation.ts, vault.ts) — este arquivo existe só para manter
// retrocompatibilidade dos poucos edge functions que ainda o consomem.
export { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from "./cors.ts";
export { getSecret } from "./vault.ts";
