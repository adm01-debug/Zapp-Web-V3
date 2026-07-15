import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  Instagram,
  Send as SendIcon,
  Facebook,
  Mail,
  Globe,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmailChatInbox } from '@/components/email/EmailChatInbox';
import { dbFrom } from '@/integrations/datasource/db';

type ChannelType = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'email' | 'webchat';

interface UnifiedMessage {
  id: string;
  contactName: string;
  contactPhone: string;
  channelType: ChannelType;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  status: string;
  assignedTo: string | null;
}

const CHANNEL_CONFIG: Record<
  ChannelType,
  { icon: typeof MessageSquare; label: string; color: string }
> = {
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-success bg-success/10' },
  instagram: { icon: Instagram, label: 'Instagram', color: 'text-accent bg-accent/10' },
  telegram: { icon: SendIcon, label: 'Telegram', color: 'text-info bg-info/10' },
  messenger: { icon: Facebook, label: 'Messenger', color: 'text-info bg-info/10' },
  email: { icon: Mail, label: 'Email', color: 'text-warning bg-warning/10' },
  webchat: { icon: Globe, label: 'Webchat', color: 'text-secondary bg-secondary/10' },
};

export function OmnichannelInbox() {
  const [activeMainTab, setActiveMainTab] = useState<'channels' | 'email'>('channels');
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [channelStats, setChannelStats] = useState<Record<string, number>>({});
  const [connections, setConnections] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    loadConnections();
    loadUnifiedInbox();
  }, []);

  const loadConnections = async () => {
    const { data } = await supabase
      .from('channel_connections_safe')
      .select('*')
      .eq('is_active', true);

    if (data) setConnections(data);
  };

  const loadUnifiedInbox = async () => {
    setLoading(true);
    try {
      const { data: contacts, error } = await dbFrom('contacts')
        .select('id, name, phone, channel_type, updated_at, assigned_to')
        .order('updated_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const unified: UnifiedMessage[] = (contacts || []).map((contact) => ({
        id: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        channelType: (contact.channel_type as ChannelType) || 'whatsapp',
        lastMessage: '',
        timestamp: contact.updated_at,
        unread: false,
        status: 'open',
        assignedTo: contact.assigned_to,
      }));

      setMessages(unified);

      const stats: Record<string, number> = {};
      unified.forEach((m) => {
        stats[m.channelType] = (stats[m.channelType] || 0) + 1;
      });
      setChannelStats(stats);
    } catch {
      toast.error('Erro ao carregar inbox unificado');
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (activeChannel !== 'all' && m.channelType !== activeChannel) return false;
    if (search) {
      const s = search.toLowerCase();
      return (m.contactName ?? '').toLowerCase().includes(s) || (m.contactPhone ?? '').includes(s);
    }
    return true;
  });

  const getChannelIcon = (type: ChannelType) => {
    const config = CHANNEL_CONFIG[type] ?? CHANNEL_CONFIG.webchat;
    const Icon = config.icon;
    return (
      <div className={`rounded-lg p-1.5 ${config.color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Main Tabs: Channels | Email Chat */}
      <Tabs
        value={activeMainTab}
        onValueChange={(v) => setActiveMainTab(v as 'channels' | 'email' /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */)}
        className="flex h-full flex-col"
      >
        <div className="border-b px-4">
          <TabsList className="h-10 bg-transparent">
            <TabsTrigger
              value="channels"
              className="gap-1.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
            >
              <Globe className="h-4 w-4" />
              Canais
            </TabsTrigger>
            <TabsTrigger
              value="email"
              className="gap-1.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
            >
              <Mail className="h-4 w-4" />
              Email Chat
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Channels tab (original content) */}
        <TabsContent value="channels" className="mt-0 flex-1 overflow-auto">
          <div className="space-y-4 p-4 md:space-y-6">
            {/* Header */}
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold md:text-xl">Inbox Omnichannel</h2>
                  <p className="text-xs text-muted-foreground md:text-sm">
                    Todas as conversas em um só lugar • {connections.length} canais conectados
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadUnifiedInbox}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {/* Channel Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              {Object.entries(CHANNEL_CONFIG).map(([type, config]) => {
                const Icon = config.icon;
                const count = channelStats[type] || 0;
                return (
                  <Card
                    key={type}
                    className={`cursor-pointer transition-all ${activeChannel === type ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
                    onClick={() => setActiveChannel(activeChannel === type ? 'all' : type)}
                  >
                    <CardContent className="pb-3 pt-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className={`rounded p-1.5 ${config.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-lg font-bold">{count}</p>
                          <p className="text-[10px] text-muted-foreground">{config.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Message List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Conversas ({filteredMessages.length})
                  </CardTitle>
                  {activeChannel !== 'all' && (
                    <Button variant="ghost" size="sm" onClick={() => setActiveChannel('all')}>
                      Limpar filtro
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-1">
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                      ))
                    ) : filteredMessages.length === 0 ? (
                      <div className="py-12 text-center">
                        <Globe className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">Nenhuma conversa encontrada</p>
                      </div>
                    ) : (
                      filteredMessages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="relative">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="text-xs">
                                {msg.contactName.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-1 -right-1">
                              {getChannelIcon(msg.channelType)}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="truncate text-sm font-medium">{msg.contactName}</p>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(msg.timestamp), 'HH:mm', { locale: ptBR })}
                              </span>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {msg.contactPhone}
                            </p>
                          </div>
                          {msg.unread && (
                            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                          )}
                        </motion.div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Connected Channels */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Canais Conectados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {connections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum canal adicional conectado
                    </p>
                  ) : (
                    connections.map((conn) => {
                      const channelType = (conn.channel_type as ChannelType) || 'webchat';
                      const config = CHANNEL_CONFIG[channelType];
                      return (
                        <Badge key={conn.id as string} variant="outline" className="gap-1">
                          {config && <config.icon className="h-3 w-3" />}
                          {(conn.name as string) || config?.label || channelType}
                          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-success" />
                        </Badge>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Email Chat tab */}
        <TabsContent value="email" className="mt-0 min-h-0 flex-1">
          <EmailChatInbox />
        </TabsContent>
      </Tabs>
    </div>
  );
}
