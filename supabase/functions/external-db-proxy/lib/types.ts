export interface ProxyFilter {
  column: string
  operator: string
  value: unknown
}

export interface QueryLogContext {
  cid: string
  rid: string
  op: 'rpc' | 'select' | 'insert' | 'update' | 'bad_request' | 'config_error'
  target: string
  startedAt: number
}

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

export type LogPayload = Record<string, unknown>
