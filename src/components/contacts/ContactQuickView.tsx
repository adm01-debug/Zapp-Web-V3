import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  Mail,
  Building,
  Briefcase,
  Calendar,
  Tag,
  MessageSquare,
  Edit3,
  Trash2,
  Globe,
  Activity,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { calculateContactHealth, getHealthColor } from '@/lib/contactHealth';
import type { Contact } from './types';

interface ContactQuickViewProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onOpenChat: (phone: string, name: string) => void;
}

/** Contact Quick View component for the contacts section. */
export const ContactQuickView: React.FC<ContactQuickViewProps> = ({
  contact,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onOpenChat,
}) => {
  // Hook antes de qualquer early-return (rules-of-hooks); tolera contato nulo.
  const health = useMemo(() => (contact ? calculateContactHealth(contact) : 0), [contact]);

  if (!contact) return null;

  const typeCfg = contact.contact_type ? CONTACT_TYPE_CONFIG[contact.contact_type] : null;
  const initials = (contact.name ?? '')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const healthColor = getHealthColor(health);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="overflow-y-auto border-l border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl sm:max-w-md">
        <motion.div
          layoutId={`contact-${contact.id}`}
          className="absolute inset-0 z-[-1] bg-card opacity-50"
        />

        <SheetHeader className="space-y-4 border-b border-border/30 pb-6">
          <div className="flex items-start justify-between">
            <motion.div layoutId={`avatar-${contact.id}`}>
              <Avatar className="h-20 w-20 border-4 border-background shadow-xl">
                <AvatarImage src={contact.avatar_url || ''} alt={contact.name ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            <div className="flex gap-2">
              <Button
                aria-label="Editar contato"
                size="icon"
                variant="outline"
                className="rounded-full"
                onClick={() => onEdit(contact)}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button
                aria-label="Excluir contato"
                size="icon"
                variant="outline"
                className="rounded-full text-destructive hover:bg-destructive/5"
                onClick={() => onDelete(contact)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <SheetTitle className="text-2xl font-bold tracking-tight">
              {`${contact.name ?? ''} ${contact.surname ?? ''}`.trim()}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {typeCfg && (
                <Badge variant="secondary" className="gap-1.5 px-2 py-0.5 font-medium">
                  {typeCfg.iconNode}
                  {typeCfg.label}
                </Badge>
              )}
              {contact.nickname && (
                <span className="text-sm font-medium italic text-muted-foreground">
                  "{contact.nickname}"
                </span>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Health Score Overview */}
        <div className="mt-6 px-1">
          <div
            className={cn(
              'space-y-3 rounded-2xl border border-border/50 p-4 shadow-sm',
              healthColor.split(' ')[1]
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn('rounded-lg p-2', healthColor)}>
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold">Saúde do Cadastro</p>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Integridade de Dados
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className={cn('text-2xl font-black', healthColor.split(' ')[0])}>
                  {health}%
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${health}%` }}
                className={cn(
                  'h-full',
                  health >= 70 ? 'bg-primary' : health >= 40 ? 'bg-warning' : 'bg-destructive'
                )}
              />
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground">
              {health >= 90
                ? 'Perfil excelente! Todos os dados essenciais estão presentes.'
                : health >= 70
                  ? 'Perfil muito bom. Adicione algumas tags ou cargo para chegar a 100%.'
                  : 'Este perfil precisa de mais informações para ser útil nas automações.'}
            </p>
          </div>
        </div>

        {/* Smart Insights & Actions */}
        <div className="mt-4 px-1">
          <div className="group relative space-y-3 overflow-hidden rounded-2xl border border-primary/10 bg-primary/5 p-4">
            <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-primary/10 blur-2xl transition-colors group-hover:bg-primary/20" />
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Hana AI Insights</h4>
            </div>

            <div className="space-y-2">
              {!contact.email && (
                <div className="flex items-start gap-2 rounded-lg border border-border/30 bg-background/50 p-2 text-[11px] text-muted-foreground">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                  <p>
                    Faltando <strong>E-mail</strong>: Adicione para liberar automações de marketing
                    e envio de propostas.
                  </p>
                </div>
              )}
              {!contact.company && (
                <div className="flex items-start gap-2 rounded-lg border border-border/30 bg-background/50 p-2 text-[11px] text-muted-foreground">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <p>
                    Sem <strong>Empresa</strong>: Vincular a uma empresa ajuda a agrupar
                    faturamentos no Analytics.
                  </p>
                </div>
              )}
              {contact.tags?.length === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-border/30 bg-background/50 p-2 text-[11px] text-muted-foreground">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <p>
                    Sem <strong>Etiquetas</strong>: Use tags para segmentar este contato em
                    campanhas futuras.
                  </p>
                </div>
              )}
              {health >= 90 && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-[11px] text-primary">
                  <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" />
                  <p>
                    <strong>Engajamento:</strong> Este contato possui dados completos. Pronto para
                    campanhas de alta conversão!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8 py-6">
          {/* Informações de Contato */}
          <section className="space-y-4">
            <h3 className="px-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Contato
            </h3>
            <div className="space-y-3">
              <div className="group flex items-center gap-3 rounded-xl bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/50 bg-background text-primary">
                  <Phone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">
                    WhatsApp / Celular
                  </p>
                  <p className="truncate font-semibold">{contact.phone}</p>
                </div>
                <div className="flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 rounded-full p-0"
                    onClick={() => window.open(`tel:${contact.phone}`)}
                    aria-label="Ligar"
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 rounded-full px-3"
                    onClick={() => onOpenChat(contact.phone ?? '', contact.name ?? '')}
                  >
                    Chat
                  </Button>
                </div>
              </div>

              {contact.email && (
                <div className="group flex items-center gap-3 rounded-xl bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/50 bg-background text-primary">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground">
                      E-mail
                    </p>
                    <p className="truncate font-semibold">{contact.email}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => window.open(`mailto:${contact.email}`)}
                    aria-label="Enviar e-mail"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Empresa e Cargo */}
          {(contact.company || contact.job_title) && (
            <section className="space-y-4">
              <h3 className="px-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Profissional
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {contact.company && (
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background p-3">
                    <Building className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] font-medium uppercase text-muted-foreground">
                        Empresa
                      </p>
                      <p className="font-semibold">{contact.company}</p>
                    </div>
                  </div>
                )}
                {contact.job_title && (
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background p-3">
                    <Briefcase className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] font-medium uppercase text-muted-foreground">
                        Cargo
                      </p>
                      <p className="font-semibold">{contact.job_title}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <section className="space-y-4">
              <h3 className="px-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Tags
              </h3>
              <div className="flex flex-wrap gap-2 px-1">
                {contact.tags.map((tag: string) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="border-primary/20 bg-primary/5 px-3 py-1 text-primary"
                  >
                    <Tag className="mr-1.5 h-3 w-3 opacity-70" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Timeline / Info */}
          <section className="space-y-4">
            <h3 className="px-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Sistema
            </h3>
            <div className="space-y-3 rounded-xl bg-muted/30 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" /> Criado em
                </span>
                <span className="font-medium">
                  {format(new Date(contact.created_at ?? ''), "dd 'de' MMMM, yyyy", {
                    locale: ptBR,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4" /> Origem
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  Hana CRM
                </Badge>
              </div>
            </div>
          </section>
        </div>

        <SheetFooter className="sticky bottom-0 mt-8 border-t border-border/30 bg-background pt-6">
          <Button
            className="h-12 w-full gap-2 text-base shadow-lg shadow-primary/20"
            onClick={() => onOpenChat(contact.phone ?? '', contact.name ?? '')}
          >
            <MessageSquare className="h-5 w-5" />
            Abrir Conversa no WhatsApp
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
