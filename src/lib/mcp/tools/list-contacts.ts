import { createClient } from '@supabase/supabase-js';
import { defineTool, type ToolContext } from '@lovable.dev/mcp-js';
import { z } from 'zod';

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
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
    const safeQuery = String(query ?? '').replace(/[,"()\\]/g, '').replace(/[%_]/g, '\\$&').slice(0, 200);
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
