import { defineTool, type ToolContext } from '@lovable.dev/mcp-js';

export default defineTool({
  name: 'whoami',
  title: 'Quem sou eu',
  description:
    'Retorna informações do usuário autenticado que está chamando o MCP (ID, e-mail, client ID).',
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: 'text', text: 'Não autenticado.' }], isError: true };
    }
    const payload = {
      user_id: ctx.getUserId(),
      email: ctx.getUserEmail?.() ?? null,
      client_id: ctx.getClientId?.() ?? null,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
