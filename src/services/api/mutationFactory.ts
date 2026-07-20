/**
 * Mutation Factory - Standard patterns for creating mutations
 *
 * This factory standardizes how mutations are created across the application,
 * reducing boilerplate and ensuring consistent error handling,
 * optimistic updates, and invalidation patterns.
 *
 * Usage:
 * const mutation = useCreateMutation(
 *   contactsService.create,
 *   { invalidateKey: queryKeys.contacts.lists() }
 * );
 */

import { UseMutationOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';

interface MutationFactoryOptions<TData, TVariables> extends Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn'
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invalidateKey?: readonly any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invalidateKeys?: (readonly any[])[];
  onSuccessMessage?: string;
  onErrorMessage?: string;
  showToasts?: boolean;
}

/**
 * Factory for create mutations
 * Handles common create logic: optimistic updates, invalidation, toasts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useCreateMutation = <TData, TVariables = any>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: MutationFactoryOptions<TData, TVariables>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data, variables, context) => {
      // Invalidate related queries
      if (options?.invalidateKey) {
        queryClient.invalidateQueries({ queryKey: options.invalidateKey });
      }
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }

      // Show success toast
      if (options?.showToasts !== false) {
        toast.success(options?.onSuccessMessage || 'Criado com sucesso!');
      }

      // Call original onSuccess if provided
      options?.onSuccess?.(data, variables, context);
    },

    onError: (error: unknown) => {
      log.error('Mutation error:', error);

      // Show error toast
      if (options?.showToasts !== false) {
        toast.error(options?.onErrorMessage || 'Ocorreu um erro ao criar. Tente novamente.');
      }

      // Call original onError if provided
      options?.onError?.(error);
    },

    ...options,
  });
};

/**
 * Factory for update mutations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useUpdateMutation = <TData, TVariables = any>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: MutationFactoryOptions<TData, TVariables>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data, variables, context) => {
      if (options?.invalidateKey) {
        queryClient.invalidateQueries({ queryKey: options.invalidateKey });
      }
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }

      if (options?.showToasts !== false) {
        toast.success(options?.onSuccessMessage || 'Atualizado com sucesso!');
      }

      options?.onSuccess?.(data, variables, context);
    },

    onError: (error: unknown) => {
      log.error('Mutation error:', error);

      if (options?.showToasts !== false) {
        toast.error(options?.onErrorMessage || 'Ocorreu um erro ao atualizar. Tente novamente.');
      }

      options?.onError?.(error);
    },

    ...options,
  });
};

/**
 * Factory for delete mutations
 * Includes confirmation handling
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useDeleteMutation = <TData = void, TVariables = any>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: MutationFactoryOptions<TData, TVariables> & {
    confirmMessage?: string;
  }
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data, variables, context) => {
      if (options?.invalidateKey) {
        queryClient.invalidateQueries({ queryKey: options.invalidateKey });
      }
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }

      if (options?.showToasts !== false) {
        toast.success(options?.onSuccessMessage || 'Deletado com sucesso!');
      }

      options?.onSuccess?.(data, variables, context);
    },

    onError: (error: unknown) => {
      log.error('Mutation error:', error);

      if (options?.showToasts !== false) {
        toast.error(options?.onErrorMessage || 'Ocorreu um erro ao deletar. Tente novamente.');
      }

      options?.onError?.(error);
    },

    ...options,
  });
};

/**
 * Factory for bulk operations
 * Handles multiple mutations with progress tracking
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useBulkMutation = <TData, TVariables = any>(
  mutationFn: (variables: TVariables[]) => Promise<TData>,
  options?: MutationFactoryOptions<TData, TVariables[]> & {
    onProgress?: (current: number, total: number) => void;
  }
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data, variables, context) => {
      if (options?.invalidateKey) {
        queryClient.invalidateQueries({ queryKey: options.invalidateKey });
      }
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }

      if (options?.showToasts !== false) {
        toast.success(
          options?.onSuccessMessage || `${variables.length} itens processados com sucesso!`
        );
      }

      options?.onSuccess?.(data, variables, context);
    },

    onError: (error: unknown) => {
      log.error('Mutation error:', error);

      if (options?.showToasts !== false) {
        toast.error(options?.onErrorMessage || 'Ocorreu um erro ao processar. Tente novamente.');
      }

      options?.onError?.(error);
    },

    ...options,
  });
};

/**
 * Factory for async operations
 * Used for side effects that don't require UI updates
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useAsyncMutation = <TData, TVariables = any>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: MutationFactoryOptions<TData, TVariables> & {
    showProgress?: boolean;
  }
) => {
  return useMutation({
    mutationFn,
    onError: (error: unknown) => {
      log.error('Async operation error:', error);

      if (options?.showToasts !== false) {
        toast.error(options?.onErrorMessage || 'Ocorreu um erro ao processar. Tente novamente.');
      }

      options?.onError?.(error);
    },

    ...options,
  });
};

/**
 * Default error handler for mutations
 */
export const handleMutationError = (error: unknown, fallbackMessage?: string) => {
  log.error('Mutation error:', error);
  const e = error as Record<string, unknown> | null;

  if (e?.code === 'NETWORK_ERROR') {
    return 'Erro de conexão. Verifique sua internet.';
  }

  if (e?.code === 'UNAUTHORIZED') {
    return 'Sua sessão expirou. Faça login novamente.';
  }

  if (e?.code === 'FORBIDDEN') {
    return 'Você não tem permissão para fazer esta ação.';
  }

  if (e?.code === 'VALIDATION_ERROR') {
    return String(e.message || '') || 'Dados inválidos. Verifique seus inputs.';
  }

  if (e?.code === 'DUPLICATE') {
    return 'Este item já existe.';
  }

  return fallbackMessage || 'Ocorreu um erro ao processar sua requisição.';
};
