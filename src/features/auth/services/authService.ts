import { supabase } from '@/integrations/supabase/client';
import {
  mirrorExternalSignIn,
  mirrorExternalSignOut,
} from '@/integrations/supabase/externalSessionBridge';
import { Session } from '@supabase/supabase-js';
import type { PostgrestError } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  max_chats: number;
  department_id: string | null;
  department: string | null;
}

export const authService = {
  async getSession() {
    return await supabase.auth.getSession();
  },

  async getUser() {
    return await supabase.auth.getUser();
  },

  async signIn(email: string, password: string) {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (!result.error) {
      // dual-session: replica login no self-hosted com as mesmas credenciais
      // mirrorExternalSignIn has an internal try/catch and never rejects — .catch() is dead code
      void mirrorExternalSignIn(email, password);
    }
    return result;
  },

  async signUp(email: string, password: string, name: string) {
    const redirectUrl = `${window.location.origin}/`;
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name },
      },
    });
    if (!result.error) {
      void mirrorExternalSignIn(email, password);
    }
    return result;
  },

  async signOut() {
    await mirrorExternalSignOut();
    return await supabase.auth.signOut();
  },

  async getProfile(userId: string): Promise<{ data: Profile | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    return { data: data as Profile | null, error }; // ignore-audit: narrows Supabase query result to local interface
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(callback);
    return subscription;
  },
};
