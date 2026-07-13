import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';

export type ModeFilter = 'all' | 'official' | 'unofficial';

export const OFFICIAL_PROVIDERS = ['whatsapp_cloud', 'cloud', 'meta', 'whatsapp-cloud'];
export const UNOFFICIAL_PROVIDERS = ['evolution', 'baileys', 'evolution-api'];
export const OFFICIAL_CHANNELS = ['whatsapp_cloud', 'cloud', 'official'];
export const UNOFFICIAL_CHANNELS = ['evolution', 'whatsapp', 'unofficial'];

export interface SendLogRow {
  id: string;
  provider: string;
  instance_name: string;
  direction: string;
  remote_jid: string;
  delivery_status: string;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  received_at: string;
  delivered_at: string | null;
}

export interface WebhookPingRow {
  id: string;
  kind: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface ErrorLogRow {
  id: string;
  instance_name: string;
  channel_type: string | null;
  remote_jid: string | null;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  retry_count: number;
  occurred_at: string;
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export function modeOfProvider(provider: string | null | undefined): ModeFilter {
  if (!provider) return 'all';
  const p = provider.toLowerCase();
  if (OFFICIAL_PROVIDERS.includes(p)) return 'official';
  if (UNOFFICIAL_PROVIDERS.includes(p)) return 'unofficial';
  return 'all';
}

export function modeBadge(mode: ModeFilter) {
  if (mode === 'official')
    return (
      <Badge variant="default" className="bg-primary hover:bg-primary">
        Cloud API
      </Badge>
    );
  if (mode === 'unofficial') return <Badge variant="secondary">Evolution</Badge>;
  return <Badge variant="outline">—</Badge>;
}

export function statusBadge(s: string) {
  const ok = ['delivered', 'read', 'sent', 'received'].includes(s);
  const warn = ['pending', 'queued', 'routing'].includes(s);
  if (ok)
    return (
      <Badge variant="outline" className="border-primary text-primary">
        {s}
      </Badge>
    );
  if (warn)
    return (
      <Badge variant="outline" className="border-warning text-warning-foreground">
        {s}
      </Badge>
    );
  return <Badge variant="destructive">{s}</Badge>;
}

export function kindBadge(kind: string) {
  if (kind === 'handshake')
    return (
      <Badge className="bg-primary hover:bg-primary">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        handshake
      </Badge>
    );
  if (kind === 'event') return <Badge variant="secondary">event</Badge>;
  if (kind === 'invalid_signature') return <Badge variant="destructive">invalid_signature</Badge>;
  if (kind === 'invalid_token') return <Badge variant="destructive">invalid_token</Badge>;
  return <Badge variant="outline">{kind}</Badge>;
}

export function EmptyState({ mode, kind }: { mode: ModeFilter; kind: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      Nenhum {kind} encontrado
      {mode !== 'all' ? ` no modo ${mode === 'official' ? 'oficial' : 'não-oficial'}` : ''}.
    </div>
  );
}
