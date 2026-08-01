import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  invokeMigrateHelper,
  type MigrateAction,
  type MigrateHelperResult,
} from '@/services/migration/migrateHelperClient';

/** Estado do painel de migração. */
export interface MigrationRunnerState {
  /** Ação em execução no momento, ou `null` quando ocioso. */
  runningAction: MigrateAction | null;
  /** Último resultado obtido. */
  lastResult: MigrateHelperResult | null;
  /** Histórico das execuções da sessão (mais recente primeiro, máx. 20). */
  history: MigrateHelperResult[];
}

const HISTORY_LIMIT = 20;

/** Hook que aciona a migrate-helper e mantém histórico/estado da migração. */
export function useMigrationRunner() {
  const [state, setState] = useState<MigrationRunnerState>({
    runningAction: null,
    lastResult: null,
    history: [],
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (action: MigrateAction, accessKey: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, runningAction: action }));
    try {
      const result = await invokeMigrateHelper(action, accessKey, controller.signal);
      setState((prev) => ({
        runningAction: null,
        lastResult: result,
        history: [result, ...prev.history].slice(0, HISTORY_LIMIT),
      }));
      if (result.ok) toast.success(`Ação "${action}" concluída em ${result.durationMs} ms`);
      else toast.error(result.error ?? `Falha na ação "${action}"`);
      return result;
    } catch (err) {
      logger.error('[useMigrationRunner] falha inesperada', err);
      setState((prev) => ({ ...prev, runningAction: null }));
      toast.error('Erro inesperado ao acionar a migração.');
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, runningAction: null }));
  }, []);

  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, history: [], lastResult: null }));
  }, []);

  return { ...state, run, cancel, clearHistory };
}
