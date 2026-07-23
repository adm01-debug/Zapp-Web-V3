
import { 
  EmailAccount, 
  EmailTokenInfo, 
  EmailThread, 
  EmailDayMetric,
  SLAStatus
} from '@/types/gmail';
import { EmailMessage } from './gmailTypes';

const MOCK_ACCOUNT_ID = 'mock-account-123';
const MOCK_USER_ID = 'user-mock-456';

/** Hook: GMAIL_MOCKS. */
export const GMAIL_MOCKS = {
  accounts: [
    {
      id: MOCK_ACCOUNT_ID,
      user_id: MOCK_USER_ID,
      email: 'comercial@empresa.com.br',
      display_name: 'Comercial - Suporte',
      is_active: true,
      token_expiry: new Date(Date.now() + 3600000).toISOString(),
      watch_expiry: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString()
    }
  ] as EmailAccount[],

  tokenStatus: [
    {
      account_id: MOCK_ACCOUNT_ID,
      email: 'comercial@empresa.com.br',
      is_active: true,
      token_status: 'valid',
      token_expiry: new Date(Date.now() + 3600000).toISOString(),
      watch_status: 'active',
      watch_expiry: new Date(Date.now() + 86400000).toISOString(),
      minutes_until_expiry: 60
    }
  ] as EmailTokenInfo[],

  threads: [
    {
      id: 'thread-1',
      account_id: MOCK_ACCOUNT_ID,
      email_thread_id: '18f2a3b4c5d6e7f1',
      subject: 'Orçamento de Software - Projeto Lovable',
      snippet: 'Olá, gostaria de solicitar um orçamento para o desenvolvimento de um dashboard customizado...',
      from_email: 'cliente@exemplo.com',
      from_name: 'João Silva',
      label_ids: ['INBOX', 'UNREAD'],
      unread_count: 1,
      message_count: 3,
      is_starred: true,
      is_important: true,
      sla_status: 'warning' as SLAStatus,
      assigned_to: null,
      last_message_at: new Date(Date.now() - 1800000).toISOString(), // 30 min atrás
      created_at: new Date(Date.now() - 86400000).toISOString(),
      tags: ['Prioridade Alta', 'Vendas']
    },
    {
      id: 'thread-2',
      account_id: MOCK_ACCOUNT_ID,
      email_thread_id: '18f2a3b4c5d6e7f2',
      subject: 'Dúvida sobre integração Supabase',
      snippet: 'Estou com dificuldade em configurar o RLS para a tabela de logs de auditoria...',
      from_email: 'tech@startup.io',
      from_name: 'Maria Dev',
      label_ids: ['INBOX'],
      unread_count: 0,
      message_count: 5,
      is_starred: false,
      is_important: false,
      sla_status: 'ok' as SLAStatus,
      assigned_to: 'agente-007',
      last_message_at: new Date(Date.now() - 3600000).toISOString(), // 1h atrás
      created_at: new Date(Date.now() - 172800000).toISOString(),
      tags: ['Suporte Técnico']
    },
    {
      id: 'thread-3',
      account_id: MOCK_ACCOUNT_ID,
      email_thread_id: '18f2a3b4c5d6e7f3',
      subject: 'URGENTE: Erro no Outbound',
      snippet: 'Nossas mensagens automáticas pararam de funcionar às 09:00 hoje...',
      from_email: 'cto@grande-corporacao.com',
      from_name: 'Carlos CTO',
      label_ids: ['INBOX', 'UNREAD', 'IMPORTANT'],
      unread_count: 2,
      message_count: 2,
      is_starred: false,
      is_important: true,
      sla_status: 'breached' as SLAStatus,
      assigned_to: null,
      last_message_at: new Date(Date.now() - 14400000).toISOString(), // 4h atrás
      created_at: new Date(Date.now() - 14400000).toISOString(),
      tags: ['Crítico', 'Infra']
    }
  ] as EmailThread[],

  messages: [
    {
      id: 'msg-1',
      thread_id: 'thread-1',
      email_msg_id: 'msg_abc_123',
      from_email: 'cliente@exemplo.com',
      from_name: 'João Silva',
      to_emails: ['comercial@empresa.com.br'],
      subject: 'Orçamento de Software - Projeto Lovable',
      snippet: 'Olá, gostaria de solicitar um orçamento...',
      body_html: '<p>Olá,</p><p>Gostaria de solicitar um orçamento para o desenvolvimento de um dashboard customizado com integração Supabase.</p><p>Atenciosamente,<br>João Silva</p>',
      body_text: 'Olá, Gostaria de solicitar um orçamento...',
      is_read: false,
      date: new Date(Date.now() - 1800000).toISOString(),
      has_attachments: false,
      created_at: new Date(Date.now() - 1800000).toISOString()
    }
  ] as EmailMessage[],

  metrics: [
    {
      date: new Date().toISOString().split('T')[0],
      threads_received: 45,
      threads_replied: 38,
      avg_first_reply_minutes: 12.5,
      sla_met_count: 40,
      sla_breached_count: 5
    }
  ] as EmailDayMetric[]
};
