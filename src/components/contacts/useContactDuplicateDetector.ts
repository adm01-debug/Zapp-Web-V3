
/**
 * useContactDuplicateDetector.ts
 * Real-time duplicate detection when creating/editing contacts.
 *
 * Checks phone + email against existing contacts and warns the user
 * before they save — preventing duplicates at the source.
 */
import { useState, useCallback, useRef } from 'react';
import { getLogger } from '@/lib/logger';

import { safeClient } from '@/integrations/supabase/safeClient';

const log = getLogger('useContactDuplicateDetector');

// ── Types ──────────────────────────────────────────────────────────────────

/** Potential Duplicate interface definition. */
export interface PotentialDuplicate {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  match_field: 'phone' | 'email' | 'name';
  similarity?: number; // 0-1
}

interface UseDuplicateDetectorOptions {
  workspaceId: string;
  excludeId?: string; // exclude the current contact when editing
  debounceMs?: number;
}

interface DuplicateState {
  checking: boolean;
  duplicates: PotentialDuplicate[];
  checked: boolean;
}

// ── Normalize ──────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  if (!phone) return '';
  let d = phone.replace(/[^0-9]/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10 && d[2] !== '9') d = d.slice(0, 2) + '9' + d.slice(2);
  return d;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/** use Contact Duplicate Detector function. */
export function useContactDuplicateDetector({
  workspaceId,
  excludeId,
  debounceMs: _debounceMs = 600,
}: UseDuplicateDetectorOptions) {
  const [state, setState] = useState<DuplicateState>({
    checking: false,
    duplicates: [],
    checked: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  const checkDuplicates = useCallback(
    async (phone: string, email: string, _name: string) => {
      const normalizedPhone = normalizePhone(phone);
      const normalizedEmail = email?.toLowerCase().trim();

      // Skip if nothing to check
      if (!normalizedPhone && !normalizedEmail) {
        setState({ checking: false, duplicates: [], checked: false });
        return;
      }

      // Cancel previous check
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setState((s) => ({ ...s, checking: true }));

      const found: PotentialDuplicate[] = [];

      try {
        // Check by normalized phone
        if (normalizedPhone && normalizedPhone.length >= 8) {
          const { data: phoneMatches } = await safeClient.from<PotentialDuplicate>(
            'contacts',
            (q) =>
              q
                .select('id, name, phone, email, avatar_url')
                .is('deleted_at', null)
                .neq('id', excludeId ?? '00000000-0000-0000-0000-000000000000')
                .or(
                  `phone.eq.${normalizedPhone},phone.eq.+55${normalizedPhone},phone.eq.55${normalizedPhone}`
                )
                .limit(5)
          );

          if (phoneMatches) {
            for (const c of phoneMatches) {
              if (!found.some((f) => f.id === c.id)) {
                found.push({ ...c, match_field: 'phone' });
              }
            }
          }
        }

        // Check by email
        if (normalizedEmail && normalizedEmail.includes('@')) {
          const { data: emailMatches } = await safeClient.from<PotentialDuplicate>(
            'contacts',
            (q) =>
              q
                .select('id, name, phone, email, avatar_url')
                .eq('email', normalizedEmail)
                .is('deleted_at', null)
                .neq('id', excludeId ?? '00000000-0000-0000-0000-000000000000')
                .limit(5)
          );

          if (emailMatches) {
            for (const c of emailMatches) {
              if (!found.some((f) => f.id === c.id)) {
                found.push({ ...c, match_field: 'email' });
              }
            }
          }
        }

        setState({ checking: false, duplicates: found, checked: true });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          log.error('Duplicate detection failed', err);
          setState({ checking: false, duplicates: [], checked: true });
        }
      }
    },
    [workspaceId, excludeId]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ checking: false, duplicates: [], checked: false });
  }, []);

  return {
    ...state,
    checkDuplicates,
    reset,
    hasDuplicates: state.duplicates.length > 0,
  };
}