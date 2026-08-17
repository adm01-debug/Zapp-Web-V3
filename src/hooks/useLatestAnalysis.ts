// useLatestAnalysis (GAP-6 / Etapa 66): análise real via RPC zapp.rpc_latest_contact_analysis.
// Substitui o stub que retornava `null` sempre. A RPC é SECURITY DEFINER no schema
// zapp e devolve um envelope JSON com dados reais (conversation_analyses,
// ai_conversation_tags, conversation_events, conversation_sla) — ou NULL (vazio
// honesto). Estados honestos: loading / error (nunca engolido) / empty (sem erro).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

/** Tipo de análise de sentimento/urgência exposto para a UI. */
export interface ContactAnalysis {
  sentiment: 'positivo' | 'neutro' | 'negativo' | 'critico';
  urgency?: 'baixa' | 'media' | 'alta' | 'critica';
  summary?: string;
  department?: string;
}

/** Normaliza valores PT/EN vindos do banco para o vocabulário da UI. */
const SENTIMENT_MAP: Record<string, ContactAnalysis['sentiment']> = {
  positivo: 'positivo',
  positive: 'positivo',
  satisfeito: 'positivo',
  neutro: 'neutro',
  neutral: 'neutro',
  negativo: 'negativo',
  negative: 'negativo',
  critico: 'critico',
  critical: 'critico',
  'muito negativo': 'critico',
};

const URGENCY_MAP: Record<string, ContactAnalysis['urgency']> = {
  baixa: 'baixa',
  low: 'baixa',
  media: 'media',
  medium: 'media',
  alta: 'alta',
  high: 'alta',
  critica: 'critica',
  critical: 'critica',
  urgente: 'critica',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Normaliza o payload da RPC em ContactAnalysis.
 * Aceita o envelope `{ analysis: {...}, ... }` da RPC real ou um payload plano
 * (contrato do teste). Retorna null quando não há análise utilizável.
 */
export function toContactAnalysis(raw: unknown): ContactAnalysis | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const analysisRec = asRecord(rec.analysis) ?? rec;

  const rawSentiment =
    typeof analysisRec.sentiment === 'string' ? analysisRec.sentiment.toLowerCase() : null;
  const rawUrgency =
    typeof analysisRec.urgency === 'string' ? analysisRec.urgency.toLowerCase() : null;
  const summary = typeof analysisRec.summary === 'string' ? analysisRec.summary : undefined;
  const department =
    typeof analysisRec.department === 'string' ? analysisRec.department : undefined;

  // Sem sentimento nem resumo não há análise utilizável para a UI.
  if (!rawSentiment && !summary) return null;

  return {
    sentiment: (rawSentiment && SENTIMENT_MAP[rawSentiment]) || 'neutro',
    urgency: rawUrgency ? URGENCY_MAP[rawUrgency] : undefined,
    summary: summary || undefined,
    department: department || undefined,
  };
}

/** React hook: retorna a última análise de um contato. */
export function useLatestAnalysis(contactId: string | null | undefined) {
  const { data: analysis = null, isLoading: loading, error } = useQuery({
    queryKey: ['latest-analysis', contactId ?? null] as const,
    queryFn: async (): Promise<ContactAnalysis | null> => {
      if (!contactId) return null;

      const { data, error: rpcError } = await supabase.rpc('rpc_latest_contact_analysis', {
        p_contact_id: contactId,
      });

      if (rpcError) {
        // Nunca engolir falha como null mudo — expõe a mensagem real.
        log.warn('rpc_latest_contact_analysis failed', { error: rpcError.message });
        throw new Error(rpcError.message || 'Falha ao carregar análise do contato');
      }

      return toContactAnalysis(data);
    },
    enabled: !!contactId,
    staleTime: Infinity,
  });

  return { analysis, loading, error: error ?? null };
}
