/**
 * Unified notification sound utilities (v2.0 consolidated)
 * Combines playNotificationSound (config-based), requestNotificationPermission, and showBrowserNotification.
 * Supports both legacy API (simple type parameter) and modern API (soundType + volume).
 */
import { log } from '@/lib/logger';
import { SOUND_CONFIGS } from './soundConfigs';
import type { SoundType, NotificationType } from './soundConfigs';

export type { SoundType, NotificationType } from './soundConfigs';

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
};

/**
 * Play a notification sound.
 * Supports two APIs for backward compatibility:
 * - Legacy: playNotificationSound('message')
 * - Modern: playNotificationSound('message', 'chime', 70)
 */
export const playNotificationSound = (
  notificationTypeOrLegacyType: NotificationType | 'message' | 'mention' | 'alert',
  soundType: SoundType = 'chime',
  volume: number = 70
) => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const notificationType = notificationTypeOrLegacyType as NotificationType;
    const config = SOUND_CONFIGS[soundType][notificationType];
    const volumeMultiplier = volume / 100;

    config.frequencies.forEach((freq, index) => {
      setTimeout(() => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = config.waveform;
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

        const baseGain = config.gains[index] * volumeMultiplier;
        const duration = config.durations[index];
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(baseGain, ctx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);
      }, config.delays[index] * 1000);
    });
  } catch (error) {
    log.warn('Could not play notification sound:', error);
  }
};

export const previewSound = (soundType: SoundType, volume: number = 70) => {
  playNotificationSound('message', soundType, volume);
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof Notification === 'undefined') {
    log.warn('Notifications not supported');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
};

export const showBrowserNotification = (
  title: string,
  body: string,
  optionsOrIcon?: string | { icon?: string; tag?: string; onClick?: () => void }
) => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  let options: { icon?: string; tag?: string; onClick?: () => void } = {};
  if (typeof optionsOrIcon === 'string') {
    options = { icon: optionsOrIcon };
  } else if (optionsOrIcon) {
    options = optionsOrIcon;
  }

  const notifOptions: NotificationOptions = {
    body,
    icon: options.icon || '/favicon.ico',
    tag: options.tag || 'notification',
  };

  let notification: Notification;
  try {
    notification = new Notification(title, notifOptions);
  } catch {
    // Fallback for test environments where Notification is mocked as a plain function
    // (Vitest 4 rejects mockReturnValue with new; calling as a function works)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notification = (Notification as any)(title, notifOptions) as Notification;
  }

  if (options.onClick) {
    notification.onclick = () => {
      window.focus();
      options.onClick?.();
      notification.close();
    };
  }

  setTimeout(() => notification.close(), 5000);
};
