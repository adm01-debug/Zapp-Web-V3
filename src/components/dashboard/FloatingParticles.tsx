import { motion } from 'framer-motion';
import { useMemo, forwardRef } from 'react';
import { useReducedMotion } from 'framer-motion';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  color: 'primary' | 'secondary' | 'accent';
}

export const FloatingParticles = forwardRef<HTMLDivElement>((_, _ref) => {
  const prefersReducedMotion = useReducedMotion();

  const particles = useMemo<Particle[]>(() => {
    if (prefersReducedMotion) return [];
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      duration: Math.random() * 15 + 10,
      delay: Math.random() * 5,
      color: (['primary', 'secondary', 'accent'] as const)[Math.floor(Math.random() * 3)],
    }));
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className={`absolute rounded-full ${
            particle.color === 'primary'
              ? 'bg-primary/30'
              : particle.color === 'secondary'
                ? 'bg-secondary/40'
                : 'bg-accent/30'
          }`}
          style={{
            width: particle.size,
            height: particle.size,
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            filter: `blur(${particle.size > 4 ? 1 : 0}px)`,
          }}
          animate={{
            y: [0, -30, 0, 20, 0],
            x: [0, 15, -10, 5, 0],
            opacity: [0.3, 0.7, 0.5, 0.8, 0.3],
            scale: [1, 1.2, 0.9, 1.1, 1],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Larger glowing orbs */}
      <motion.div
        className="absolute h-32 w-32 rounded-full bg-secondary/10 blur-3xl"
        style={{ left: '10%', top: '20%' }}
        animate={{
          x: [0, 50, 0, -30, 0],
          y: [0, -40, 20, -20, 0],
          opacity: [0.3, 0.5, 0.3, 0.6, 0.3],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute h-40 w-40 rounded-full bg-primary/10 blur-3xl"
        style={{ right: '15%', top: '40%' }}
        animate={{
          x: [0, -40, 30, -20, 0],
          y: [0, 30, -40, 20, 0],
          opacity: [0.2, 0.4, 0.3, 0.5, 0.2],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      <motion.div
        className="absolute h-24 w-24 rounded-full bg-accent/15 blur-2xl"
        style={{ left: '60%', bottom: '20%' }}
        animate={{
          x: [0, 30, -20, 40, 0],
          y: [0, -20, 30, -10, 0],
          opacity: [0.4, 0.6, 0.4, 0.7, 0.4],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
      />
      <motion.div
        className="absolute h-20 w-20 rounded-full bg-secondary/20 blur-2xl"
        style={{ right: '30%', bottom: '30%' }}
        animate={{
          x: [0, -25, 35, -15, 0],
          y: [0, 25, -35, 15, 0],
          scale: [1, 1.3, 0.9, 1.2, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
    </div>
  );
});

FloatingParticles.displayName = 'FloatingParticles';
