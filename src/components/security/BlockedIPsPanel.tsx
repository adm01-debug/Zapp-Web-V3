import { useState, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, Plus, Trash2, Clock, Globe, Loader2, Search, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BlockIPDialog, UnblockIPDialog } from './BlockedIPDialogs';
import { normalizeBlockedIP, type NormalizedBlockedIP as BlockedIP } from '@/lib/normalizers';

/** Blocked IPs Panel component for the security section. */
export function BlockedIPsPanel() {
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [ipToRemove, setIpToRemove] = useState<BlockedIP | null>(null);
  const mountedRef = useMountedRef();

  const fetchBlockedIPs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blocked_ips')
      .select('*')
      .order('blocked_at', { ascending: false });
    if (!mountedRef.current) return;
    if (!error && data)
      setBlockedIPs(
        data.map((row) => normalizeBlockedIP(row as unknown as Record<string, unknown>))
      );
    setLoading(false);
  };

  useEffect(() => {
    void fetchBlockedIPs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredIPs = blockedIPs.filter(
    (ip) => ip.ip_address.includes(search) || ip.reason.toLowerCase().includes(search.toLowerCase())
  );
  const isExpired = (expiresAt: string | null) =>
    expiresAt ? new Date(expiresAt) < new Date() : false;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <Ban className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <CardTitle>IPs Bloqueados</CardTitle>
                <CardDescription>Gerencie endereços IP bloqueados do sistema</CardDescription>
              </div>
            </div>
            <Button onClick={() => setShowAddDialog(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Bloquear IP
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por IP ou motivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredIPs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Shield className="mx-auto mb-2 h-12 w-12 opacity-20" />
              <p>Nenhum IP bloqueado</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filteredIPs.map((ip) => (
                  <motion.div
                    key={ip.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`flex items-center justify-between rounded-lg border p-3 ${isExpired(ip.expires_at) ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="font-medium">{ip.ip_address}</code>
                          {ip.is_permanent ? (
                            <Badge variant="destructive">Permanente</Badge>
                          ) : isExpired(ip.expires_at) ? (
                            <Badge variant="secondary">Expirado</Badge>
                          ) : (
                            <Badge variant="outline">
                              <Clock className="mr-1 h-3 w-3" />
                              Expira{' '}
                              {formatDistanceToNow(new Date(ip.expires_at ?? ''), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{ip.reason}</p>
                        {ip.request_count > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {ip.request_count} tentativas desde o bloqueio
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIpToRemove(ip)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
      <BlockIPDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={fetchBlockedIPs}
      />
      <UnblockIPDialog
        ip={ipToRemove}
        onClose={() => setIpToRemove(null)}
        onSuccess={fetchBlockedIPs}
      />
    </>
  );
}
