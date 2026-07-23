import type {
  ConnectionInfo,
  WebhookTestResult,
  WebhookConfig,
} from './hooks/useEvolutionMonitoring';

/** Secret Status component for the monitoring section. */
export interface SecretStatus {
  configured: boolean;
  length: number;
  hashPrefix: string | null;
  strictMode: boolean;
  checkedAt: string;
}

/** Monitoring Webhook Panel Props component for the monitoring section. */
export interface MonitoringWebhookPanelProps {
  connections: ConnectionInfo[];
  webhookTest: WebhookTestResult;
  webhookConfig: WebhookConfig | null;
  reconfiguring: boolean;
  onTest: (instanceId: string) => void;
  onReconfigure: (instanceId: string) => void;
  onCheckConfig: (instanceId: string) => void;
}

/** ALL_EXPECTED_EVENTS component for the monitoring section. */
export const ALL_EXPECTED_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'MESSAGES_SET',
  'SEND_MESSAGE',
  'CONTACTS_UPSERT',
  'CONTACTS_UPDATE',
  'CONTACTS_SET',
  'PRESENCE_UPDATE',
  'CHATS_UPSERT',
  'CHATS_UPDATE',
  'CHATS_DELETE',
  'CHATS_SET',
  'CONNECTION_UPDATE',
  'LABELS_EDIT',
  'LABELS_ASSOCIATION',
  'GROUPS_UPSERT',
  'GROUP_PARTICIPANTS_UPDATE',
  'CALL',
  'QRCODE_UPDATED',
];

/** EVENT_CATEGORIES component for the monitoring section. */
export const EVENT_CATEGORIES: Record<string, string[]> = {
  Mensagens: [
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'MESSAGES_DELETE',
    'MESSAGES_SET',
    'SEND_MESSAGE',
  ],
  Conexão: ['CONNECTION_UPDATE', 'QRCODE_UPDATED'],
  Contatos: ['CONTACTS_UPSERT', 'CONTACTS_UPDATE', 'CONTACTS_SET'],
  Chats: ['CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE', 'CHATS_SET'],
  Grupos: ['GROUPS_UPSERT', 'GROUP_PARTICIPANTS_UPDATE'],
  Outros: ['PRESENCE_UPDATE', 'LABELS_EDIT', 'LABELS_ASSOCIATION', 'CALL'],
};
