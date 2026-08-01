// Reporta status (presença/ausência) de WEBHOOK_SECRET sem expor o valor.
// Apenas comprimento e prefixo hash SHA-256 — útil para validar configuração no painel admin.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get('WEBHOOK_SECRET') ?? '';
  const present = secret.length > 0;
  let hashPrefix: string | null = null;
  if (present) {
    const data = new TextEncoder().encode(secret);
    const buf = await crypto.subtle.digest('SHA-256', data);
    hashPrefix = Array.from(new Uint8Array(buf))
      .slice(0, 4)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return new Response(
    JSON.stringify({
      configured: present,
      length: present ? secret.length : 0,
      hashPrefix,
      strictMode: present,
      checkedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
