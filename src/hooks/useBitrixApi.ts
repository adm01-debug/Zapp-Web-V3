// useBitrixApi — Bitrix24 CRM integration hook
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useBitrixApi');

type BitrixResult<T = unknown> = { data: T | null; success: boolean; error?: string };

async function callBitrix<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<BitrixResult<T>> {
  const { data, error } = await supabase.functions.invoke('bitrix-api', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message ?? String(error));
  if (data?.error) throw new Error(data.error);
  return { data: data?.data ?? data ?? null, success: true };
}

export function useBitrixApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrap = <T = unknown>(fn: () => Promise<BitrixResult<T>>) => async (): Promise<BitrixResult<T> | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      log.error('Bitrix API error', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Leads
  const listLeads = wrap(() => callBitrix('list', { entityType: 'lead' }));
  const getLead = wrap<unknown>(() => callBitrix('getLead'));
  const createLead = wrap(() => callBitrix('createLead'));
  const updateLead = wrap(() => callBitrix('updateLead'));
  const deleteLead = wrap(() => callBitrix('deleteLead'));

  // Contacts
  const listContacts = wrap(() => callBitrix('listContacts'));
  const getContact = wrap(() => callBitrix('getContact'));
  const createContact = wrap(() => callBitrix('createContact'));

  // Deals
  const listDeals = wrap(() => callBitrix('listDeals'));
  const getDeal = wrap(() => callBitrix('getDeal'));
  const createDeal = wrap(() => callBitrix('createDeal'));

  // Calls
  const registerCall = wrap(() => callBitrix('registerCall'));
  const finishCall = wrap(() => callBitrix('finishCall'));
  const attachCallRecord = wrap(() => callBitrix('attachCallRecord'));

  // Sync
  const syncContactsFromBitrix = wrap(() => callBitrix('syncContacts'));
  const pushContactToBitrix = wrap(() => callBitrix('pushContact'));
  const createLeadFromConversation = wrap(() => callBitrix('createLeadFromConversation'));

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
