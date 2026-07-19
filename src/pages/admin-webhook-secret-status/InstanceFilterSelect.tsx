import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Server } from 'lucide-react';
import { SELECTABLE_WHATSAPP_INSTANCES } from '@/lib/constants/whatsappInstances';

interface InstanceFilterSelectProps {
  instances: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

const ALL_VALUE = '__all__';

/** Instance Filter Select. */
export function InstanceFilterSelect({
  instances,
  value,
  onChange,
  disabled,
}: InstanceFilterSelectProps) {
  return (
    <Select
      value={value ?? ALL_VALUE}
      onValueChange={(v) => onChange(v === ALL_VALUE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="w-[200px]">
        <Server className="h-4 w-4 mr-2 text-muted-foreground" />
        <SelectValue placeholder="Todas as instâncias" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>Todas as instâncias</SelectItem>
        {SELECTABLE_WHATSAPP_INSTANCES.map((inst) => (
          <SelectItem key={inst} value={inst}>
            {inst}
          </SelectItem>
        ))}
        {/* Dynamic instances from logs that might not be in the core list yet */}
        {instances
          .filter((inst) => !(SELECTABLE_WHATSAPP_INSTANCES as readonly string[]).includes(inst))
          .map((inst) => (
            <SelectItem key={inst} value={inst}>
              {inst} (Log)
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
