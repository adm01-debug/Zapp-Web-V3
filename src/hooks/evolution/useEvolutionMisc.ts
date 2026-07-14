import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';

export function useEvolutionMisc(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  // Templates
  const createTemplate = useCallback(
    (instanceName: string, templateData: object) =>
      withToast(
        'create-template',
        { instanceName, ...templateData },
        'Template criado',
        'Erro ao criar template'
      ),
    [withToast]
  );
  const findTemplates = useCallback(
    (instanceName: string) => callApi('find-templates', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteTemplate = useCallback(
    (instanceName: string, templateData: object) =>
      withToast(
        'delete-template',
        { instanceName, ...templateData },
        'Template excluído',
        'Erro ao excluir template',
        'DELETE'
      ),
    [withToast]
  );

  // Block/Unblock
  const updateBlockStatus = useCallback(
    (instanceName: string, number: string, status: 'block' | 'unblock') =>
      withToast(
        'update-block-status',
        { instanceName, number, status },
        status === 'block' ? 'Contato bloqueado' : 'Contato desbloqueado',
        'Erro ao atualizar bloqueio'
      ),
    [withToast]
  );

  // Offer Call
  const offerCall = useCallback(
    (instanceName: string, number: string, isVideo?: boolean, callDuration?: number) =>
      callApi('offer-call', { instanceName, number, isVideo, callDuration }),
    [callApi]
  );

  // Business Catalog
  const getBusinessCatalog = useCallback(
    (instanceName: string, number: string, limit?: number, cursor?: string) =>
      callApi('get-catalog', { instanceName, number, limit, cursor }),
    [callApi]
  );
  const getBusinessCollections = useCallback(
    (instanceName: string, number: string, limit?: number, cursor?: string) =>
      callApi('get-collections', { instanceName, number, limit, cursor }),
    [callApi]
  );

  // Proxy
  const setProxy = useCallback(
    (
      instanceName: string,
      config: {
        enabled?: boolean;
        host: string;
        port: number;
        protocol: string;
        username?: string;
        password?: string;
      }
    ) =>
      withToast(
        'set-proxy',
        { instanceName, ...config },
        'Proxy configurado',
        'Erro ao configurar proxy'
      ),
    [withToast]
  );
  const getProxy = useCallback(
    (instanceName: string) => callApi('get-proxy', { instanceName }, 'GET'),
    [callApi]
  );

  return {
    createTemplate,
    findTemplates,
    deleteTemplate,
    updateBlockStatus,
    offerCall,
    getBusinessCatalog,
    getBusinessCollections,
    setProxy,
    getProxy,
  };
}
