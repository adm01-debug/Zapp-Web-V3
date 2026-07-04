/**
 * ContactDuplicateIndicator.tsx — Detect similar contacts in EXTERNAL CRM database
 *
 * FIXED: Now uses contactsDB.duplicates.findSimilar() on the EXTERNAL DB
 * instead of querying the Lovable Cloud contacts table.
 *
 * Features:
 * - Searches by phone number suffix and name similarity
 * - Shows badge with count of potential duplicates
 * - Expandable list with merge action placeholder
 */
import React, { useState, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('ContactDuplicateIndicator');

import { Users, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { contactsDB, type ExternalContact } from '@/lib/contactsDB';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ContactDuplicateIndicatorProps {
  contactId: string;
  contactPhone: string | null;
  contactName: string | null;
  contactEmail?: string | null;
  workspaceId?: string;
  onMerge?: (duplicateId: string) => void;
}

export function ContactDuplicateIndicator({
  contactId,
  contactPhone,
  contactName,
  onMerge,
}: ContactDuplicateIndicatorProps) {
  const [duplicates, setDuplicates] = useState<ExternalContact[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isExternalConfigured || (!contactPhone && !contactName)) return;

    let cancelled = false;
    setIsLoading(true);

    contactsDB.duplicates
      .findSimilar(contactPhone ?? '', contactName ?? '', 5)
      .then((results) => {
        if (cancelled) return;
        // Filter out the current contact
        setDuplicates(results.filter((c) => c.id !== contactId));
      })
      .catch((err) => {
        if (!cancelled) log.error('Failed to check for duplicates', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [contactId, contactPhone, contactName]);

  if (isLoading || duplicates.length === 0) return null;

  return (
    <div className="border border-warning bg-warning dark:bg-warning/20 dark:border-warning rounded-lg p-2 text-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left"
        aria-expanded={isExpanded}
      >
        <AlertTriangle className="h-4 w-4 text-warning-foreground flex-shrink-0" />
        <span className="flex-1 text-warning-foreground dark:text-warning-foreground font-medium">
          {duplicates.length} contato{duplicates.length > 1 ? 's' : ''} similar{duplicates.length > 1 ? 'es' : ''}
        </span>
        <Badge variant="secondary" className="text-xs">{duplicates.length}</Badge>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {duplicates.map((dup) => (
            <div key={dup.id} className="flex items-center justify-between gap-2 p-2 bg-background dark:bg-background rounded border">
              <div className="min-w-0">
                <p className="font-medium text-xs truncate">
                  {dup.full_name || dup.first_name || 'Sem nome'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {dup.phone || dup.whatsapp || dup.email || 'Sem contato'}
                </p>
              </div>
              {onMerge && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 px-2"
                  onClick={() => onMerge(dup.id)}
                >
                  <Users className="h-3 w-3 mr-1" />
                  Mesclar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ContactDuplicateIndicator;
