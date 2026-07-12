import { supabase as _supabase } from './client';
import { getLogger } from '@/lib/logger';
import { PostgrestError } from '@supabase/supabase-js';
import { generateCorrelationId } from '@/lib/correlationId';

const supabase = _supabase;
const _log = getLogger('safeClient');

// Whitelist of allowed tables to prevent SQL injection via table name parameter
// Generated from schema migrations - only these tables can be queried via safeClient
const ALLOWED_TABLES = new Set([
  // Agent & AI
  'agent_achievements', 'agent_skills', 'agent_stats', 'agent_visibility_grants',
  'ai_conversation_tags', 'ai_providers', 'ai_usage_logs',
  // Access Control
  'allowed_countries', 'blocked_countries', 'blocked_ips',
  // Automation
  'automations', 'automation_executions', 'auto_close_config',
  'away_messages', 'followup_sequences', 'followup_executions',
  // Audio & Media
  'audio_memes', 'custom_emojis',
  // Business Hours & SLA
  'business_hours', 'csat_auto_config', 'csat_surveys',
  // Calls
  'calls', 'channel_connections', 'channel_routing_rules', 'channel_queues',
  // Campaigns & Contacts
  'campaign_contacts', 'campaigns', 'contact_custom_fields', 'contact_notes',
  'contact_tags', 'contacts', 'favorite_contacts',
  // Conversation Management
  'conversation_analyses', 'conversation_audit_logs', 'conversation_closures',
  'conversation_events', 'conversation_memory', 'conversation_reads',
  'conversation_sla', 'conversation_snoozes', 'conversation_tasks',
  'conversation_transfers',
  // Chatbot
  'chatbot_executions', 'chatbot_flows',
  // Client Management
  'client_wallet_rules',
  // Deal Management
  'deal_activities', 'sales_deals', 'sales_pipeline_stages',
  // Email
  'email_accounts', 'email_attachments', 'email_drafts', 'email_labels',
  'email_messages', 'email_revalidation_jobs', 'email_threads',
  // Evolution API
  'evolution_retry_metrics', 'evolution_instance_features', 'evolution_webhook_logs',
  // Global Settings
  'global_settings', 'knowledge_base_articles', 'knowledge_base_categories',
  // Logging & Audit
  'audit_logs', 'connection_health_logs', 'failed_messages', 'rls_audit_log',
  // Notifications
  'notification_preferences', 'notification_queue', 'notification_templates',
  // Passwords & Auth
  'password_reset_requests_safe',
  // Profiles & Users
  'profiles', 'user_roles', 'user_settings',
  // Queue Management
  'queue_members', 'queue_skill_requirements', 'queues',
  // Security Alerts
  'security_alerts',
  // Typebot Integration
  'typebot_executions',
  // WhatsApp
  'whatsapp_connections', 'whatsapp_groups', 'whatsapp_media_urls',
  // Views (read-only)
  'messages', 'message_templates',
  // RPC helper tables
  'rpc_dlq_log_reprocess_result', 'rpc_dlq_log_reprocess_trigger',
] as const);

type AllowedTable = typeof ALLOWED_TABLES extends Set<infer T> ? T : never;

/**
 * Valida se o nome da tabela está na whitelist de tabelas permitidas.
 * Previne SQL injection via injeção de nomes de tabelas.
 * Throws se tabela não estiver autorizada.
 */
function validateTableName(table: string): void {
  if (!ALLOWED_TABLES.has(table as any)) {
    throw new Error(
      `SQL Injection Prevention: Table "${table}" is not in the allowed tables whitelist. ` +
      `Only these tables can be accessed via safeClient: ${Array.from(ALLOWED_TABLES).slice(0, 5).join(', ')}...`
    );
  }
}

/**
 * Interface para retorno padronizado do safeClient
 */
export interface SafeResponse<T> {
  data: T | null;
  error: Error | null;
  requestId?: string;
}

/**
 * Cache de recursos validados para evitar chamadas repetidas ao schema
 */
