// @ts-nocheck
import { useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { authService, Profile } from '../services/authService';
import { log } from '@/lib/logger';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { verifyHttpOnlyCookieAuth } from '@/integrations/supabase/cookieStorage';

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

  const fetchRolesAndPermissions = useCallback(async (userId: string) => {
    if (fetchingRolesRef.current) return;
    fetchingRolesRef.current = true;
    fetchingPermissionsRef.current = true;
    try {
      if (!supabase) {
        log.warn('[Auth] Supabase client not initialized for user:', userId);
        setRoles([]);
        setPermissions([]);
        return;
      }
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error || !userRoles) {
        setRoles([]);
        setPermissions([]);
        return;
      }

      const roleNames = userRoles.map((r) => r.role as string);
      setRoles(roleNames);

      if (roleNames.length === 0) {
        setPermissions([]);
        return;
      }

      const { data: perms } = await supabase
        .from('role_permissions')
        .select('permissions(name)')
        .in(
          'role',
          roleNames as Array<'admin' | 'agent' | 'dev' | 'manager' | 'special_agent' | 'supervisor'>
        );

      if (perms) {
        const permNames = (perms as Array<{ permissions: { name: string } | null }>)
          .map((p) => p.permissions?.name)
          .filter((n): n is string => typeof n === 'string');
        setPermissions([...new Set(permNames)]);
      }
    } catch (err: unknown) {
      log.warn('[Auth] Failed to fetch roles/permissions for user:', userId, err);
    } finally {
      fetchingRolesRef.current = false;
      fetchingPermissionsRef.current = false;
    }
  }, []);

  const fetchRoles = useCallback(
    (userId: string) => fetchRolesAndPermissions(userId),
    [fetchRolesAndPermissions]
  );
  const fetchPermissions = useCallback(
    (userId: string) => fetchRolesAndPermissions(userId),
    [fetchRolesAndPermissions]
  );

  const refreshAll = useCallback(
    async (userId: string) => {
      setLoading(true);
      await Promise.all([fetchProfile(userId), fetchRolesAndPermissions(userId)]);
      setLoading(false);
    },
    [fetchProfile, fetchRolesAndPermissions]
  );

  useEffect(() => {
    // Verify that auth tokens are stored in httpOnly cookies (XSS-resistant)
    if (!verifyHttpOnlyCookieAuth()) {
      log.error('[Auth] Security check failed: httpOnly cookies not properly configured');
    }

    const subscription = authService.onAuthStateChange((event, session) => {
      log.info(`[Auth] Event: ${event}`);

      // Token cleanup is now handled server-side via httpOnly cookie management.
      // No client-side localStorage manipulation needed.

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

    authService
      .getUser()
      .then(({ data: { user } }) => {
        setUser(user);
        if (user) {
          refreshAll(user.id);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        log.warn('[Auth] getUser failed, clearing local session', err);
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
            .forEach((k) => localStorage.removeItem(k));
        } catch {
          /* noop */
        }
        setLoading(false);
      });

    authService
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch(() => {
        // getSession error is already handled by getUser catch
      });

    return () => subscription.unsubscribe();
  }, [refreshAll]);

  useEffect(() => {
    if (!user) return;

    const profileChannel = supabase
      .channel(`profile-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          log.info('[Auth] Profile update detected via real-time', payload);
          if (payload.eventType === 'DELETE') {
            setProfile(null);
          } else {
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
          schema: 'zapp',
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
      profileChannel.unsubscribe();
      rolesChannel.unsubscribe();
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
    try {
      await authService.signOut();
      if (typeof window !== 'undefined') {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
          .forEach((k) => localStorage.removeItem(k));
      }
    } catch (e) {
      log.warn('[Auth] Error during signOut:', e);
    } finally {
      setProfile(null);
      setRoles([]);
      setPermissions([]);
      queryClient.clear();
    }
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
    [
      user,
      session,
      profile,
      roles,
      permissions,
      loading,
      refreshProfile,
      refreshRoles,
      refreshPermissions,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}