import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from './_shared-client';

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
    const { data, error } = await sb
      .from('contacts')
      .select('id, name, phone_number, email, assigned_to, created_at')
      .or(`name.ilike.%${query}%,phone_number.ilike.%${query}%`)
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
