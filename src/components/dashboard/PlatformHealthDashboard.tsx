/**
 * PlatformHealthDashboard.tsx
 * Global platform health dashboard using get_platform_health() RPC.
 * One call returns contacts + conversations + messages + webhooks KPIs.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getLogger } from '@/lib/logger';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users, MessageCircle, MessageSquare, Webhook,
  RefreshCw, AlertTriangle, Bot, Bell,
} from 'lucide-react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { SLADashboard } from '@/components/sla/SLADashboard';

const log = getLogger('PlatformHealthDashboard');

interface PlatformHealth {
  contacts: {
    total_active:     number;
    new_today:        number;
    duplicates:       number;
    consent_rate_pct: string;
  };
  conversations: {
    open:           number;
    closed_today:   number;
    unread:         number;
    bot_active:     number;
    avg_response_s: number | null;
  };
  messages: {
    total_today:   number;
    inbound_today: number;
    follow_ups:    number;
  };
  webhooks: {
    total_events:     number;
    processed_events: number;
    pending_events:   number;
    dlq_pending:      number;
  };
  instance_name: string;
  generated_at:  string;
}

function formatSeconds(s: number | null): string {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s/60)}min`;
  return `${(s/3600).toFixed(1)}h`;
}

interface Props {
  instanceName?: string;
  showSLA?:      boolean;
}

export const PlatformHealthDashboard: React.FC<Props> = ({
  instanceName = 'wpp2', showSLA = true,
}) => {
  const [data,    setData]    = useState<PlatformHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: health, error } = await safeClient.rpc<PlatformHealth>('get_platform_health', {
        p_instance_name: instanceName,
        p_days: 1,
      });
      if (!mountedRef.current) return;
      if (error) throw error;
      setData(health);
      setLastUpdated(new Date());
    } catch (err) {
      log.error('Failed to load platform health', err);
    } finally { if (mountedRef.current) setLoading(false); }
  }, [instanceName]);

  useEffect(() => {
    load();
    // Auto-refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  if (!data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}
        </div>
      </div>
    );
  }

  const webhookHealth = data.webhooks.dlq_pending === 0 && data.webhooks.pending_events === 0;
  const consentRate   = parseFloat(data.contacts.consent_rate_pct ?? '0');
  const hasDuplicates = data.contacts.duplicates > 0;

  const modules = [
    // Contacts
    { label: 'Contatos', value: data.contacts.total_active.toLocaleString('pt-BR'), sub: `+${data.contacts.new_today} hoje`, icon: Users, color: 'bg-primary text-primary' },
    { label: 'Duplicatas', value: data.contacts.duplicates.toLocaleString('pt-BR'), sub: hasDuplicates ? 'Mesclar aba Duplicados' : '✓ Nenhuma', icon: AlertTriangle, color: hasDuplicates ? 'bg-warning text-warning-foreground' : 'bg-primary text-primary' },
    // Conversations
    { label: 'Conversas abertas', value: data.conversations.open.toLocaleString('pt-BR'), sub: `${data.conversations.unread} não lidas`, icon: MessageCircle, color: 'bg-primary text-primary' },
    { label: 'Bots ativos', value: data.conversations.bot_active.toLocaleString('pt-BR'), sub: `TMP: ${formatSeconds(data.conversations.avg_response_s)}`, icon: Bot, color: 'bg-primary text-primary' },
    // Messages
    { label: 'Mensagens hoje', value: data.messages.total_today.toLocaleString('pt-BR'), sub: `${data.messages.inbound_today} recebidas`, icon: MessageSquare, color: 'bg-primary text-primary' },
    { label: 'Follow-ups', value: data.messages.follow_ups.toLocaleString('pt-BR'), sub: data.messages.follow_ups > 0 ? '⚠️ Pendentes' : '✓ Em dia', icon: Bell, color: data.messages.follow_ups > 0 ? 'bg-warning text-warning-foreground' : 'bg-primary text-primary' },
    // Webhooks
    { label: 'Webhooks hoje', value: data.webhooks.total_events.toLocaleString('pt-BR'), sub: `${data.webhooks.pending_events} pendentes`, icon: Webhook, color: 'bg-muted text-muted-foreground' },
    { label: 'DLQ', value: data.webhooks.dlq_pending.toLocaleString('pt-BR'), sub: webhookHealth ? '✓ Saudável' : '⚠️ Reprocessar', icon: AlertTriangle, color: webhookHealth ? 'bg-primary text-primary' : 'bg-destructive text-destructive-foreground' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${loading ? 'bg-warning animate-pulse' : 'bg-primary'}`} />
          <h2 className="text-sm font-semibold">Platform Health — {instanceName}</h2>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 w-7 p-0">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {(hasDuplicates || consentRate < 50 || data.webhooks.dlq_pending > 0 || data.messages.follow_ups > 0) && (
        <div className="flex flex-wrap gap-2">
          {hasDuplicates && (
            <Badge variant="outline" className="text-xs text-warning-foreground border-warning gap-1">
              <AlertTriangle className="h-3 w-3" />
              {data.contacts.duplicates} duplicatas — use aba Duplicados
            </Badge>
          )}
          {consentRate < 50 && (
            <Badge variant="outline" className="text-xs text-destructive-foreground border-destructive gap-1">
              <AlertTriangle className="h-3 w-3" />
              LGPD: {consentRate}% consentimento
            </Badge>
          )}
          {data.webhooks.dlq_pending > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertTriangle className="h-3 w-3" />
              {data.webhooks.dlq_pending} webhooks no DLQ
            </Badge>
          )}
          {data.messages.follow_ups > 0 && (
            <Badge variant="outline" className="text-xs text-warning-foreground border-warning gap-1">
              <Bell className="h-3 w-3" />
              {data.messages.follow_ups} follow-ups pendentes
            </Badge>
          )}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {modules.map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-full ${color} flex items-center justify-center shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight">{value}</p>
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* SLA Section */}
      {showSLA && (
        <div className="rounded-lg border p-3">
          <SLADashboard instanceName={instanceName} compact={false} />
        </div>
      )}
    </div>
  );
};

export default PlatformHealthDashboard;
