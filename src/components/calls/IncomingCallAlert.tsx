import { useState, useEffect, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CallDialog } from './CallDialog';
import { useIncomingCallListener } from '@/hooks/useIncomingCallListener';
import { useIncomingCallBroadcast } from '@/features/inbox';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { cn } from '@/lib/utils';

import { getLogger } from '@/lib/logger';
const log = getLogger('IncomingCallAlert');

export const IncomingCallAlert = forwardRef<HTMLDivElement>(
  function IncomingCallAlert(_props, _ref) {
    const { incomingCall: legacyCall, dismissCall: dismissLegacy } = useIncomingCallListener();
    const { incomingCall: broadcastCall, dismissCall: dismissBroadcast } =
      useIncomingCallBroadcast();
    // Broadcast wins (arrives first); legacy is fallback
    const incomingCall = broadcastCall ?? legacyCall;
    const dismissCall = () => {
      dismissBroadcast();
      dismissLegacy();
    };
    const { settings: notifSettings, isQuietHours } = useNotificationSettings();
    const [showDialog, setShowDialog] = useState(false);
    const _audioRef = useRef<HTMLAudioElement | null>(null);

    // Play ringtone only if sound is enabled and not in quiet hours
    useEffect(() => {
      const soundAllowed = notifSettings.soundEnabled && !isQuietHours();
      if (incomingCall && !showDialog && soundAllowed) {
        try {
          const ctx = new AudioContext();
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
            ctx.close();
          };
        } catch (err) {
          log.error('Unexpected error in IncomingCallAlert:', err);
        }
      }
    }, [
      incomingCall,
      showDialog,
      notifSettings.soundEnabled,
      notifSettings.soundVolume,
      isQuietHours,
    ]);

    // Auto-dismiss after 30s
    useEffect(() => {
      if (!incomingCall) return;
      const timeout = setTimeout(dismissCall, 30000);
      return () => clearTimeout(timeout);
    }, [incomingCall, dismissCall]);

    const handleAnswer = () => {
      setShowDialog(true);
    };

    const handleDecline = () => {
      dismissCall();
    };

    const handleDialogEnd = () => {
      setShowDialog(false);
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

    if (showDialog) {
      return (
        <CallDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) handleDialogEnd();
          }}
          contact={{
            id: incomingCall.contact_id || undefined,
            name: incomingCall.contact_name,
            phone: incomingCall.contact_phone,
          }}
          direction="inbound"
          whatsappConnectionId={incomingCall.whatsapp_connection_id || undefined}
          onAnswer={() => {}}
          onEnd={handleDialogEnd}
        />
      );
    }

    return (
      <AnimatePresence>
        <motion.div
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
              >
                <Phone className="h-4 w-4" />
                Atender
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }
);
