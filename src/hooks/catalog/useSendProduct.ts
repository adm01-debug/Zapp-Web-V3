import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';
import { extractEvolutionMessageId } from '@/lib/evolutionMessageId';
import { dbFrom } from '@/integrations/datasource/db';

const log = getLogger('useSendProduct');

export interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

export function useContactSearch(step: 'configure' | 'selectContact') {
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);

  useEffect(() => {
    if (step !== 'selectContact' || !contactSearch.trim()) {
      setContactResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingContacts(true);
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`)
        .limit(15);
      setContactResults(data || []);
      setSearchingContacts(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [contactSearch, step]);

  useEffect(() => {
    if (step !== 'selectContact') return;
    setSearchingContacts(true);
    dbFrom('contacts')
      .select('id, name, phone, avatar_url')
      .order('updated_at', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        if (!contactSearch.trim()) setContactResults(data || []);
        setSearchingContacts(false);
      });
  }, [step]);

  const resetContactSelection = useCallback(() => {
    setSelectedContact(null);
    setContactSearch('');
  }, []);

  return {
    contactSearch, setContactSearch,
    contactResults, searchingContacts,
    selectedContact, setSelectedContact,
    resetContactSelection,
  };
}

export function useSendToContact(onSuccess: () => void) {
  const [isSending, setIsSending] = useState(false);

  const sendProductToContact = useCallback(async (
    contact: ContactResult,
    message: string,
    imageUrls: string[],
  ) => {
    setIsSending(true);
    try {
      const { data: connections , error: connectionsErr } = await supabase
        .from('whatsapp_connections')
        .select('id, name')
        .eq('status', 'connected')
        .limit(1);

      const connection = connections?.[0];

      for (const imgUrl of imageUrls) {
        const { data: dbResult } = await supabase.from('messages').insert({
          contact_id: contact.id,
          content: imgUrl,
          sender: 'agent',
          message_type: 'image',
          status: 'sending',
          whatsapp_connection_id: connection?.id || null,
        }).select('id').single();

        const { data: apiResult } = await supabase.functions.invoke('evolution-api', {
          body: {
            action: 'send-media',
            instanceName: connection?.name || 'wpp2',
            number: contact.phone,
            mediatype: 'image',
            media: imgUrl,
            caption: '',
          }
        });

        const externalId = extractEvolutionMessageId(apiResult);
        if (dbResult?.id && externalId) {
          await dbFrom('messages')
            .update({ external_id: externalId, status: 'sent' })
            .eq('id', dbResult.id);
        }
      }

      const { data: textDbResult } = await supabase.from('messages').insert({
        contact_id: contact.id,
        content: message,
        sender: 'agent',
        message_type: 'text',
        status: 'sending',
        whatsapp_connection_id: connection?.id || null,
      }).select('id').single();

      const { data: textApiResult } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send-text',
          instanceName: connection?.name || 'wpp2',
          number: contact.phone,
          text: message,
        }
      });

      const textExternalId = extractEvolutionMessageId(textApiResult);
      if (textDbResult?.id && textExternalId) {
        await dbFrom('messages')
          .update({ external_id: textExternalId, status: 'sent' })
          .eq('id', textDbResult.id);
      }

      toast({ title: '✅ Produto enviado!', description: `Enviado para ${contact.name}` });
      onSuccess();
    } catch (err) {
      log.error('Error sending product:', err);
      toast({ title: 'Erro ao enviar produto', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [onSuccess]);

  return { isSending, sendProductToContact };
}
