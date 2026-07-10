import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UserPlus, Upload, Keyboard, Users, Zap } from 'lucide-react';
import { ContactStatsCards } from './ContactStatsCards';
import { ContactBirthdayPanel } from './ContactBirthdayPanel';

interface BirthdayContact {
  id: string;
  name: string;
  avatar_url?: string | null;
  birthday: string | null;
}

interface Props {
  totalCount: number;
  contactCountByType: Record<string, number>;
  uniqueCompanies: string[];
  contactsForStats: { created_at: string }[];
  contactsForBirthday: BirthdayContact[];
  highContrast: boolean;
  onToggleHighContrast: () => void;
  onOpenShortcuts: () => void;
  onOpenImport: () => void;
  onOpenAdd: () => void;
  onBirthdayContactClick: (id: string) => void;
}

export function ContactsRichHeader({
  totalCount,
  contactCountByType,
  uniqueCompanies,
  contactsForStats,
  contactsForBirthday,
  highContrast,
  onToggleHighContrast,
  onOpenShortcuts,
  onOpenImport,
  onOpenAdd,
  onBirthdayContactClick,
}: Props) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <ContactStatsCards
          totalCount={totalCount}
          contactCountByType={contactCountByType}
          uniqueCompanies={uniqueCompanies}
          contacts={contactsForStats}
        />
        <ContactBirthdayPanel
          contacts={contactsForBirthday}
          onContactClick={onBirthdayContactClick}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="bg-gradient-to-br from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
            Hub de Contatos
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground/80">
              <Users className="h-4 w-4 text-primary/60" />
              {totalCount.toLocaleString('pt-BR')} registros
            </span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
              Hana Smart View
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={highContrast ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleHighContrast}
            className={cn(
              'hidden gap-2 transition-all md:flex',
              !highContrast
                ? 'border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5'
                : 'bg-foreground text-background hover:bg-foreground/90'
            )}
            title="Alto Contraste"
          >
            <Zap
              className={cn('h-4 w-4', highContrast ? 'text-warning' : 'text-muted-foreground')}
            />
            <span className="sr-only">Contraste</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenShortcuts}
            className="hidden gap-2 border-muted-foreground/20 transition-all hover:border-primary/40 hover:bg-primary/5 md:flex"
            title="Atalhos de Teclado (?)"
          >
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Atalhos</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenImport}
            className="gap-2 border-primary/20 transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <Upload className="h-4 w-4 text-primary" />
            <span className="hidden font-medium sm:inline">Importar CSV</span>
          </Button>
          <Button
            size="sm"
            onClick={onOpenAdd}
            className="gap-2 font-medium shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30"
          >
            <UserPlus className="h-4 w-4" />
            Novo Registro
          </Button>
        </div>
      </div>
    </>
  );
}
