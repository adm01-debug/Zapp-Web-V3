/**
 * useDuplicateDetector.ts — v2.0
 * Real-time duplicate detection for ContactFormModal.
 * Checks evolution_contacts by phone_number and email with debouncing.
 * Uses proper BR phone normalization to catch 9th digit variations.
 */
import { useState, useCallback, useRef } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('useDuplicateDetector');

import { normalizePhone } from '@/lib/phoneUtils';
import { sanitizeText } from '@/lib/sanitize';
import { dbFrom } from '@/integrations/datasource/db';

export interface PotentialDuplicate {
  id:           string;
  name:         string;  // display name (full_name ?? push_name ?? phone_number)
  phone_number: string | null;
  email:        string | null;
  lead_status:  string;
}

interface Options {
  workspaceId: string;  // instance_name in evolution_contacts
  excludeId?:  string;
  debounceMs?: number;
}

export function useDuplicateDetector({
  workspaceId: instanceName, excludeId, debounceMs = 600,
}: Options) {
  const [duplicates,    setDuplicates]    = useState<PotentialDuplicate[]>([]);
  const [hasDuplicates, setHasDuplicates] = useState(false);
  const [checking,      setChecking]      = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const checkDuplicates = useCallback((phone: string, email: string) => {
    clearTimeout(timer.current);

    const normalizedPhone = phone?.trim() ? normalizePhone(phone) : null;
    const normalizedEmail = email?.trim()?.toLowerCase() || null;

    if (!normalizedPhone && !normalizedEmail) {
      setDuplicates([]); setHasDuplicates(false); return;
    }

    timer.current = setTimeout(async () => {
      setChecking(true);
      try {
        // Build OR conditions for phone (also check without 9th digit)
        const phoneConds: string[] = [];
        if (normalizedPhone) {
          phoneConds.push(`phone_number.eq.${normalizedPhone}`);
          // Also check without 9th digit (10-digit variation)
          if (normalizedPhone.length === 11) {
            const without9 = normalizedPhone.slice(0, 2) + normalizedPhone.slice(3);
            phoneConds.push(`phone_number.eq.${without9}`);
          }
          // Also check with 9th digit (10-digit → 11-digit)
          if (normalizedPhone.length === 10) {
            const with9 = normalizedPhone.slice(0, 2) + '9' + normalizedPhone.slice(2);
            phoneConds.push(`phone_number.eq.${with9}`);
          }
        }
        if (normalizedEmail) phoneConds.push(`email.eq.${normalizedEmail}`);

        let q = dbFrom('contacts')
          .select('id,full_name,push_name,phone_number,email,lead_status')
          .is('deleted_at', null)
          .eq('instance_name', instanceName)
          .or(phoneConds.join(','))
          .limit(5);

        if (excludeId) q = q.neq('id', excludeId);

        const { data } = await q;

        const found: PotentialDuplicate[] = (data ?? []).map((c) => ({
          id:           c.id,
          name:         sanitizeText(c.full_name ?? c.push_name ?? c.phone_number ?? 'Sem nome'),
          phone_number: c.phone_number,
          email:        c.email,
          lead_status:  c.lead_status ?? 'novo',
        }));

        setDuplicates(found);
        setHasDuplicates(found.length > 0);
      } catch (err) {
        log.error('Duplicate detection failed', err);
      } finally {
        setChecking(false);
      }
    }, debounceMs);
  }, [instanceName, excludeId, debounceMs]);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setDuplicates([]); setHasDuplicates(false);
  }, []);

  return { duplicates, hasDuplicates, checking, checkDuplicates, clear };
}

export default useDuplicateDetector;
