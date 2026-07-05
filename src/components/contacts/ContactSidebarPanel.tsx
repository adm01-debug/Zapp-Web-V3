/**
 * ContactSidebarPanel.tsx — v3.0
 * CRM 360° sidebar with 4 tabs: Notes / LGPD / History / Info
 * Uses evolution_contacts schema with all new features.
 */
import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Phone, Mail, Clock, MessageCircle, Edit2, Shield, History, StickyNote, Info, Star } from 'lucide-react';
import { sanitizeText } from '@/lib/sanitize';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { type Contact } from '@/hooks/useContacts';
import { AuditLogPanel } from '@/components/contacts/AuditLogPanel';
import { LGPDConsentManager } from '@/components/contacts/LGPDConsentManager';
import { ContactNotesPanel } from '@/components/contacts/ContactNotesPanel';
import SafeHtml from '@/components/contacts/SafeHtml';

const LEAD_LABELS: Record<string, string> = {
  novo: '🆕 Novo', em_contato: '💬 Em contato', qualificado: '✅ Qualificado',
  proposta: '📋 Proposta', negociacao: '🤝 Negociação', fechado: '🏆 Fechado', perdido: '❌ Perdido',
};
const LEAD_COLORS: Record<string, string> = {
  novo: 'bg-muted text-muted-foreground', em_contato: 'bg-primary text-primary-foreground',
  qualificado: 'bg-primary text-primary', proposta: 'bg-primary text-primary',
  negociacao: 'bg-warning text-warning-foreground', fechado: 'bg-primary text-primary',
  perdido: 'bg-destructive text-destructive-foreground',
};

interface Props { contact: Contact; onEdit?: () => void; onOpenChat?: () => void; onUpdated?: (u: Partial<Contact>) => void; readonly?: boolean; }

