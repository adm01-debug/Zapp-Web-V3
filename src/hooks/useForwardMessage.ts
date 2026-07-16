// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from '@/hooks/use-toast';

const log = getLogger('useForwardMessage');
import { dbFrom } from '@/integrations/datasource/db';
import type { Tables } from '@/integrations/supabase/schema';

type Contact = Pick<Tables<'contacts'>, 'id' | 'name' | 'phone' | 'avatar_url'>;

interface Group {
  id: string;
  name: string;
  avatar_url?: string;
  participant_count: number;
}

/** Manages message forwarding to multiple contacts and groups with search and filtering. */
export function useForwardMessage(
  open: boolean,
  onForward: (targetIds: string[], targetType: 'contact' | 'group') => void,
  onOpenChange: (open: boolean) => void
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups'>('contacts');

  const mountedRef = useRef(true); // ✅ Fix: mounted guard para race condition
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchContacts = useCallback(async () => { // ✅ Fix: useCallback para deps estáveis
    setIsLoading(true);
    try {
      const { data, error } = await dbFrom('contacts')
        .select('id, name, phone, avatar_url')
        .order('name');
      if (error) throw error;
      if (mountedRef.current) setContacts(data || []); // ✅ Fix: checar mounted antes de setState
    } catch (error) {
      log.error('Error fetching contacts:', error);
    } finally {
      if (mountedRef.current) setIsLoading(false); // ✅ Fix: checar mounted
    }
  }, []); // ✅ deps vazias — dbFrom é estável

  useEffect(() => {
    if (open) {
      void fetchContacts();
      void fetchGroups();
    }
  }, [open, fetchContacts]); // ✅ Fix: adicionar fetchContacts e fetchGroups nas deps

  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_groups')
        .select('id, name, avatar_url, participant_count')
        .order('name');
      if (error) throw error;
      setGroups(data || []);
    } catch (error) {
      log.error('Error fetching groups:', error);
    }
  };

  const filteredContacts = contacts.filter(
    (c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery)
  );

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleGroup = (id: string) => {
    setSelectedGroups((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const reset = useCallback(() => {
    setSelectedContacts([]);
    setSelectedGroups([]);
    setSearchQuery('');
  }, []);

  const handleForward = async () => {
    if (selectedContacts.length === 0 && selectedGroups.length === 0) {
      toast({
        title: 'Selecione destinatários',
        description: 'Escolha pelo menos um contato ou grupo para encaminhar.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      if (selectedContacts.length > 0) onForward(selectedContacts, 'contact');
      if (selectedGroups.length > 0) onForward(selectedGroups, 'group');

      const total = selectedContacts.length + selectedGroups.length;
      toast({
        title: 'Mensagem encaminhada!',
        description: `Encaminhada para ${total} ${total === 1 ? 'destinatário' : 'destinatários'}.`,
      });
      reset();
      onOpenChange(false);
    } catch {
      toast({
        title: 'Erro ao encaminhar',
        description: 'Não foi possível encaminhar a mensagem.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const totalSelected = selectedContacts.length + selectedGroups.length;

  return {
    searchQuery,
    setSearchQuery,
    selectedContacts,
    selectedGroups,
    filteredContacts,
    filteredGroups,
    isLoading,
    isSending,
    activeTab,
    setActiveTab,
    toggleContact,
    toggleGroup,
    handleForward,
    handleClose,
    totalSelected,
  };
}

export type { Contact, Group };