import { useState, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { motion, AnimatePresence } from 'framer-motion';
import { getLogger } from '@/lib/logger';

const log = getLogger('OnboardingChecklist');
import { CheckCircle2, Sparkles, ChevronDown, ChevronUp, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth';
import { CHECKLIST_STEPS } from '@/lib/onboarding/checklistSteps';
import type { ChecklistStep } from '@/lib/onboarding/checklistSteps';

interface OnboardingChecklistProps {
  onNavigate?: (view: string) => void;
  onDismiss?: () => void;
  compact?: boolean;
}

export function OnboardingChecklist({
  onNavigate,
  onDismiss,
  compact = false,
}: OnboardingChecklistProps) {
  const { user } = useAuth();
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const mounted = useMountedRef();

  useEffect(() => {
    if (!isExpanded) return;
    const timer = setTimeout(() => setIsExpanded(false), 8000);
    return () => clearTimeout(timer);
  }, [isExpanded]);

  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const checkAllSteps = async () => {
      setIsLoading(true);
      const completed: string[] = [];
      for (const step of CHECKLIST_STEPS) {
        try {
          if (await step.checkCondition()) completed.push(step.id);
        } catch (error) {
          log.error(`Error checking step ${step.id}:`, error);
        }
      }
      if (!mounted.current) return;
      setCompletedSteps(completed);
      setIsLoading(false);
    };
    try {
      if (localStorage.getItem(`checklist_dismissed_${user.id}`) === 'true') setIsDismissed(true);
    } catch (e) {
      log.warn('localStorage unavailable for checklist:', e);
    }
    checkAllSteps();
  }, [user, mounted]);

  const handleDismiss = () => {
    if (user) {
      try {
        localStorage.setItem(`checklist_dismissed_${user.id}`, 'true');
      } catch {
        /* storage unavailable */
      }
    }
    setIsDismissed(true);
    onDismiss?.();
  };

  const handleStepAction = (step: ChecklistStep) => {
    if (step.actionRoute && onNavigate) onNavigate(step.actionRoute);
  };

  const progress = (completedSteps.length / CHECKLIST_STEPS.length) * 100;
  const allComplete = completedSteps.length === CHECKLIST_STEPS.length;

  if (isDismissed || allComplete || isLoading) return null;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-secondary/10 p-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Configure sua conta</p>
              <p className="text-xs text-muted-foreground">
                {completedSteps.length}/{CHECKLIST_STEPS.length} passos concluídos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Progress value={progress} className="h-2 w-24" />
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-1/2 translate-y-1/2 rounded-full bg-secondary/10 blur-2xl" />
        <CardHeader className="relative z-10 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg"
              >
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </motion.div>
              <div>
                <CardTitle className="text-lg">Configure sua conta</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {completedSteps.length} de {CHECKLIST_STEPS.length} passos concluídos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                aria-label={isExpanded ? 'Recolher checklist' : 'Expandir checklist'}
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8"
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              <Button
                aria-label="Dispensar checklist"
                variant="ghost"
                size="icon"
                onClick={handleDismiss}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="relative z-10 pt-2">
                <div className="space-y-2">
                  {CHECKLIST_STEPS.map((step, index) => {
                    const isComplete = completedSteps.includes(step.id);
                    const Icon = step.icon;
                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                          'flex items-center gap-3 rounded-xl p-3 transition-all',
                          isComplete
                            ? 'border border-success/20 bg-success/10'
                            : 'border border-transparent bg-muted/30 hover:border-primary/20 hover:bg-muted/50'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                            isComplete ? 'bg-success/20' : 'bg-primary/10'
                          )}
                        >
                          {isComplete ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : (
                            <Icon className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm font-medium',
                              isComplete && 'text-muted-foreground line-through'
                            )}
                          >
                            {step.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                        {!isComplete && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-shrink-0 gap-1 text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() => handleStepAction(step)}
                          >
                            {step.action}
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
