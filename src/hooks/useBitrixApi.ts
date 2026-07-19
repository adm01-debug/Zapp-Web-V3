import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useBitrixApi');

type BitrixBody = Record<string, unknown>;

export function useBitrixApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoke = useCallback(async <T = unknown>(body: BitrixBody): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('bitrix-api', { body });
      if (invokeError) {
        const msg = invokeError.message ?? String(invokeError);
        setError(msg);
        log.error('Bitrix API error', invokeError);
        return null;
      }
      if (data?.error) {
        setError(data.error);
        return null;
      }
      return data as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      log.error('Bitrix API exception', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Lead operations
  const listLeads = useCallback(() => invoke({ action: 'list', entityType: 'lead' }), [invoke]);
  const getLead = useCallback((id: number) => invoke({ action: 'get', entityType: 'lead', entityId: String(id) }), [invoke]);
  const createLead = useCallback((fields: BitrixBody) => invoke({ action: 'create', entityType: 'lead', data: fields }), [invoke]);
  const updateLead = useCallback((id: number, fields: BitrixBody) => invoke({ action: 'update', entityType: 'lead', entityId: String(id), data: fields }), [invoke]);
  const deleteLead = useCallback((id: number) => invoke({ action: 'delete', entityType: 'lead', entityId: String(id) }), [invoke]);

  // Contact operations
  const listContacts = useCallback(() => invoke({ action: 'list', entityType: 'contact' }), [invoke]);
  const getContact = useCallback((id: number) => invoke({ action: 'get', entityType: 'contact', entityId: String(id) }), [invoke]);
  const createContact = useCallback((fields: BitrixBody) => invoke({ action: 'create', entityType: 'contact', data: fields }), [invoke]);

  // Deal operations
  const listDeals = useCallback(() => invoke({ action: 'list', entityType: 'deal' }), [invoke]);
  const getDeal = useCallback((id: number) => invoke({ action: 'get', entityType: 'deal', entityId: String(id) }), [invoke]);
  const createDeal = useCallback((fields: BitrixBody) => invoke({ action: 'create', entityType: 'deal', data: fields }), [invoke]);

  // Telephony
  const registerCall = useCallback((params: BitrixBody) => invoke({ action: 'register_call', entityType: 'call', data: params }), [invoke]);
  const finishCall = useCallback((callId: string, params?: BitrixBody) => invoke({ action: 'finish_call', entityType: 'call', entityId: callId, data: params }), [invoke]);
  const attachCallRecord = useCallback((callId: string, record: BitrixBody) => invoke({ action: 'attach_record', entityType: 'call', entityId: callId, data: record }), [invoke]);

  // Sync
  const syncContactsFromBitrix = useCallback(() => invoke({ action: 'sync_contacts' }), [invoke]);
  const pushContactToBitrix = useCallback((contactId: string) => invoke({ action: 'push_contact', entityId: contactId }), [invoke]);
  const createLeadFromConversation = useCallback((conversationId: string, params?: BitrixBody) => invoke({ action: 'create_lead_from_conversation', entityId: conversationId, data: params }), [invoke]);

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
