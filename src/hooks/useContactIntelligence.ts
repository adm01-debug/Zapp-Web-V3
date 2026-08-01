// Rich Contact Intelligence hook.
// Derives briefing / triggers / rapport / best_times / churn / disc_tips from
// zapp.contact_intelligence + basic message stats. Falls back gracefully when
// data is missing so the panel always renders a usable state.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ContactIntelligenceRow } from '@/integrations/supabase/types-manual';
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
  // Aceita a partir de 8 digitos (numero local sem DDI/DDD) -- o lookup em
  // `contact_intelligence` e BARATO (tabela pequena) e deve rodar para
  // qualquer phone. O guard de LID (14+ digitos) aplica-se SOMENTE a query
  // pesada de `evolution_messages` (ver call-site) -- bloquear aqui deixaria
  // 27% dos contatos (LIDs com dados em contact_intelligence) sem briefing.
  if (digits.length < 8) return null;
  return { kind: 'phone', value: sanitizePostgrestFilter(digits) };
}

/**
 * Detecta TimeoutError do fetch/supabase-js: o erro chega com
 * `name === 'TimeoutError'` (undici/fetch) ou mensagem de timeout/abort.
 * Usado para logar com `log.error` (Sentry) em vez de `log.warn` generico.
 */
function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'TimeoutError' ||
    /timeout|timed ?out|ETIMEDOUT|aborted?/i.test(err.message)
  );
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

/**
 * RawIntel = campos de zapp.contact_intelligence usados pelo hook, derivados
 * do tipo verificado ContactIntelligenceRow (espelho do information_schema).
 * Todos os campos opcionais para tolerar linhas parcialmente nulas.
 * NAO adicionar colunas que nao existem no banco: o TS agora valida (a
 * interface espelha o tipo real, nao ha mais cast `as never` escondendo).
 */
type RawIntel = Pick<
  ContactIntelligenceRow,
  | 'contact_id'
  | 'sentiment'
  | 'engagement_score'
  | 'predicted_value'
  | 'risk_level'
  | 'disc_profile'
  | 'total_messages'
  | 'days_since_contact'
> & {
  [K in keyof ContactIntelligenceRow]?: ContactIntelligenceRow[K] | null;
};

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
  if (key === 'D' || key === 'I' || key === 'S' || key === 'C') return DISC_TEMPLATES[key as keyof typeof DISC_TEMPLATES];
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
    raw?.engagement_score != null ? Math.round(raw.engagement_score) : null;
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
          // `as never` e obrigatorio: o schema zapp nao esta no types.ts gerado
          // (debito documentado em types-manual.ts). O TIPO DO RESULTADO usa
          // ContactIntelligenceRow (espelho verificado) -- coluna inexistente
          // como total_interactions agora quebra o typecheck.
          .from('contact_intelligence' as never)
          .select('*')
          .or(ident.kind === 'uuid' ? `contact_id.eq.${ident.value}` : `phone.eq.${ident.value}`)
          .limit(1)
          .maybeSingle();
        if (error) log.warn('contact_intelligence lookup failed:', error.message);
        raw = (intel ?? null) as unknown as RawIntel | null; // ignore-audit — ponte intencional: Row do PostgREST (schema zapp fora do types gerado) → RawIntel verificado
      } catch (err) {
        log.warn('contact_intelligence lookup threw:', err);
      }

      const totalMessages = raw?.total_messages ?? 0;
      // days_since_contact e o campo real (dias); converter em data aproximada
      // para manter o contrato de buildBriefing (que calcula days a partir de lastAt).
      let lastAt: Date | null =
        raw?.days_since_contact != null
          ? new Date(Date.now() - raw.days_since_contact * 24 * 60 * 60 * 1000)
          : null;

      // F1 (revisao Claude): o fallback so tem efeito em `lastAt` (o count saiu
      // no PR #645 e a linha 351 so escreve lastAt). Quando days_since_contact
      // ja preencheu lastAt, rodar a query pesada e trabalho jogado fora.
      if (!lastAt) {
        // Guard de LID aplicado AQUI (query pesada em evolution_messages, 23+
        // particoes): phone com 14+ digitos nao e DDI+DDD+numero BR -- e LID do
        // WhatsApp (ex.: '551199384518134' tem 15) e nunca existira como
        // remote_jid sargable; pular evita varredura inutil. O mesmo guard
        // (10-13 digitos) cobre numeros curtos sem DDI, que tambem nao existem
        // como remote_jid. O lookup barato em contact_intelligence (acima) JA
        // rodou para qualquer phone >= 8.
        const phoneDigits = ident.kind === 'phone' ? ident.value : null;
        const isLid = phoneDigits != null && (phoneDigits.length > 13 || phoneDigits.length < 10);
        if (!isLid) {
        try {
          // `evolution_messages` nao tem coluna `phone`: por telefone o vinculo
          // correto e `remote_jid`. Os dois sufixos que coexistem no banco sao
          // cobertos com igualdade exata via `.in()`: `@s.whatsapp.net` e `@lid`.
          // IMPORTANTE: NUNCA voltar para LIKE de prefixo aqui -- `remote_jid`
          // tem collation nao-C, entao `LIKE '...%@'` nao usa indice e o Postgres
          // varre TODAS as 25+ particoes (EXPLAIN confirmado: Index Scan em
          // pidx_msgs_created_at em todas com Filter remote_jid LIKE), causando
          // TimeoutError de 12s em producao. Igualdade exata e sargable e usa o
          // indice btree (remote_jid, created_at DESC) que ja existe nas particoes.
          // A contagem exata (count) do PostgREST tambem conta TODAS as linhas e
          // anula o `limit(1)` -- o total decorativo ja vem de
          // contact_intelligence.total_messages (coluna real; total_interactions
          // nao existe no schema e era lido como 0).
          let query = supabase
            .from('evolution_messages' as never)
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1);
          if (ident.kind === 'uuid') {
            query = query.eq('contact_id', ident.value);
          } else {
            query = query.in('remote_jid', [
              `${ident.value}@s.whatsapp.net`,
              `${ident.value}@lid`,
            ]);
          }
          const { data: msgs, error } = await query;
          if (error) {
            // postgrest-js NUNCA lanca TimeoutError: ele captura erros de fetch
            // (incluindo AbortError/TimeoutError) e os devolve no campo `error`.
            // Sem esta checagem o timeout de producao vira apenas um warn.
            if (/timeout|aborted|fetch/i.test(error.message ?? '')) {
              log.error('messages stats lookup timed out (evolution_messages scan):', error);
            } else {
              log.warn('messages stats lookup failed:', error.message);
            }
          }
          const rows = (msgs ?? []) as Array<{ created_at?: string }>;
          if (!lastAt && rows[0]?.created_at) lastAt = new Date(rows[0].created_at);
        } catch (err) {
          if (isTimeoutError(err)) {
            log.error('messages stats lookup timed out (evolution_messages scan):', err);
          } else {
            log.warn('messages stats lookup skipped:', err);
          }
        }
        } // !isLid
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
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  return { intelligence: data ?? null, loading: isLoading };
}