export const ContactSidebarPanel: React.FC<Props> = ({ contact, onEdit, onOpenChat, onUpdated, readonly = false }) => {
  const displayName = sanitizeText(contact.full_name ?? contact.push_name ?? contact.phone_number ?? 'Sem nome');
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('');
  const hasConsent = !!contact.lgpd_consent_at && !contact.lgpd_opt_out_at;

  // Provide defaults for potentially missing fields to avoid crashes when passed partial data
  const safeContact = {
    ...contact,
    tags: contact.tags || [],
    lead_status: contact.lead_status || 'novo',
    lead_score: contact.lead_score || 0,
    version: contact.version || 1,
    created_at: contact.created_at || new Date().toISOString(),
    instance_name: contact.instance_name || 'default',
    remote_jid: contact.remote_jid || '',
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" role="complementary" aria-label={`Detalhes: ${displayName}`}>
      {/* ── Contact Header ── */}
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-14 w-14 shrink-0">
            {contact.profile_picture_url && <AvatarImage src={sanitizeText(contact.profile_picture_url)} alt="" loading="lazy" />}
            <AvatarFallback className="text-base font-semibold">{initials || '?'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base truncate">{displayName}</h2>
            {contact.company && <p className="text-sm text-muted-foreground truncate">{sanitizeText(contact.company)}</p>}
            <div className="flex flex-wrap gap-1 mt-1">
              <Badge className={`text-xs ${LEAD_COLORS[safeContact.lead_status] ?? 'bg-muted text-muted-foreground'}`}>
                {LEAD_LABELS[safeContact.lead_status] ?? safeContact.lead_status}
              </Badge>
              {safeContact.lead_score > 0 && (
                <Badge variant="outline" className="text-xs gap-0.5"><Star className="h-2.5 w-2.5" />{safeContact.lead_score}</Badge>
              )}
              <Badge className={`text-xs ${hasConsent ? 'bg-primary text-primary-foreground border-primary' : 'bg-warning text-warning-foreground border-warning'}`}>
                <Shield className="h-2.5 w-2.5 mr-0.5" />{hasConsent ? 'LGPD ✓' : 'Sem consent.'}
              </Badge>
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {onOpenChat && <Button size="icon" variant="outline" className="h-8 w-8" onClick={onOpenChat} aria-label="Abrir conversa"><MessageCircle className="h-4 w-4" /></Button>}
            {!readonly && onEdit && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label="Editar contato"><Edit2 className="h-4 w-4" /></Button>}
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-1.5 text-sm">
          {safeContact.phone_number && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" /><a href={`tel:${safeContact.phone_number}`} className="hover:text-foreground">{formatPhoneForDisplay(safeContact.phone_number)}</a></div>}
          {safeContact.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" /><a href={`mailto:${sanitizeText(safeContact.email)}`} className="hover:text-foreground truncate text-sm">{sanitizeText(safeContact.email)}</a></div>}
          {safeContact.last_message_at && <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5 shrink-0" /><span className="text-xs">Último msg: {new Date(safeContact.last_message_at).toLocaleDateString('pt-BR')}</span></div>}
          {safeContact.total_messages && safeContact.total_messages > 0 && <p className="text-xs text-muted-foreground pl-6">{safeContact.total_messages.toLocaleString('pt-BR')} mensagens</p>}
        </div>

        {/* Tags */}
        {safeContact.tags && safeContact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1" role="list" aria-label="Tags">
            {safeContact.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs" role="listitem">{sanitizeText(t)}</Badge>)}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Tabs: Notes / LGPD / History / Info ── */}
      <Tabs defaultValue="notes" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="grid grid-cols-4 mx-3 my-2 h-8">
          <TabsTrigger value="notes" className="text-xs h-7 gap-0.5"><StickyNote className="h-3 w-3" />Notas</TabsTrigger>
          <TabsTrigger value="lgpd"  className="text-xs h-7 gap-0.5"><Shield className="h-3 w-3" />LGPD</TabsTrigger>
          <TabsTrigger value="history" className="text-xs h-7 gap-0.5"><History className="h-3 w-3" />Hist.</TabsTrigger>
          <TabsTrigger value="info" className="text-xs h-7 gap-0.5"><Info className="h-3 w-3" />Info</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="notes" className="p-3 mt-0">
            <ContactNotesPanel contactId={safeContact.id} />
          </TabsContent>

          <TabsContent value="lgpd" className="p-3 mt-0">
            <LGPDConsentManager contact={safeContact} onUpdated={onUpdated} readonly={readonly} />
          </TabsContent>

          <TabsContent value="history" className="p-3 mt-0">
            <AuditLogPanel contactId={safeContact.id} maxEntries={20} />
          </TabsContent>

          <TabsContent value="info" className="p-3 mt-0 space-y-2 text-xs text-muted-foreground">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              <span className="font-medium">ID:</span><span className=" truncate">{safeContact.id.slice(0, 8)}...</span>
              <span className="font-medium">Instância:</span><span>{sanitizeText(safeContact.instance_name)}</span>
              <span className="font-medium">JID:</span><span className=" truncate">{sanitizeText(safeContact.remote_jid)}</span>
              <span className="font-medium">Versão:</span><span>{safeContact.version}</span>
              <span className="font-medium">Criado:</span><span>{new Date(safeContact.created_at).toLocaleDateString('pt-BR')}</span>
              <span className="font-medium">1º contato:</span><span>{safeContact.first_contact_at ? new Date(safeContact.first_contact_at).toLocaleDateString('pt-BR') : '—'}</span>
              {safeContact.assigned_to && <><span className="font-medium">Responsável:</span><span className="truncate">{sanitizeText(safeContact.assigned_to)}</span></>}
              {safeContact.merge_source_id && <><span className="font-medium">Origem:</span><span className=" truncate text-warning-foreground">Mesclado</span></>}
            </div>
            {/* Inline notes backup */}
            {contact.notes && (
              <div className="mt-2">
                <p className="font-medium mb-1">Nota principal:</p>
                <SafeHtml html={contact.notes} className="rounded bg-muted/30 p-2" />
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default ContactSidebarPanel;
