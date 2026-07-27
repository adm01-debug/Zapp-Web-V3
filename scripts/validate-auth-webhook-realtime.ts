// validate-auth-webhook-realtime.ts
// Chave lida de VITE_SUPABASE_ANON_KEY ou SUPABASE_ANON_KEY (nao hardcoded)
const SUPABASE_URL = 'https://supabase.atomicabr.com.br';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
