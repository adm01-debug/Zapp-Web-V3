/**
 * Catálogo estático de tabelas e RPCs disponíveis no FATOR X
 * (project: tdprnylgyrogbbhgdoik). Mantenha em sincronia com
 * o `<project-knowledge>` quando novas RPCs forem criadas.
 */
export interface CatalogTable {
  name: string;
  category: 'Operacional' | 'Pipeline' | 'Automação' | 'Webhook' | 'Config' | 'Integrações';
  description: string;
}

export interface CatalogRpc {
  name: string;
  kind: 'select' | 'mutation' | 'analytics';
  description: string;
  /** Exemplo de params para preencher o editor JSON. */
  exampleParams: Record<string, unknown>;
}

export const TABLES: readonly CatalogTable[] = [
  // Operacional
  {
    name: 'evolution_messages',
    category: 'Operacional',
    description: 'Todas as mensagens recebidas/enviadas',
  },
  {
    name: 'evolution_contacts',
    category: 'Operacional',
    description: 'Contatos com lead_status e tags',
  },
  {
    name: 'evolution_conversations',
    category: 'Operacional',
    description: 'Tickets/conversas com SLA e CSAT',
  },
  { name: 'evolution_calls', category: 'Operacional', description: 'Chamadas VoIP/áudio' },
  { name: 'evolution_groups', category: 'Operacional', description: 'Grupos do WhatsApp' },
  { name: 'evolution_tags', category: 'Operacional', description: 'Catálogo de etiquetas' },
  { name: 'evolution_media', category: 'Operacional', description: 'Galeria de mídias' },

  // Pipeline & Vendas
  { name: 'evolution_deals', category: 'Pipeline', description: 'Negócios no funil' },
  { name: 'evolution_sales_pipeline', category: 'Pipeline', description: 'Definição de funis' },
  {
    name: 'evolution_pipeline_history',
    category: 'Pipeline',
    description: 'Histórico de mudanças de stage',
  },
  { name: 'evolution_stage_mapping', category: 'Pipeline', description: 'Stages ativos do Kanban' },
  { name: 'evolution_tasks', category: 'Pipeline', description: 'Tarefas atribuídas a agentes' },

  // Automação & IA
  { name: 'evolution_automations', category: 'Automação', description: 'Regras de automação' },
  { name: 'evolution_followup_rules', category: 'Automação', description: 'Regras de follow-up' },
  { name: 'evolution_followups', category: 'Automação', description: 'Follow-ups pendentes' },
  { name: 'evolution_quick_replies', category: 'Automação', description: 'Respostas rápidas' },
  { name: 'evolution_message_templates', category: 'Automação', description: 'Templates HSM' },
  {
    name: 'evolution_chatbot_responses',
    category: 'Automação',
    description: 'Respostas do chatbot',
  },
  {
    name: 'evolution_sentiment_analysis',
    category: 'Automação',
    description: 'Análise de sentimento',
  },
  { name: 'evolution_typebot_sessions', category: 'Automação', description: 'Sessões do Typebot' },

  // Webhook & Observabilidade
  {
    name: 'evolution_webhook_events',
    category: 'Webhook',
    description: 'Eventos brutos recebidos da Evolution API',
  },
  {
    name: 'evolution_webhook_metrics',
    category: 'Webhook',
    description: 'Métricas agregadas do webhook',
  },
  { name: 'evolution_webhook_dlq', category: 'Webhook', description: 'Dead-letter queue' },
  { name: 'evolution_daily_metrics', category: 'Webhook', description: 'Snapshots diários' },
  {
    name: 'evolution_realtime_events',
    category: 'Webhook',
    description: 'Buffer de eventos realtime',
  },
  { name: 'evolution_audit_log', category: 'Webhook', description: 'Trilha de auditoria' },

  // Integrações
  { name: 'evolution_bitrix_queue', category: 'Integrações', description: 'Fila Bitrix24' },
  { name: 'evolution_bitrix_sync', category: 'Integrações', description: 'Sync Bitrix24' },
  {
    name: 'evolution_bitrix_field_mapping',
    category: 'Integrações',
    description: 'Mapeamento de campos Bitrix',
  },

  // Config
  { name: 'evolution_settings', category: 'Config', description: 'Configurações chave/valor' },
  {
    name: 'evolution_notification_config',
    category: 'Config',
    description: 'Config de notificações',
  },
] as const;

