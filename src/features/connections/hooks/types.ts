/** Whats App Api Type type alias. */
export type WhatsAppApiType = 'evolution' | 'official';

/** Whats App Connection interface definition. */
export interface WhatsAppConnection {
  id: string;
  name: string;
  phone_number: string;
  /** Nome da instância na Evolution API — identificador usado nas rotas HTTP. */
  instance_name?: string | null;
  /** UUID interno da Evolution — NUNCA usar em rotas da API (gera 404/fantasma). */
  instance_id: string | null;
  status: string;
  qr_code: string | null;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
  api_type?: string;
  battery_level?: number | null;
  is_plugged?: boolean | null;
  retry_count?: number | null;
  max_retries?: number | null;
  health_status?: string | null;
  health_response_ms?: number | null;
  last_health_check?: string | null;
  health_reason?: string | null;
  owner_jid?: string | null;
}

/** Qr Ttl Source type alias. */
export type QrTtlSource = 'detected' | 'default' | 'clamped';

/** Qr Code Dialog State interface definition. */
export interface QrCodeDialogState {
  open: boolean;
  connectionId: string;
  connectionName: string;
  qrCode: string | null;
  status: 'loading' | 'pending' | 'connected' | 'error';
  errorMessage?: string;
  expiresAt: number | null;
  attemptId: string | null;
  ttlSeconds: number | null;
  ttlSource: QrTtlSource | null;
  rawPayload?: unknown;
}
