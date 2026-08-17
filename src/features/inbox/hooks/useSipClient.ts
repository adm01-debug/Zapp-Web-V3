import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import { UserAgent, Inviter, SessionState, Web } from 'sip.js';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { toast } from 'sonner';
import { useSipConnection } from './sip/useSipConnection';

/** Re-exported module members. */
export type { SipStatus } from './sip/useSipConnection';
/** Lifecycle state of the active SIP call session. */
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active' | 'on-hold' | 'ended';

/** Opções da makeCall: `video: true` inicia a chamada com vídeo desde o início (V1 — sem upgrade mid-call). */
export interface MakeCallOptions {
  video?: boolean;
}

const log = getLogger('SipClient');

/** Mensagem de erro amigável por falha de câmera (SIM-03 F1-F3). */
function cameraErrorMessage(err: unknown): string {
  const name =
    err instanceof DOMException ? err.name : ((err as { name?: string } | null)?.name ?? '');
  switch (name) {
    case 'NotAllowedError':
      return 'Câmera bloqueada — chamando só voz';
    case 'NotFoundError':
      return 'Câmera não encontrada — chamando só voz';
    case 'NotReadableError':
      return 'Câmera em uso em outra aba — chamando só voz';
    case 'OverconstrainedError':
      return 'Câmera não suporta a resolução pedida — chamando só voz';
    default:
      return 'Câmera indisponível — chamando só voz';
  }
}

