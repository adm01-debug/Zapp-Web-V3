import { useAgentPerformanceRanking } from '@/hooks/useAgentPerformanceRanking';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Flame, Zap, Target, Clock, MessageSquare, Star, Crown, Medal } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Agent Performance Panel component for the dashboard section. */
export function AgentPerformancePanel() {
  const { data: agents = [], isLoading } = useAgentPerformanceRanking();

  const rankIcons = [Crown, Medal, Trophy];
  const rankColors = ['text-warning', 'text-muted-foreground', 'text-warning'];

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-primary" />
          Ranking de Performance
          <Badge variant="outline" className="ml-auto gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-pulse" />
            Ao vivo
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando ranking...</div>
        ) : agents.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Trophy className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>Sem dados de performance ainda.</p>
          </div>
        ) : (
          agents.slice(0, 10).map((agent, i) => {
            const RankIcon = i < 3 ? rankIcons[i] : null;
            const rankColor = i < 3 ? rankColors[i] : '';
            const xpForNext = (agent.level + 1) * (agent.level + 1) * 50;
            const xpProgress = (agent.xp / xpForNext) * 100;

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  'rounded-lg border p-3 transition-all hover:shadow-md',
                  i === 0 && 'border-warning/30 bg-gradient-to-r from-warning/5 to-transparent',
                  i === 1 && 'border-border/20 bg-gradient-to-r from-gray-400/5 to-transparent',
                  i === 2 && 'border-warning/20 bg-gradient-to-r from-warning/5 to-transparent'
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <div className="w-8 shrink-0 text-center">
                    {RankIcon ? (
                      <RankIcon className={cn('mx-auto h-5 w-5', rankColor)} />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">#{agent.rank}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={agent.avatar} alt={agent.name} />
                    <AvatarFallback className="text-xs">{agent.name.charAt(0)}</AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{agent.name}</span>
                      <Badge variant="outline" className="h-4 shrink-0 gap-0.5 text-[10px]">
                        <Zap className="h-2.5 w-2.5" /> Nv.{agent.level}
                      </Badge>
                      {agent.streak > 0 && (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 gap-0.5 border-warning text-[10px] text-warning"
                        >
                          <Flame className="h-2.5 w-2.5" /> {agent.streak}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="h-3 w-3" /> {agent.messagessSent}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Target className="h-3 w-3" /> {agent.resolved}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" /> {formatTime(agent.avgResponseTime)}
                      </span>
                      {agent.satisfaction > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 text-warning" /> {agent.satisfaction.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {/* XP Bar */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={xpProgress} className="h-1.5 flex-1" />
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {agent.xp} XP
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}