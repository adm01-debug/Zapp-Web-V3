/**
 * useImapAccounts.ts — Contas IMAP/SMTP não-Gmail (EMAIL-02)
 *
 * CRUD de contas imap_smtp_accounts (via view zapp.imap_smtp_accounts, que
 * tem GRANT SELECT/INSERT/UPDATE/DELETE para authenticated) + invocação da
 * edge email-imap-bridge para salvar credenciais com criptografia AES-GCM
 * (saveCredentials), testar formato (testConnection) e obter configurações
 * pré-definidas de provedores (getProviderConfig/listProviders).
 *
 * Contrato email-imap-bridge@v1 (contract-schemas.ts):
 *   - getProviderConfig { provider } → { config, supported_providers }
 *   - saveCredentials   { config }   → { success, accountId, email }
 *   - testConnection    { config }   → { valid, issues?, message?, recommendation? }
 *   - listProviders     {}           → { providers: [{id,name,imap_host,smtp_host}], note }
 *
 * NOTA: a edge é HTTP-only (sem TCP) — testConnection valida apenas formato;
 * conexão IMAP/SMTP real exige broker externo (Nylas/EmailEngine). A UI deixa
 * isso explícito ao usuário.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('ImapAccounts');

/** Provedores suportados pelo contrato email-imap-bridge@v1. */
export type ImapProvider = 'outlook' | 'yahoo' | 'gmail' | 'custom';

/** Linha da tabela imap_smtp_accounts (view zapp). Colunas extras
 * (provider, imap_use_ssl, smtp_use_tls) existem no DB live mas estão
 * ausentes do types.ts gerado — tratadas como opcionais aqui. */
export interface ImapSmtpAccount {
  id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  username: string | null;
  provider?: ImapProvider | string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_use_ssl?: boolean | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_use_tls?: boolean | null;
  password_encrypted?: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Config enviada à edge (saveCredentials/testConnection). */
export interface ImapSmtpConfig {
  email: string;
  password: string;
  provider: ImapProvider;
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  username?: string;
  display_name?: string;
}

/** Config pré-definida de um provedor (getProviderConfig). */
export interface ImapProviderConfig {
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
}

/** Resposta da edge email-imap-bridge. */
export interface ImapBridgeResponse<T> {
  data: T | null;
  error: string | null;
}

const IMAP_ACCOUNTS_KEY = ['imap-smtp-accounts'] as const;

/** Invoca a edge email-imap-bridge com o contrato v1 e normaliza erro. */
async function invokeBridge<T>(body: Record<string, unknown>): Promise<ImapBridgeResponse<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('email-imap-bridge', { body });
    if (error) {
      const msg =
        (error as { message?: string }).message ||
        (error as { context?: { message?: string } }).context?.message ||
        'Falha ao acessar email-imap-bridge';
      return { data: null, error: msg };
    }
    const payload = (data ?? {}) as { error?: string } & T;
    if (typeof payload.error === 'string' && payload.error) {
      return { data: null, error: payload.error };
    }
    return { data: payload, error: null };
  } catch (err) {
    log.error('email-imap-bridge invoke error', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Erro ao acessar email-imap-bridge',
    };
  }
}

/** CRUD de contas IMAP/SMTP (EMAIL-02) — lista, salva (via edge, com
 * criptografia), testa, ativa/desativa e remove. */
export function useImapAccounts() {
  const queryClient = useQueryClient();

  const {
    data: accounts = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: IMAP_ACCOUNTS_KEY,
    queryFn: async () => {
      const { data, error } = await safeClient.from<ImapSmtpAccount>('imap_smtp_accounts', (q) =>
        q.select('*').order('created_at', { ascending: true })
      );
      if (error) {
        log.warn('imap_smtp_accounts load error', error);
        return [] as ImapSmtpAccount[];
      }
      return (data ?? []) as ImapSmtpAccount[];
    },
    staleTime: 30_000,
  });

  /** Busca a configuração pré-definida de um provedor. */
  const getProviderConfig = useCallback(
    async (provider: ImapProvider): Promise<ImapBridgeResponse<ImapProviderConfig>> => {
      const res = await invokeBridge<{ config?: ImapProviderConfig }>({
        action: 'getProviderConfig',
        provider,
      });
      return { data: res.data?.config ?? null, error: res.error };
    },
    []
  );

  /** Lista provedores suportados pela edge. */
  const listProviders = useCallback(async () => {
    return invokeBridge<{ providers: Array<{ id: string; name: string }> }>({
      action: 'listProviders',
    });
  }, []);

  /** Valida formato das credenciais (sem TCP — edge HTTP-only). */
  const testConnection = useCallback(
    async (
      config: ImapSmtpConfig
    ): Promise<ImapBridgeResponse<{ valid: boolean; issues?: string[]; message?: string }>> => {
      return invokeBridge({ action: 'testConnection', config });
    },
    []
  );

  /** Persiste a conta: edge criptografa a senha (AES-GCM) e faz upsert em
   * imap_smtp_accounts (onConflict user_id,email). */
  const saveAccount = useCallback(
    async (
      config: ImapSmtpConfig
    ): Promise<ImapBridgeResponse<{ accountId: string; email: string }>> => {
      const res = await invokeBridge<{ accountId: string; email: string }>({
        action: 'saveCredentials',
        config: {
          email: config.email,
          password: config.password,
          provider: config.provider,
          imap_host: config.imap_host,
          imap_port: config.imap_port,
          imap_use_ssl: config.imap_use_ssl,
          smtp_host: config.smtp_host,
          smtp_port: config.smtp_port,
          smtp_use_tls: config.smtp_use_tls,
          username: config.username || config.email,
          ...(config.display_name ? { display_name: config.display_name } : {}),
        },
      });
      if (!res.error) await queryClient.invalidateQueries({ queryKey: IMAP_ACCOUNTS_KEY });
      return res as ImapBridgeResponse<{ accountId: string; email: string }>;
    },
    [queryClient]
  );

  /** Ativa/desativa uma conta. */
  const setActive = useCallback(
    async (id: string, isActive: boolean) => {
      const { error } = await safeClient.from('imap_smtp_accounts', (q) =>
        q.update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', id)
      );
      if (error) {
        log.error('imap_smtp_accounts update error', error);
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: IMAP_ACCOUNTS_KEY });
      return true;
    },
    [queryClient]
  );

  /** Remove uma conta. */
  const removeAccount = useCallback(
    async (id: string) => {
      const { error } = await safeClient.from('imap_smtp_accounts', (q) => q.delete().eq('id', id));
      if (error) {
        log.error('imap_smtp_accounts delete error', error);
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: IMAP_ACCOUNTS_KEY });
      return true;
    },
    [queryClient]
  );

  return {
    accounts,
    isLoading,
    refetch,
    getProviderConfig,
    listProviders,
    testConnection,
    saveAccount,
    setActive,
    removeAccount,
  };
}
