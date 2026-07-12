import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Trophy, Star, Flame, Zap, Crown, Award, ArrowUp, ArrowDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MiniSparkline } from './MiniSparkline';

// ── AnimatedBadge ──
interface AnimatedBadgeProps {
  value: string | number;
  label?: string;
  variant?: 'xp' | 'coins' | 'streak' | 'achievement' | 'rank';
  size?: 'sm' | 'md' | 'lg';
  showAnimation?: boolean;
  className?: string;
}

const variantConfig = {
  xp: {
    icon: Zap,
    gradient: 'from-xp to-primary',
    glow: 'shadow-[0_0_20px_hsl(var(--xp)/0.4)]',
    pulse: true,
  },
  coins: {
    icon: Star,
    gradient: 'from-coins to-warning',
    glow: 'shadow-[0_0_20px_hsl(var(--coins)/0.4)]',
    pulse: true,
  },
  streak: {
    icon: Flame,
    gradient: 'from-streak to-warning',
    glow: 'shadow-[0_0_20px_hsl(var(--streak)/0.4)]',
    pulse: true,
  },
  achievement: {
    icon: Trophy,
    gradient: 'from-primary to-primary-glow',
    glow: 'shadow-[0_0_20px_hsl(var(--primary)/0.4)]',
    pulse: false,
  },
  rank: {
    icon: Crown,
    gradient: 'from-rank-gold to-warning',
    glow: 'shadow-[0_0_20px_hsl(var(--rank-gold)/0.4)]',
    pulse: false,
  },
};

const sizeConfig = {
  sm: { container: 'px-2.5 py-1 gap-1.5', icon: 'w-3.5 h-3.5', text: 'text-xs' },
  md: { container: 'px-3 py-1.5 gap-2', icon: 'w-4 h-4', text: 'text-sm' },
  lg: { container: 'px-4 py-2 gap-2.5', icon: 'w-5 h-5', text: 'text-base' },
};

export const AnimatedBadge = React.forwardRef<HTMLDivElement, AnimatedBadgeProps>(
  function AnimatedBadge(
    { value, label, variant = 'xp', size = 'md', showAnimation = true, className },
    _ref
  ) {
    const config = variantConfig[variant];
    const s = sizeConfig[size];
    const Icon = config.icon;

    return (
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        className={cn(
          'relative inline-flex items-center rounded-full bg-gradient-to-r font-semibold text-primary-foreground',
          config.gradient,
          showAnimation && config.glow,
          s.container,
          className
        )}
      >
        {showAnimation && (
          <motion.div
            className="absolute inset-0 overflow-hidden rounded-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            />
          </motion.div>
        )}
        {showAnimation && config.pulse && (
          <motion.div
            className={cn('absolute inset-0 rounded-full bg-gradient-to-r', config.gradient)}
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
        <motion.div
          animate={showAnimation ? { rotate: [0, 10, -10, 0] } : {}}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
        >
          <Icon className={cn(s.icon, 'relative z-10')} />
        </motion.div>
        <span className={cn(s.text, 'relative z-10 font-bold')}>
          {value}
          {label && <span className="ml-1 font-medium opacity-80">{label}</span>}
        </span>
      </motion.div>
    );
  }
);

// ── StatCardWithGamification ──
interface StatCardProps {
  title: string;
  value: string | number;
  change: string;
  changeType: 'positive' | 'negative';
  changePercentage?: number;
  previousValue?: number;
  currentValue?: number;
  invertTrend?: boolean;
  sparklineData?: number[];
  icon: LucideIcon;
  gradient: string;
  iconBg?: string;
  achievement?: { label: string; unlocked: boolean };
  streak?: number;
  index: number;
}

export function StatCardWithGamification({
  title,
  value,
  change,
  changeType,
  invertTrend = false,
  sparklineData,
  icon: Icon,
  gradient,
  iconBg,
  achievement,
  streak,
  index,
}: StatCardProps) {
  const isPositiveTrend = invertTrend ? changeType === 'negative' : changeType === 'positive';
  const ArrowIcon = changeType === 'positive' ? ArrowUp : ArrowDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="group relative"
    >
      <div className="card-glow-purple relative h-full overflow-hidden rounded-2xl border border-secondary/30 bg-card p-5 transition-all duration-300 hover:border-secondary/60 hover:shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.2)]">
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(350px circle at 80% 20%, hsl(var(--secondary) / 0.15), hsl(var(--primary) / 0.05) 60%, transparent 80%)`,
          }}
        />
        <div className="relative flex items-start justify-between">
          <motion.div
            className={cn(
              'relative flex h-12 w-12 items-center justify-center rounded-xl',
              iconBg || 'bg-primary/10'
            )}
            whileHover={{ scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <Icon
              className={cn(
                'h-6 w-6',
                gradient.includes('primary')
                  ? 'text-primary'
                  : gradient.includes('info')
                    ? 'text-info'
                    : gradient.includes('success')
                      ? 'text-success'
                      : gradient.includes('coins')
                        ? 'text-coins'
                        : 'text-primary'
              )}
            />
          </motion.div>
          {streak && streak > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 + 0.4, type: 'spring' }}
            >
              <AnimatedBadge value={streak} variant="streak" size="sm" />
            </motion.div>
          )}
        </div>

        <div className="mt-4 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <motion.p
            className="font-display text-3xl font-bold text-foreground"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: index * 0.1 + 0.2, type: 'spring' }}
          >
            {value}
          </motion.p>
        </div>

        <motion.div
          className="mt-3 flex items-center justify-between gap-2"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 + 0.4 }}
        >
          <div className="flex items-center gap-2">
            <motion.div
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
                isPositiveTrend
                  ? 'border-success/30 bg-success/15 text-success'
                  : 'border-destructive/30 bg-destructive/15 text-destructive'
              )}
              whileHover={{ scale: 1.08 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              <motion.div
                animate={changeType === 'positive' ? { y: [0, -2, 0] } : { y: [0, 2, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ArrowIcon className="h-3.5 w-3.5" />
              </motion.div>
              {change}
            </motion.div>
            <span className="text-xs text-muted-foreground">vs ontem</span>
          </div>
          {sparklineData && sparklineData.length > 1 && (
            <MiniSparkline
              data={sparklineData}
              isPositive={isPositiveTrend}
              delay={index * 0.1 + 0.5}
            />
          )}
        </motion.div>

        {achievement?.unlocked && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 + 0.5 }}
            className="mt-3 border-t border-border/20 pt-3"
          >
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Award className="h-4 w-4 text-primary" />
              </motion.div>
              <span className="text-xs font-medium text-muted-foreground">{achievement.label}</span>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── LevelProgress ──
interface LevelProgressProps {
  currentXP: number;
  requiredXP: number;
  level: number;
  className?: string;
}

export function LevelProgress({ currentXP, requiredXP, level, className }: LevelProgressProps) {
  const progress = (currentXP / requiredXP) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('relative', className)}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-glow"
            animate={{
              boxShadow: [
                '0 0 0 0 hsl(var(--primary) / 0.4)',
                '0 0 15px 2px hsl(var(--primary) / 0.2)',
                '0 0 0 0 hsl(var(--primary) / 0.4)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-sm font-bold text-primary-foreground">{level}</span>
          </motion.div>
          <div>
            <p className="text-sm font-semibold text-foreground">Nível {level}</p>
            <p className="text-xs text-muted-foreground">
              {currentXP}/{requiredXP} XP
            </p>
          </div>
        </div>
        <AnimatedBadge value={`${Math.round(progress)}%`} variant="xp" size="sm" />
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-xp to-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}
