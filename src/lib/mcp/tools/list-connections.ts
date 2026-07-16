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
  name: 'list_whatsapp_connections',
  title: 'Listar conexões WhatsApp',
  description:
    'Lista as conexões WhatsApp (instâncias) visíveis para o usuário autenticado, respeitando RLS.',
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Máximo de conexões a retornar (padrão 20).'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: 'text', text: 'Não autenticado.' }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from('whatsapp_connections')
      .select('id, name, instance_id, phone_number, status, is_default, created_at')
      .limit(limit ?? 20);

    if (error) {
      return { content: [{ type: 'text', text: error.message }], isError: true };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: { connections: data ?? [] },
    };
  },
});
