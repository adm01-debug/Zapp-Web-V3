// Rich Contact Intelligence hook.
// Derives briefing / triggers / rapport / best_times / churn / disc_tips from
// zapp.contact_intelligence + basic message stats. Falls back gracefully when
// data is missing so the panel always renders a usable state.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import { isValidUUID } from '@/utils/uuid';

type ResolvedIdent = { kind: 'uuid'; value: string } | { kind: 'phone'; value: string };

/**
 * Resolve o identificador recebido (uuid de contato OU telefone) num filtro
 * PostgREST valido.
 *
 * Motivo: `contact_intelligence.contact_id` e `uuid` e `evolution_messages`
 * nao possui coluna `phone`. Interpolar um telefone (ou o sentinela
 * 'unknown') em `contact_id.eq.` gera HTTP 400 (22P02 invalid input syntax
 * for type uuid); filtrar por `phone` numa relacao que nao tem essa coluna
 * gera HTTP 400 (42703 column does not exist).
 *
 * Retorna `null` quando o valor nao e consultavel -- nesse caso a query e
 * pulada em vez de disparar um 400. Era exatamente o que faltava: o request
 * `?or=(phone.eq.unknown)` visto em producao nascia de um sentinela textual
 * que passava direto pelo `isValidUUID` e virava filtro por telefone.
 */
function resolveIdentifier(value?: string): ResolvedIdent | null {
  const raw = (value ?? '').trim();
  if (!raw || raw.toLowerCase() === 'unknown') return null;
  // `isValidUUID` e declarado como type guard `value is string`. Aplicado
  // direto num valor ja tipado `string`, ele estreita o ramo negativo para
  // `never` e quebra o `raw.replace` abaixo. Guardar em `boolean` descarta o
  // guard e preserva o tipo.
  const looksLikeUuid: boolean = isValidUUID(raw);
  if (looksLikeUuid) return { kind: 'uuid', value: raw };
  // Normaliza: remove '+', espacos, parenteses e hifens antes de comparar.
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  return { kind: 'phone', value: sanitizePostgrestFilter(digits) };
}

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

export interface ContactIntelligenceView {
  found: boolean;
  briefing: ContactBriefing;
  triggers: MentalTrigger[];
  rapport: RapportData;
  best_times: BestTime[];
  churn: ChurnData | null;
  disc_tips: DISCTips | null;
}

interface RawIntel {
  contact_id?: string;
  sentiment?: string | null;
  engagement_score?: number | null;
  predicted_value?: number | null;
  risk_level?: string | null;
  disc_profile?: string | null;
  last_contact_at?: string | null;
  total_interactions?: number | null;
  relationship_score?: number | null;
}

const DISC_TEMPLATES: Record<'D' | 'I' | 'S' | 'C', DISCTips> = {
  D: {
    profile: 'D',
    name: 'Dominante',
    communication_tips: ['Seja direto e objetivo', 'Foque em resultados', 'Evite rodeios'],
    keywords_to_use: ['resultado', 'eficiência', 'decisão', 'rápido'],
    keywords_to_avoid: ['talvez', 'depende', 'quem sabe'],
  },
  I: {
    profile: 'I',
    name: 'Influente',
    communication_tips: ['Seja caloroso e entusiasta', 'Use histórias', 'Reconheça a pessoa'],
    keywords_to_use: ['juntos', 'incrível', 'novidade', 'você'],
    keywords_to_avoid: ['dados', 'análise fria', 'restrições'],
  },
  S: {
    profile: 'S',
    name: 'Estável',
    communication_tips: ['Seja paciente e cordial', 'Explique passo a passo', 'Ofereça segurança'],
    keywords_to_use: ['tranquilo', 'apoio', 'estabilidade', 'confiança'],
    keywords_to_avoid: ['urgente', 'pressão', 'mudança brusca'],
  },
  C: {
    profile: 'C',
    name: 'Consciente',
    communication_tips: ['Use dados e evidências', 'Seja preciso', 'Respeite o processo'],
    keywords_to_use: ['dados', 'processo', 'qualidade', 'evidência'],
    keywords_to_avoid: ['achismo', 'talvez', 'improviso'],
  },
};

function buildDisc(raw: RawIntel | null): DISCTips | null {
  const key = (raw?.disc_profile || '').toUpperCase();
  if (key === 'D' || key === 'I' || key === 'S' || key === 'C') return DISC_TEMPLATES[key];
  return null;
}

function buildChurn(raw: RawIntel | null): ChurnData | null {
  if (!raw?.risk_level && raw?.engagement_score == null) return null;
  const engagement = raw?.engagement_score ?? 50;
  const level = (raw?.risk_level || '').toLowerCase();
  const risk_level: ChurnData['risk_level'] =
    level === 'high' || engagement < 30
      ? 'high'
      : level === 'medium' || engagement < 60
        ? 'medium'
        : 'low';
  const churn_probability = Math.max(0, Math.min(100, 100 - engagement));
  const recommended_actions =
    risk_level === 'high'
      ? ['Priorize contato imediato e ofereça benefício exclusivo.']
      : risk_level === 'medium'
        ? ['Reforce valor entregue e agende follow-up.']
        : ['Mantenha cadência de relacionamento atual.'];
  return { risk_level, churn_probability, recommended_actions };
}

