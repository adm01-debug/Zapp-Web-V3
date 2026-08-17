import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Loader2, WifiOff, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSipClient } from '@/features/inbox';
import { useMountedRef } from '@/hooks/useMountedRef';

const SIP_SETTINGS_KEY = 'voip_sip_settings';

interface SipSettings {
  server: string;
  user: string;
  wsPort: number;
  sipEnabled: boolean;
  autoRecord: boolean;
}

function loadSipSettings(): SipSettings {
  try {
    const stored = localStorage.getItem(SIP_SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* storage unavailable */
  }
  return {
    server: 'ip.b24-9441-1552764901.bitrixphone.com',
    user: 'phone1',
    wsPort: 8089,
    sipEnabled: true,
    autoRecord: true,
  };
}

export interface VideoCallContact {
  name: string;
  phone: string;
  avatar?: string;
}

interface VideoCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: VideoCallContact;
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/**
 * VideoCallDialog — videochamada REAL via SIP (SIM-03).
 *
 * Abre a chamada com vídeo desde o início (sem upgrade mid-call na sip.js 0.21):
 *  - conecta o UserAgent SIP automaticamente (settings + get-sip-password) se preciso;
 *  - chama `makeCall(phone, { video: true })` quando registrado;
 *  - renderiza <video> local (mini, espelhado) + remoto (grande) com attach via callback ref;
 *  - controles reais: mute, vídeo on/off e desligar (todos via useSipClient).
 */
export function VideoCallDialog({ open, onOpenChange, contact }: VideoCallDialogProps) {
  const {
    sipStatus,
    callStatus,
    callDuration,
    isMuted,
    isVideoOn,
    videoSupported,
    localStream,
    remoteStream,
    connect,
    makeCall,
    hangUp,
    toggleMute,
    toggleVideo,
  } = useSipClient();
  const mountedRef = useMountedRef();
  const [connecting, setConnecting] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);
  const autoStartRef = useRef(false);
  const startedRef = useRef(false);
  const wasInCallRef = useRef(false);

  const inCall = callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'active';
  const callActive = callStatus === 'active';

  // Anexa a stream LOCAL ao <video muted> via callback ref (padrão do SIM-03).
  const attachLocalVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el) el.srcObject = localStream;
    },
    [localStream]
  );

  // Anexa a stream REMOTA ao <video> via callback ref. Remove os elementos
  // body-level criados pelo hook para não duplicar o áudio (a stream toca
  // aqui, não no <audio id="sip-remote-audio">).
  const attachRemoteVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el) return;
      document.getElementById('sip-remote-video')?.remove();
      document.getElementById('sip-remote-audio')?.remove();
      el.srcObject = remoteStream;
    },
    [remoteStream]
  );

  const autoConnectAndCall = useCallback(async () => {
    setConnecting(true);
    setConnectFailed(false);
    try {
      const settings = loadSipSettings();
      const { data, error } = await supabase.functions.invoke('get-sip-password');
      if (error || !data?.password) throw new Error('Senha SIP não configurada');
      await connect({
        server: settings.server,
        user: settings.user,
        password: data.password,
        wsPort: settings.wsPort,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setConnectFailed(true);
      toast.error(`Erro ao conectar VoIP: ${err instanceof Error ? err.message : 'Falha na conexão'}`);
    } finally {
      if (mountedRef.current) setConnecting(false);
    }
  }, [connect, mountedRef]);

  // Ao abrir: inicia o fluxo UMA vez — chamada direta se já registrado, senão
  // conecta o SIP e espera o registro (effect abaixo) para ligar com vídeo.
  useEffect(() => {
    if (!open) {
      autoStartRef.current = false;
      startedRef.current = false;
      wasInCallRef.current = false;
      return;
    }
    if (autoStartRef.current) return;
    autoStartRef.current = true;
    if (sipStatus === 'registered') {
      startedRef.current = true;
      makeCall(contact.phone, { video: true });
    } else {
      void autoConnectAndCall();
    }
  }, [open, sipStatus, contact.phone, makeCall, autoConnectAndCall]);

  // Registro SIP chegou depois do dialog aberto → inicia a videochamada.
  useEffect(() => {
    if (!open || !autoStartRef.current || startedRef.current) return;
    if (sipStatus === 'registered' && callStatus === 'idle') {
      startedRef.current = true;
      makeCall(contact.phone, { video: true });
    }
  }, [open, sipStatus, callStatus, contact.phone, makeCall]);

  // Fecha o dialog sozinho quando a chamada termina (idle após ended).
  useEffect(() => {
    if (!open) return;
    if (inCall) wasInCallRef.current = true;
    else if (wasInCallRef.current && callStatus === 'idle') {
      wasInCallRef.current = false;
      onOpenChange(false);
    }
  }, [open, inCall, callStatus, onOpenChange]);

  const handleClose = useCallback(() => {
    if (callStatus !== 'idle') hangUp();
    onOpenChange(false);
  }, [callStatus, hangUp, onOpenChange]);

  const handleRetryConnect = useCallback(() => {
    void autoConnectAndCall();
  }, [autoConnectAndCall]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="border-0 p-0 sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Videochamada — {contact.name}</DialogTitle>
          <DialogDescription>
            Videochamada SIP com {contact.name} ({contact.phone})
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          {/* Remoto (grande) */}
          {callActive ? (
            <video
              ref={attachRemoteVideo}
              autoPlay
              playsInline
              data-testid="video-call-remote"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative"
              >
                <Avatar className="h-20 w-20 border-4 border-white/20">
                  <AvatarImage src={contact.avatar} alt={contact.name} />
                  <AvatarFallback className="bg-primary/20 text-xl text-primary">
                    {contact.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <AnimatePresence>
                  {callStatus === 'ringing' && (
                    <motion.div
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute inset-0 rounded-full border-2 border-primary"
                    />
                  )}
                </AnimatePresence>
              </motion.div>
              <p className="text-sm font-medium text-white">{contact.name}</p>
              <p className="text-xs text-white/60">
                {callStatus === 'ringing' && 'Tocando...'}
                {callStatus === 'calling' && 'Chamando...'}
                {callStatus === 'ended' && 'Chamada encerrada'}
              </p>
            </div>
          )}

          {/* Local (mini, espelhado) */}
          {callActive && (
            <video
              ref={attachLocalVideo}
              autoPlay
              playsInline
              muted
              data-testid="video-call-local"
              className="absolute right-3 top-3 h-24 w-36 -scale-x-100 rounded-lg border border-white/20 bg-black object-cover"
            />
          )}

          {/* Conectando ao VoIP */}
          {connecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-white">Conectando ao VoIP...</p>
            </div>
          )}

          {/* Falha na conexão */}
          {connectFailed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 p-6">
              <WifiOff className="h-8 w-8 text-destructive" />
              <p className="text-center text-sm text-white">
                Não foi possível conectar ao servidor VoIP. Verifique as configurações na página
                VoIP.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleRetryConnect}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Tentar novamente
                </Button>
                <Button size="sm" variant="destructive" onClick={handleClose}>
                  Fechar
                </Button>
              </div>
            </div>
          )}

          {/* Badge de voz (provedor sem vídeo / câmera indisponível) */}
          {callActive && (!videoSupported || !isVideoOn) && (
            <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/80">
              Chamada de voz
            </div>
          )}

          {/* Status / timer */}
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/50 px-3 py-0.5 text-xs text-white/90">
            {callActive
              ? `${contact.name} · ${formatTime(callDuration)}`
              : contact.name}
          </div>

          {/* Controles */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3">
            <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
              <Button
                aria-label={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
                variant="outline"
                size="icon"
                className={cn(
                  'h-12 w-12 rounded-full border-white/20 bg-black/40 text-white hover:bg-black/60 hover:text-white',
                  isMuted && 'bg-destructive/80 border-destructive hover:bg-destructive'
                )}
                onClick={toggleMute}
                disabled={!callActive}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
            </motion.div>

            {videoSupported && (
              <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                <Button
                  aria-label={isVideoOn ? 'Desligar vídeo' : 'Ligar vídeo'}
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-12 w-12 rounded-full border-white/20 bg-black/40 text-white hover:bg-black/60 hover:text-white',
                    !isVideoOn && 'bg-warning/70 border-warning hover:bg-warning'
                  )}
                  onClick={toggleVideo}
                  disabled={!callActive}
                >
                  {isVideoOn ? (
                    <Video className="h-5 w-5" />
                  ) : (
                    <VideoOff className="h-5 w-5" />
                  )}
                </Button>
              </motion.div>
            )}

            <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
              <Button
                aria-label="Encerrar videochamada"
                size="icon"
                className="h-14 w-14 rounded-full bg-destructive hover:bg-destructive/90"
                onClick={handleClose}
                disabled={callStatus === 'idle' && !connectFailed && !connecting}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface VideoCallLauncherProps {
  // Sem props — escuta o evento global 'start-video-call' disparado pelos
  // botões de videochamada (ChatHeader / ContactActionButtons).
  [key: string]: never;
}

/**
 * VideoCallLauncher — ponte entre os botões de videochamada do app
 * (evento CustomEvent 'start-video-call' com { phone, name, avatar }) e o
 * VideoCallDialog real. Montado no App-level (DeferredProviders).
 */
export function VideoCallLauncher(_props: VideoCallLauncherProps) {
  const [pending, setPending] = useState<{ contact: VideoCallContact; key: number } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ phone?: string; name?: string; avatar?: string }>).detail;
      const phone = detail?.phone ?? '';
      if (!phone) return;
      setPending({
        contact: { phone, name: detail?.name ?? 'Contato', avatar: detail?.avatar },
        key: Date.now(),
      });
    };
    window.addEventListener('start-video-call', handler);
    return () => window.removeEventListener('start-video-call', handler);
  }, []);

  if (!pending) return null;
  return (
    <VideoCallDialog
      key={pending.key}
      open
      onOpenChange={(v) => {
        if (!v) setPending(null);
      }}
      contact={pending.contact}
    />
  );
}