export const RPCS: readonly CatalogRpc[] = [
  // SELECT
  {
    name: 'rpc_list_contacts',
    kind: 'select',
    description: 'Lista contatos com filtros',
    exampleParams: {
      p_instance: 'wpp_pink_test',
      p_lead_status: null,
      p_assigned_to: null,
      p_search: null,
      p_limit: 20,
      p_offset: 0,
    },
  },
  {
    name: 'rpc_get_contact',
    kind: 'select',
    description: 'Detalhe de um contato',
    exampleParams: { p_remote_jid: '551147808139@s.whatsapp.net', p_instance: 'wpp_pink_test' },
  },
  {
    name: 'rpc_list_messages',
    kind: 'select',
    description: 'Mensagens de uma conversa',
    exampleParams: {
      p_remote_jid: '551147808139@s.whatsapp.net',
      p_instance: 'wpp_pink_test',
      p_limit: 20,
      p_before_date: null,
    },
  },
  {
    name: 'rpc_list_messages_lite',
    kind: 'select',
    description: 'Mensagens (sem payload/raw_data)',
    exampleParams: {
      p_remote_jid: '551147808139@s.whatsapp.net',
      p_instance: 'wpp_pink_test',
      p_limit: 20,
      p_before_date: null,
    },
  },
  {
    name: 'rpc_list_conversations',
    kind: 'select',
    description: 'Lista conversas/tickets',
    exampleParams: {
      p_instance: 'wpp_pink_test',
      p_status: null,
      p_assigned_to: null,
      p_limit: 20,
    },
  },
  {
    name: 'rpc_list_calls',
    kind: 'select',
    description: 'Chamadas de um contato',
    exampleParams: {
      p_remote_jid: '551147808139@s.whatsapp.net',
      p_instance: 'wpp_pink_test',
      p_limit: 20,
    },
  },
  {
    name: 'rpc_list_tasks',
    kind: 'select',
    description: 'Tarefas com filtros',
    exampleParams: {
      p_assigned_to: null,
      p_status: null,
      p_contact_id: null,
      p_deal_id: null,
      p_due_from: null,
      p_due_to: null,
      p_limit: 20,
      p_offset: 0,
    },
  },
  {
    name: 'rpc_list_deals',
    kind: 'select',
    description: 'Deals com filtros',
    exampleParams: {
      p_stage: null,
      p_assigned_to: null,
      p_contact_id: null,
      p_instance: 'wpp_pink_test',
      p_limit: 20,
      p_offset: 0,
    },
  },
  {
    name: 'rpc_list_media',
    kind: 'select',
    description: 'Mídias por contato/tipo',
    exampleParams: { p_remote_jid: null, p_media_type: null, p_limit: 20, p_offset: 0 },
  },
  {
    name: 'rpc_list_audit_log',
    kind: 'select',
    description: 'Trilha de auditoria',
    exampleParams: {
      p_entity_type: null,
      p_entity_id: null,
      p_action: null,
      p_performed_by: null,
      p_limit: 20,
      p_offset: 0,
    },
  },

  // ANALYTICS
  {
    name: 'rpc_dashboard_home',
    kind: 'analytics',
    description: '8 KPIs em uma chamada',
    exampleParams: { p_instance: 'wpp_pink_test', p_assigned_to: null },
  },
  {
    name: 'rpc_message_stats',
    kind: 'analytics',
    description: 'Stats agregadas por dia',
    exampleParams: { p_instance: 'wpp_pink_test', p_days_back: 7, p_assigned_to: null },
  },
  {
    name: 'rpc_global_search',
    kind: 'analytics',
    description: 'Busca unificada (contacts+messages+deals)',
    exampleParams: { p_query: 'teste', p_instance: 'wpp_pink_test', p_limit: 20 },
  },
] as const;

export const TABLE_CATEGORIES = [
  'Operacional',
  'Pipeline',
  'Automação',
  'Webhook',
  'Config',
  'Integrações',
] as const;
