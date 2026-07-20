import { motion } from 'framer-motion';
import { 
  MessageCircle, 
  Bot, 
  BarChart3, 
  Users, 
  Clock, 
  Shield 
} from 'lucide-react';

const benefits = [
  {
    icon: MessageCircle,
    title: 'Inbox Unificado',
    description: 'Todas conversas em um só lugar'
  },
  {
    icon: Bot,
    title: 'IA Integrada',
    description: 'Respostas automáticas inteligentes'
  },
  {
    icon: BarChart3,
    title: 'Analytics Avançado',
    description: 'Métricas em tempo real'
  },
  {
    icon: Users,
    title: 'Multi-agentes',
    description: 'Colaboração de equipe eficiente'
  },
  {
    icon: Clock,
    title: 'SLA Tracking',
    description: 'Monitore tempos de resposta'
  },
  {
    icon: Shield,
    title: 'Segurança Total',
    description: 'Dados criptografados'
  },
];

/** Hero Benefits component. */
export function HeroBenefits() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
      className="flex flex-col justify-center px-4 py-4 lg:px-12 lg:py-8"
    >
      <motion.h2
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.7 }}
        className="text-lg lg:text-2xl font-bold text-foreground mb-1 lg:mb-2"
      >
        Tudo que você precisa para
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8 }}
        className="text-xl lg:text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4 lg:mb-8"
      >
        atender com excelência
      </motion.p>

      <div className="grid grid-cols-3 lg:grid-cols-2 gap-2 lg:gap-4">
        {benefits.map((benefit, index) => (
          <motion.div
            key={benefit.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 + index * 0.1 }}
            whileHover={{ scale: 1.02, x: 5 }}
            className="flex flex-col lg:flex-row items-center lg:items-start gap-1.5 lg:gap-3 p-2 lg:p-3 rounded-lg bg-card border border-border/30 hover:border-primary/30 transition-all cursor-default text-center lg:text-left"
          >
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <benefit.icon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-[11px] lg:text-sm leading-tight">{benefit.title}</h3>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5 hidden lg:block">{benefit.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Testimonial — desktop only */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5 }}
        className="hidden lg:block mt-8 p-4 rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20"
      >
        <p className="text-sm italic text-muted-foreground">
          "Nós somos o que fazemos repetidamente; a excelência, portanto, não é um ato, mas um hábito."
        </p>
        <div className="flex items-center gap-2 mt-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground text-xs font-bold">
            AR
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Aristóteles</p>
            <p className="text-[10px] text-muted-foreground">Filósofo</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
