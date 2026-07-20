import { motion } from 'framer-motion';

interface MiniSparklineProps {
  data: number[];
  isPositive: boolean;
  delay?: number;
}

/** Mini Sparkline component for the dashboard section. */
export function MiniSparkline({ data, isPositive, delay = 0 }: MiniSparklineProps) {
  const width = 50;
  const height = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <motion.svg width={width} height={height} className="overflow-visible" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay }}>
      <motion.path d={pathD} fill="none" stroke={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: delay + 0.1 }} />
      <motion.circle cx={points[points.length - 1]?.x || 0} cy={points[points.length - 1]?.y || 0} r="3" fill={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3, delay: delay + 0.6 }} />
    </motion.svg>
  );
}
