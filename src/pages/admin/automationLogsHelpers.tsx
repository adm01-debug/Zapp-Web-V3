import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollText, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';

export interface ExecutionRow {
  id: string;
  rule_id: string | null;
  remote_jid: string;
  instance_name: string | null;
  status: 'pending' | 'executed' | 'dismissed' | 'error' | string;
  trigger_payload: Record<string, unknown> | null;
  suggestion_text: string | null;
  applied_tags: string[] | null;
  recommended_tag: string | null;
  kb_sources: string[] | null;
  rule_snapshot: Record<string, unknown> | null;
  channel_id: string | null;
  department_id: string | null;
  error_message: string | null;
  error_at: string | null;
  acted_at: string | null;
  acted_by: string | null;
  created_at: string;
}

export interface RuleLite {
  id: string;
  name: string;
}

export const STATUS_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; variant: string }
> = {
  pending: { label: 'Pendente', icon: Clock, variant: 'outline' },
  accepted: { label: 'Aceita', icon: CheckCircle2, variant: 'default' },
  executed: { label: 'Executada', icon: CheckCircle2, variant: 'default' },
  dismissed: { label: 'Descartada', icon: XCircle, variant: 'secondary' },
  failed: { label: 'Falhou', icon: AlertTriangle, variant: 'destructive' },
};

export type AutomationStatus = 'pending' | 'accepted' | 'executed' | 'dismissed' | 'failed';

export const PAGE_SIZE = 50;

export function statusBadge(s: string) {
  const meta = STATUS_META[s] ?? { label: s, icon: ScrollText, variant: 'outline' };
  const Icon = meta.icon;
  return (
    <Badge
      variant={meta.variant as 'default' | 'secondary' | 'destructive' | 'outline'}
      className="gap-1"
    >
      <Icon className="h-3 w-3" /> {meta.label}
    </Badge>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="max-w-[280px] truncate">{v}</span>
    </div>
  );
}

export function Pre({ title, data }: { title: string; data: unknown }) {
  return (
    <div>
      <Label className="text-xs">{title}</Label>
      <pre className="mt-1 max-h-[200px] overflow-x-auto rounded-md border bg-muted/30 p-2 text-[11px]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
