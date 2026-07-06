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
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <ContactStatsCards
          totalCount={totalCount}
          contactCountByType={contactCountByType}
          uniqueCompanies={uniqueCompanies}
          contacts={contactsForStats}
        />
        <ContactBirthdayPanel contacts={contactsForBirthday} onContactClick={onBirthdayContactClick} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-br from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent sm:text-4xl">
            Hub de Contatos
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground/80">
              <Users className="w-4 h-4 text-primary/60" />
              {totalCount.toLocaleString('pt-BR')} registros
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase">
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
              'hidden md:flex gap-2 transition-all',
              !highContrast
                ? 'border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5'
                : 'bg-foreground text-background hover:bg-foreground/90',
            )}
            title="Alto Contraste"
          >
            <Zap className={cn('w-4 h-4', highContrast ? 'text-warning' : 'text-muted-foreground')} />
            <span className="sr-only">Contraste</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenShortcuts}
            className="hidden md:flex gap-2 border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all"
            title="Atalhos de Teclado (?)"
          >
            <Keyboard className="w-4 h-4 text-muted-foreground" />
            <span className="sr-only">Atalhos</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenImport}
            className="gap-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all"
          >
            <Upload className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline font-medium">Importar CSV</span>
          </Button>
          <Button
            size="sm"
            onClick={onOpenAdd}
            className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all font-medium"
          >
            <UserPlus className="w-4 h-4" />
            Novo Registro
          </Button>
        </div>
      </div>
    </>
  );
}