const CACHE_TTL = 300000; // 5 minutos
const resourceCache = new Map<string, { exists: boolean; expires: number }>();

// Telemetria interna
let lastValidation: Date | null = null;
const recentFailures: unknown[] = [];
const MAX_FAILURES = 50;
const stats = {
  totalCalls: 0,
  failedCalls: 0,
  cacheHits: 0
};

/**
 * safeClient — Wrapper para chamadas Supabase com tratamento de erro e tipagem opcional.
 * Resolve problemas de tabelas não tipadas e schemas externos.
 */
export const safeClient = {
  /**
   * Executa uma query 'from' com tratamento de erro e validação de existência
   */
  async from<T = any>(
    table: string,
    queryBuilder: (query: any) => any
  ): Promise<SafeResponse<T[]>> {
    const requestId = generateCorrelationId();
    stats.totalCalls++;
    try {
      // Validação de SQL injection: verifica se tabela está na whitelist
      validateTableName(table);

      // Validação automática para tabelas email_*
      if (table.startsWith('email_')) {
        const exists = await this.validateResource(table, 'table');
        if (!exists) {
          this.log(requestId, 'warn', `Tabela ${table} não encontrada no schema.`, { table });
          this.recordFailure(requestId, 'from', table, `Tabela ${table} não encontrada`);
          return { data: [] as T[], error: new Error(`Tabela ${table} não disponível`), requestId };
        }
      }

      const { data, error } = await queryBuilder((supabase as any).from(table));
      if (error) {
        this.log(requestId, 'error', `Erro na query from ${table}`, error);
        this.recordFailure(requestId, 'from', table, error.message || 'Erro desconhecido');
        stats.failedCalls++;
        return { data: [] as T[], error: this.formatError(error), requestId };
      }

      return { data: (Array.isArray(data) ? data : []) as T[], error: null, requestId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isSqlInjectionAttempt = errorMsg.includes('SQL Injection Prevention');

      if (isSqlInjectionAttempt) {
        this.log(requestId, 'error', `🚨 SECURITY ALERT: SQL Injection attempt blocked on table access`, {
          table,
          attemptedTable: table,
          errorMsg
        });
        this.recordFailure(requestId, 'from', table, `SQL Injection attempt blocked: ${errorMsg}`);
      } else {
        this.log(requestId, 'error', `Erro crítico ao consultar tabela ${table}`, err);
        this.recordFailure(requestId, 'from', table, errorMsg);
      }

      stats.failedCalls++;
      return { data: [] as T[], error: err instanceof Error ? err : new Error(String(err)), requestId };
    }
  },

  /**
   * Executa uma query 'from' que retorna um único item
   */
  async single<T = any>(
    table: string,
    queryBuilder: (query: any) => any
  ): Promise<SafeResponse<T>> {
    const requestId = generateCorrelationId();
    stats.totalCalls++;
    try {
      // Validação de SQL injection: verifica se tabela está na whitelist
      validateTableName(table);

      if (table.startsWith('email_')) {
        const exists = await this.validateResource(table, 'table');
        if (!exists) {
          this.log(requestId, 'warn', `Tabela ${table} não encontrada para single()`, { table });
          this.recordFailure(requestId, 'single', table, `Tabela ${table} não encontrada`);
          return { data: null, error: new Error(`Tabela ${table} não disponível`), requestId };
        }
      }

      const { data, error } = await queryBuilder((supabase as any).from(table)).single();
      if (error) {
        this.log(requestId, 'error', `Erro single query ${table}`, error);
        this.recordFailure(requestId, 'single', table, error.message || 'Erro desconhecido');
        stats.failedCalls++;
        return { data: null, error: this.formatError(error), requestId };
      }
      return { data: data as T, error: null, requestId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isSqlInjectionAttempt = errorMsg.includes('SQL Injection Prevention');

      if (isSqlInjectionAttempt) {
        this.log(requestId, 'error', `🚨 SECURITY ALERT: SQL Injection attempt blocked on single query`, {
          table,
          attemptedTable: table,
          errorMsg
        });
        this.recordFailure(requestId, 'single', table, `SQL Injection attempt blocked: ${errorMsg}`);
      } else {
        this.log(requestId, 'error', `Erro crítico single ${table}`, err);
        this.recordFailure(requestId, 'single', table, errorMsg);
      }

      stats.failedCalls++;
      return { data: null, error: err instanceof Error ? err : new Error(String(err)), requestId };
    }
  },

  /**
   * Executa um RPC com validação e tratamento de erro
   */
  async rpc<T = any>(
    name: string,
    params?: Record<string, any>
  ): Promise<SafeResponse<T>> {
    const requestId = generateCorrelationId();
    stats.totalCalls++;
    try {
      // Validação automática para RPCs rpc_email_*
      if (name.startsWith('rpc_email_')) {
        const exists = await this.validateResource(name, 'function');
        if (!exists) {
          this.log(requestId, 'warn', `RPC ${name} não encontrada no schema.`, { function: name });
          this.recordFailure(requestId, 'rpc', name, `Função ${name} não encontrada`);
          return { data: null, error: new Error(`Função ${name} não disponível`), requestId };
        }
      }

      const { data, error } = await supabase.rpc(name as any, params);
      if (error) {
        this.log(requestId, 'error', `Erro ao executar RPC ${name}`, error);
        this.recordFailure(requestId, 'rpc', name, error.message || 'Erro desconhecido');
        stats.failedCalls++;
        return { data: null, error: this.formatError(error), requestId };
      }

      if (data === undefined || data === null) return { data: null, error: null, requestId };

      return { data: data as T, error: null, requestId };
    } catch (err) {
      this.log(requestId, 'error', `Erro crítico RPC ${name}`, err);
      this.recordFailure(requestId, 'rpc', name, err instanceof Error ? err.message : String(err));
      stats.failedCalls++;
      return { data: null, error: err instanceof Error ? err : new Error(String(err)), requestId };
    }
  },

  /**
   * Verifica se um RPC ou Tabela existe no schema público com cache
   */
  async validateResource(name: string, type: 'function' | 'table' = 'table'): Promise<boolean> {
    const cacheKey = `${type}:${name}`;
    const cached = resourceCache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      stats.cacheHits++;
      return cached.exists;
    }

    lastValidation = new Date();

    try {
      let exists = false;
      if (type === 'table') {
        const { error } = await (supabase as any).from(name).select('count', { count: 'exact', head: true }).limit(0);
        exists = !error || !error.message || !error.message.toLowerCase().includes('does not exist');
      } else {
        const { error } = await supabase.rpc(name as any).limit(0);
        if (!error) {
          exists = true;
        } else {
          const msg = error.message ? error.message.toLowerCase() : '';
          exists = !msg.includes('does not exist') && !msg.includes('não existe');
        }
      }
      
      resourceCache.set(cacheKey, { exists, expires: Date.now() + CACHE_TTL });
      
      // Sincronizar estado de saúde com o banco para que o Edge possa ver
      this.syncHealthState();
      
      return exists;
    } catch {
      return false;
    }
  },

  /**
   * Sincroniza o estado de saúde local (in-memory) com a tabela compartilhada no banco
   */
  async syncHealthState() {
    const telemetry = this.getTelemetry();
    let status: 'healthy' | 'degraded' | 'error' = 'healthy';
    if (telemetry.recentFailures.length > 10) status = 'error';
    else if (telemetry.recentFailures.length > 0) status = 'degraded';

    try {
      await safeClient.rpc('rpc_update_email_health_state', {
        p_status: status,
        p_failure_count: telemetry.recentFailures.length,
        p_metadata: {
          total_calls: telemetry.stats.totalCalls,
          cache_hits: telemetry.stats.cacheHits,
          last_validation: lastValidation?.toISOString()
        }
      });
    } catch (err) {
      _log.warn('Erro ao sincronizar estado de saúde', { error: err instanceof Error ? err.message : String(err) });
    }
  },

  /**
   * Logger estruturado com masking de dados sensíveis — usa o logger de produção
   * em vez de console.* para que os logs sigam o nível de verbosidade configurado.
   */
  log(requestId: string, level: 'info' | 'warn' | 'error', message: string, detail?: unknown) {
    const maskedDetail = this.maskSensitiveData(detail);
    const meta: Record<string, unknown> = { requestId };
    if (maskedDetail != null) {
      meta['detail'] = maskedDetail;
    }
    if (level === 'error') {
      _log.error(`${message}`, meta);
    } else if (level === 'warn') {
      _log.warn(`${message}`, meta);
    } else {
      _log.info(`${message}`, meta);
    }
  },

  /**
   * Redação de dados sensíveis para logs
   */
  maskSensitiveData(data: any): any {
    if (!data) return data;
    if (typeof data !== 'object') {
      if (typeof data === 'string') {
        if (data.length > 50 || data.includes('@')) {
          return this.applyMasking(data);
        }
      }
      return data;
    }

    const masked = Array.isArray(data) ? [...data] : { ...data };
    
    for (const key in masked) {
      const val = masked[key];
      const lowerKey = key.toLowerCase();
      
      if (
        lowerKey.includes('token') || 
        lowerKey.includes('secret') || 
        lowerKey.includes('password') || 
        lowerKey.includes('key') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('session') ||
        lowerKey.includes('cookie')
      ) {
        masked[key] = '***MASKED***';
      } else if (lowerKey.includes('email') && typeof val === 'string') {
        masked[key] = this.maskEmail(val);
      } else if (typeof val === 'object') {
        masked[key] = this.maskSensitiveData(val);
      }
    }
    
    return masked;
  },

  maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;
    const [user, domain] = email.split('@');
    if (user.length <= 2) return `***@${domain}`;
    return `${user.substring(0, 2)}***@${domain}`;
  },

  applyMasking(str: string): string {
    if (str.length > 30 && (str.includes('.') || /^[a-zA-Z0-9_-]+$/.test(str))) {
      return str.substring(0, 5) + '...' + str.substring(str.length - 5);
    }
    return str;
  },

  /**
   * Registra uma falha na telemetria e opcionalmente no banco
   */
  async recordFailure(requestId: string, operation: string, resource: string, error: string) {
    const failure = {
      requestId,
      operation,
      resource,
      error,
      timestamp: new Date().toISOString()
    };
    
    recentFailures.unshift(failure);
    
    if (recentFailures.length > MAX_FAILURES) {
      recentFailures.pop();
    }

    // Persistir falha no banco para monitoramento assíncrono
    try {
      await safeClient.rpc('rpc_log_email_health', {
        p_status: 'error',
        p_operation: operation,
        p_resource: resource,
        p_request_id: requestId,
        p_error_message: error,
        p_is_failure: true
      });
    } catch (dbErr) {
      // Ignorar erros de persistência para não travar a operação principal
      _log.warn('Falha ao persistir log de saúde', { error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
    }
  },

  getTelemetry() {
    return {
      lastValidation,
      recentFailures: [...recentFailures],
      stats: { ...stats }
    };
  },

  getCacheInfo() {
    const values = Array.from(resourceCache.values());
    const expiration = values.length > 0 ? Math.max(...values.map(v => v.expires)) : null;
    return {
      expiration,
      size: resourceCache.size
    };
  },

  clearCache(prefix?: string) {
    if (!prefix) {
      resourceCache.clear();
      return;
    }
    for (const key of resourceCache.keys()) {
      if (key.includes(prefix)) {
        resourceCache.delete(key);
      }
    }
  },

  formatError(error: PostgrestError | any): Error {
    if (error.message) {
      if (error.message.toLowerCase().includes('does not exist')) {
        return new Error(`Recurso indisponível: ${error.message}`);
      }
      return new Error(error.message);
    }
    return new Error(String(error));
  }
};
