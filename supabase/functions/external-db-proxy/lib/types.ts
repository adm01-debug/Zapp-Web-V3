/** types utilities and exports. */
export interface ProxyFilter {
  column: string
  operator: string
  value: unknown
}

/** Query Log Context interface. */
export interface QueryLogContext {
  cid: string
  rid: string
  op: 'rpc' | 'select' | 'insert' | 'update' | 'bad_request' | 'config_error'
  target: string
  startedAt: number
}

/** Query Outcome interface definition. */
export interface QueryOutcome {
  ok: boolean
  ms: number
  status: number
  timeoutFired?: boolean
  pgTimeout?: boolean
  errCode?: string
  errMsg?: string
  rowCount?: number
  schemaRetries?: number
}

/** Metric Sample interface definition. */
export interface MetricSample {
  cid: string
  rid: string
  op: string
  target: string
  status: number
  ms: number
  ok: boolean
  timeout_fired?: boolean
  pg_timeout?: boolean
  err_code?: string | null
  err_msg?: string | null
}

/** Log Payload type alias. */
export type LogPayload = Record<string, unknown>
