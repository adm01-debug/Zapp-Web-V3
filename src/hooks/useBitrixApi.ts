// useBitrixApi — Bitrix24 CRM integration hook
import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useBitrixApi');

type BitrixResult<T = unknown> = { data: T | null; success: boolean; error?: string };

/** Invokes the Bitrix24 edge function with a given action and payload. Throws on HTTP or API-level errors. */
async function callBitrix<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<BitrixResult<T>> {
  const { data, error } = await supabase.functions.invoke('bitrix-api', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message ?? String(error));
  if (data?.error) throw new Error(data.error);
  return { data: data?.data ?? data ?? null, success: true };
}

/** Hook exposing typed Bitrix24 CRM operations (leads, contacts, deals, calls, sync). Loading is shared across concurrent requests — clears only when all finish. */
export function useBitrixApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(0);

  const wrap = <T = unknown, Args extends unknown[] = []>(
    fn: (...args: Args) => Promise<BitrixResult<T>>
  ) =>
    async (...args: Args): Promise<BitrixResult<T> | null> => {
      activeRef.current += 1;
      setLoading(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        log.error('Bitrix API error', err);
        return null;
      } finally {
        activeRef.current -= 1;
        if (activeRef.current === 0) setLoading(false);
      }
    };

  // Leads
  const listLeads = wrap(() => callBitrix('list', { entityType: 'lead' }));
  const getLead = wrap((id: string) => callBitrix('getLead', { id }));
  const createLead = wrap((data: Record<string, unknown>) => callBitrix('createLead', data));
  const updateLead = wrap((id: string, data: Record<string, unknown>) => callBitrix('updateLead', { id, ...data }));
  const deleteLead = wrap((id: string) => callBitrix('deleteLead', { id }));

  // Contacts
  const listContacts = wrap(() => callBitrix('listContacts'));
  const getContact = wrap((id: string) => callBitrix('getContact', { id }));
  const createContact = wrap((data: Record<string, unknown>) => callBitrix('createContact', data));

  // Deals
  const listDeals = wrap(() => callBitrix('listDeals'));
  const getDeal = wrap((id: string) => callBitrix('getDeal', { id }));
  const createDeal = wrap((data: Record<string, unknown>) => callBitrix('createDeal', data));

  // Calls
  const registerCall = wrap((data: Record<string, unknown>) => callBitrix('registerCall', data));
  const finishCall = wrap((callId: string, data?: Record<string, unknown>) =>
    callBitrix('finishCall', { callId, ...(data ?? {}) })
  );
  const attachCallRecord = wrap((callId: string, recordUrl: string) =>
    callBitrix('attachCallRecord', { callId, recordUrl })
  );

  // Sync
  const syncContactsFromBitrix = wrap(() => callBitrix('syncContacts'));
  const pushContactToBitrix = wrap((contactId: string) => callBitrix('pushContact', { contactId }));
  const createLeadFromConversation = wrap((conversationId: string) =>
    callBitrix('createLeadFromConversation', { conversationId })
  );

  return {
    loading,
    error,
    listLeads,
    getLead,
    createLead,
    updateLead,
    deleteLead,
    listContacts,
    getContact,
    createContact,
    listDeals,
    getDeal,
    createDeal,
    registerCall,
    finishCall,
    attachCallRecord,
    syncContactsFromBitrix,
    pushContactToBitrix,
    createLeadFromConversation,
  };
}
