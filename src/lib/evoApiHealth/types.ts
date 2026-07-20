/** Severity. */
export type Severity = 'info' | 'warning' | 'critical';

/** Pipeline Health. */
export interface PipelineHealth {
  instances_open: number;
  instances_connecting: number;
  instances_closed: number;
  instances_total: number;
  messages_total: number;
  messages_last_5m: number;
  messages_last_1h: number;
  messages_last_24h: number;
  last_message_at: string | null;
  lag_seconds: number | null;
  bot_sessions_open: number;
  chats_unread: number;
  unread_total: number | null;
}

/** Pipeline Readiness. */
export interface PipelineReadiness {
  tables_count: number; tables_status: string;
  enums_count: number;  enums_status: string;
  fk_count: number;     fk_status: string;
  realtime_count: number; realtime_status: string;
  replica_full_count: number; replica_full_status: string;
  index_count: number; trigger_count: number;
  cron_jobs: number; aux_tables_count: number;
  overall: string;
}

/** Dashboard Response. */
export interface DashboardResponse {
  health: PipelineHealth;
  readiness: PipelineReadiness;
  integrity: {
    overall: string;
    foreign_keys: number;
    indexes: number;
    realtime_publications: number;
    replica_identity_full: number;
    tables_missing: string[];
    enums_missing: string[];
  };
  computed_at: string;
}

/** Active Alert. */
export interface ActiveAlert {
  id: number;
  alert_type: string;
  severity: Severity;
  title: string;
  details: Record<string, unknown>;
  created_at: string;
  age_seconds: number;
}

/** Alert Channel. */
export interface AlertChannel {
  id: number;
  name: string;
  channel_type: string;
  active: boolean;
  min_severity: Severity;
  rate_limit_min: number;
  success_rate_pct: number | null;
}

/** Health History Row. */
export interface HealthHistoryRow {
  bucket: string;
  avg_instances_open: number;
  peak_messages_5m: number;
  avg_lag_sec: number;
  max_lag_sec: number;
  all_ok: boolean;
}

/** Dr Runbook Step. */
export interface DrRunbookStep {
  step_number: number;
  category: string;
  icon: string;
  title: string;
  description: string;
  command: string | null;
  rto_minutes: number | null;
  rpo_minutes: number | null;
}

/** Test Suite Result. */
export interface TestSuiteResult {
  run_id: string;
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate_pct: number;
  overall: string;
}
