export type Phase =
  | 'config'
  | 'parse-body'
  | 'build-payload'
  | 'sign'
  | 'mutate'
  | 'request'
  | 'validate'
  | 'signature-presence'
  | 'temporal'
  | 'response';

export interface ScenarioReport {
  name: string;
  description: string;
  expected: 'accept' | 'reject';
  outcome: 'accept' | 'reject';
  passed: boolean;
  reason: string | null;
  failed_phase?: Phase | null;
  phases?: Array<{ phase: Phase; status: 'ok' | 'fail' | 'skip'; duration_ms: number }>;
  issuedAt: string;
  ageSeconds: number;
  nonce: string;
}

export interface SelfTestResult {
  ok: boolean;
  configured: boolean;
  request_id?: string;
  failed_phase?: Phase | null;
  secret_length?: number;
  duration_ms?: number;
  tolerance_seconds?: number;
  scenarios?: ScenarioReport[];
  payload_preview?: Record<string, unknown>;
  payload_bytes?: number;
  computed_signature_prefix?: string;
  good?: { accepted: boolean; signatureFound: boolean; error: string | null };
  tampered?: { accepted: boolean; signatureFound: boolean; error: string | null };
  message?: string;
  error?: string;
}
