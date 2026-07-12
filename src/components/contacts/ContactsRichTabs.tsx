import { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { GitMerge, Trash2 } from 'lucide-react';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';

const TAB_ORDER = [
  'all',
  'cliente',
  'fornecedor',
  'colaborador',
  'prestador_servico',
  'lead',
  'parceiro',
  'sicoob_gifts',
  'transportadora',
  'outros',
  'duplicates',
  'trash',
] as const;

interface Props {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  totalCount: number;
  contactCountByType: Record<string, number>;
}

export function ContactsRichTabs({
  activeTab,
  setActiveTab,
  totalCount,
  contactCountByType,
}: Props) {
  const typedTabs = useMemo(
    () =>
      TAB_ORDER.filter(
        (k) => k !== 'all' && k !== 'duplicates' && k !== 'trash' && CONTACT_TYPE_CONFIG[k]
      ),
    []
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/40 p-1">
        <TabsTrigger value="all" className="gap-2 data-[state=active]:bg-background">
          Todos
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            {(contactCountByType.all ?? totalCount).toLocaleString('pt-BR')}
          </Badge>
        </TabsTrigger>
        {typedTabs.map((key) => {
          const cfg = CONTACT_TYPE_CONFIG[key];
          const count = contactCountByType[key] ?? 0;
          return (
            <TabsTrigger key={key} value={key} className="gap-2 data-[state=active]:bg-background">
              <span className="flex items-center gap-1.5">
                {cfg?.iconNode}
                {cfg?.label || key}
              </span>
              {count > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  {count.toLocaleString('pt-BR')}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
        <div className="mx-1 my-auto hidden h-6 w-px bg-border sm:block" />
        <TabsTrigger
          value="duplicates"
          className="gap-2 text-warning-foreground transition-colors hover:text-warning-foreground data-[state=active]:bg-background"
        >
          <GitMerge className="h-3.5 w-3.5" />
          Duplicados
        </TabsTrigger>
        <TabsTrigger
          value="trash"
          className="gap-2 text-destructive transition-colors hover:text-destructive/80 data-[state=active]:bg-background"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Lixeira
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
