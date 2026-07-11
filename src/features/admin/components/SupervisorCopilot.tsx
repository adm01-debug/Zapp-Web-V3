import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brain, Send, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dbFrom } from '@/integrations/datasource/db';

interface InsightResult {
  question: string;
  answer: string;
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  'Quais filas estão em risco de SLA?',
  'Quem está com maior backlog?',
  'Quantas conversas estão sem resposta há mais de 1h?',
  'Qual atendente tem melhor performance hoje?',
  'Quais são os motivos de encerramento mais comuns?',
];

export function SupervisorCopilot() {
  const [question, setQuestion] = useState('');
  const [insights, setInsights] = useState<InsightResult[]>([]);
  const [loading, setLoading] = useState(false);

  const askQuestion = async (q?: string) => {
    const query = q || question;
    if (!query.trim()) return;
    setLoading(true);
    setQuestion('');

    try {
      // Build context from real data
      const [queueData, agentData, messageData] = await Promise.all([
        supabase.from('queues').select('id, name').limit(20),
        supabase
          .from('profiles')
          .select('id, name, role, is_active')
          .eq('is_active', true)
          .limit(50),
        dbFrom('messages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const context = `
Dados atuais do sistema:
- ${queueData.data?.length || 0} filas configuradas
- ${agentData.data?.length || 0} agentes ativos
- ${messageData.count || 0} mensagens nas últimas 24h
Filas: ${queueData.data?.map((q) => q.name).join(', ') || 'nenhuma'}
Agentes: ${agentData.data?.map((a) => `${a.name} (${a.role})`).join(', ') || 'nenhum'}
      `.trim();

      const response = await supabase.functions.invoke('ai-proxy', {
        body: {
          messages: [
            {
              role: 'system',
              content: `Você é um copiloto de supervisor de atendimento. Responda com base nos dados reais fornecidos. Seja conciso e direto. Use bullet points. Dados:\n${context}`,
            },
            { role: 'user', content: query },
          ],
          model: 'google/gemini-3-flash-preview',
        },
      });

      const answer =
        response.data?.content ||
        response.data?.choices?.[0]?.message?.content ||
        'Não foi possível processar sua pergunta.';

      setInsights((prev) => [{ question: query, answer, timestamp: new Date() }, ...prev]);
    } catch {
      setInsights((prev) => [
        {
          question: query,
          answer: 'Erro ao processar. Tente novamente.',
          timestamp: new Date(),
        },
        ...prev,
      ]);
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Brain className="h-4 w-4 text-primary" />
          Copiloto do Supervisor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick questions */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map((q) => (
            <Button
              key={q}
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => askQuestion(q)}
              disabled={loading}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {q.length > 40 ? q.slice(0, 40) + '...' : q}
            </Button>
          ))}
        </div>

        {/* Custom question */}
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pergunte sobre a operação..."
            className="text-sm"
            onKeyDown={(e) => e.key === 'Enter' && askQuestion()}
          />
          <Button size="icon" onClick={() => askQuestion()} disabled={loading || !question.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {/* Results */}
        <AnimatePresence mode="popLayout">
          {insights.map((insight, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2 rounded-xl border border-border/30 bg-muted/20 p-3"
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs font-medium">{insight.question}</p>
              </div>
              <div className="pl-6">
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {insight.answer}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
