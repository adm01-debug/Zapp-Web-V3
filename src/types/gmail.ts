
/**
 * email.ts — Tipagens compartilhadas para o domínio de Email e Email unificado.
 */

export type EmailProvider = 'email' | 'outlook' | 'yahoo' | 'custom';
export type EmailTokenStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_token';
export type EmailWatchStatus = 'active' | 'expiring_soon' | 'expired' | 'no_watch';
export type SLAStatus = 'ok' | 'warning' | 'breached' | 'met';
export type EmailLabel = 'INBOX' | 'SENT' | 'DRAFTS' | 'STARRED' | 'IMPORTANT' | 'TRASH' | 'SPAM' | string;

export interface EmailAccount {
  id:            string;
  user_id:       string;
  email:         string;
  display_name:  string | null;
  picture_url?:  string | null;
  is_active:     boolean;
  token_expiry:  string | null;
  watch_expiry:  string | null;
  created_at?:   string;
}

export interface EmailTokenInfo {
  account_id:            string;
  email:                 string;
  is_active:             boolean;
  token_status:          EmailTokenStatus;
  token_expiry:          string | null;
  watch_status:          EmailWatchStatus;
  watch_expiry:          string | null;
  minutes_until_expiry:  number | null;
}

export interface EmailThread {
  id:              string;
  account_id:      string;
  email_thread_id: string;
  thread_id?:      string;   // Alias legado
  subject:         string | null;
  snippet:         string | null;
  from_email:      string | null;
  from_name:       string | null;
  label_ids:       string[];
  unread_count:    number;
  message_count:   number;
  is_starred:      boolean;
  is_important:    boolean;
  is_unread?:      boolean;  // Legado
  sla_status:      SLAStatus | null;
  assigned_to:     string | null;
  last_message_at: string | null;
  first_reply_at:  string | null;
  created_at:      string;
  contact?:        Record<string, unknown>;
  tags?:           string[];
}

// Duplicate identifier 'EmailThread' removed

export interface EmailDraft {
  id:             string;
  account_id:     string;
  email_draft_id: string | null;
  thread_id_ref:  string | null;
  to_emails:      string[];
  cc_emails:      string[];
  subject:        string | null;
  body_html:      string | null;
  last_saved_at:  string;
}

export interface EmailSignature {
  id:          string;
  account_id:  string;
  name:        string;
  content:     string;
  is_default:  boolean;
}

export interface UnifiedEmailAccount {
  account_id:      string;
  user_id:         string;
  email:           string;
  display_name:    string;
  provider:        EmailProvider;
  auth_method:     string;
  is_active:       boolean;
  token_expired:   boolean;
  unread_threads:  number;
  sla_breached:    number;
  created_at:      string;
}

export interface EmailLabelInfo {
  id:             string;
  account_id:     string;
  email_label_id: string;
  name:           string;
  type:           'system' | 'user';
  color?:         string | null;
  thread_count?:  number;
  unread_count?:  number;
}

export interface EmailDayMetric {
  date:                    string;
  threads_received:        number;
  threads_replied:         number;
  avg_first_reply_minutes: number | null;
  sla_met_count:           number;
  sla_breached_count:      number;
}

export interface EmailMetricsSummary {
  period:              string;
  total_received:      number;
  total_replied:       number;
  reply_rate:          number;
  avg_reply_minutes:   number | null;
  sla_compliance_rate: number;
  total_sla_met:       number;
  total_sla_breached:  number;
  daily:               EmailDayMetric[];
}

export interface EmailSLADashboard {
  ok_count:       number;
  warning_count:  number;
  breached_count: number;
  met_count:      number;
  total:          number;
}

export interface EmailSendParams {
  to:          string | string[];
  cc?:         string | string[];
  bcc?:        string | string[];
  subject:     string;
  bodyHtml:    string;
  threadId?:   string;
  inReplyTo?:  string;
  signature?:  boolean;
}
