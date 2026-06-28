import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!SUPABASE_URL) {
  console.error(
    '[Supabase] VITE_SUPABASE_URL não configurada.\n' +
    'Acesse: Projeto Lovable → Settings → Secrets e adicione VITE_SUPABASE_URL.\n' +
    'Obtenha em: Supabase Dashboard → Project Settings → API.'
  );
}
if (!SUPABASE_ANON_KEY) {
  console.error(
    '[Supabase] VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY) não configurada.\n' +
    'Acesse: Projeto Lovable → Settings → Secrets e adicione VITE_SUPABASE_ANON_KEY.\n' +
    'Obtenha em: Supabase Dashboard → Project Settings → API.'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

const supabaseUrl = isSupabaseConfigured ? SUPABASE_URL : 'https://supabase-unconfigured.invalid';
const supabaseAnonKey = isSupabaseConfigured ? SUPABASE_ANON_KEY : 'missing-anon-key';

const getSupabaseStorage = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: getSupabaseStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
);
