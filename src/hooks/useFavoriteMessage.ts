import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { isValidUUID } from '@/utils/uuid';

// NOTA (DB-as-source): zapp.favorite_messages é nova (migration 20260817150000,
// ainda não aplicada no DB) — types.ts será regenerado na rodada de aplicação;
// até lá, from('favorite_messages' as never) mantém o typecheck verde.

/**
 * useFavoriteMessage — Favoritar mensagem (Etapa 44 do plano 100 etapas).
 * Backend: zapp.favorite_messages (migration 20260817150000) — user-scoped,
 * toggle = INSERT/DELETE (UNIQUE user_id+message_id garante idempotência).
 * Padrão: useConversationManagement.loadFavorites (Set local + getUser fresco).
 */
export function useFavoriteMessage() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadFavorites = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !mountedRef.current) return;
    const { data, error } = await supabase
      .from('favorite_messages' as never)
      .select('message_id')
      .eq('user_id', user.id);
    if (error) {
      log.warn('[useFavoriteMessage] load failed', error);
      return;
    }
    if (data && mountedRef.current) {
      setFavoriteIds(new Set(data.map((f: { message_id: string }) => f.message_id)));
    }
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  const toggleFavorite = useCallback(async (messageId: string) => {
    if (!isValidUUID(messageId)) {
      toast.error('Mensagem inválida');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Sessão expirada');
      return;
    }

    const isFavorite = favoriteIds.has(messageId);
    // Atualização otimista
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.delete(messageId);
      else next.add(messageId);
      return next;
    });

    const { error } = isFavorite
      ? await supabase.from('favorite_messages' as never).delete().eq('user_id', user.id).eq('message_id', messageId)
      : await supabase.from('favorite_messages' as never).insert({ message_id: messageId, user_id: user.id } as never);

    if (error) {
      // rollback otimista
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFavorite) next.add(messageId);
        else next.delete(messageId);
        return next;
      });
      toast.error(isFavorite ? 'Erro ao remover favorita' : 'Erro ao favoritar mensagem');
      log.error('[useFavoriteMessage] toggle failed', error);
      return;
    }

    toast.success(isFavorite ? 'Favorita removida' : 'Mensagem favoritada ⭐');
  }, [favoriteIds]);

  return { favoriteIds, isFavorite: (id: string) => favoriteIds.has(id), toggleFavorite, loadFavorites };
}
