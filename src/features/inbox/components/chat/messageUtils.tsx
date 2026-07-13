/* eslint-disable react-refresh/only-export-components */
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, CheckCheck, Clock, AlertCircle, RefreshCw, ShieldAlert, Headphones } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';

export function formatMessageTime(date: Date): string {
  return format(date, 'HH:mm');
}

export function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
}

/**
 * WhatsApp-authentic message status icons:
 * - sending/pending: Clock (animated pulse)
 * - retrying: RefreshCw spinning, warning color
 * - sent: Single check ✓
 * - delivered: Double check ✓✓
 * - read: Double check ✓✓ in blue
 * - played: Headphones in blue (ACK 5 — audio/video reproduzido)
 * - failed_auth: ShieldAlert in destructive
 * - failed/failed_retries: AlertCircle in destructive
 */
export function MessageStatusIcon({ status, className }: { status: Message['status']; className?: string }) {
  switch (status) {
    case 'sent':
      return (
        <Check className={cn('w-[15px] h-[15px] transition-all duration-300 ease-out', className)} strokeWidth={1.8} />
      );
    case 'delivered':
      return (
        <CheckCheck className={cn('w-[16px] h-[16px] transition-all duration-300 ease-out', className)} strokeWidth={1.8} />
      );
    case 'read':
      return (
        <motion.div
          initial={{ scale: 0.8, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          <CheckCheck className={cn('w-[16px] h-[16px] text-info transition-all duration-500 ease-out', className)} strokeWidth={1.8} />
        </motion.div>
      );
    case 'played':
      return (
        <motion.div
          initial={{ scale: 0.8, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          <Headphones className={cn('w-[16px] h-[16px] text-info transition-all duration-500 ease-out', className)} strokeWidth={1.8} aria-label="Reproduzido" />
        </motion.div>
      );
    case 'retrying':
      return (
        <RefreshCw className={cn('w-[14px] h-[14px] text-warning animate-spin', className)} strokeWidth={2.5} />
      );
    case 'failed_auth':
      return (
        <ShieldAlert className={cn('w-[14px] h-[14px] text-destructive', className)} strokeWidth={2.5} />
      );
    case 'failed':
    case 'failed_retries':
      return (
        <AlertCircle className={cn('w-[14px] h-[14px] text-destructive', className)} strokeWidth={2.5} />
      );
    case 'sending':
    default:
      return (
        <Clock className={cn('w-3 h-3 animate-pulse opacity-60', className)} strokeWidth={2} />
      );
  }
}
