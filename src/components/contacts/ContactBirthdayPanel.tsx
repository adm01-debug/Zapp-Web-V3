import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cake, Gift, PartyPopper, Calendar } from 'lucide-react';
import { format, differenceInDays, setYear, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatarColors';
import type { ContactRow } from '@/integrations/supabase/schema';

// W4 (2026-07-06): derivado do schema gerado. ATENÇÃO: 'birthday' NÃO existe em
// zapp.contacts (verificado via information_schema) — painel fica inerte até a
// coluna existir ou a fonte ser metadata. Decisão de produto registrada no REFACTOR_PLAN.
type Contact = Pick<NonNullable<ContactRow>, 'id' | 'name'> &
  Partial<Pick<NonNullable<ContactRow>, 'avatar_url'>> & { birthday?: string | null };

interface ContactBirthdayPanelProps {
  contacts: Contact[];
  onContactClick?: (id: string) => void;
}

function getUpcomingBirthdays(contacts: Contact[], days = 30) {
  const today = startOfDay(new Date());
  const thisYear = today.getFullYear();

  return contacts
    .filter((c) => c.birthday)
    .map((c) => {
      const bday = new Date(c.birthday as string);
      let nextBday = setYear(bday, thisYear);
      if (nextBday < today) nextBday = setYear(bday, thisYear + 1);
      const daysUntil = differenceInDays(nextBday, today);
      return { contact: c, nextBday, daysUntil };
    })
    .filter((b) => b.daysUntil <= days)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

function getDaysLabel(days: number) {
  if (days === 0) return { text: 'Hoje! 🎉', variant: 'default' as const };
  if (days === 1) return { text: 'Amanhã', variant: 'secondary' as const };
  if (days <= 7) return { text: `${days} dias`, variant: 'outline' as const };
  return { text: `${days} dias`, variant: 'outline' as const };
}

export function ContactBirthdayPanel({ contacts, onContactClick }: ContactBirthdayPanelProps) {
  const upcoming = useMemo(() => getUpcomingBirthdays(contacts), [contacts]);

  if (upcoming.length === 0) {
    return (
      <Card className="border-border/40">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
            <Cake className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhum aniversário nos próximos 30 dias</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Adicione datas de nascimento aos contatos
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(340_70%_92%)]">
            <PartyPopper className="h-3.5 w-3.5 text-[hsl(340_70%_40%)]" />
          </div>
          Aniversários Próximos
          <Badge variant="secondary" className="ml-auto h-5 text-[10px]">
            {upcoming.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="max-h-48">
          <div className="space-y-2">
            {upcoming.map((item, i) => {
              const { text, variant } = getDaysLabel(item.daysUntil);
              const colors = getAvatarColor(item.contact.name);
              return (
                <motion.button
                  key={item.contact.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => onContactClick?.(item.contact.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
                    'hover:bg-muted/50',
                    item.daysUntil === 0 && 'border border-primary/20 bg-primary/5'
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={item.contact.avatar_url || undefined}
                      alt={item.contact.name}
                    />
                    <AvatarFallback className={cn(colors.bg, colors.text, 'text-[10px]')}>
                      {getInitials(item.contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{item.contact.name}</p>
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="h-2.5 w-2.5" />
                      {format(item.nextBday, 'dd MMM', { locale: ptBR })}
                    </p>
                  </div>
                  <Badge
                    variant={variant}
                    className={cn(
                      'h-5 shrink-0 text-[10px]',
                      item.daysUntil === 0 && 'bg-primary text-primary-foreground'
                    )}
                  >
                    {item.daysUntil === 0 ? <Gift className="mr-1 h-3 w-3" /> : null}
                    {text}
                  </Badge>
                </motion.button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