function buildTriggers(raw: RawIntel | null): MentalTrigger[] {
  if (!raw) return [];
  const triggers: MentalTrigger[] = [];
  const engagement = raw.engagement_score ?? 50;
  if (engagement >= 70) {
    triggers.push({
      trigger_name: 'Compromisso',
      category: 'commitment',
      description: 'Cliente engajado — reforce pequenos compromissos para consolidar decisão.',
      examples: ['Podemos confirmar para amanhã?'],
    });
  }
  if ((raw.risk_level || '').toLowerCase() === 'high') {
    triggers.push({
      trigger_name: 'Escassez',
      category: 'scarcity',
      description: 'Sinalize oportunidade limitada para reativar interesse.',
      examples: ['Últimas unidades desta condição.'],
    });
  }
  if ((raw.sentiment || '').toLowerCase() === 'positive') {
    triggers.push({
      trigger_name: 'Reciprocidade',
      category: 'reciprocity',
      description: 'Ofereça um bônus/atenção especial para manter reciprocidade.',
      examples: ['Separei um bônus exclusivo para você.'],
    });
  }
  triggers.push({
    trigger_name: 'Autoridade',
    category: 'authority',
    description: 'Cite cases, números e certificações para aumentar credibilidade.',
    examples: ['Mais de 500 empresas já usam nossa solução.'],
  });
  return triggers;
}

function buildRapport(raw: RawIntel | null): RapportData {
  const suggestions: string[] = [];
  const sentiment = (raw?.sentiment || '').toLowerCase();
  if (sentiment === 'positive')
    suggestions.push('Reforce o clima positivo com uma pergunta aberta sobre o dia dele.');
  if (sentiment === 'negative')
    suggestions.push('Reconheça a insatisfação e demonstre empatia antes de propor solução.');
  suggestions.push('Personalize a saudação usando o primeiro nome.');
  return { suggestions };
}

function buildBriefing(
  raw: RawIntel | null,
  totalMessages: number,
  lastAt: Date | null
): ContactBriefing {
  const days =
    lastAt != null ? Math.floor((Date.now() - lastAt.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const relationship_score =
    raw?.relationship_score ??
    (raw?.engagement_score != null ? Math.round(raw.engagement_score) : null);
  const opening_tip =
    days != null && days > 30
      ? 'Cliente sem contato há tempo — resgate com mensagem personalizada.'
      : days != null && days <= 1
        ? 'Conversa recente — dê continuidade natural ao último tópico.'
        : 'Inicie com pergunta aberta relacionada à necessidade principal.';
  const risk_alert =
    (raw?.risk_level || '').toLowerCase() === 'high'
      ? 'Alto risco de churn detectado — priorize esta conversa.'
      : null;
  return {
    opening_tip,
    risk_alert,
    days_since_last_contact: days,
    total_interactions: totalMessages,
    relationship_score,
  };
}

/** Hook: use Contact Intelligence (rich view). */
export function useContactIntelligence(contactIdOrPhone?: string) {
  const enabled = !!contactIdOrPhone;

  const { data, isLoading } = useQuery<ContactIntelligenceView | null>({
    queryKey: ['contact-intelligence-view', contactIdOrPhone],
    queryFn: async () => {
      if (!contactIdOrPhone) return null;

      const ident = resolveIdentifier(contactIdOrPhone);
      if (!ident) return null;

      let raw: RawIntel | null = null;
      try {
        // supabase-js NAO lanca excecao em erro HTTP: e obrigatorio checar
        // `error`, senao um 400 vira `data: null` silencioso -- foi exatamente
        // isso que manteve este bug invisivel em producao.
        const { data: intel, error } = await supabase
          .from('contact_intelligence' as never)
          .select('*')
          .or(
            ident.kind === 'uuid'
              ? `contact_id.eq.${ident.value}`
              : `phone.eq.${ident.value}`
          )
          .limit(1)
          .maybeSingle();
        if (error) log.warn('contact_intelligence lookup failed:', error.message);
        raw = (intel ?? null) as unknown as RawIntel | null;
      } catch (err) {
        log.warn('contact_intelligence lookup threw:', err);
      }

      let totalMessages = raw?.total_interactions ?? 0;
      let lastAt: Date | null = raw?.last_contact_at ? new Date(raw.last_contact_at) : null;

      if (!totalMessages || !lastAt) {
        try {
          // `evolution_messages` nao tem coluna `phone`: por telefone o vinculo
          // correto e `remote_jid`. O prefixo com LIKE cobre os dois sufixos que
          // coexistem no banco -- `@s.whatsapp.net` e `@lid` -- e continua
          // sargable (prefixo fixo, curinga so no fim).
          const { data: msgs, count, error } = await supabase
            .from('evolution_messages' as never)
            .select('created_at', { count: 'exact', head: false })
            .or(
              ident.kind === 'uuid'
                ? `contact_id.eq.${ident.value}`
                : `remote_jid.like.${ident.value}@*`
            )
            .order('created_at', { ascending: false })
            .limit(1);
          if (error) log.warn('messages stats lookup failed:', error.message);
          if (count != null) totalMessages = totalMessages || count;
          const rows = (msgs ?? []) as Array<{ created_at?: string }>;
          if (!lastAt && rows[0]?.created_at) lastAt = new Date(rows[0].created_at);
        } catch (err) {
          log.warn('messages stats lookup skipped:', err);
        }
      }

      const found = !!raw || totalMessages > 0;
      return {
        found,
        briefing: buildBriefing(raw, totalMessages, lastAt),
        triggers: buildTriggers(raw),
        rapport: buildRapport(raw),
        best_times: [],
        churn: buildChurn(raw),
        disc_tips: buildDisc(raw),
      };
    },
    enabled,
    staleTime: 60_000,
  });

  return { intelligence: data ?? null, loading: isLoading };
}
