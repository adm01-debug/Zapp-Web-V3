/**
 * RPC Catalog — fonte única e tipada das RPCs do FATOR X.
 *
 * Toda leitura/escrita do domínio WhatsApp/CRM (`evolution_*`) deve passar
 * por uma RPC SECURITY DEFINER no self-hosted. Este catálogo amarra cada RPC
 * ao shape de `params` e ao shape da `row` retornada.
 *
 * MULTI-INSTÂNCIA (fix 2026-07-03):
 *  - `p_instance = undefined/null` → retorna TODAS as instâncias (DB suporta)
 *  - `p_instance = 'wpp_pink_test'` → filtra instância específica
 *  - Não passe DEFAULT_INSTANCE como default — deixe NULL para mostrar tudo.
 *
 * Uso (via helpers em ./db.ts):
 *
 *   import { dbList, dbGet, dbInsert } from '@/integrations/datasource/db';
 *   import { RPC } from '@/integrations/datasource/rpcCatalog';
 *
 *   // Todas as conversas de todas as instâncias:
 *   const { data: convs } = await dbList(RPC.listConversations, { p_limit: 50 });
 *
 *   // Mensagens de uma conversa (instância vem do contexto):
 *   const { data: msgs } = await dbList(RPC.listMessagesLite, {
 *     p_remote_jid: jid,
 *     p_instance: conversation.instance_name, // passa explícito do contexto
 *   });
 */
import type {
  EvolutionContact,
  EvolutionMessage,
  EvolutionConversation,
} from '@/types/evolutionExternal';
import type { DatasourceClient } from './registry';
export type { DatasourceClient };

