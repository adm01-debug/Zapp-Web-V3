import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingDown,
  Users,
  AlertTriangle,
  Brain,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { differenceInDays } from 'date-fns';
import { dbFrom } from '@/integrations/datasource/db';
import { classifyChurnRisk, type ChurnRisk } from './classifyChurnRisk';
import { getLogger } from '@/lib/logger';

const log = getLogger('ChurnPredictionDashboard');

export function ChurnPredictionDashboard() {
  const [risks, setRisks] = useState<ChurnRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [stats, setStats] = useState({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });
  const isMountedRef = useRef(true);

  useEffect(() => {
    analyzeChurnRisk();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const analyzeChurnRisk = async () => {
    setLoading(true);
    try {
      // Fetch contacts with their latest messages
      const { data: contacts, error } = await dbFrom('contacts')
        .select('id, name, phone, ai_sentiment, updated_at, created_at')
        .order('updated_at', { ascending: true })
        .limit(500);

      if (error) throw error;

      const now = new Date();
      const churnRisks: ChurnRisk[] = (contacts || []).map((contact) => {
        const daysSinceUpdate = differenceInDays(now, new Date(contact.updated_at));
        const daysSinceCreation = differenceInDays(now, new Date(contact.created_at));

        // Calculate risk score based on multiple factors
        let score = 0;
        const reasons: string[] = [];

        // Inactivity factor (max 40 points)
        if (daysSinceUpdate > 30) {
          score += Math.min(40, (daysSinceUpdate - 30) * 2);
          reasons.push(`${daysSinceUpdate} dias sem interação`);
        }

        // Sentiment factor (max 30 points)
        if (contact.ai_sentiment === 'negative') {
          score += 30;
          reasons.push('Sentimento negativo detectado');
        } else if (contact.ai_sentiment === 'neutral') {
          score += 10;
        }

        // New contact with no follow-up (max 20 points)
        if (daysSinceCreation < 7 && daysSinceUpdate > 3) {
          score += 20;
          reasons.push('Novo contato sem follow-up');
        }

        // Long-term inactive (max 10 points)
        if (daysSinceUpdate > 60) {
          score += 10;
          reasons.push('Inativo por mais de 60 dias');
        }

        score = Math.min(100, score);
        const riskLevel: ChurnRisk['riskLevel'] = classifyChurnRisk(score);

        if (reasons.length === 0) reasons.push('Engajamento regular');

        return {
          contactId: contact.id,
          contactName: contact.name,
          phone: contact.phone,
          riskScore: score,
          riskLevel,
          daysSinceLastMessage: daysSinceUpdate,
          totalMessages: 0,
          sentiment: contact.ai_sentiment,
          reasons,
        };
      });

      // Sort by risk score descending
      churnRisks.sort((a, b) => b.riskScore - a.riskScore);
      if (isMountedRef.current) {
        setRisks(churnRisks);
        setStats({
          total: churnRisks.length,
          critical: churnRisks.filter((r) => r.riskLevel === 'critical').length,
          high: churnRisks.filter((r) => r.riskLevel === 'high').length,
          medium: churnRisks.filter((r) => r.riskLevel === 'medium').length,
          low: churnRisks.filter((r) => r.riskLevel === 'low').length,
        });
      }
    } catch {
      if (isMountedRef.current) toast.error('Erro ao analisar risco de churn');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const runAIAnalysis = async () => {
    setAnalyzing(true);
    try {
      const { error } = await supabase.functions.invoke('ai-churn-analysis', {
        body: { contactIds: risks.slice(0, 20).map((r) => r.contactId) },
      });
      if (error) throw error;
      toast.success('Análise de IA concluída!');
      await analyzeChurnRisk();
    } catch (err) {
      log.error('Falha na análise de churn por IA', err);
      toast.error('Não foi possível concluir a análise de IA. Exibindo apenas a estimativa local.');
    } finally {
      setAnalyzing(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-destructive text-destructive-foreground';
      case 'high':
        return 'bg-warning text-warning-foreground';
      case 'medium':
        return 'bg-accent text-accent-foreground';
      case 'low':
        return 'bg-primary text-primary-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Previsão de Churn</h2>
            <p className="text-sm text-muted-foreground">Análise preditiva de risco de abandono</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={analyzeChurnRisk} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={runAIAnalysis} disabled={analyzing}>
            {analyzing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Brain className="mr-1 h-4 w-4" />
            )}
            Análise IA
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { label: 'Total Analisados', value: stats.total, icon: Users, color: 'text-primary' },
          {
            label: 'Crítico',
            value: stats.critical,
            icon: AlertTriangle,
            color: 'text-destructive',
          },
          { label: 'Alto', value: stats.high, icon: ArrowUpRight, color: 'text-warning' },
          { label: 'Médio', value: stats.medium, icon: Clock, color: 'text-accent-foreground' },
          { label: 'Baixo', value: stats.low, icon: ArrowDownRight, color: 'text-success' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pb-4 pt-4">
              <div className="flex items-center gap-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <div>
                  <p className="text-xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Risk List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-destructive" />
            Contatos em Risco ({risks.filter((r) => r.riskScore > 30).length})
          </CardTitle>
          <CardDescription>
            Contatos com maior probabilidade de churn baseado em atividade e sentimento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                  ))
                : risks
                    .filter((r) => r.riskScore > 20)
                    .slice(0, 50)
                    .map((risk) => (
                      <motion.div
                        key={risk.contactId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                      >
                        <Badge className={`${getRiskColor(risk.riskLevel)} shrink-0 text-xs`}>
                          {risk.riskScore}%
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{risk.contactName}</p>
                          <p className="text-xs text-muted-foreground">{risk.phone}</p>
                        </div>
                        <div className="hidden w-24 md:block">
                          <Progress value={risk.riskScore} className="h-2" />
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-muted-foreground">
                            {risk.daysSinceLastMessage}d sem contato
                          </p>
                          <div className="mt-1 flex flex-wrap justify-end gap-1">
                            {risk.reasons.slice(0, 2).map((reason) => (
                              <Badge
                                key={reason}
                                variant="outline"
                                className="px-1 py-0 text-[10px]"
                              >
                                {reason.length > 25 ? reason.substring(0, 25) + '...' : reason}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
