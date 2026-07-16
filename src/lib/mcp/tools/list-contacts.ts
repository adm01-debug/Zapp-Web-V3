import { createClient } from '@supabase/supabase-js';
import { defineTool, type ToolContext } from '@lovable.dev/mcp-js';
import { z } from 'zod';

function supabaseForUser(ctx: ToolContext) {
  const supabaseUrl = process.env.SUPABASE_URL as string;
  const supabaseKey = (process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY) as string;
  return createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'zapp' },
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: 'search_contacts',
  title: 'Buscar contatos',
  description:
    'Busca contatos por nome ou telefone (LIKE case-insensitive). Respeita RLS do usuário.',
  inputSchema: {
    query: z.string().trim().min(1).max(120).describe('Termo de busca (nome ou telefone).'),
    limit: z.number().int().min(1).max(50).optional().describe('Máximo de resultados (padrão 20).'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: 'text', text: 'Não autenticado.' }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    // Strip PostgREST .or() metacharacters to prevent filter injection (no DOMPurify in Node context)
    const safeQuery = String(query ?? '')
      .slice(0, 100) // pre-cap before escaping: worst-case 2× expansion → max 200 chars
      .replace(/[,"()]/g, '') // strip PostgREST .or() metacharacters
      .replace(/\\/g, '\\\\') // escape backslash first (complete encoding)
      .replace(/[*%_]/g, '\\$&') // escape SQL LIKE wildcards (* is PostgREST alias for %)
      .slice(0, 200); // safety net
    const { data, error } = await sb
      .from('contacts')
      .select('id, name, phone_number, email, assigned_to, created_at')
      .or(`name.ilike.%${safeQuery}%,phone_number.ilike.%${safeQuery}%`)
      .limit(limit ?? 20);

    if (error) {
      return { content: [{ type: 'text', text: error.message }], isError: true };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: { contacts: data ?? [] },
    };
  },
});
