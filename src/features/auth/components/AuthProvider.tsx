import { useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { authService, Profile } from '@/features/auth/services/authService';
import { log } from '@/lib/logger';
import { AuthContext } from '@/features/auth/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';



/**
 * Componente central que fornece o estado de autenticação para toda a aplicação.
 * Encapsula a lógica de sessão do Supabase e sincronização do perfil do usuário.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingProfileRef = useRef(false);
  const fetchingRolesRef = useRef(false);
  const fetchingPermissionsRef = useRef(false);
  const queryClient = useQueryClient();


  const fetchProfile = useCallback(async (userId: string) => {
    if (fetchingProfileRef.current) return;
    fetchingProfileRef.current = true;
    try {
      const { data, error } = await authService.getProfile(userId);
      if (!error && data) {
        setProfile(data);
      }
    } catch (err: unknown) {
      log.warn('[Auth] Failed to fetch profile for user:', userId, err);
    } finally {
      fetchingProfileRef.current = false;
    }
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    if (fetchingRolesRef.current) return;
    fetchingRolesRef.current = true;
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (!error && data) {
        const userRoles = data.map((r) => r.role as string);
        setRoles(userRoles);
      }
    } catch (err: unknown) {
      log.warn('[Auth] Failed to fetch roles for user:', userId, err);
    } finally {
      fetchingRolesRef.current = false;
    }
  }, []);

  const fetchPermissions = useCallback(async (userId: string) => {
    if (fetchingPermissionsRef.current) return;
    fetchingPermissionsRef.current = true;
    try {
      // Get roles first (to avoid complex joins that might hit RLS issues or be slow)
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (userRoles && userRoles.length > 0) {
        const roles = userRoles.map(r => r.role);
        const { data: perms } = await supabase
          .from('role_permissions')
          .select('permissions(name)')
          .in('role', roles);

        if (perms) {
          const permNames = perms
            .map(p => (p.permissions as unknown as { name: string } | null)?.name)
            .filter(Boolean) as string[];
          setPermissions([...new Set(permNames)]);
        }
      } else {
        setPermissions([]);
      }
    } catch (err: unknown) {
      log.warn('[Auth] Failed to fetch permissions for user:', userId, err);
    } finally {
      fetchingPermissionsRef.current = false;
    }
  }, []);

  const refreshAll = useCallback(async (userId: string) => {
    setLoading(true);
    await Promise.all([
      fetchProfile(userId),
      fetchRoles(userId),
      fetchPermissions(userId)
    ]);
    setLoading(false);
  }, [fetchProfile, fetchRoles, fetchPermissions]);

  useEffect(() => {
    const subscription = authService.onAuthStateChange((event, session) => {
      log.info(`[Auth] Event: ${event}`);
      
      if (event === 'TOKEN_REFRESHED' && !session) {
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
            .forEach((k) => localStorage.removeItem(k));
        } catch (e) {
          log.warn('[Auth] Failed to clear stale auth tokens', e);
        }
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        refreshAll(session.user.id);
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
      }
    });

    authService.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        refreshAll(user.id);
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      log.warn('[Auth] getUser failed, clearing local session', err);
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* noop */ }
      setLoading(false);
    });

    authService.getSession().then(({ data: { session } }) => {
      setSession(session);
    }).catch(() => {
      // getSession error is already handled by getUser catch
    });

    return () => subscription.unsubscribe();
  }, [refreshAll]);

  // Real-time profile updates (e.g., department changes)
  useEffect(() => {
    if (!user) return;

    const profileChannel = supabase
      .channel(`profile-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          log.info('[Auth] Profile update detected via real-time', payload.event);
          if (payload.event === 'DELETE') {
            setProfile(null);
          } else {
            // Refetch to ensure we have full data and respect RLS
            await fetchProfile(user.id);
          }
        }
      )
      .subscribe();

    const rolesChannel = supabase
      .channel(`role-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          log.info('[Auth] Role change detected, refetching...');
          fetchRoles(user.id);
          fetchPermissions(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(rolesChannel);
    };
  }, [user, profile?.id, fetchRoles, fetchPermissions]);


  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshRoles = useCallback(async () => {
    if (user) await fetchRoles(user.id);
  }, [user, fetchRoles]);

  const refreshPermissions = useCallback(async () => {
    if (user) await fetchPermissions(user.id);
  }, [user, fetchPermissions]);

  const signIn = async (email: string, password: string) => {
    return await authService.signIn(email, password);
  };

  const signUp = async (email: string, password: string, name: string) => {
    return await authService.signUp(email, password, name);
  };

  const signOut = async () => {
    await authService.signOut();
    setProfile(null);
    setRoles([]);
    setPermissions([]);
    queryClient.clear();
  };

  const contextValue = useMemo(
    () => ({
      user,
      session,
      profile,
      roles,
      permissions,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshRoles,
      refreshPermissions,
    }),
    [user, session, profile, roles, permissions, loading, refreshProfile, refreshRoles, refreshPermissions]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

