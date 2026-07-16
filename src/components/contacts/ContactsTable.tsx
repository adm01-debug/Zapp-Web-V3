import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare,
  Edit,
  Trash2,
  MoreVertical,
  Phone,
  Mail,
  Briefcase,
  Tag,
  Users,
  Truck,
  UserCheck,
  Wrench,
  Star,
  Handshake,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatarColors';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { CompanyLogo } from './CompanyLogo';
import { HighlightText } from './HighlightText';
import { calculateContactHealth, getHealthColor } from '@/lib/contactHealth';
import type { Contact } from './types';
import type { CRMBatchResult } from '@/hooks/useExternalContact360Batch';

const CONTACT_TYPE_ICONS: Record<string, React.ReactNode> = {
  cliente: <Users className="h-4 w-4" />,
  fornecedor: <Truck className="h-4 w-4" />,
  colaborador: <UserCheck className="h-4 w-4" />,
  prestador_servico: <Wrench className="h-4 w-4" />,
  lead: <Star className="h-4 w-4" />,
  parceiro: <Handshake className="h-4 w-4" />,
  outros: <MoreHorizontal className="h-4 w-4" />,
};

export { CONTACT_TYPE_ICONS };

type SortField = 'name' | 'type' | 'phone' | 'email' | 'company' | 'job_title' | 'created_at';
type SortDir = 'asc' | 'desc';

interface ContactsTableProps {
  contacts: Contact[];
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  getCRMData?: (phone: string) => CRMBatchResult | undefined;
  searchQuery?: string;
}

function SortableHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortField;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <th
      scope="col"
      className="group cursor-pointer select-none p-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDown className="h-3 w-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </div>
    </th>
  );
}

export function ContactsTable({
  contacts,
  selectedIds,
  onSelectIds,
  onOpenChat,
  onEdit,
  onDelete,
  getCRMData,
  searchQuery,
}: ContactsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedContacts = useMemo(() => {
    if (!sortField) return contacts;
    return [...contacts].sort((a, b) => {
      let valA = '',
        valB = '';
      switch (sortField) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'type':
          valA = a.contact_type || '';
          valB = b.contact_type || '';
          break;
        case 'phone':
          valA = a.phone;
          valB = b.phone;
          break;
        case 'email':
          valA = a.email || '';
          valB = b.email || '';
          break;
        case 'company':
          valA = a.company || '';
          valB = b.company || '';
          break;
        case 'job_title':
          valA = a.job_title || '';
          valB = b.job_title || '';
          break;
        case 'created_at':
          valA = a.created_at;
          valB = b.created_at;
          break;
      }
      const cmp = valA.localeCompare(valB);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [contacts, sortField, sortDir]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/30">
      <table className="w-full" role="grid" aria-label="Lista de contatos">
        <thead>
          <tr className="border-b border-border/20 bg-muted/20">
            <th scope="col" className="w-10 p-3">
              <Checkbox
                checked={selectedIds.length === contacts.length && contacts.length > 0}
                onCheckedChange={(checked) => onSelectIds(checked ? contacts.map((c) => c.id) : [])}
                aria-label="Selecionar todos"
              />
            </th>
            <SortableHeader
              label="Contato"
              field="name"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortableHeader
              label="Tipo"
              field="type"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortableHeader
              label="Telefone"
              field="phone"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortableHeader
              label="Email"
              field="email"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortableHeader
              label="Empresa"
              field="company"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortableHeader
              label="Cargo"
              field="job_title"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <th
              scope="col"
              className="p-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Etiquetas
            </th>
            <th
              scope="col"
              className="p-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Saúde
            </th>
            <th
              scope="col"
              className="p-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedContacts.map((contact, index) => {
            const typeConfig =
              CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
            const avatarColors = getAvatarColor(contact.name);
            const crmData = getCRMData?.(contact.phone);
            return (
              <motion.tr
                key={contact.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.015 }}
                className={cn(
                  'group cursor-pointer border-b border-border/10 transition-all duration-150 last:border-0 hover:bg-muted/30',
                  selectedIds.includes(contact.id) && 'border-l-2 border-l-primary bg-primary/5'
                )}
                onClick={() => onOpenChat(contact.id)}
              >
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(contact.id)}
                    onCheckedChange={(checked) =>
                      onSelectIds(
                        checked
                          ? [...selectedIds, contact.id]
                          : selectedIds.filter((id) => id !== contact.id)
                      )
                    }
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={contact.avatar_url || undefined} alt={contact.name} />
                        <AvatarFallback
                          className={cn(
                            'text-xs font-semibold',
                            avatarColors.bg,
                            avatarColors.text
                          )}
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
                      {contact.nickname && (
                        <span className="text-[11px] text-muted-foreground">
                          ({contact.nickname})
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'h-5 gap-1 px-1.5 text-[10px] font-medium',
                      typeConfig.badgeClass
                    )}
                  >
                    {typeConfig.iconNode}
                    {typeConfig.label}
                  </Badge>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <HighlightText
                      text={contact.phone}
                      highlight={searchQuery}
                      className="text-[11px]"
                    />
                  </div>
                </td>
                <td className="p-3">
                  {contact.email ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <HighlightText
                        text={contact.email}
                        highlight={searchQuery}
                        className="max-w-[160px] truncate text-[11px]"
                      />
                    </div>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </td>
                <td className="p-3">
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
                        className="max-w-[140px] truncate"
                      />
                    </div>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </td>
                <td className="p-3">
                  {contact.job_title ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Briefcase className="h-3 w-3 shrink-0" />
                      <HighlightText
                        text={contact.job_title}
                        highlight={searchQuery}
                        className="max-w-[140px] truncate"
                      />
                    </div>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {contact.tags?.slice(0, 2).map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="h-5 px-1.5 text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                    {(contact.tags?.length || 0) > 2 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        +{(contact.tags?.length || 0) - 2}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex justify-center">
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                        getHealthColor(calculateContactHealth(contact))
                      )}
                    >
                      <Activity className="h-2.5 w-2.5" />
                      {calculateContactHealth(contact)}%
                    </div>
                  </div>
                </td>
                <td className="p-3 text-right">
                  <div
                    className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      aria-label="Conversar"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                      onClick={() => onOpenChat(contact.id)}
                      title="Conversar"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label="Opções do contato"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
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
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onDelete(contact)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
