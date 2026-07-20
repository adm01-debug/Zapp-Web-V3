/** Performance Metric Status type alias. */
export type PerformanceMetricStatus = 'good' | 'warning' | 'critical';

/**
 * Classifica um valor numérico de métrica de performance em good/warning/
 * critical contra dois limiares (quanto menor o valor, melhor). O algoritmo
 * é idêntico para todas as métricas (FCP, TTFB, DOM Ready, etc.) — só os
 * limiares variam por métrica. Extraído para ser testável isoladamente,
 * sem precisar mockar performance.* / navigator.connection.
 */
export function classifyMetricStatus(
  value: number,
  goodMax: number,
  warningMax: number
): PerformanceMetricStatus {
  if (value < goodMax) return 'good';
  if (value < warningMax) return 'warning';
  return 'critical';
}