export interface RpcDefinition<TParams, TRow> {
  /** Nome exato da função SQL no banco. */
  readonly name: string;
  /** Qual cliente expõe a RPC. */
  readonly client: DatasourceClient;
  /** Defaults aplicados antes do `params` do call site. */
  readonly defaults?: Partial<TParams>;
  /** Phantom marker — preserva `TRow` no tipo da definição. */
  readonly __row?: TRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Param shapes
// ─────────────────────────────────────────────────────────────────────────────

interface ListContactsParams {
  /** Omitir (null) para retornar contatos de TODAS as instâncias. */
  p_instance?: string | null;
  p_lead_status?: string | null;
  p_assigned_to?: string | null;
  p_search?: string | null;
  p_limit?: number;
  p_offset?: number;
}

interface GetContactParams {
  p_remote_jid: string;
  /** Omitir (null) para buscar em qualquer instância. */
  p_instance?: string | null;
}

interface ListMessagesParams {
  p_remote_jid: string;
  /** Omitir (null) para retornar msgs de TODAS as instâncias do JID. */
  p_instance?: string | null;
  p_limit?: number;
  p_before_date?: string | null;
}

interface ListMessagesLiteParams {
  p_remote_jid: string;
  /** Omitir (null) para retornar msgs de TODAS as instâncias do JID. */
  p_instance?: string | null;
  p_limit?: number;
  p_offset?: number;
  p_before_date?: string | null;
}

interface ListConversationsParams {
  /** Omitir (null) para retornar conversas de TODAS as instâncias. */
  p_instance?: string | null;
  p_status?: string | null;
  p_assigned_to?: string | null;
  p_limit?: number;
  p_offset?: number;
}

interface ListCallsParams {
  p_remote_jid?: string | null;
  p_instance?: string | null;
  p_limit?: number;
}

interface ListAuditLogParams {
  p_entity_type?: string | null;
  p_entity_id?: string | null;
  p_action?: string | null;
  p_performed_by?: string | null;
  p_limit?: number;
  p_offset?: number;
}

/**
 * Params para rpc_insert_message.
 * IMPORTANTE: sempre passe p_instance explicitamente quando souber a instância.
 * O DB tem DEFAULT 'wpp_pink_test', mas o TypeScript deve forçar a escolha.
 */
interface InsertMessageParams {
  /** JID do destinatário (ex: '5511999999999@s.whatsapp.net') */
  p_remote_jid: string;
  p_content: string;
  p_message_type?: string;
  p_message_id?: string;
  p_from_me?: boolean;
  /** Direção da mensagem. Default: 'outbound'. */
  p_direction?: string;
  /**
   * Instância WhatsApp. Sempre passe ACTIVE_WHATSAPP_INSTANCE.
   * DB default: 'wpp_pink_test'. NÃO omitir em produção.
   */
  p_instance?: string | null;
}

/**
 * Params para rpc_upsert_contact.
 * Reflete a assinatura completa da função SQL.
 */
interface UpsertContactParams {
  p_remote_jid: string;
  /**
   * Instância WhatsApp. DB default: 'wpp_pink_test'.
   * Sempre passe ACTIVE_WHATSAPP_INSTANCE explicitamente.
   */
  p_instance?: string | null;
  p_push_name?: string | null;
  p_full_name?: string | null;
  p_phone_number?: string | null;
  p_email?: string | null;
  p_company?: string | null;
  p_role_title?: string | null;
  p_lead_status?: string | null;
  p_lead_source?: string | null;
  p_lead_score?: number | null;
  p_assigned_to?: string | null;
  p_tags?: string[] | null;
  p_notes?: string | null;
}

interface DeleteContactParams {
  p_remote_jid: string;
  /** DB default: 'wpp_pink_test'. Passe explicitamente. */
  p_instance?: string | null;
  p_performed_by: string;
}

interface FindDuplicateContactsParams {
  p_workspace_id: string;
  p_limit?: number;
}

interface MergeContactsParams {
  p_primary_id: string;
  p_secondary_id: string;
  p_merged_fields?: Record<string, unknown>;
}

interface BulkAutoMergeDuplicatesParams {
  p_instance_name: string;
  p_limit?: number;
}

interface GrantLgpdConsentParams {
  p_contact_id: string;
  p_channel: string;
  p_marketing_consent?: boolean;
  p_data_sharing?: boolean;
  p_profiling?: boolean;
}

interface RevokeLgpdConsentParams {
  p_contact_id: string;
  p_reason?: string;
}

interface GetLgpdComplianceStatsParams {
  p_instance_name?: string | null;
  p_workspace_id?: string;
}

interface GetContactStatsParams {
  p_instance_name?: string | null;
}

interface DashboardHomeParams {
  p_instance?: string | null;
  p_assigned_to?: string | null;
}

interface GlobalSearchParams {
  p_query: string;
  p_instance?: string | null;
  p_limit?: number;
}

// ── CRM 360 / Search avançado ─────────────────────────────────────────────────────

export interface SearchContactsAdvancedParams {
  p_search?: string | null;
  p_vendedor?: string | null;
  p_ramo?: string | null;
  p_rfm_segment?: string | null;
  p_estado?: string | null;
  p_cliente_ativado?: boolean | null;
  p_ja_comprou?: boolean | null;
  p_sort_by?: string;
  p_page?: number;
  p_page_size?: number;
}

interface GetContact360Params { p_phone: string; }
interface GetContactIntelligenceParams { p_phone: string; }
interface GetCompaniesByPhonesBatchParams { p_phones: string[]; }

interface SyncInteractionParams {
  p_phone: string;
  p_channel?: string;
  p_direction?: string;
  p_assunto?: string | null;
  p_resumo?: string | null;
  p_conteudo?: string | null;
  p_sentiment?: string;
  p_message_count?: number;
  p_duration_seconds?: number | null;
  p_agent_name?: string | null;
  p_zapp_conversation_id?: string | null;
}

// ── Contacts module param shapes ──────────────────────────────────────────────

interface SearchContactsParams {
  search_term: string;
  page_size?: number;
  page_offset?: number;
}

interface BulkSoftDeleteContactsParams {
  p_contact_ids: string[];
  p_reason?: string;
}

interface SoftDeleteContactParams {
  p_contact_id: string;
  p_reason?: string;
}

interface GetContactConversationsParams {
  p_contact_id: string;
  p_limit?: number;
}

interface GetContactNotesParams {
  p_contact_id: string;
  p_limit?: number;
}

interface AddContactNoteParams {
  p_contact_id: string;
  p_content: string;
  p_note_type?: string;
  p_is_pinned?: boolean;
}

interface BulkUpdateLeadStatusParams {
  p_contact_ids: string[];
  p_status: string;
}

interface BulkAddTagParams {
  p_contact_ids: string[];
  p_tag: string;
}

interface FindDuplicateContactRow {
  phone_normalized: string;
  contact_ids: string[];
  contact_names: string[];
  contact_count?: number;
}

interface UpdateContactVersionedParams {
  p_contact_id: string;
  p_expected_version: number;
  p_updates: Record<string, unknown>;
}

interface RestoreContactParams {
  p_contact_id: string;
}

interface RpcLogServiceEventParams {
  p_instance: string;
  p_event_type: string;
  p_message: string;
  p_level?: string;
  p_remote_jid?: string;
  p_payload?: Record<string, unknown>;
  p_metadata?: Record<string, unknown>;
  p_performed_by?: string;
}

interface SendMessageV2Params {
  p_remote_jid: string;
  p_content: string;
  p_message_type: string;
  p_media_url?: string;
  p_media_mimetype?: string;
  /** DB default: 'wpp_pink_test'. Passe ACTIVE_WHATSAPP_INSTANCE explicitamente. */
  p_instance?: string | null;
}

interface SendMessageV2Row {
  success: boolean;
  message: string;
}

// ── Message actions (toggles, follow-up) ──────────────────────────────────────

interface ToggleMessageStarParams {
  p_message_id: string;
  p_value: boolean;
}

interface ToggleMessageImportantParams {
  p_message_id: string;
  p_value: boolean;
}

interface ScheduleFollowUpParams {
  p_message_id: string;
  p_follow_up_at: string;
  p_follow_up_done?: boolean;
}

interface MarkFollowUpDoneParams {
  p_message_id: string;
}

// ── CSAT / NPS ───────────────────────────────────────────────────────────────

interface GetCSATStatsParams {
  p_instance_name?: string;
  p_days?: number;
}

// ── Provider panel ────────────────────────────────────────────────────────────

type ProviderPanelParams = Record<string, never>;

interface ProviderSessionTimelineParams {
  p_provider_id: string | null;
  p_session_id: string | null;
  p_limit?: number;
}

// ── Outbound event telemetry ──────────────────────────────────────────────────

interface LogOutboundEventParams {
  p_conversation_id: string;
  p_message_type: string;
  p_instance_name: string;
  p_status: string;
  p_latency_ms: number;
  p_error_code?: string | null;
  p_metadata?: Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────────────────────

const def = <P, R>(d: RpcDefinition<P, R>) => d;

export const RPC = {
  // ── Reads ──────────────────────────────────────────────────────────────────
  // NOTA: Nenhum default de p_instance — null = todas as instâncias.
  // Passe p_instance explicitamente apenas quando precisar filtrar uma.

  listContacts: def<ListContactsParams, EvolutionContact[]>({
    name: 'rpc_list_contacts',
    client: 'lovable',
    // sem default de instância → retorna contatos de TODAS as instâncias
  }),

  getContact: def<GetContactParams, EvolutionContact>({
    name: 'rpc_get_contact',
    client: 'lovable',
    // sem default de instância
  }),

  listMessages: def<ListMessagesParams, EvolutionMessage[]>({
    name: 'rpc_list_messages',
    client: 'lovable',
    // sem default — passe p_instance do contexto da conversa
  }),

  listMessagesLite: def<ListMessagesLiteParams, EvolutionMessage[]>({
    name: 'rpc_list_messages_lite',
    client: 'lovable',
    // sem default — passe p_instance do contexto da conversa
  }),

  listConversations: def<ListConversationsParams, EvolutionConversation[]>({
    name: 'rpc_list_conversations',
    client: 'lovable',
    // sem default de instância → retorna conversas de TODAS as instâncias
  }),

  listCalls: def<ListCallsParams, unknown[]>({
    name: 'rpc_list_calls',
    client: 'lovable',
  }),

  listAuditLog: def<ListAuditLogParams, unknown[]>({
    name: 'rpc_list_audit_log',
    client: 'lovable',
  }),

  // ── Writes ──────────────────────────────────────────────────────────────────
  // IMPORTANTE: sempre passe p_instance explicitamente (DB default é 'wpp_pink_test',
  // mas o TypeScript deve documenter a escolha). Use ACTIVE_WHATSAPP_INSTANCE.

  insertMessage: def<InsertMessageParams, EvolutionMessage>({
    name: 'rpc_insert_message',
    client: 'lovable',
    // p_instance: usar ACTIVE_WHATSAPP_INSTANCE no call site
  }),

  upsertContact: def<UpsertContactParams, EvolutionContact>({
    name: 'rpc_upsert_contact',
    client: 'lovable',
    // p_instance: usar ACTIVE_WHATSAPP_INSTANCE no call site
  }),

  deleteContact: def<DeleteContactParams, boolean>({
    name: 'rpc_delete_contact',
    client: 'lovable',
    // p_instance: usar ACTIVE_WHATSAPP_INSTANCE no call site
  }),

  // ── Analytics / Search ───────────────────────────────────────────────────────
  dashboardHome: def<DashboardHomeParams, unknown>({
    name: 'rpc_dashboard_home',
    client: 'lovable',
  }),

  globalSearch: def<GlobalSearchParams, unknown>({
    name: 'rpc_global_search',
    client: 'lovable',
  }),

  // ── CRM 360 / Search avançado ─────────────────────────────────────────────
  searchContactsAdvanced: def<SearchContactsAdvancedParams, unknown>({
    name: 'search_contacts_advanced',
    client: 'lovable',
  }),

  getContact360ByPhone: def<GetContact360Params, unknown>({
    name: 'get_contact_360_by_phone',
    client: 'lovable',
  }),

  getContactIntelligenceByPhone: def<GetContactIntelligenceParams, unknown>({
    name: 'get_contact_intelligence_by_phone',
    client: 'lovable',
  }),

  getCompaniesByPhonesBatch: def<GetCompaniesByPhonesBatchParams, unknown>({
    name: 'get_companies_by_phones_batch',
    client: 'lovable',
  }),

  syncInteractionFromZapp: def<SyncInteractionParams, unknown>({
    name: 'sync_interaction_from_zapp',
    client: 'lovable',
  }),

  // ── Contacts module: notes, audit, dashboards, bulk ops ────────────────────
  getContactConversations: def<GetContactConversationsParams, Record<string, unknown>[]>({
    name: 'get_contact_conversations',
    client: 'lovable',
  }),

  searchContacts: def<SearchContactsParams, Record<string, unknown>[]>({
    name: 'search_contacts',
    client: 'lovable',
  }),

  bulkSoftDeleteContacts: def<BulkSoftDeleteContactsParams, unknown>({
    name: 'bulk_soft_delete_contacts',
    client: 'lovable',
  }),

  softDeleteContact: def<SoftDeleteContactParams, unknown>({
    name: 'soft_delete_contact',
    client: 'lovable',
  }),

  getContactNotes: def<GetContactNotesParams, Record<string, unknown>[]>({
    name: 'get_contact_notes',
    client: 'lovable',
  }),

  addContactNote: def<AddContactNoteParams, Record<string, unknown>>({
    name: 'add_contact_note',
    client: 'lovable',
  }),

  bulkUpdateLeadStatus: def<BulkUpdateLeadStatusParams, unknown>({
    name: 'bulk_update_lead_status',
    client: 'lovable',
  }),

  bulkAddTag: def<BulkAddTagParams, unknown>({
    name: 'bulk_add_tag',
    client: 'lovable',
  }),

  findDuplicateContacts: def<FindDuplicateContactsParams, FindDuplicateContactRow[]>({
    name: 'find_duplicate_contacts',
    client: 'lovable',
  }),

  mergeContacts: def<MergeContactsParams, Record<string, unknown>>({
    name: 'merge_contacts',
    client: 'lovable',
  }),

  bulkAutoMergeDuplicates: def<BulkAutoMergeDuplicatesParams, Record<string, unknown>>({
    name: 'bulk_auto_merge_duplicates',
    client: 'lovable',
  }),

  updateContactVersioned: def<UpdateContactVersionedParams, Record<string, unknown>>({
    name: 'update_contact_versioned',
    client: 'lovable',
  }),

  restoreContact: def<RestoreContactParams, Record<string, unknown>>({
    name: 'restore_contact',
    client: 'lovable',
  }),

  getContactStats: def<GetContactStatsParams, Record<string, unknown>>({
    name: 'get_contact_stats',
    client: 'lovable',
  }),

  getLgpdComplianceStats: def<GetLgpdComplianceStatsParams, Record<string, unknown>>({
    name: 'get_lgpd_compliance_stats',
    client: 'lovable',
  }),

  grantLgpdConsent: def<GrantLgpdConsentParams, unknown>({
    name: 'grant_lgpd_consent',
    client: 'lovable',
  }),

  revokeLgpdConsent: def<RevokeLgpdConsentParams, unknown>({
    name: 'revoke_lgpd_consent',
    client: 'lovable',
  }),

  getDuplicateReport: def<GetContactStatsParams, Record<string, unknown>>({
    name: 'get_duplicate_report',
    client: 'lovable',
  }),

  rpc_log_service_event: def<RpcLogServiceEventParams, Record<string, unknown>>({
    name: 'rpc_log_service_event',
    client: 'lovable',
  }),

  send_message_v2: def<SendMessageV2Params, SendMessageV2Row>({
    name: 'send_message_v2',
    client: 'lovable',
  }),

  // ── Message actions (toggle star/important, follow-up) ─────────────────────
  toggleMessageStar: def<ToggleMessageStarParams, boolean>({
    name: 'rpc_toggle_message_star',
    client: 'lovable',
  }),

  toggleMessageImportant: def<ToggleMessageImportantParams, boolean>({
    name: 'rpc_toggle_message_important',
    client: 'lovable',
  }),

  scheduleFollowUp: def<ScheduleFollowUpParams, Record<string, unknown>>({
    name: 'rpc_schedule_follow_up',
    client: 'lovable',
  }),

  markFollowUpDone: def<MarkFollowUpDoneParams, Record<string, unknown>>({
    name: 'mark_follow_up_done',
    client: 'lovable',
  }),

  // ── CSAT / NPS ────────────────────────────────────────────────────────────
  getCSATStats: def<GetCSATStatsParams, Record<string, unknown>>({
    name: 'get_csat_stats',
    client: 'lovable',
  }),

  // ── Provider panel ────────────────────────────────────────────────────────
  providerPanel: def<ProviderPanelParams, Record<string, unknown>>({
    name: 'rpc_provider_panel',
    client: 'lovable',
  }),
  providerSessionTimeline: def<ProviderSessionTimelineParams, unknown[]>({
    name: 'rpc_provider_session_timeline',
    client: 'lovable',
  }),

  // ── Outbound event telemetry ──────────────────────────────────────────────
  logOutboundEvent: def<LogOutboundEventParams, Record<string, unknown>>({
    name: 'rpc_log_outbound_event',
    client: 'lovable',
  }),
} as const;

export type RpcKey = keyof typeof RPC;
