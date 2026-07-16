import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
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

export function ContactCard({
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      className={cn(
        'group relative rounded-2xl border border-border/40 bg-card hover:bg-muted/30',
        'cursor-pointer overflow-hidden transition-all duration-200',
        'hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10',
        isSelected && 'border-primary/30 bg-primary/5 ring-2 ring-primary/50'
      )}
      onClick={() => onOpenChat(contact.id)}
    >
      {/* Top accent bar */}
      <div className={cn('h-1 w-full', typeConfig.gradient)} />

      {/* Selection checkbox */}
      <div
        className={cn(
          'absolute left-3 top-3 z-10 transition-opacity duration-150',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
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
        className="absolute right-3 top-3 z-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Opções do contato"
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-background/60 backdrop-blur-sm hover:bg-background/90"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onOpenChat(contact.id)}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Conversar
            </DropdownMenuItem>
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

      <div className="space-y-4 p-5 pt-4">
        {/* Avatar + Name */}
        <div className="flex items-start gap-3.5">
          <div className="relative">
            <motion.div layoutId={`avatar-${contact.id}`}>
              <Avatar className="h-12 w-12 shadow-md ring-2 ring-background">
                <AvatarImage src={contact.avatar_url || undefined} alt={contact.name} />
                <AvatarFallback
                  className={cn('text-sm font-bold', avatarColors.bg, avatarColors.text)}
                >
                  {getInitials(contact.name)}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            {/* Type indicator dot */}
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background',
                typeConfig.dotBg
              )}
            >
              <span className="text-[8px] text-primary-foreground">{typeConfig.icon}</span>
            </div>
            {/* Company logo overlay */}
            {(companyLogo || contact.company) && (
              <div className="absolute -left-1 -top-1">
                <CompanyLogo
                  logoUrl={companyLogo}
                  companyName={companyName}
                  fallbackCompanyName={contact.company}
                  size="xs"
                  className="shadow-sm ring-2 ring-background"
                />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <HighlightText
                text={`${contact.name} ${contact.surname || ''}`.trim()}
                highlight={searchQuery}
                className="block max-w-[120px] truncate text-sm font-semibold leading-tight text-foreground"
              />
              {/* Health Score Indicator */}
              <div
                className={cn(
                  'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-tight',
                  getHealthColor(calculateContactHealth(contact))
                )}
                title="Saúde do Perfil"
              >
                <Activity className="h-2.5 w-2.5" />
                {calculateContactHealth(contact)}%
              </div>
            </div>
            {contact.nickname && (
              <p className="truncate text-xs text-muted-foreground">({contact.nickname})</p>
            )}
            <Badge
              variant="outline"
              className={cn(
                'mt-1 h-auto min-h-5 max-w-full gap-1 whitespace-normal px-1.5 py-0.5 text-[10px] font-medium',
                typeConfig.badgeClass
              )}
            >
              {typeConfig.iconNode}
              {typeConfig.label}
            </Badge>
          </div>
        </div>

        {/* Company & Job */}
        {(contact.company || contact.job_title) && (
          <div className="space-y-1 rounded-xl bg-muted/40 p-2.5">
            {contact.company && (
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <CompanyLogo
                  logoUrl={companyLogo}
                  companyName={companyName}
                  fallbackCompanyName={contact.company}
                  size="sm"
                />
                <HighlightText
                  text={companyName || contact.company || ''}
                  highlight={searchQuery}
                  className="truncate"
                />
              </div>
            )}
            {contact.job_title && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Briefcase className="h-3 w-3 shrink-0" />
                <HighlightText
                  text={contact.job_title}
                  highlight={searchQuery}
                  className="truncate"
                />
              </div>
            )}
          </div>
        )}

        {/* Contact info with quick actions */}
        <div className="space-y-1.5">
          <div
            className="group/phone flex items-center gap-2 text-xs text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <a
              href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[11px] transition-colors hover:text-primary hover:underline"
              title="Abrir no WhatsApp"
            >
              <HighlightText text={contact.phone} highlight={searchQuery} />
            </a>
          </div>
          {contact.email && (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <a
                href={`mailto:${contact.email}`}
                className="truncate text-[11px] transition-colors hover:text-primary hover:underline"
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
            {contact.tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                {tag}
              </Badge>
            ))}
            {contact.tags.length > 3 && (
              <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                +{contact.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/30 pt-1">
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(contact.created_at), 'dd MMM yyyy', { locale: ptBR })}
          </span>
          <div
            className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
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
            <Button
              aria-label="Editar contato"
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-muted"
              onClick={() => onEdit(contact)}
              title="Editar"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
