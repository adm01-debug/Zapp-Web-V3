/** Churn Risk interface definition. */
export interface ChurnRisk {
  contactId: string;
  contactName: string;
  phone: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  daysSinceLastMessage: number;
  totalMessages: number;
  sentiment: string | null;
  reasons: string[];
}

/**
 * Classifica um score de risco de churn (0-100) em um nível categórico.
 * Extraído do componente para ser testável isoladamente (sem mockar
 * Supabase/render) e para que o teste exercite a lógica real de produção
 * em vez de reimplementar os mesmos thresholds de forma desacoplada.
 */
export function classifyChurnRisk(score: number): ChurnRisk['riskLevel'] {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}
