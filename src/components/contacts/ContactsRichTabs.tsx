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

export function ContactsRichTabs({ activeTab, setActiveTab, totalCount, contactCountByType }: Props) {
  const typedTabs = useMemo(
    () => TAB_ORDER.filter((k) => k !== 'all' && k !== 'duplicates' && k !== 'trash' && CONTACT_TYPE_CONFIG[k]),
    [],
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/40 p-1">
        <TabsTrigger value="all" className="gap-2 data-[state=active]:bg-background">
          Todos
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
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
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {count.toLocaleString('pt-BR')}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
        <div className="w-px h-6 bg-border mx-1 my-auto hidden sm:block" />
        <TabsTrigger
          value="duplicates"
          className="gap-2 data-[state=active]:bg-background text-warning-foreground hover:text-warning-foreground transition-colors"
        >
          <GitMerge className="w-3.5 h-3.5" />
          Duplicados
        </TabsTrigger>
        <TabsTrigger
          value="trash"
          className="gap-2 data-[state=active]:bg-background text-destructive hover:text-destructive/80 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Lixeira
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
