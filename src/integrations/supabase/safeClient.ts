import { supabase as _supabase } from './client';
import { getLogger } from '@/lib/logger';
import { PostgrestError } from '@supabase/supabase-js';

const supabase = _supabase;

// ---------------------------------------------------------------------------
// QueryCallback — tipo para o callback passado a safeClient.from() e
// safeClient.single().
//
// Por que não usar ReturnType<typeof supabase.from> como retorno?
//   supabase.from(<tableName>) → PostgrestQueryBuilder
//   query.select().eq()...    → PostgrestFilterBuilder  (subclasse diferente)
//   FilterBuilder NÃO estende QueryBuilder → TS2739 em todos os callsites.
//
// Solução: anotar o retorno do callback como PromiseLike<{data,error}>, que
// é a interface comum que QUALQUER builder supabase implementa ao ser `await`ed.
// Isso é semanticamente correto: só precisamos que o callback retorne algo
// que, ao ser awaited, devolva { data, error }. O runtime já faz `await cb(q)`.
// ---------------------------------------------------------------------------
type AnyQueryResult = PromiseLike<{ data: unknown; error: PostgrestError | null }>;
const _log = getLogger('safeClient');