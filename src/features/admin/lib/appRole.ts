import type { AppRole } from '@/features/auth';

/**
 * E60 — saneamento auth/admin: guard runtime de AppRole sem casts frágeis.
 * Substitui `v as AppRole` (cast inseguro) por validação runtime do papel.
 * (Select/Tabs entregam string; só valores da lista são aceitos).
 */
export const APP_ROLE_VALUES: readonly AppRole[] = ['dev', 'admin', 'manager', 'supervisor', 'agent'];

export function isAppRole(v: string): v is AppRole {
  return (APP_ROLE_VALUES as readonly string[]).includes(v);
}
