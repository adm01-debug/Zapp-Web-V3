// @ts-nocheck
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
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

export function ContactCard({
  contact, isSelected, onToggleSelect, onOpenChat, onEdit, onDelete, index, companyLogo, companyName, searchQuery,
}: ContactItemProps) {
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  const avatarColors = getAvatarColor(contact.name);

  return (
    <motion.div
      layoutId={`contact-${contact.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      className={cn(
        "group relative rounded-2xl border border-border/40 bg-card hover:bg-muted/30",
        "transition-all duration-200 cursor-pointer overflow-hidden",
        "hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/30",
        isSelected && "ring-2 ring-primary/50 border-primary/30 bg-primary/5"
      )}
      onClick={() => onOpenChat(contact.id)}
    >
      {/* Top accent bar */}
      <div className={cn("h-1 w-full", typeConfig.gradient)} />

      {/* Selection checkbox */}
      <div
        className={cn(
          "absolute top-3 left-3 z-10 transition-opacity duration-150",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelect(contact.id, !!checked)}
          className="bg-background/80 backdrop-blur-sm"
        />
      </div>

      {/* Actions dropdown */}
      <div
        className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Opções do contato" variant="ghost" size="icon" className="w-7 h-7 bg-background/60 backdrop-blur-sm hover:bg-background/90">
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onOpenChat(contact.id)}>
              <MessageSquare className="w-4 h-4 mr-2" />Conversar
            </DropdownMenuItem>
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

      <div className="p-5 pt-4 space-y-4">
        {/* Avatar + Name */}
        <div className="flex items-start gap-3.5">
          <div className="relative">
            <motion.div layoutId={`avatar-${contact.id}`}>
              <Avatar className="w-12 h-12 ring-2 ring-background shadow-md">
                <AvatarImage src={contact.avatar_url || undefined} alt={contact.name} />
                <AvatarFallback className={cn('font-bold text-sm', avatarColors.bg, avatarColors.text)}>
                  {getInitials(contact.name)}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            {/* Type indicator dot */}
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center",
              typeConfig.dotBg
            )}>
              <span className="text-[8px] text-primary-foreground">{typeConfig.icon}</span>
            </div>
            {/* Company logo overlay */}
            {(companyLogo || contact.company) && (
              <div className="absolute -top-1 -left-1">
                <CompanyLogo
                  logoUrl={companyLogo}
                  companyName={companyName}
                  fallbackCompanyName={contact.company}
                  size="xs"
                  className="ring-2 ring-background shadow-sm"
                />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <HighlightText
                text={`${contact.name} ${contact.surname || ''}`.trim()}
                highlight={searchQuery}
                className="font-semibold text-sm text-foreground truncate leading-tight block max-w-[120px]"
              />
              {/* Health Score Indicator */}
              <div className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-tight",
                getHealthColor(calculateContactHealth(contact))
              )} title="Saúde do Perfil">
                <Activity className="w-2.5 h-2.5" />
                {calculateContactHealth(contact)}%
              </div>
            </div>
            {contact.nickname && (
              <p className="text-xs text-muted-foreground truncate">({contact.nickname})</p>
            )}
            <Badge
              variant="outline"
              className={cn("mt-1 text-[10px] h-auto min-h-5 py-0.5 px-1.5 font-medium gap-1 max-w-full whitespace-normal", typeConfig.badgeClass)}
            >
              {typeConfig.iconNode}
              {typeConfig.label}
            </Badge>
          </div>
        </div>

        {/* Company & Job */}
        {(contact.company || contact.job_title) && (
          <div className="bg-muted/40 rounded-xl p-2.5 space-y-1">
            {contact.company && (
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <CompanyLogo
                  logoUrl={companyLogo}
                  companyName={companyName}
                  fallbackCompanyName={contact.company}
                  size="sm"
                />
                <HighlightText text={companyName || contact.company || ""} highlight={searchQuery} className="truncate" />
              </div>
            )}
            {contact.job_title && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Briefcase className="w-3 h-3 shrink-0" />
                <HighlightText text={contact.job_title} highlight={searchQuery} className="truncate" />
              </div>
            )}
          </div>
        )}

        {/* Contact info with quick actions */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground group/phone" onClick={(e) => e.stopPropagation()}>
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <a
              href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className=" text-[11px] truncate hover:text-primary hover:underline transition-colors"
              title="Abrir no WhatsApp"
            >
              <HighlightText text={contact.phone} highlight={searchQuery} />
            </a>
          </div>
          {contact.email && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <a
                href={`mailto:${contact.email}`}
                className="truncate text-[11px] hover:text-primary hover:underline transition-colors"
                title="Enviar email"
              >
                <HighlightText text={contact.email} highlight={searchQuery} />
              </a>
            </div>
          )}
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {contact.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px] h-5 px-1.5 rounded-md">
                {tag}
              </Badge>
            ))}
            {contact.tags.length > 3 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-md">
                +{contact.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(contact.created_at), "dd MMM yyyy", { locale: ptBR })}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <Button
              aria-label="Conversar"
              variant="ghost"
              size="icon"
              className="w-7 h-7 hover:bg-primary/10 hover:text-primary"
              onClick={() => onOpenChat(contact.id)}
              title="Conversar"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
            <Button
              aria-label="Editar contato"
              variant="ghost"
              size="icon"
              className="w-7 h-7 hover:bg-muted"
              onClick={() => onEdit(contact)}
              title="Editar"
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
