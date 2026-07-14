import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';

export function useEvolutionStreaming(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>
) {
  // RabbitMQ
  const setRabbitMQ = useCallback(
    (instanceName: string, enabled: boolean, events?: string[]) =>
      callApi('set-rabbitmq', { instanceName, enabled, events }),
    [callApi]
  );
  const getRabbitMQ = useCallback(
    (instanceName: string) => callApi('get-rabbitmq', { instanceName }, 'GET'),
    [callApi]
  );

  // SQS
  const setSQS = useCallback(
    (instanceName: string, enabled: boolean, events?: string[]) =>
      callApi('set-sqs', { instanceName, enabled, events }),
    [callApi]
  );
  const getSQS = useCallback(
    (instanceName: string) => callApi('get-sqs', { instanceName }, 'GET'),
    [callApi]
  );

  // Kafka
  const setKafka = useCallback(
    (instanceName: string, enabled: boolean, events?: string[]) =>
      callApi('set-kafka', { instanceName, enabled, events }),
    [callApi]
  );
  const getKafka = useCallback(
    (instanceName: string) => callApi('get-kafka', { instanceName }, 'GET'),
    [callApi]
  );

  // Nats
  const setNats = useCallback(
    (instanceName: string, enabled: boolean, events?: string[]) =>
      callApi('set-nats', { instanceName, enabled, events }),
    [callApi]
  );
  const getNats = useCallback(
    (instanceName: string) => callApi('get-nats', { instanceName }, 'GET'),
    [callApi]
  );

  // Pusher
  const setPusher = useCallback(
    (
      instanceName: string,
      config: {
        enabled?: boolean;
        appId: string;
        key: string;
        secret: string;
        cluster: string;
        events?: string[];
      }
    ) => callApi('set-pusher', { instanceName, ...config }),
    [callApi]
  );
  const getPusher = useCallback(
    (instanceName: string) => callApi('get-pusher', { instanceName }, 'GET'),
    [callApi]
  );

  return {
    setRabbitMQ,
    getRabbitMQ,
    setSQS,
    getSQS,
    setKafka,
    getKafka,
    setNats,
    getNats,
    setPusher,
    getPusher,
  };
}
