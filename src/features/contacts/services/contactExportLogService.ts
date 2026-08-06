import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/schema';

/**
 * Registra exportação de contatos em `contact_export_log` (rastreabilidade de
 * exportação CSV). Service de domínio contacts — a UI não acessa o supabase
 * diretamente (check-data-layer: components/pages com teto 0).
 */

export interface ContactExportLogInput {
  user_id: string | null;
  row_count: number;
  filters: Json;
}

export async function logContactExport(input: ContactExportLogInput): Promise<void> {
  const { error } = await supabase.from('contact_export_log').insert({
    user_id: input.user_id,
    exported_by: input.user_id,
    export_type: 'csv',
    row_count: input.row_count,
    status: 'completed',
    filters: input.filters,
  });
  if (error) throw error;
}
