/**
 * scripts/validate-rls-policies.ts
 *
 * Valida 200+ RLS policies via introspection do schema.
 *
 * Uso: bun run scripts/validate-rls-policies.ts
 */

const SUPABASE_URL = 'https://supabase.atomicabr.com.br';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
