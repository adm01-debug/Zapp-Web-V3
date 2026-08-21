// Healthcheck endpoint mínimo para a função `status`.
//
// Existe porque o runtime (e ferramentas externas de
// monitoramento) ocasionalmente fazem GET em `/functions/v1/status`.
// Sem este arquivo o runtime devolve 503 SUPABASE_EDGE_RUNTIME_ERROR
// ("Service is temporarily unavailable") porque a função não existe.
//
// Resposta intencionalmente leve (sem dependências externas, sem auth)
// para que o handler suba em milissegundos e nunca falhe.

import { corsHeaders, readJsonBodyOrEmpty } from '../_shared/validation.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { StatusV1Schema } from '../_shared/contract-schemas.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Contrato status@v1 (estrito): probe GET sem body → {} aceito.
  const parsed = parseOrReject('status', { v1: StatusV1Schema }, req, await readJsonBodyOrEmpty(req), {
    extraHeaders: corsHeaders,
  });
  if (parsed.ok === false) return parsed.response;

  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'zapp-web-edge',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
