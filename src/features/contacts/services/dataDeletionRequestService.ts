import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/schema';

/**
 * SEGURANCA-10: cria pedido real em `data_deletion_requests` (LGPD right to be
 * forgotten), processável pelo admin. Service de domínio contacts — a UI não
 * acessa o supabase diretamente (check-data-layer: components/pages com teto 0).
 */

export interface DataDeletionRequestInput {
  user_id: string;
  reason: string;
  status: string;
  metadata: Json;
}

export async function createDataDeletionRequest(input: DataDeletionRequestInput): Promise<void> {
  const { error } = await supabase.from('data_deletion_requests').insert(input);
  if (error) throw error;
}
