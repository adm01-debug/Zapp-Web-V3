import { supabase } from '@/integrations/supabase/client';
import { dbFrom } from '@/integrations/datasource/db';

export interface WhatsAppStatusMessage {
  id: string;
  fromMe: boolean;
  remoteJid: string;
  remoteJidAlt?: string | null;
  participant?: string | null;
  status?: string;
  messageId?: string;
  keyId?: string;
  messageType?: string;
  source?: string;
  key?: {
    remoteJid: string;
    remoteJidAlt?: string | null;
    participant?: string | null;
    fromMe: boolean;
    id: string;
  };
  message?: {
    imageMessage?: {
      url?: string;
      caption?: string;
      mimetype?: string;
    };
    videoMessage?: {
      url?: string;
      caption?: string;
      mimetype?: string;
    };
    extendedTextMessage?: {
      text?: string;
      backgroundColor?: number;
    };
    conversation?: string;
  };
  messageTimestamp?: number | string;
  pushName?: string;
}

export interface WhatsAppPresenceInfo {
  isOnline: boolean;
  lastSeen?: string | null;
  loading: boolean;
}

export interface ContactConnectionInfo {
  contactName: string | null;
  instanceName: string | null;
}

export const whatsappStatusRepository = {
  async getContact(phone: string) {
    return dbFrom('contacts')
      .select('name, whatsapp_connection_id')
      .eq('phone', phone)
      .maybeSingle();
  },

  async getConnectedWhatsAppConnection() {
    return supabase
      .from('whatsapp_connections')
      .select('id')
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle();
  },

  async getWhatsAppConnection(id: string) {
    return supabase
      .from('whatsapp_connections')
      .select('instance_id, instance_name')
      .eq('id', id)
      .maybeSingle();
  },

  async findStatusMessages(instanceName: string, page = 1, offset = 200) {
    return supabase.functions.invoke('evolution-api/find-status-messages', {
      method: 'POST',
      body: { instanceName, page, offset },
    });
  },

  async sendChatPresence(instanceName: string, phone: string) {
    return supabase.functions.invoke('evolution-api/send-chat-presence', {
      method: 'POST',
      body: { instanceName, number: phone, presence: 'paused', delay: 0 },
    });
  },
};
