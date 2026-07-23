import { auth, defineMcp } from '@lovable.dev/mcp-js';
import whoamiTool from './tools/whoami';
import listConnectionsTool from './tools/list-connections';
import searchContactsTool from './tools/list-contacts';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://supabase.atomicabr.com.br';

/** MCP server definition for ZAPP Web: exposes whoami, list-connections, and list-contacts tools with Supabase OAuth auth. */
export default defineMcp({
  name: 'zapp-web-mcp',
  title: 'ZAPP Web MCP',
  version: '0.1.0',
  instructions:
    'Ferramentas para o ZAPP Web: identificação do usuário autenticado, listagem de conexões WhatsApp e busca de contatos. Todas as chamadas respeitam RLS do usuário.',
  auth: auth.oauth.issuer({
    issuer: `${supabaseUrl}/auth/v1`,
    acceptedAudiences: 'authenticated',
  }),
  tools: [whoamiTool, listConnectionsTool, searchContactsTool],
});
