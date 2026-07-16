import { useState, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import { toast } from 'sonner';
import { newRequestId } from '@/lib/withRequestId';
import { z } from 'zod';
import {
  createCriticalPayloadSchemas,
  mapValidationIssuesToContractError,
} from '@/shared/criticalPayloadSchemas';
import { dbFrom } from '@/integrations/datasource/db';
import { evolutionInstanceName } from '@/lib/evolutionInstance';

interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

export function useNewConversation(
  open: boolean,
  onConversationStarted?: (contactId: string) => void,
  onClose?: () => void
) {
  const { sendTextPayloadSchema } = createCriticalPayloadSchemas(z);
  const mounted = useMountedRef();
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [connections, setConnections] = useState<
    { id: string; name: string; instance_id: string | null }[]
  >([]);
  const [selectedConnection, setSelectedConnection] = useState('');

  useEffect(() => {
    if (!open) return;
    supabase
      .from('whatsapp_connections')
      .select('id, name, instance_id')
      .eq('status', 'connected')
      .then(
        ({ data }) => {
          if (data && data.length > 0 && mounted.current) {
            setConnections(data);
            setSelectedConnection(data[0].id);
          }
        },
        () => {}
      );
  }, [open, mounted]);

  useEffect(() => {
    if (!searchQuery.trim() || mode !== 'search') {
      setContacts([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      const { data, error: _error } = await supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .or(
          `name.ilike.%${sanitizePostgrestFilter(searchQuery)}%,phone.ilike.%${sanitizePostgrestFilter(searchQuery)}%`
        )
        .limit(10);
      if (!mounted.current) return;
      setContacts(data || []);
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, mode]);

  const resetForm = () => {
    setSearchQuery('');
    setSelectedContact(null);
    setNewPhone('');
    setNewName('');
    setMessageText('');
    setMode('search');
  };

  const handleSend = async () => {
    if (!messageText.trim()) {
      toast.error('Digite uma mensagem');
      return;
    }
    setIsSending(true);
    try {
      let contactId = selectedContact?.id;
      if (mode === 'new' && !contactId) {
        if (!newPhone.trim()) {
          toast.error('Informe o número do telefone');
          setIsSending(false);
          return;
        }
        const cleanedNewPhone = newPhone.trim().replace(/\D/g, '');
        const { data: existing } = await dbFrom('contacts')
          .select('id, name')
          .eq('phone', cleanedNewPhone)
          .maybeSingle();
        if (existing) {
          toast.error(`Já existe um contato com este número: ${existing.name}`);
          setIsSending(false);
          return;
        }
        const { data: newContact, error: newContactErr } = await dbFrom('contacts')
          .insert({
            name: newName.trim() || cleanedNewPhone,
            phone: cleanedNewPhone,
            whatsapp_connection_id: selectedConnection || null,
          })
          .select('id')
          .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;
        if (newContactErr) {
          if (newContactErr.code === '23505') {
            toast.error('Já existe um contato com este número de telefone.');
            setIsSending(false);
            return;
          }
          throw newContactErr;
        }
        contactId = newContact.id;
        await supabase.functions.invoke('batch-fetch-avatars');
      }
      if (!contactId) {
        toast.error('Selecione um contato');
        setIsSending(false);
        return;
      }
      const _conn = connections.find((c) => c.id === selectedConnection);
      const _evoName = _conn ? evolutionInstanceName(_conn) : null;
      if (!_evoName) {
        toast.error(
          'Conexão WhatsApp sem nome de instância válido. Reconecte a instância e tente novamente.'
        );
        setIsSending(false);
        return;
      }
      const trace = newRequestId('new-conv');
      const { error: msgError } = await dbFrom('messages').insert({
        contact_id: contactId,
        content: messageText.trim(),
        sender: 'agent',
        message_type: 'text',
        status: 'sending',
        whatsapp_connection_id: selectedConnection || null,
        request_id: trace.requestId,
      });
      if (msgError) throw msgError;
      const rawSendPayload = {
        instanceName: _evoName,
        number: selectedContact?.phone || newPhone,
        text: messageText.trim(),
      };
      const sendValidation = sendTextPayloadSchema.safeParse(rawSendPayload);
      if (!sendValidation.success) {
        const mapped = mapValidationIssuesToContractError(sendValidation.error.issues);
        toast.error(`${mapped.message} (código: ${mapped.code})`);
        setIsSending(false);
        return;
      }
      await supabase.functions.invoke('evolution-api', {
        body: { action: 'send-text', ...sendValidation.data },
        headers: trace.headers,
      });
      toast.success('Mensagem enviada!');
      await supabase.functions.invoke('batch-fetch-avatars');
      onConversationStarted?.(contactId);
      onClose?.();
      resetForm();
    } catch {
      toast.error('Erro ao enviar mensagem');
    } finally {
      setIsSending(false);
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    contacts,
    selectedContact,
    setSelectedContact,
    newPhone,
    setNewPhone,
    newName,
    setNewName,
    messageText,
    setMessageText,
    isLoading,
    isSending,
    mode,
    setMode,
    connections,
    selectedConnection,
    setSelectedConnection,
    handleSend,
    resetForm,
  };
}
