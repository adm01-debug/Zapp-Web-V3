// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useTalkXManagement } from '@/hooks/useIntegrationManagement';

export function useTalkX() {
  return useTalkXManagement();
}

/**
 * TalkXCampaign — tipo estrutural para campanhas do Talk X.
 * Mantido aqui como fonte canônica pois a tabela `talkx_campaigns`
 * ainda não possui tipos gerados no schema `zapp`.
 */
export interface TalkXCampaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed' | string;
  message_template: string | null;
  media_type: string | null;
  media_url: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at?: string | null;
  sent_count: number;
  failed_count: number;
  total_recipients: number;
  send_interval_min: number;
  send_interval_max: number;
  typing_delay_min: number;
  typing_delay_max: number;
  whatsapp_connection_id: string | null;
  created_by?: string | null;
  workspace_id?: string | null;
  [key: string]: unknown;
}

/**
 * TalkXRecipient — destinatário de uma campanha Talk X.
 */
export interface TalkXRecipient {
  id: string;
  campaign_id: string;
  phone: string;
  name: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  variables?: Record<string, unknown> | null;
  personalized_message?: string | null;
  contacts?: {
    name?: string | null;
    nickname?: string | null;
    avatar_url?: string | null;
  } | null;
  [key: string]: unknown;
}
