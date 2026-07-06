import { auth, defineMcp } from '@lovable.dev/mcp-js';
import whoamiTool from './tools/whoami';
import listConnectionsTool from './tools/list-connections';
import searchContactsTool from './tools/list-contacts';

// The OAuth issuer MUST be the direct Supabase host, built from the project
// ref (Vite inlines it at build time so this stays import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? 'project-ref-unset';

export default defineMcp({
  name: 'zapp-web-mcp',
  title: 'ZAPP Web MCP',
  version: '0.1.0',
  instructions:
    'Ferramentas para o ZAPP Web: identificação do usuário autenticado, listagem de conexões WhatsApp e busca de contatos. Todas as chamadas respeitam RLS do usuário.',
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: 'authenticated',
  }),
  tools: [whoamiTool, listConnectionsTool, searchContactsTool],
});
