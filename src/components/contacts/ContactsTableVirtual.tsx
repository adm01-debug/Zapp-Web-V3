import React, { useRef, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  MoreVertical,
  Phone,
  Mail,
  Briefcase,
  Tag,
  Edit,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { CompanyLogo } from './CompanyLogo';
import { HighlightText } from './HighlightText';
import { type Contact } from './types';

// ── Types ──────────────────────────────────────────────────────────────────

interface ContactsTableVirtualProps {
  contacts: Contact[];
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  getCRMData?: (phone: string) => any;
  searchQuery?: string;
  loadMoreRef?: React.RefObject<HTMLDivElement>;
  loadingMore?: boolean;
}

const ROW_HEIGHT = 64; // px

// ── Row Component (memoized for perf) ──────────────────────────────────────

const ContactRow = memo(
  ({
    contact,
    isSelected,
    onToggleSelect,
    onOpenChat,
    onEdit,
    onDelete,
    getCRMData,
    searchQuery,
  }: {
    contact: Contact;
    isSelected: boolean;
    onToggleSelect: (id: string, selected: boolean) => void;
    onOpenChat: (id: string) => void;
    onEdit: (contact: Contact) => void;
    onDelete: (contact: Contact) => void;
    getCRMData?: (phone: string) => any;
    searchQuery?: string;
  }) => {
    const avatarColors = getAvatarColor(contact.name);
    const typeConfig =
      CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
    const crmData = getCRMData?.(contact.phone);

    return (
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-3 border-b px-4 transition-colors',
          isSelected ? 'border-l-2 border-l-primary bg-primary/5' : 'hover:bg-muted/30'
        )}
        style={{ height: ROW_HEIGHT }}
        role="row"
        aria-selected={isSelected}
        onClick={() => onOpenChat(contact.id)}
      >
        {/* Checkbox */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelect(contact.id, !!checked)}
            aria-label={`Selecionar ${contact.name}`}
          />
        </div>

        {/* Avatar & Info */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarImage src={contact.avatar_url || undefined} />
              <AvatarFallback
                className={cn('text-xs font-semibold', avatarColors.bg, avatarColors.text)}
              >
                {getInitials(contact.name)}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                typeConfig.dotBg
              )}
            />
          </div>
          <div className="min-w-0">
            <HighlightText
              text={`${contact.name} ${contact.surname || ''}`.trim()}
              highlight={searchQuery}
              className="block truncate text-sm font-medium"
            />
            <div className="mt-0.5 flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn('h-4 gap-1 px-1 text-[10px] font-medium', typeConfig.badgeClass)}
              >
                {typeConfig.iconNode}
                {typeConfig.label}
              </Badge>
              {contact.nickname && (
                <span className="truncate text-[10px] italic text-muted-foreground">
                  ({contact.nickname})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Professional */}
        <div className="hidden min-w-[120px] max-w-[180px] flex-col lg:flex">
          {contact.company ? (
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <CompanyLogo
                logoUrl={crmData?.logo_url}
                companyName={crmData?.company_name}
                fallbackCompanyName={contact.company}
                size="xs"
              />
              <HighlightText
                text={crmData?.company_name || contact.company}
                highlight={searchQuery}
                className="truncate"
              />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/30">—</span>
          )}
          {contact.job_title && (
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Briefcase className="h-2.5 w-2.5" />
              <HighlightText
                text={contact.job_title}
                highlight={searchQuery}
                className="truncate"
              />
            </div>
          )}
        </div>

        {/* Contact Details */}
        <div className="hidden min-w-[140px] max-w-[200px] flex-col md:flex">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Phone className="h-3 w-3" />
            <HighlightText text={contact.phone} highlight={searchQuery} />
          </div>
          {contact.email && (
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
              <Mail className="h-3 w-3" />
              <HighlightText text={contact.email} highlight={searchQuery} />
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="hidden max-w-[120px] shrink-0 items-center gap-1 xl:flex">
          {contact.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="h-4 truncate px-1 text-[10px]">
              {tag}
            </Badge>
          ))}
          {(contact.tags?.length || 0) > 2 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              +{(contact.tags?.length || 0) - 2}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex shrink-0 items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
            onClick={() => onOpenChat(contact.id)}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(contact)}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Tag className="mr-2 h-4 w-4" />
                Gerenciar etiquetas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }
);

ContactRow.displayName = 'ContactRow';

// ── Table Header ───────────────────────────────────────────────────────────

const TableHeader = memo(
  ({
    contacts,
    selectedIds,
    onSelectIds,
  }: {
    contacts: Contact[];
    selectedIds: string[];
    onSelectIds: (ids: string[]) => void;
  }) => {
    const allSelected = selectedIds.length === contacts.length && contacts.length > 0;
    const _someSelected = selectedIds.length > 0 && selectedIds.length < contacts.length;

    return (
      <div
        className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        role="rowgroup"
      >
        <div className="w-4 shrink-0">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => onSelectIds(checked ? contacts.map((c) => c.id) : [])}
            aria-label={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
          />
        </div>
        <div className="flex-1">Contato</div>
        <div className="hidden min-w-[120px] max-w-[180px] lg:block">Profissional</div>
        <div className="hidden min-w-[140px] max-w-[200px] md:block">Contato</div>
        <div className="hidden w-[120px] xl:block">Etiquetas</div>
        <div className="w-[72px] text-right">Ações</div>
      </div>
    );
  }
);

TableHeader.displayName = 'TableHeader';

// ── Main Component ─────────────────────────────────────────────────────────

export const ContactsTableVirtual: React.FC<ContactsTableVirtualProps> = ({
  contacts,
  selectedIds,
  onSelectIds,
  onOpenChat,
  onEdit,
  onDelete,
  getCRMData,
  searchQuery,
  loadMoreRef,
  loadingMore,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const items = virtualizer.getVirtualItems();

  const handleToggleSelect = useCallback(
    (id: string, selected: boolean) => {
      if (selected) {
        onSelectIds([...selectedIds, id]);
      } else {
        onSelectIds(selectedIds.filter((i) => i !== id));
      }
    },
    [selectedIds, onSelectIds]
  );

  return (
    <div
      className="flex h-[600px] flex-col overflow-hidden rounded-xl border border-border/30 bg-card"
      role="table"
      aria-label="Lista de contatos"
    >
      <TableHeader contacts={contacts} selectedIds={selectedIds} onSelectIds={onSelectIds} />

      <div ref={parentRef} className="scrollbar-thin flex-1 overflow-y-auto" role="rowgroup">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {items.map((virtualItem) => {
            const contact = contacts[virtualItem.index];
            if (!contact) return null;
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <ContactRow
                  contact={contact}
                  isSelected={selectedIds.includes(contact.id)}
                  onToggleSelect={handleToggleSelect}
                  onOpenChat={onOpenChat}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  getCRMData={getCRMData}
                  searchQuery={searchQuery}
                />
              </div>
            );
          })}
        </div>

        {loadMoreRef && (
          <div ref={loadMoreRef} className="flex h-10 items-center justify-center p-4">
            {loadingMore && (
              <div className="animate-pulse text-xs text-muted-foreground">Carregando mais...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactsTableVirtual;
