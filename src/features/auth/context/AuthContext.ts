import { createContext } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { Profile } from '../services/authService';

/** Auth Context Type. */
export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  permissions: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

/** Auth Context. */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
