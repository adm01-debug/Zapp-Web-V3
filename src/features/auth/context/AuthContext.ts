import { createContext } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { Profile } from '../services/authService';

/** Estado de erro do bootstrap de auth (Supabase inacessivel / timeout). */
export type AuthBootstrapError = 'timeout' | 'offline' | null;

/** Auth Context Type. */
export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  permissions: string[];
  loading: boolean;
  bootstrapError: AuthBootstrapError;
  bootstrapElapsedMs: number | null;
  /** true enquanto retryBootstrap() está em execução — desabilita o botão de retry na UI. */
  isRetrying: boolean;
  retryBootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

/** Auth Context. */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
