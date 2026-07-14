import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';
import type { PrivacySettings } from '../evolutionApi.types';
import { withV237Fallback, fallbackFetchProfile } from './v237Fallbacks';

export function useEvolutionProfile(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  const fetchProfile = useCallback(
    (instanceName: string, remoteJid?: string) =>
      withV237Fallback(
        () =>
          callApi(
            'fetch-profile',
            { instanceName, ...(remoteJid ? { number: remoteJid } : {}) },
            'GET'
          ),
        () => fallbackFetchProfile(remoteJid ?? '', instanceName),
        'fetchProfile'
      ),
    [callApi]
  );

  const updateProfileName = useCallback(
    (instanceName: string, name: string) =>
      withToast(
        'update-profile-name',
        { instanceName, name },
        'Nome atualizado',
        'Erro ao atualizar nome'
      ),
    [withToast]
  );

  const updateProfileStatus = useCallback(
    (instanceName: string, status: string) =>
      withToast(
        'update-profile-status',
        { instanceName, status },
        'Status atualizado',
        'Erro ao atualizar status'
      ),
    [withToast]
  );

  const updateProfilePicture = useCallback(
    (instanceName: string, picture: string) =>
      withToast(
        'update-profile-picture',
        { instanceName, picture },
        'Foto atualizada',
        'Erro ao atualizar foto'
      ),
    [withToast]
  );

  const removeProfilePicture = useCallback(
    (instanceName: string) =>
      withToast(
        'remove-profile-picture',
        { instanceName },
        'Foto removida',
        'Erro ao remover foto',
        'DELETE'
      ),
    [withToast]
  );

  const fetchProfilePicture = useCallback(
    (instanceName: string, number: string) =>
      callApi('fetch-profile-picture', { instanceName, number }, 'GET'),
    [callApi]
  );

  const fetchBusinessProfile = useCallback(
    (instanceName: string, number: string) =>
      callApi('fetch-business-profile', { instanceName, number }),
    [callApi]
  );

  const updatePrivacySettings = useCallback(
    (settings: PrivacySettings) =>
      withToast(
        'update-privacy',
        settings,
        'Privacidade atualizada',
        'Erro ao atualizar privacidade'
      ),
    [withToast]
  );

  const findLabels = useCallback(
    (instanceName: string) => callApi('find-labels', { instanceName }, 'GET'),
    [callApi]
  );

  const handleLabel = useCallback(
    (instanceName: string, number: string, labelId: string, action: 'add' | 'remove') =>
      callApi('handle-label', { instanceName, number, labelId, action }),
    [callApi]
  );

  return {
    fetchProfile,
    updateProfileName,
    updateProfileStatus,
    updateProfilePicture,
    removeProfilePicture,
    fetchProfilePicture,
    fetchBusinessProfile,
    updatePrivacySettings,
    findLabels,
    handleLabel,
  };
}
