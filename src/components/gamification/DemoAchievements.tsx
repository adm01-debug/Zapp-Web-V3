import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useGamification } from './GamificationProvider';
import { TrendingUp, Award, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AchievementsPanel } from './AchievementsPanel';
import { useState } from 'react';

/** Demo Achievements component for the gamification section. */
export function DemoAchievements() {
  const [showAchievementsPanel, setShowAchievementsPanel] = useState(false);
  const {
    stats,
    isLoading,
  } = useGamification();

  // Etapa 66: array `demos` (botões de teste) removido — ver comentário no JSX.

  if (showAchievementsPanel) {
    return (
      <div className="space-y-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowAchievementsPanel(false)}
          className="mb-2"
        >
          ← Voltar para Gamificação
        </Button>
        <AchievementsPanel />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-2xl bg-card border border-border"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-info flex items-center justify-center">
            <Trophy className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Sistema de Gamificação</h3>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Carregando...' : 'Suas conquistas são salvas automaticamente'}
            </p>
          </div>
        </div>
        
        {/* Stats Summary */}
        <div className="flex items-center gap-2">
          {!isLoading && stats && (
            <>
              <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary border-0">
                <TrendingUp className="w-3 h-3" />
                Nv {stats.level}
              </Badge>
              <Badge variant="secondary" className="gap-1 bg-xp/10 text-xp border-0">
                <Zap className="w-3 h-3" />
                {stats.xp.toLocaleString()} XP
              </Badge>
              <Badge variant="secondary" className="gap-1 bg-coins/10 text-coins border-0">
                <Award className="w-3 h-3" />
                {stats.achievementsCount}
              </Badge>
            </>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowAchievementsPanel(true)}
            className="gap-1 ml-2"
          >
            Ver Conquistas
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {!isLoading && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
            <p className="text-xs text-muted-foreground">Streak Atual</p>
            <p className="text-lg font-bold text-foreground flex items-center gap-1">
              <Flame className={cn("w-4 h-4", stats.streak > 0 ? "text-warning" : "text-muted-foreground")} />
              {stats.streak}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
            <p className="text-xs text-muted-foreground">Mensagens</p>
            <p className="text-lg font-bold text-foreground">{stats.messagesHandled}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
            <p className="text-xs text-muted-foreground">Resoluções</p>
            <p className="text-lg font-bold text-foreground">{stats.resolutions}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
            <p className="text-xs text-muted-foreground">Conquistas</p>
            <p className="text-lg font-bold text-foreground">{stats.achievementsCount}</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {/* Etapa 66: botões de teste REMOVIDOS — gravavam XP/conquistas/streak
          FALSOS em agent_stats/agent_achievements de produção, inflando o
          leaderboard real. A gamificação real está desligada (provider não
          montado) — ver issue do plano 100 etapas. */}
    </motion.div>
  );
}
