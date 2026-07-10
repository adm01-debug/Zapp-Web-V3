import { createContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { Profile } from '../services/authService';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  permissions: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
