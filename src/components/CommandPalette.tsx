import { useEffect, useState, useMemo } from 'react';
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';
import { Clock } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  primaryNav,
  communicationNav,
  automationNav,
  salesNav,
  connectionsNav,
  analyticsNav,
  systemNav,
} from '@/components/layout/sidebarNavConfig';
import type { NavItemConfig } from '@/components/layout/SidebarNavItem';

interface CommandPaletteProps {
  onNavigate: (view: string) => void;
}

const RECENT_KEY = 'zapp-recent-modules';
const MAX_RECENT = 5;

const groups: { label: string; items: readonly NavItemConfig[] }[] = [
  { label: 'Principal', items: primaryNav },
  { label: 'Comunicação', items: communicationNav },
  { label: 'Automação & IA', items: automationNav },
  { label: 'Vendas & CRM', items: salesNav },
  { label: 'Conexões', items: connectionsNav },
  { label: 'Analytics', items: analyticsNav },
  { label: 'Sistema', items: systemNav },
];

const allItems = groups.flatMap(g => g.items);

function getRecent(): string[] {
  return safeGetJSON<string[]>(RECENT_KEY, []);
}

function pushRecent(id: string) {
  const list = getRecent().filter(r => r !== id);
  list.unshift(id);
  safeSetJSON(RECENT_KEY, list.slice(0, MAX_RECENT));
}

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) setRecent(getRecent());
  }, [open]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', down);
    const handler = () => setOpen(true);
    document.addEventListener('open-global-search', handler);
    return () => {
      window.removeEventListener('keydown', down);
      document.removeEventListener('open-global-search', handler);
    };
  }, []);

  const recentItems = useMemo(
    () => recent.map(id => allItems.find(i => i.id === id)).filter(Boolean) as NavItemConfig[],
    [recent]
  );

  const select = (id: string) => {
    pushRecent(id);
    onNavigate(id);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar módulo… (ex: pipeline, chatbot)" />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>Nenhum módulo encontrado.</CommandEmpty>

        {recentItems.length > 0 && (
          <>
            <CommandGroup heading="Recentes">
              {recentItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem key={`recent-${item.id}`} onSelect={() => select(item.id)} className="gap-2 cursor-pointer">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {groups.map((group, i) => (
          <div key={group.label}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group.label}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem key={item.id} onSelect={() => select(item.id)} className="gap-2 cursor-pointer">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/60 ">#{item.id}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
