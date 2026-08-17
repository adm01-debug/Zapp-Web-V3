import { useState, useEffect, useCallback, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Phone, PhoneOff, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useIncomingCallListener } from '@/hooks/useIncomingCallListener';
import { useIncomingCallBroadcast, useSipClient } from '@/features/inbox';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { cn } from '@/lib/utils';
import { getInboundAnswerNotice } from './inboundAnswerNotice';

import { getLogger } from '@/lib/logger';
const log = getLogger('IncomingCallAlert');

type BrowserAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

/** Incoming Call Alert component for the calls section. */
export const IncomingCallAlert = forwardRef<HTMLDivElement, Record<string, never>>(
  function IncomingCallAlert(_props, ref) {
    const { incomingCall: legacyCall, dismissCall: dismissLegacy } = useIncomingCallListener();
    const { incomingCall: broadcastCall, dismissCall: dismissBroadcast } =
      useIncomingCallBroadcast();
    const { sipStatus } = useSipClient();
    // Broadcast wins (arrives first); legacy is fallback
    const incomingCall = broadcastCall ?? legacyCall;
    const dismissCall = useCallback(() => {
      dismissBroadcast();
      dismissLegacy();
    }, [dismissBroadcast, dismissLegacy]);
    const { settings: notifSettings, isQuietHours } = useNotificationSettings();
    // Aviso honesto do "Atender": não existe caminho de áudio para chamadas
    // recebidas (SIP outbound-only + alerta via webhook WhatsApp/Evolution).
    // Em vez de abrir uma UI de chamada falsa, exibimos a limitação real.
    const [answerNotice, setAnswerNotice] = useState<string | null>(null);
    // Play ringtone only if sound is enabled and not in quiet hours
    useEffect(() => {
      const soundAllowed = notifSettings.soundEnabled && !isQuietHours();
      if (incomingCall && soundAllowed) {
        try {
          const AudioContextCtor =
            window.AudioContext ?? (window as BrowserAudioWindow).webkitAudioContext;
          if (!AudioContextCtor) return undefined;
          const ctx = new AudioContextCtor();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 440;
          const vol = ((notifSettings.soundVolume ?? 70) / 100) * 0.2;
          gain.gain.value = vol;
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();

          const interval = setInterval(() => {
            gain.gain.value = gain.gain.value > 0 ? 0 : vol;
          }, 500);

          return () => {
            clearInterval(interval);
            osc.stop();
            void ctx.close();
          };
        } catch (err) {
          log.error('Unexpected error in IncomingCallAlert:', err);
        }
      }
      return undefined;
    }, [
      incomingCall,
      notifSettings.soundEnabled,
      notifSettings.soundVolume,
      isQuietHours,
    ]);

    // Auto-dismiss after 30s
    useEffect(() => {
      if (!incomingCall) return undefined;
      const timeout = setTimeout(dismissCall, 30000);
      return () => clearTimeout(timeout);
    }, [incomingCall, dismissCall]);

    // Nova chamada recebida → limpa o aviso honesto anterior
    useEffect(() => {
      setAnswerNotice(null);
    }, [incomingCall]);

    const handleAnswer = () => {
      // HONEST: nunca no-op e nunca UI de chamada falsa. Sem INVITE SIP de
      // entrada, o máximo honesto é informar a limitação real.
      const notice = getInboundAnswerNotice(sipStatus);
      setAnswerNotice(notice);
      log.warn('Atendimento de chamada recebida indisponível — aviso honesto exibido:', notice);
    };

    const handleDecline = () => {
      dismissCall();
    };

    const getInitials = (name: string) => {
      return name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    };

    if (!incomingCall) return null;

    return (
      <AnimatePresence>
        <motion.div
          ref={ref}
          initial={{ y: -100, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -100, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed right-4 top-4 z-[9999] w-80"
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {/* Pulsing header */}
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium text-primary-foreground',
                incomingCall.is_video ? 'bg-info' : 'bg-success'
              )}
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                {incomingCall.is_video ? (
                  <Video className="h-4 w-4" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
              </motion.div>
              {incomingCall.is_video ? 'Chamada de vídeo' : 'Chamada de voz'}
            </div>

            {/* Contact info */}
            <div className="flex items-center gap-3 p-4">
              <Avatar className="h-12 w-12">
                {incomingCall.contact_avatar_url && (
                  <AvatarImage
                    src={incomingCall.contact_avatar_url}
                    alt={incomingCall.contact_name}
                  />
                )}
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {getInitials(incomingCall.contact_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {incomingCall.contact_name}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {incomingCall.contact_phone}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-4 pb-4">
              <Button variant="destructive" className="flex-1 gap-2" onClick={handleDecline}>
                <PhoneOff className="h-4 w-4" />
                Recusar
              </Button>
              <Button
                className={cn(
                  'flex-1 gap-2 text-primary-foreground',
                  incomingCall.is_video
                    ? 'bg-info hover:bg-info/90'
                    : 'bg-success hover:bg-success/90'
                )}
                onClick={handleAnswer}
                title={getInboundAnswerNotice(sipStatus)}
                aria-describedby={answerNotice ? 'incoming-call-answer-notice' : undefined}
              >
                <Phone className="h-4 w-4" />
                Atender
              </Button>
            </div>

            {/* Honest notice (nunca no-op): explica a limitação real do atendimento */}
            {answerNotice && (
              <div
                id="incoming-call-answer-notice"
                role="alert"
                className="mx-4 mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{answerNotice}</span>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }
);
