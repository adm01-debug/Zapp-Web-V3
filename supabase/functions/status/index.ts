// Healthcheck endpoint mínimo para a função `status`.
//
// Existe porque o runtime (e ferramentas externas de
// monitoramento) ocasionalmente fazem GET em `/functions/v1/status`.
// Sem este arquivo o runtime devolve 503 SUPABASE_EDGE_RUNTIME_ERROR
// ("Service is temporarily unavailable") porque a função não existe.
//
// Resposta intencionalmente leve (sem dependências externas, sem auth)
// para que o handler suba em milissegundos e nunca falhe.

import { corsHeaders } from '../_shared/validation.ts';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
