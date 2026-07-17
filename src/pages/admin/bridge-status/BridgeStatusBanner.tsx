import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BridgeStatus } from '../useBridgeStatus';

interface StatusConfig {
  color: string;
  label: string;
  description: string;
}

interface BridgeStatusBannerProps {
  status: BridgeStatus;
  statusConfig: StatusConfig;
}

export function BridgeStatusBanner({ status, statusConfig }: BridgeStatusBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 p-8 text-center transition-colors duration-500',
        statusConfig.color
      )}
    >
      <div className="relative">
        {status === 'online' && <CheckCircle2 className="h-16 w-16" />}
        {status === 'degraded' && <AlertTriangle className="h-16 w-16 animate-pulse" />}
        {status === 'offline' && <WifiOff className="h-16 w-16 animate-bounce" />}
        {status === 'loading' && <RefreshCw className="h-16 w-16 animate-spin" />}
        {status === 'online' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute inset-0 rounded-full bg-background/30"
          />
        )}
      </div>
      <div>
        <h2 className="text-3xl font-black tracking-tighter">{statusConfig.label}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm font-medium opacity-80">
          {statusConfig.description}
        </p>
      </div>
    </motion.div>
  );
}
