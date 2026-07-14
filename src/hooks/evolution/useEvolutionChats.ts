import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';
import { withV237Fallback, fallbackFindChats, fallbackFindContacts } from './v237Fallbacks';

export function useEvolutionChats(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>
) {
  const findChats = useCallback(
    (instanceName: string, page?: number, offset?: number) =>
      withV237Fallback(
        () => callApi('find-chats', { instanceName, page, offset }, 'GET'),
        () => fallbackFindChats(instanceName, offset ?? 200),
        'findChats'
      ),
    [callApi]
  );

  const findMessages = useCallback(
    (
      instanceName: string,
      remoteJid: string,
      page?: number,
      offset?: number,
      timestampStart?: number,
      timestampEnd?: number
    ) =>
      callApi(
        'find-messages',
        { instanceName, remoteJid, page, offset, timestampStart, timestampEnd },
        'GET'
      ),
    [callApi]
  );

  const findStatusMessages = useCallback(
    (instanceName: string) => callApi('find-status-messages', { instanceName }, 'GET'),
    [callApi]
  );

  const findContacts = useCallback(
    (instanceName: string, page?: number, offset?: number) =>
      withV237Fallback(
        () => callApi('find-contacts', { instanceName, page, offset }, 'GET'),
        () => fallbackFindContacts(instanceName, offset ?? 500),
        'findContacts'
      ),
    [callApi]
  );

  const checkWhatsAppNumbers = useCallback(
    (instanceName: string, numbers: string[]) =>
      callApi('check-numbers', { instanceName, numbers }),
    [callApi]
  );

  const getMediaBase64 = useCallback(
    (instanceName: string, message: object, convertToMp4?: boolean) =>
      callApi('get-media-base64', { instanceName, message, convertToMp4 }),
    [callApi]
  );

  return {
    findChats,
    findMessages,
    findStatusMessages,
    findContacts,
    checkWhatsAppNumbers,
    getMediaBase64,
  };
}
