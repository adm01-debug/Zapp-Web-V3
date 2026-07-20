/**
 * Complete TypeScript types for the external CRM database (bancodadosclientes)
 * Auto-mapped from the 111+ tables available in pgxfvjmuubtbowutlide
 */

// ─── Core Entities ────────────────────────────────────────────

/** Ext Company interface. */
export interface ExtCompany {
  id: string;
  nome_crm: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  website: string | null;
  ramo_atividade: string | null;
  status: string | null;
  logo_url: string | null;
  cores_marca: string[] | null;
  nicho_cliente: string | null;
  porte_rf: string | null;
  natureza_juridica_desc: string | null;
  capital_social: number | null;
  data_fundacao: string | null;
  bitrix_company_id: number | null;
  grupo_economico_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Ext Contact interface definition. */
export interface ExtContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  nome_tratamento: string | null;
  apelido: string | null;
  cargo: string | null;
  departamento: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  relationship_stage: string | null;
  relationship_score: number;
  sentiment: string | null;
  tags: string[];
  notes: string | null;
  source: string | null;
  assinatura_contato: string | null;
  bitrix_contact_id: number | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Ext Customer interface definition. */
export interface ExtCustomer {
  id: string;
  company_id: string;
  ramo_atividade: string | null;
  grupo_clientes: string | null;
  tipo_cooperativa: string | null;
  perfil_preco: string | null;
  perfil_qualidade: string | null;
  perfil_prazo: string | null;
  poder_compra: string | null;
  cliente_ativado: boolean;
  ja_comprou: boolean;
  vendedor_id: number | null;
  vendedor_nome: string | null;
  sdr_id: number | null;
  sdr_nome: string | null;
  data_entrada_carteira: string | null;
  observacoes: string | null;
  sobre: string | null;
  data_primeira_compra: string | null;
  data_ultima_compra: string | null;
  total_pedidos: number;
  valor_total_compras: number;
  ticket_medio: number | null;
  data_ativacao: string | null;
  ativado_por: string | null;
  primeiro_ativador_id: number | null;
  primeiro_ativador_nome: string | null;
  data_primeira_ativacao: string | null;
  data_inativacao: string | null;
  inativado_por_id: number | null;
  inativado_por_nome: string | null;
  motivo_inativacao: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Ext Interaction interface definition. */
export interface ExtInteraction {
  id: string;
  contact_id: string | null;
  company_id: string | null;
  channel: string;
  direction: string;
  type: string | null;
  assunto: string | null;
  resumo: string | null;
  sentiment: string | null;
  data_interacao: string;
  created_at: string;
}

// ─── Contact Details ──────────────────────────────────────────

/** Ext Contact Phone interface definition. */
export interface ExtContactPhone {
  id: string;
  contact_id: string;
  phone_type: string;
  numero: string;
  numero_normalizado: string;
  numero_e164: string | null;
  is_primary: boolean;
  is_whatsapp: boolean;
  is_verified: boolean;
  observacao: string | null;
  fonte: string | null;
  contexto: string | null;
  confiabilidade: number | null;
  created_at: string;
  updated_at: string;
}

/** Ext Contact Email interface definition. */
export interface ExtContactEmail {
  id: string;
  contact_id: string;
  email_type: string;
  email: string;
  email_normalizado: string;
  is_primary: boolean;
  is_verified: boolean;
  fonte: string | null;
  contexto: string | null;
  confiabilidade: number;
  created_at: string;
  updated_at: string;
}

/** Ext Contact Social Media interface definition. */
export interface ExtContactSocialMedia {
  id: string;
  contact_id: string;
  plataforma: string;
  handle: string;
  url: string | null;
  nome_perfil: string | null;
  is_verified: boolean;
  is_active: boolean;
  observacoes: string | null;
  origem: string | null;
  fonte: string | null;
  contexto: string | null;
  confiabilidade: number | null;
  created_at: string;
  updated_at: string;
}

/** Ext Contact Address interface definition. */
export interface ExtContactAddress {
  id: string;
  contact_id: string;
  tipo: string;
  is_primary: boolean;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  google_place_id: string | null;
  origem: string | null;
  fonte: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Company Details ──────────────────────────────────────────

/** Ext Company Phone interface definition. */
export interface ExtCompanyPhone {
  id: string;
  company_id: string;
  phone_type: string;
  numero: string;
  numero_e164: string | null;
  is_primary: boolean;
  is_whatsapp: boolean;
  departamento: string | null;
  created_at: string;
}

/** Ext Company Email interface definition. */
export interface ExtCompanyEmail {
  id: string;
  company_id: string;
  email_type: string;
  email: string;
  is_primary: boolean;
  departamento: string | null;
  created_at: string;
}

/** Ext Company Social Media interface definition. */
export interface ExtCompanySocialMedia {
  id: string;
  company_id: string;
  plataforma: string;
  handle: string | null;
  url: string | null;
  nome_perfil: string | null;
  is_verified: boolean;
  is_active: boolean;
  seguidores: number | null;
  observacoes: string | null;
  origem: string | null;
  created_at: string;
  updated_at: string;
}

/** Ext Company Address interface definition. */
export interface ExtCompanyAddress {
  id: string;
  company_id: string;
  tipo: string;
  is_primary: boolean;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string;
  latitude: number | null;
  longitude: number | null;
  ponto_referencia: string | null;
  instrucoes_entrega: string | null;
  horario_funcionamento: string | null;
  google_maps_url: string | null;
  google_place_id: string | null;
  origem: string | null;
  created_at: string;
  updated_at: string;
}

/** Ext Company R F M Score interface definition. */
export interface ExtCompanyRFMScore {
  id: string;
  user_id: string;
  company_id: string;
  last_interaction_date: string | null;
  interaction_count: number;
  total_value: number;
  recency_score: number;
  frequency_score: number;
  monetary_score: number;
  combined_score: number;
  segment_id: string | null;
  segment_code: string | null;
  overall_trend: string | null;
  contacts_count: number;
  avg_contact_score: number | null;
  calculated_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Sales & Pipeline ─────────────────────────────────────────

/** Ext Salesperson interface definition. */
export interface ExtSalesperson {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  commission_rate: number;
  is_active: boolean;
  role: string;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Ext Sale interface definition. */
export interface ExtSale {
  id: string;
  client_name: string;
  product_name: string;
  amount: number;
  status: string;
  category: string;
  salesperson_id: string;
  source: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Ext Sales Activity interface definition. */
export interface ExtSalesActivity {
  id: string;
  sale_id: string;
  salesperson_id: string;
  activity_type: string;
  outcome: string;
  notes: string | null;
  duration_minutes: number;
  contact_name: string | null;
  deleted_at: string | null;
  created_at: string;
}

// ─── Suppliers & Carriers ─────────────────────────────────────

/** Ext Supplier interface definition. */
export interface ExtSupplier {
  id: string;
  company_id: string;
  categoria: string | null;
  tipo_fornecedor: string | null;
  ramo_atividade: string | null;
  grupo_economico: string | null;
  produtos: string | null;
  servicos: string | null;
  api_url: string | null;
  tem_integracao: boolean;
  perfil_preco: string | null;
  perfil_qualidade: string | null;
  perfil_prazo: string | null;
  prazo_entrega_medio: string | null;
  pedido_minimo: number | null;
  forma_pagamento: string | null;
  prazo_pagamento: string | null;
  homologado: boolean;
  data_homologacao: string | null;
  score_geral: number | null;
  created_at: string;
  updated_at: string;
}

/** Ext Carrier interface definition. */
export interface ExtCarrier {
  id: string;
  company_id: string;
  tipo_transporte: string | null;
  grupo_economico: string | null;
  estados_atendidos: string[] | null;
  cidades_atendidas: string[] | null;
  tipo_frete: string | null;
  transportadora_validada: boolean;
  data_validacao: string | null;
  ultimo_transporte: string | null;
  observacoes: string | null;
  homologado: boolean;
  data_homologacao: string | null;
  score_geral: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Gamification ─────────────────────────────────────────────

/** Ext Achievement interface definition. */
export interface ExtAchievement {
  id: string;
  salesperson_id: string;
  achievement_type: string;
  achievement_date: string;
  details: Record<string, unknown>;
  created_at: string;
}

/** Ext Daily Challenge interface definition. */
export interface ExtDailyChallenge {
  id: string;
  title: string;
  description: string;
  challenge_type: string;
  target_value: number;
  xp_reward: number;
  challenge_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Ext Weekly Challenge interface definition. */
export interface ExtWeeklyChallenge {
  id: string;
  title: string;
  description: string;
  challenge_type: string;
  target_value: number;
  xp_reward: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Generic query types ──────────────────────────────────────

/** External D B Filter interface definition. */
export interface ExternalDBFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';
  value: unknown;
}

/** External D B Order interface definition. */
export interface ExternalDBOrder {
  column: string;
  ascending?: boolean;
}

/** External D B Query Params interface definition. */
export interface ExternalDBQueryParams {
  table: string;
  select?: string;
  filters?: ExternalDBFilter[];
  order?: ExternalDBOrder;
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
}

/** External D B Query Result interface definition. */
export interface ExternalDBQueryResult<T = unknown> {
  data: T[];
  meta: {
    record_count: number | null;
    duration_ms: number;
    severity: string;
  };
}

/** External D B R P C Params interface definition. */
export interface ExternalDBRPCParams {
  rpc: string;
  params?: Record<string, unknown>;
}

// ─── Table registry (for UI rendering) ────────────────────────

/** External Table Name type alias. */
export type ExternalTableName =
  | 'companies'
  | 'contacts'
  | 'customers'
  | 'contact_phones'
  | 'contact_emails'
  | 'contact_social_media'
  | 'contact_addresses'
  | 'company_social_media'
  | 'company_addresses'
  | 'company_rfm_scores'
  | 'company_phones'
  | 'company_emails'
  | 'salespeople'
  | 'sales'
  | 'sales_activities'
  | 'suppliers'
  | 'carriers'
  | 'achievements'
  | 'daily_challenges'
  | 'weekly_challenges'
  | 'interactions'
  | 'orders'
  | 'order_items'
  | 'products'
  | 'leads'
  | 'pipelines'
  | 'pipeline_stages'
  | 'deals'
  | 'deal_products'
  | 'quotations'
  | 'quotation_items'
  | 'tasks'
  | 'notes'
  | 'tags'
  | 'company_tags'
  | 'contact_tags_ext'
  | 'payment_conditions'
  | 'price_tables'
  | 'regions'
  | 'segments';

/** E X T E R N A L_ T A B L E_ L A B E L S constant. */
export const EXTERNAL_TABLE_LABELS: Record<ExternalTableName, string> = {
  companies: 'Empresas',
  contacts: 'Contatos',
  customers: 'Clientes',
  contact_phones: 'Telefones (Contatos)',
  contact_emails: 'E-mails (Contatos)',
  contact_social_media: 'Redes Sociais (Contatos)',
  contact_addresses: 'Endereços (Contatos)',
  company_social_media: 'Redes Sociais (Empresas)',
  company_addresses: 'Endereços (Empresas)',
  company_rfm_scores: 'Scores RFM',
  company_phones: 'Telefones (Empresas)',
  company_emails: 'E-mails (Empresas)',
  salespeople: 'Vendedores',
  sales: 'Vendas',
  sales_activities: 'Atividades de Venda',
  suppliers: 'Fornecedores',
  carriers: 'Transportadoras',
  achievements: 'Conquistas',
  daily_challenges: 'Desafios Diários',
  weekly_challenges: 'Desafios Semanais',
  interactions: 'Interações',
  orders: 'Pedidos',
  order_items: 'Itens de Pedido',
  products: 'Produtos',
  leads: 'Leads',
  pipelines: 'Pipelines',
  pipeline_stages: 'Etapas do Pipeline',
  deals: 'Negócios',
  deal_products: 'Produtos do Negócio',
  quotations: 'Orçamentos',
  quotation_items: 'Itens de Orçamento',
  tasks: 'Tarefas',
  notes: 'Notas',
  tags: 'Tags',
  company_tags: 'Tags (Empresas)',
  contact_tags_ext: 'Tags (Contatos)',
  payment_conditions: 'Condições de Pagamento',
  price_tables: 'Tabelas de Preço',
  regions: 'Regiões',
  segments: 'Segmentos',
};
