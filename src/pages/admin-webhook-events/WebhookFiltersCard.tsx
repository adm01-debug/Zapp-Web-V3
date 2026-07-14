import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EVENT_TYPES,
  MESSAGE_TYPES,
  STATUS_OPTIONS,
  RANGE_OPTIONS,
  type EventTypeFilter,
} from './useWebhookEvents';

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

interface Props {
  hours: string;
  setHours: (v: string) => void;
  eventType: EventTypeFilter;
  setEventType: (v: EventTypeFilter) => void;
  instance: string;
  setInstance: (v: string) => void;
  messageType: string;
  setMessageType: (v: (typeof MESSAGE_TYPES)[number]) => void;
  status: string;
  setStatus: (v: (typeof STATUS_OPTIONS)[number]['value']) => void;
  remoteJidFilter: string;
  setRemoteJidFilter: (v: string) => void;
  pushNameFilter: string;
  setPushNameFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  instances: string[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

export function WebhookFiltersCard({
  hours,
  setHours,
  eventType,
  setEventType,
  instance,
  setInstance,
  messageType,
  setMessageType,
  status,
  setStatus,
  remoteJidFilter,
  setRemoteJidFilter,
  pushNameFilter,
  setPushNameFilter,
  search,
  setSearch,
  instances,
  hasActiveFilters,
  clearFilters,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Filtros</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <FilterField label="Janela">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Tipo de evento">
          <Select
            value={eventType}
            onValueChange={(v) =>
              setEventType(
                v as EventTypeFilter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
              )
            }
          >
            <SelectTrigger className="w-[220px]" data-testid="filter-webhook-event-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === 'all' ? 'Todos' : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Instância">
          <Select value={instance} onValueChange={setInstance}>
            <SelectTrigger className="w-[160px]" data-testid="filter-webhook-instance">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {instances.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Tipo de mensagem">
          <Select
            value={messageType}
            onValueChange={(v) =>
              setMessageType(
                v as (typeof MESSAGE_TYPES)[number] /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
              )
            }
          >
            <SelectTrigger className="w-[200px]" data-testid="filter-webhook-message-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESSAGE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === 'all' ? 'Todos' : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Status">
          <Select
            value={status}
            onValueChange={(v) =>
              setStatus(
                v as (typeof STATUS_OPTIONS)[number]['value'] /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
              )
            }
          >
            <SelectTrigger className="w-[160px]" data-testid="filter-webhook-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Remote JID">
          <Input
            value={remoteJidFilter}
            onChange={(e) => setRemoteJidFilter(e.target.value)}
            placeholder="Ex: 5511999"
            className="w-[200px]"
            data-testid="filter-webhook-remote-jid"
          />
        </FilterField>

        <FilterField label="Push name">
          <Input
            value={pushNameFilter}
            onChange={(e) => setPushNameFilter(e.target.value)}
            placeholder="Ex: João"
            className="w-[200px]"
            data-testid="filter-webhook-push-name"
          />
        </FilterField>

        <FilterField label="Refinar (texto livre)">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtra resultado já carregado"
            className="w-[240px]"
            data-testid="filter-webhook-search"
          />
        </FilterField>

        {hasActiveFilters && (
          <FilterField label=" ">
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              data-testid="filter-webhook-clear"
              onClick={clearFilters}
            >
              Limpar filtros
            </Button>
          </FilterField>
        )}
      </CardContent>
    </Card>
  );
}
