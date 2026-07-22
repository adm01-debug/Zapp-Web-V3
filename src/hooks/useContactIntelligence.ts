// Re-export from consolidated useCRMManagement module (ETAPA 43 consolidation)
import { useContactIntelligenceManagement } from '@/hooks/useCRMManagement';

/** Hook: Contact Briefing. */
export interface ContactBriefing {
  opening_tip: string;
  risk_alert?: string | null;
  days_since_last_contact?: number | null;
  total_interactions: number;
  relationship_score?: number | null;
}

/** Hook: Mental Trigger. */
export interface MentalTrigger {
  trigger_name: string;
  category: string;
  description: string;
  examples?: string[];
}

/** Hook: Rapport Data. */
export interface RapportData {
  suggestions?: string[];
}

/** Hook: Best Time. */
export interface BestTime {
  day_of_week: number;
  hour: number;
  success_rate?: number | null;
}

/** Hook: Churn Data. */
export interface ChurnData {
  risk_level: 'high' | 'medium' | 'low';
  churn_probability: number;
  recommended_actions?: string[];
}

/** Hook: DISCTips. */
export interface DISCTips {
  profile: 'D' | 'I' | 'S' | 'C';
  name: string;
  communication_tips?: string[];
  avoid?: string[];
  keywords_to_use?: string[];
  keywords_to_avoid?: string[];
}

/** Hook: use Contact Intelligence. */
export function useContactIntelligence(contactId: string) {
  return useContactIntelligenceManagement(contactId);
}
