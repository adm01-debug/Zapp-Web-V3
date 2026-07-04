/**
 * ContactBitrix24Panel.tsx — CRM enrichment from EXTERNAL database
 *
 * FIXED: Now reads bitrix_contact_id, company data, and deals from the
 * EXTERNAL CRM database (GESTÃO DE CLIENTES) instead of Lovable Cloud.
 *
 * Shows:
 * - Bitrix24 contact ID with direct link
 * - Company info from companies table
 * - Recent interactions from interactions table
 * - Relationship stage and score
 */
import React, { useState, useEffect } from 'react';
const log = getLogger('ContactBitrix24Panel');

import { Building2, ExternalLink, Users, TrendingUp, MessageSquare } from 'lucide-react';
import { getLogger } from '@/lib/logger';
import { type ExternalContact } from '@/lib/contactsDB';
import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { Badge } from '@/components/ui/badge';

interface ContactBitrix24PanelProps {
  contact: ExternalContact | null;
}

interface CompanyInfo {
  id: string;
  name: string | null;
  cnpj: string | null;
  segment: string | null;
}

interface InteractionSummary {
  id: string;
  interaction_type: string;
  description: string | null;
  created_at: string;
}

export function ContactBitrix24Panel({ contact }: ContactBitrix24PanelProps) {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [interactions, setInteractions] = useState<InteractionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!contact || !isExternalConfigured) return;
    let cancelled = false;
    setIsLoading(true);

    const loadData = async () => {
      const client = getExternalSupabase();
      if (!client) return;

      // Load company
      if (contact.company_id) {
        const { data: companyData } = await client
          .from('companies')
          .select('id, name, cnpj, segment')
          .eq('id', contact.company_id)
          .maybeSingle();
        if (!cancelled && companyData) setCompany(companyData as CompanyInfo);
      }

      // Load recent interactions
      const { data: intData } = await client
        .from('interactions')
        .select('id, interaction_type, description, created_at')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!cancelled && intData) setInteractions(intData as InteractionSummary[]);

      if (!cancelled) setIsLoading(false);
    };

    loadData().catch(err => log.error('Failed to load Bitrix24 data', err));
    return () => { cancelled = true; };
  }, [contact?.id, contact?.company_id]);

  if (!contact || !isExternalConfigured) return null;

  const bitrixUrl = contact.bitrix_contact_id
    ? `https://promobrindes.bitrix24.com.br/crm/contact/details/${contact.bitrix_contact_id}/`
    : null;

  const stageColor: Record<string, string> = {
    unknown: 'bg-muted text-muted-foreground',
    lead: 'bg-primary text-primary-foreground',
    prospect: 'bg-primary text-primary',
    customer: 'bg-primary text-primary',
    advocate: 'bg-primary text-primary',
    churned: 'bg-destructive text-destructive-foreground',
  };

  return (
    <div className="space-y-3">
      {/* Relationship Stage */}
      {contact.relationship_stage && (
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <Badge className={stageColor[contact.relationship_stage] ?? stageColor.unknown}>
            {contact.relationship_stage}
          </Badge>
          {contact.relationship_score != null && (
            <span className="text-xs text-muted-foreground">Score: {contact.relationship_score}/100</span>
          )}
        </div>
      )}

      {/* Bitrix24 Link */}
      {bitrixUrl && (
        <a
          href={bitrixUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:text-primary-foreground hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Bitrix24 #{contact.bitrix_contact_id}
        </a>
      )}

      {/* Company */}
      {company && (
        <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
          <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{company.name}</p>
            {company.cnpj && <p className="text-xs text-muted-foreground">{company.cnpj}</p>}
            {company.segment && <Badge variant="outline" className="text-xs mt-1">{company.segment}</Badge>}
          </div>
        </div>
      )}

      {/* Recent Interactions */}
      {interactions.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            \u00daltimas intera\u00e7\u00f5es
          </div>
          {interactions.map((int) => (
            <div key={int.id} className="text-xs p-1.5 bg-muted/30 rounded">
              <span className="font-medium">{int.interaction_type}</span>
              {int.description && (
                <span className="text-muted-foreground"> \u2014 {int.description.slice(0, 60)}...</span>
              )}
              <span className="text-muted-foreground block">
                {new Date(int.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sentiment */}
      {contact.sentiment && contact.sentiment !== 'neutral' && (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Badge variant={contact.sentiment === 'positive' ? 'default' : 'destructive'}>
            {contact.sentiment}
          </Badge>
        </div>
      )}
    </div>
  );
}

export default ContactBitrix24Panel;
