import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Tag, Brain, Loader2, CheckCircle, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('AutoTicketClassifier');

interface ClassifiedTicket {
  contactId: string;
  contactName: string;
  category: string;
  priority: string;
  confidence: number;
  tags: string[];
  lastMessage: string;
}

const CATEGORIES = [
  { name: 'Suporte Técnico', color: 'bg-info/10 text-info', icon: '🔧' },
  { name: 'Vendas', color: 'bg-success/10 text-success', icon: '💰' },
  { name: 'Financeiro', color: 'bg-warning/10 text-warning', icon: '💳' },
  { name: 'Reclamação', color: 'bg-destructive/10 text-destructive', icon: '⚠️' },
  { name: 'Informação', color: 'bg-secondary/10 text-secondary', icon: 'ℹ️' },
  { name: 'Agendamento', color: 'bg-accent/10 text-accent-foreground', icon: '📅' },
];

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgente', color: 'bg-destructive text-destructive-foreground' },
  high: { label: 'Alta', color: 'bg-warning text-warning-foreground' },
  medium: { label: 'Média', color: 'bg-accent text-accent-foreground' },
  low: { label: 'Baixa', color: 'bg-success text-success-foreground' },
};

export function AutoTicketClassifier() {
  const [autoClassify, setAutoClassify] = useState(true);
  const [tickets, setTickets] = useState<ClassifiedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    loadClassifiedTickets();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadClassifiedTickets = async () => {
    setLoading(true);
    try {
      // Fetch AI-tagged contacts
      type AiTagRow = {
        contact_id: string;
        tag_name: string;
        confidence: number | null;
        created_at: string;
        contacts: { name: string | null; phone: string | null } | null;
      };
      const { data: tags, error } = await safeClient.from<AiTagRow>('ai_conversation_tags', (q) =>
        q.select('*, contacts(name, phone)').order('created_at', { ascending: false }).limit(100)
      );

      if (!error && tags) {
        const grouped = new Map<string, ClassifiedTicket>();
        tags.forEach((tag) => {
          const contactId = tag.contact_id;
          const contact = tag.contacts;
          if (!grouped.has(contactId)) {
            grouped.set(contactId, {
              contactId,
              contactName: contact?.name || 'Desconhecido',
              category: classifyTag(tag.tag_name),
              priority: derivePriority(tag.tag_name, tag.confidence ?? 0),
              confidence: (tag.confidence ?? 0.7) * 100,
              tags: [tag.tag_name],
              lastMessage: '',
            });
          } else {
            const existing = grouped.get(contactId)!;
            existing.tags.push(tag.tag_name);
          }
        });

        const list = Array.from(grouped.values());

        // Compute category stats
        const stats: Record<string, number> = {};
        list.forEach((t) => {
          stats[t.category] = (stats[t.category] || 0) + 1;
        });
        if (isMountedRef.current) {
          setTickets(list);
          setCategoryStats(stats);
        }
      }
    } catch {
      if (isMountedRef.current) toast.error('Erro ao carregar tickets classificados');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const classifyTag = (tagName: string): string => {
    const lower = tagName.toLowerCase();
    if (lower.includes('suporte') || lower.includes('bug') || lower.includes('erro'))
      return 'Suporte Técnico';
    if (lower.includes('vend') || lower.includes('preço') || lower.includes('compra'))
      return 'Vendas';
    if (lower.includes('pag') || lower.includes('boleto') || lower.includes('fatura'))
      return 'Financeiro';
    if (lower.includes('reclam') || lower.includes('insatisf')) return 'Reclamação';
    if (lower.includes('agend') || lower.includes('horário')) return 'Agendamento';
    return 'Informação';
  };

  const derivePriority = (tagName: string, confidence: number): string => {
    const lower = tagName.toLowerCase();
    if (lower.includes('urgent') || lower.includes('reclam')) return 'urgent';
    if (confidence > 0.8 && (lower.includes('bug') || lower.includes('erro'))) return 'high';
    if (confidence > 0.5) return 'medium';
    return 'low';
  };

  const runBatchClassification = async () => {
    setClassifying(true);
    try {
      const { data: _data, error } = await supabase.functions.invoke('ai-classify-tickets', {
        body: { limit: 50 },
      });
      if (error) throw error;
      toast.success('Classificação em lote concluída!');
      await loadClassifiedTickets();
    } catch (err) {
      log.error('Falha na classificação de tickets', err);
      toast.error('Não foi possível classificar os tickets. Tente novamente.');
    } finally {
      setClassifying(false);
    }
  };

  const getCategoryInfo = (name: string) => {
    return CATEGORIES.find((c) => c.name === name) || CATEGORIES[4];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Classificação Automática de Tickets</h2>
            <p className="text-sm text-muted-foreground">
              IA classifica conversas por categoria e prioridade
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="auto-classify" checked={autoClassify} onCheckedChange={setAutoClassify} />
            <Label htmlFor="auto-classify" className="text-sm">
              Auto-classificar
            </Label>
          </div>
          <Button size="sm" onClick={runBatchClassification} disabled={classifying}>
            {classifying ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Brain className="mr-1 h-4 w-4" />
            )}
            Classificar em Lote
          </Button>
        </div>
      </div>

      {/* Category Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {CATEGORIES.map((cat) => (
          <Card key={cat.name}>
            <CardContent className="pb-3 pt-3">
              <div className="text-center">
                <p className="mb-1 text-2xl">{cat.icon}</p>
                <p className="text-lg font-bold">{categoryStats[cat.name] || 0}</p>
                <p className="text-xs text-muted-foreground">{cat.name}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Classified Tickets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Tickets Classificados ({tickets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />
                ))
              ) : tickets.length === 0 ? (
                <div className="py-12 text-center">
                  <Tag className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhum ticket classificado ainda</p>
                  <Button variant="outline" className="mt-3" onClick={runBatchClassification}>
                    Iniciar Classificação
                  </Button>
                </div>
              ) : (
                tickets.map((ticket) => {
                  const catInfo = getCategoryInfo(ticket.category);
                  const priorityInfo = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.low;
                  return (
                    <motion.div
                      key={ticket.contactId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className={`rounded-lg p-2 ${catInfo.color}`}>
                        <span className="text-lg">{catInfo.icon}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{ticket.contactName}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {ticket.category}
                          </Badge>
                          <Badge className={`text-xs ${priorityInfo.color}`}>
                            {priorityInfo.label}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Confiança</p>
                          <p className="text-sm font-medium">{Math.round(ticket.confidence)}%</p>
                        </div>
                        <CheckCircle className="h-4 w-4 text-success" />
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
