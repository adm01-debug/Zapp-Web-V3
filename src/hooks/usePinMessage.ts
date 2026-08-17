import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { isValidUUID } from '@/features/inbox/utils/contactRef';

/**
 * usePinMessage — Fixar mensagem (Etapa 44 do plano 100 etapas).
 * Backend: zapp.pinned_messages (migration 20260817160000) — pinned_by = profile_id,
 * visível ao time que vê o contato (padrão pinned_conversations).
 */
export function usePinMessage() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !mountedRef.current) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      log.warn('[usePinMessage] loadProfile failed', error);
      return;
    }
    if (data && mountedRef.current) setProfileId(data.id);
  }, []);

  const loadPins = useCallback(async (pid: string) => {
    const { data, error } = await supabase
      .from('pinned_messages')
      .select('message_id')
      .eq('pinned_by', pid);
    if (error) {
      log.warn('[usePinMessage] load failed', error);
      return;
    }
    if (data && mountedRef.current) {
      setPinnedIds(new Set(data.map((p: { message_id: string }) => p.message_id)));
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profileId) void loadPins(profileId);
  }, [profileId, loadPins]);

  const togglePin = useCallback(async (messageId: string, contactId?: string) => {
    if (!isValidUUID(messageId)) {
      toast.error('Mensagem inválida');
      return;
    }
    if (!profileId) {
      toast.error('Perfil não carregado');
      return;
    }

    const isPinned = pinnedIds.has(messageId);
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (isPinned) next.delete(messageId);
      else next.add(messageId);
      return next;
    });

    const { error } = isPinned
      ? await supabase.from('pinned_messages').delete().eq('pinned_by', profileId).eq('message_id', messageId)
      : await supabase.from('pinned_messages').insert({
          message_id: messageId,
          contact_id: contactId ?? null,
          pinned_by: profileId,
          position: pinnedIds.size + 1,
        });

    if (error) {
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (isPinned) next.add(messageId);
        else next.delete(messageId);
        return next;
      });
      toast.error(isPinned ? 'Erro ao desafixar' : 'Erro ao fixar mensagem');
      log.error('[usePinMessage] toggle failed', error);
      return;
    }

    toast.success(isPinned ? 'Mensagem desafixada' : 'Mensagem fixada 📌');
  }, [profileId, pinnedIds]);

  return { pinnedIds, isPinned: (id: string) => pinnedIds.has(id), togglePin, loadPins, profileId };
}
