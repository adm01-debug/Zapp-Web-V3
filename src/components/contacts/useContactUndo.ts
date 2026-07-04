/**
 * useContactUndo.ts
 * Provides a 5-second undo window after bulk deletions.
 *
 * Pattern:
 *   1. User clicks "Delete 50 contacts"
 *   2. Hook shows toast with "Desfazer" button (5s countdown)
 *   3a. User clicks "Desfazer" → contacts restored, operation cancelled
 *   3b. Timer expires → soft delete is committed to DB
 *
 * This is a classic "pending delete" / "optimistic UI" pattern.
 */
import { useRef, useCallback } from 'react';
const log = getLogger('useContactUndo');

import { useToast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

const UNDO_WINDOW_MS = 5_000; // 5 seconds

interface UseContactUndoOptions {
  onUndone?: (restoredIds: string[]) => void;
  onCommitted?: (deletedIds: string[]) => void;
}

interface PendingDelete {
  ids: string[];
  timer: ReturnType<typeof setTimeout>;
}

export function useContactUndo(options: UseContactUndoOptions = {}) {
  const { toast } = useToast();
  const pendingRef = useRef<PendingDelete | null>(null);

  /**
   * Cancel any ongoing pending delete (used when component unmounts
   * or a new operation starts before the previous one commits).
   */
  const cancelPending = useCallback(() => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }
  }, []);

  /**
   * Initiate a soft-delete with a 5-second undo window.
   * The contacts are hidden from the UI immediately (optimistic) but
   * the DB operation is delayed.
   *
   * @param contactIds  IDs to delete
   * @param label       Human-readable description ("3 contatos")
   */
  const softDeleteWithUndo = useCallback(
    async (contactIds: string[], label?: string) => {
      // Cancel any previous pending delete
      cancelPending();

      if (contactIds.length === 0) return;

      const count = contactIds.length;
      const description = label ?? `${count} contato${count !== 1 ? 's' : ''}`;

      // Show toast with undo button
      const { dismiss } = toast({
        title: `🗑️ ${description} excluído${count !== 1 ? 's' : ''}`,
        description: 'Clique em "Desfazer" para restaurar.',
        duration: UNDO_WINDOW_MS,
        action: ({
          // The toast action button
          altText: 'Desfazer exclusão',
          onClick: () => {
            // User clicked undo — cancel the pending commit
            cancelPending();
            options.onUndone?.(contactIds);
            toast({
              title: '↩️ Exclusão desfeita',
              description: `${description} restaurado${count !== 1 ? 's' : ''}.`,
              duration: 3_000,
            });
          },
        } as unknown as never),
      });

      // Schedule the actual soft-delete commit after UNDO_WINDOW_MS
      const timer = setTimeout(async () => {
        pendingRef.current = null;
        dismiss?.();

        try {
          // Safety: max 500 per call
          const chunks = chunkArray(contactIds, 500);
          for (const chunk of chunks) {
            const { error } = await (supabase as any).rpc('bulk_soft_delete_contacts', {
              p_contact_ids: chunk,
              p_reason: 'bulk_deletion',
            });
            if (error) throw error;
          }
          options.onCommitted?.(contactIds);
        } catch (err) {
          log.error('Failed to commit bulk delete', err);
          // If commit fails, restore UI state
          options.onUndone?.(contactIds);
          toast({
            title: '❌ Erro ao excluir',
            description: 'Os contatos foram restaurados automaticamente.',
            variant: 'destructive',
            duration: 5_000,
          });
        }
      }, UNDO_WINDOW_MS);

      pendingRef.current = { ids: contactIds, timer };
    },
    [cancelPending, options, toast]
  );

  /**
   * Immediately commit a delete without undo window.
   * Use for single-contact deletes where user explicitly confirmed.
   */
  const hardDelete = useCallback(
    async (contactId: string, contactName: string) => {
      try {
        const { error } = await (supabase as any).rpc('soft_delete_contact', {
          p_contact_id: contactId,
          p_reason: 'manual_deletion',
        });
        if (error) throw error;

        toast({
          title: '🗑️ Contato excluído',
          description: `"${contactName}" foi removido. Administradores podem restaurar em até 30 dias.`,
          duration: 4_000,
        });
        options.onCommitted?.([contactId]);
      } catch (err) {
        log.error('Failed to hard delete contacts', err);
        toast({
          title: '❌ Erro ao excluir contato',
          description: 'Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    [options, toast]
  );

  return { softDeleteWithUndo, hardDelete, cancelPending };
}

// ── Utils ──────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
