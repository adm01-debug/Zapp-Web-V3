import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { requireServiceRoleOrCron } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const denied = requireServiceRoleOrCron(req)
  if (denied) return denied

  try {
    const url = Deno.env.get('EXTERNAL_SUPABASE_URL')
    const key = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')

    if (!url || !key) {
      return new Response(JSON.stringify({ error: 'Missing external DB credentials' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const ext = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // 1. List all tables
    const { data: tables, error: tablesErr } = await ext.rpc('get_tables_info').maybeSingle()
    
    // Fallback: query information_schema directly via PostgREST isn't possible,
    // so we'll query known evolution_* tables and check which exist
    const knownTables = [
      'evolution_webhook_events', 'evolution_messages', 'evolution_contacts',
      'evolution_conversations', 'evolution_calls', 'evolution_labels',
      'evolution_groups', 'evolution_deals', 'evolution_sales_pipeline',
      'evolution_pipeline_history', 'evolution_stage_mapping',
      'evolution_chatbot_responses', 'evolution_sentiment_analysis',
      'evolution_automations', 'evolution_followup_rules', 'evolution_followups',
      'evolution_quick_replies', 'evolution_message_templates',
      'evolution_bitrix_queue', 'evolution_bitrix_sync',
      'evolution_bitrix_field_mapping', 'evolution_typebot_sessions',
      'evolution_webhook_metrics', 'evolution_daily_metrics',
      'evolution_webhook_dlq', 'evolution_audit_log',
      'evolution_realtime_events', 'evolution_settings',
      'evolution_tags', 'evolution_notification_config',
      // Additional common tables
      'contacts', 'messages', 'conversations', 'profiles', 'users',
      'companies', 'customers', 'interactions', 'deals', 'pipelines',
      'tags', 'notes', 'tasks', 'activities', 'products', 'orders',
      'invoices', 'payments', 'subscriptions', 'webhooks', 'integrations',
      'settings', 'notifications', 'templates', 'campaigns',
      'analytics', 'reports', 'logs', 'events', 'files', 'media',
      'categories', 'groups', 'roles', 'permissions',
    ]

    const results: Record<string, unknown> = {}

    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`query timeout after ${ms}ms`)), ms);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    };

    // Check all tables in parallel with individual 5s timeouts — avoids 50× sequential RTT
    const tableChecks = await Promise.allSettled(
      knownTables.map(async (table) => {
        const { data, error, count } = await withTimeout(
          ext.from(table).select('*', { count: 'exact' }).limit(3),
          5000
        );
        if (!error && data) {
          return {
            table,
            exists: true,
            count: count,
            sample: data,
            columns: data.length > 0 ? Object.keys(data[0] as Record<string, unknown>) : [],
          };
        }
        return null;
      })
    );

    for (const result of tableChecks) {
      if (result.status === 'fulfilled' && result.value) {
        const { table, ...rest } = result.value;
        results[table] = rest;
      }
    }

    // Also try to discover tables via a simple approach
    let discoveredTables: string[] = []
    try {
      const { data } = await withTimeout(ext.rpc('get_all_table_names'), 5000);
      if (data) discoveredTables = data as string[];
    } catch {}

    return new Response(JSON.stringify({
      external_url: url.replace(/https?:\/\//, '').split('.')[0] + '...',
      tables_found: Object.keys(results),
      table_count: Object.keys(results).length,
      details: results,
      discovered_tables: discoveredTables,
      timestamp: new Date().toISOString()
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
