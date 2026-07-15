import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare, Edit, Trash2, MoreVertical, Phone, Mail,
  Briefcase, Activity
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
  contact, isSelected, onToggleSelect, onOpenChat, onEdit, onDelete, index, companyLogo, companyName, searchQuery,
}: ContactItemProps) {
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  const avatarColors = getAvatarColor(contact.name);

  return (
    <motion.div
      layoutId={`contact-${contact.id}`}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02, duration: 0.25 }}
      className={cn(
        "group flex items-center gap-4 px-4 py-3 rounded-xl border border-border/30",
        "hover:bg-muted/30 hover:border-primary/15 transition-all duration-150 cursor-pointer",
        isSelected && "bg-primary/5 border-primary/30"
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
          <Avatar className="w-[53px] h-[53px]">
            <AvatarImage src={contact.avatar_url || undefined} alt={contact.name} />
            <AvatarFallback className={cn('font-semibold text-sm', avatarColors.bg, avatarColors.text)}>
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>
        </motion.div>
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background",
          typeConfig.dotBg
        )} />
        {(companyLogo || contact.company) && (
          <div className="absolute -top-0.5 -left-0.5">
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
            className="font-semibold text-sm text-foreground truncate block"
          />
          <div className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-tight shrink-0",
            getHealthColor(calculateContactHealth(contact))
          )}>
            <Activity className="w-2.5 h-2.5" />
            {calculateContactHealth(contact)}%
          </div>
          <Badge
            variant="outline"
            className={cn("text-[10px] h-5 px-1.5 font-medium gap-1 shrink-0", typeConfig.badgeClass)}
          >
            {typeConfig.iconNode}
            {typeConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {contact.company && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CompanyLogo
                logoUrl={companyLogo}
                companyName={companyName}
                fallbackCompanyName={contact.company}
                size="xs"
              />
              <HighlightText text={companyName || contact.company || ""} highlight={searchQuery} className="truncate max-w-[120px]" />
            </span>
          )}
          {contact.job_title && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="w-3 h-3" />
              <HighlightText text={contact.job_title} highlight={searchQuery} />
            </span>
          )}
        </div>
      </div>

      {/* Phone */}
      <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground min-w-[140px]" onClick={(e) => e.stopPropagation()}>
        <Phone className="w-3.5 h-3.5 shrink-0" />
        <a
          href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className=" text-[11px] hover:text-primary hover:underline transition-colors"
          title="Abrir no WhatsApp"
        >
          <HighlightText text={contact.phone} highlight={searchQuery} />
        </a>
      </div>

      {/* Email */}
      <div className="hidden xl:flex items-center gap-2 text-xs text-muted-foreground min-w-[180px]" onClick={(e) => e.stopPropagation()}>
        {contact.email ? (
          <>
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <a
              href={`mailto:${contact.email}`}
              className="truncate text-[11px] hover:text-primary hover:underline transition-colors"
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
      <div className="hidden lg:flex items-center gap-1 min-w-[120px]">
        {contact.tags?.slice(0, 2).map(tag => (
          <Badge key={tag} variant="secondary" className="text-[10px] h-5 px-1.5">
            {tag}
          </Badge>
        ))}
        {(contact.tags?.length || 0) > 2 && (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            +{(contact.tags?.length || 0) - 2}
          </Badge>
        )}
      </div>

      {/* Date */}
      <span className="hidden md:block text-[11px] text-muted-foreground shrink-0">
        {format(new Date(contact.created_at), "dd/MM/yy", { locale: ptBR })}
      </span>

      {/* Actions */}
      <div
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button aria-label="Conversar" variant="ghost" size="icon" className="w-7 h-7 hover:bg-primary/10 hover:text-primary" onClick={() => onOpenChat(contact.id)} title="Conversar">
          <MessageSquare className="w-3.5 h-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Opções do contato" variant="ghost" size="icon" className="w-7 h-7">
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onEdit(contact)}>
              <Edit className="w-4 h-4 mr-2" />Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}>
              <Trash2 className="w-4 h-4 mr-2" />Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
