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
  Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatarColors';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { CompanyLogo } from './CompanyLogo';
import { HighlightText } from './HighlightText';
import { calculateContactHealth, getHealthColor } from '@/lib/contactHealth';
import type { ContactItemProps } from './types';

export function ContactListItem({
  contact,
  isSelected,
  onToggleSelect,
  onOpenChat,
  onEdit,
  onDelete,
  index,
  companyLogo,
  companyName,
  searchQuery,
}: ContactItemProps) {
  const typeConfig =
    CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  const avatarColors = getAvatarColor(contact.name);

  return (
    <motion.div
      layoutId={`contact-${contact.id}`}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02, duration: 0.25 }}
      className={cn(
        'group flex items-center gap-4 rounded-xl border border-border/30 px-4 py-3',
        'cursor-pointer transition-all duration-150 hover:border-primary/15 hover:bg-muted/30',
        isSelected && 'border-primary/30 bg-primary/5'
      )}
      onClick={() => onOpenChat(contact.id)}
    >
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelect(contact.id, !!checked)}
        />
      </div>

      {/* Avatar with company logo overlay */}
      <div className="relative shrink-0">
        <motion.div layoutId={`avatar-${contact.id}`}>
          <Avatar className="h-[53px] w-[53px]">
            <AvatarImage src={contact.avatar_url || undefined} alt={contact.name} />
            <AvatarFallback
              className={cn('text-sm font-semibold', avatarColors.bg, avatarColors.text)}
            >
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>
        </motion.div>
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background',
            typeConfig.dotBg
          )}
        />
        {(companyLogo || contact.company) && (
          <div className="absolute -left-0.5 -top-0.5">
            <CompanyLogo
              logoUrl={companyLogo}
              companyName={companyName}
              fallbackCompanyName={contact.company}
              size="xs"
              className="ring-1 ring-background"
            />
          </div>
        )}
      </div>

      {/* Name & type */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <HighlightText
            text={`${contact.name} ${contact.surname || ''}`.trim()}
            highlight={searchQuery}
            className="block truncate text-sm font-semibold text-foreground"
          />
          <div
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-tight',
              getHealthColor(calculateContactHealth(contact))
            )}
          >
            <Activity className="h-2.5 w-2.5" />
            {calculateContactHealth(contact)}%
          </div>
          <Badge
            variant="outline"
            className={cn(
              'h-5 shrink-0 gap-1 px-1.5 text-[10px] font-medium',
              typeConfig.badgeClass
            )}
          >
            {typeConfig.iconNode}
            {typeConfig.label}
          </Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-3">
          {contact.company && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CompanyLogo
                logoUrl={companyLogo}
                companyName={companyName}
                fallbackCompanyName={contact.company}
                size="xs"
              />
              <HighlightText
                text={companyName || contact.company || ''}
                highlight={searchQuery}
                className="max-w-[120px] truncate"
              />
            </span>
          )}
          {contact.job_title && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              <HighlightText text={contact.job_title} highlight={searchQuery} />
            </span>
          )}
        </div>
      </div>

      {/* Phone */}
      <div
        className="hidden min-w-[140px] items-center gap-2 text-xs text-muted-foreground lg:flex"
        onClick={(e) => e.stopPropagation()}
      >
        <Phone className="h-3.5 w-3.5 shrink-0" />
        <a
          href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] transition-colors hover:text-primary hover:underline"
          title="Abrir no WhatsApp"
        >
          <HighlightText text={contact.phone} highlight={searchQuery} />
        </a>
      </div>

      {/* Email */}
      <div
        className="hidden min-w-[180px] items-center gap-2 text-xs text-muted-foreground xl:flex"
        onClick={(e) => e.stopPropagation()}
      >
        {contact.email ? (
          <>
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <a
              href={`mailto:${contact.email}`}
              className="truncate text-[11px] transition-colors hover:text-primary hover:underline"
              title="Enviar email"
            >
              <HighlightText text={contact.email} highlight={searchQuery} />
            </a>
          </>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Tags */}
      <div className="hidden min-w-[120px] items-center gap-1 lg:flex">
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

      {/* Date */}
      <span className="hidden shrink-0 text-[11px] text-muted-foreground md:block">
        {format(new Date(contact.created_at), 'dd/MM/yy', { locale: ptBR })}
      </span>

      {/* Actions */}
      <div
        className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
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
            <Button aria-label="Opções do contato" variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onEdit(contact)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