/** Manages a SIP.js WebRTC voice/video call session: connects/disconnects the UA, places/answers/holds/mutes/video-toggles calls, tracks duration, and persists call records to Supabase. */
export function useSipClient() {
  const { sipStatus, uaRef, connect, disconnect } = useSipConnection();
  const queryClient = useQueryClient();
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const callStatusRef = useRef<CallStatus>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [currentNumber, setCurrentNumber] = useState('');
  /** Stream local (mic + câmera) da chamada ativa — anexada a um <video muted> pela UI. */
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  /** Stream remota (áudio + vídeo quando o provedor suporta) da chamada ativa. */
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  /** Vídeo local ligado/desligado (track.enabled — mesmo padrão do mute). */
  const [isVideoOn, setIsVideoOn] = useState(false);
  /** Suporte a vídeo do provedor na sessão atual (F4: sem m=video remoto → degrada para voz). */
  const [videoSupported, setVideoSupported] = useState(true);

  const sessionRef = useRef<Inviter | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const callStartTimeRef = useRef<string | null>(null);
  const profileIdRef = useRef<string | null>(null);

  const getRemoteAudio = useCallback(() => {
    if (!remoteAudioRef.current) {
      const existing = document.getElementById('sip-remote-audio');
      if (existing) existing.remove();
      const audio = document.createElement('audio');
      audio.id = 'sip-remote-audio';
      audio.autoplay = true;
      document.body.appendChild(audio);
      remoteAudioRef.current = audio;
    }
    return remoteAudioRef.current;
  }, []);

  /** <video> body-level para chamadas COM vídeo (mesmo padrão get-or-create do getRemoteAudio).
   *  Reproduz áudio+vídeo — evita som duplicado com o elemento de áudio. */
  const getRemoteVideo = useCallback(() => {
    if (!remoteVideoRef.current) {
      const existing = document.getElementById('sip-remote-video');
      if (existing) existing.remove();
      const video = document.createElement('video');
      video.id = 'sip-remote-video';
      video.autoplay = true;
      video.playsInline = true;
      document.body.appendChild(video);
      remoteVideoRef.current = video;
    }
    return remoteVideoRef.current;
  }, []);

  const startTimer = useCallback(() => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const findContactByPhone = useCallback(async (phone: string): Promise<string | null> => {
    try {
      const n = phone.replace(/[-\s()]/g, '');
      const safeN = sanitizePostgrestFilter(n);
      // Slice raw n before sanitizing so escape sequences aren't split by the slice
      const safeSuffix = sanitizePostgrestFilter(n.slice(-8));
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .or(`phone.eq.${safeN},phone.eq.+${safeN},phone.ilike.%${safeSuffix}%`)
        .limit(1)
        .maybeSingle();
      return data?.id || null;
    } catch {
      return null;
    }
  }, []);

  const getProfileId = useCallback(async (): Promise<string | null> => {
    if (profileIdRef.current) return profileIdRef.current;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.id) profileIdRef.current = data.id;
      return data?.id || null;
    } catch {
      return null;
    }
  }, []);

  const logCall = useCallback(
    async (number: string, status: string) => {
      try {
        const agentId = await getProfileId();
        const contactId = await findContactByPhone(number);
        const startedAt = callStartTimeRef.current || new Date().toISOString();
        const endedAt = new Date().toISOString();
        const duration = Math.round(
          (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
        );
        const { error: insertErr } = await supabase.from('calls').insert({
          direction: 'outbound',
          status,
          started_at: startedAt,
          ended_at: endedAt,
          duration_seconds: duration,
          agent_id: agentId,
          contact_id: contactId,
          notes: `Chamada para ${number}`,
        });
        if (insertErr) throw insertErr;
        callStartTimeRef.current = null;
        void queryClient.invalidateQueries({ queryKey: queryKeys.calls.history() });
      } catch (err) {
        log.error('Error logging call:', err);
      }
    },
    [getProfileId, findContactByPhone, queryClient]
  );

  const makeCall = useCallback(
    async (number: string, options?: MakeCallOptions) => {
      const videoEnabled = options?.video ?? false;
      if (!uaRef.current || sipStatus !== 'registered') {
        toast.error('VoIP não conectado.');
        return;
      }
      if (callStatusRef.current !== 'idle') {
        toast.error('Já existe uma chamada em andamento.');
        return;
      }
      // Camera pre-flight (SIM-03 F1-F3): valida a câmera ANTES de enviar o
      // INVITE. Se falhar (permissão negada / sem câmera / câmera em uso),
      // a chamada cai para áudio-only com toast explicativo — o SDP do Inviter
      // sai sem m=video.
      let constraints: MediaStreamConstraints = { audio: true, video: false };
      if (videoEnabled) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          });
          probe.getTracks().forEach((t) => t.stop());
          constraints = { audio: true, video: true };
        } catch (err) {
          toast.error(cameraErrorMessage(err));
        }
      }
      try {
        const target = UserAgent.makeURI(`sip:${number}@${uaRef.current.configuration.uri.host}`);
        if (!target) {
          toast.error('Número inválido');
          return;
        }
        setCurrentNumber(number);
        setCallStatus('calling');
        callStatusRef.current = 'calling';
        callStartTimeRef.current = new Date().toISOString();
        const inviter = new Inviter(uaRef.current, target, {
          sessionDescriptionHandlerOptions: { constraints },
        });
        const callHasVideo = videoEnabled && constraints.video !== false;
        setIsVideoOn(callHasVideo);
        setVideoSupported(true);
        inviter.stateChange.addListener((state) => {
          if (state === SessionState.Establishing) {
            setCallStatus('ringing');
            callStatusRef.current = 'ringing';
          } else if (state === SessionState.Established) {
            setCallStatus('active');
            callStatusRef.current = 'active';
            startTimer();
            const stream = new MediaStream();
            const sdh = inviter.sessionDescriptionHandler as Web.SessionDescriptionHandler;
            const receivers = sdh?.peerConnection?.getReceivers() ?? [];
            let hasRemoteVideo = false;
            receivers.forEach((r) => {
              if (r.track) {
                stream.addTrack(r.track);
                if (r.track.kind === 'video') hasRemoteVideo = true;
              }
            });
            if (hasRemoteVideo) {
              // Remoto com vídeo: toca no <video> (que também reproduz o áudio)
              // e remove o <audio> para não duplicar o som.
              getRemoteVideo().srcObject = stream;
              remoteAudioRef.current?.remove();
              remoteAudioRef.current = null;
            } else {
              getRemoteAudio().srcObject = stream;
              remoteVideoRef.current?.remove();
              remoteVideoRef.current = null;
            }
            setRemoteStream(stream);
            setLocalStream(sdh?.localMediaStream ?? null);
            if (callHasVideo && !hasRemoteVideo) {
              // F4: provedor não anunciou m=video — degrada a sessão para voz.
              setVideoSupported(false);
              toast.info('Provedor sem suporte a vídeo — chamada em áudio');
            }
          } else if (state === SessionState.Terminated) {
            stopTimer();
            setLocalStream(null);
            setRemoteStream(null);
            setIsVideoOn(false);
            setVideoSupported(true);
            const prev = callStatusRef.current;
            const logStatus = prev === 'active' ? 'ended' : 'missed';
            setCallStatus('ended');
            callStatusRef.current = 'ended';
            setIsMuted(false);
            void logCall(number, logStatus);
            resetTimerRef.current = setTimeout(() => {
              setCallStatus('idle');
              callStatusRef.current = 'idle';
            }, 2000);
          }
        });
        await inviter.invite();
        sessionRef.current = inviter;
      } catch (err: unknown) {
        log.error('Call error:', err);
        void logCall(number, 'missed');
        setCallStatus('idle');
        callStatusRef.current = 'idle';
        toast.error(`Erro ao ligar: ${err instanceof Error ? err.message : 'Falha'}`);
      }
    },
    [sipStatus, uaRef, startTimer, stopTimer, getRemoteAudio, getRemoteVideo, logCall]
  );

  const hangUp = useCallback(() => {
    if (sessionRef.current) {
      try {
        if (sessionRef.current.state === SessionState.Established) {
          void sessionRef.current.bye();
        } else {
          void sessionRef.current.cancel();
        }
      } catch (err) {
        log.error('Hangup error:', err);
      }
      sessionRef.current = null;
    }
    stopTimer();
    setCallStatus('idle');
    callStatusRef.current = 'idle';
    setIsMuted(false);
    setIsVideoOn(false);
    setLocalStream(null);
    setRemoteStream(null);
    setVideoSupported(true);
  }, [stopTimer]);

  const toggleMute = useCallback(() => {
    if (!sessionRef.current) return;
    const sdh = sessionRef.current.sessionDescriptionHandler as Web.SessionDescriptionHandler;
    sdh?.peerConnection?.getSenders().forEach((s) => {
      if (s.track?.kind === 'audio') s.track.enabled = isMuted;
    });
    setIsMuted(!isMuted);
  }, [isMuted]);

  /** Liga/desliga o vídeo local da chamada ativa (track.enabled — mesmo padrão do mute). */
  const toggleVideo = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;
    const sdh = session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
    const videoSenders =
      sdh?.peerConnection?.getSenders().filter((s) => s.track?.kind === 'video') ?? [];
    if (videoSenders.length === 0) {
      toast.info('Vídeo não disponível nesta chamada');
      return;
    }
    videoSenders.forEach((s) => {
      if (s.track) s.track.enabled = !isVideoOn;
    });
    setIsVideoOn(!isVideoOn);
  }, [isVideoOn]);

  const sendDTMF = useCallback((digit: string) => {
    if (!sessionRef.current || sessionRef.current.state !== SessionState.Established) return;
    try {
      const sdh = sessionRef.current.sessionDescriptionHandler as Web.SessionDescriptionHandler;
      const sender = sdh?.peerConnection?.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender)
        (sender as RTCRtpSender & { dtmf?: RTCDTMFSender }).dtmf?.insertDTMF(digit, 100, 70);
    } catch (err) {
      log.error('DTMF error:', err);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      remoteAudioRef.current?.remove();
      remoteAudioRef.current = null;
      remoteVideoRef.current?.remove();
      remoteVideoRef.current = null;
    };
  }, [stopTimer]);

  return {
    sipStatus,
    callStatus,
    callDuration,
    isMuted,
    isVideoOn,
    videoSupported,
    localStream,
    remoteStream,
    currentNumber,
    connect,
    disconnect,
    makeCall,
    hangUp,
    toggleMute,
    toggleVideo,
    sendDTMF,
  };
}
