// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock AudioContext
const mockOscillator = {
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  type: 'sine',
  frequency: { setValueAtTime: vi.fn() },
};

const mockGainNode = {
  connect: vi.fn(),
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
};

const mockAudioContext = {
  createOscillator: vi.fn().mockReturnValue({ ...mockOscillator }),
  createGain: vi.fn().mockReturnValue({ ...mockGainNode }),
  currentTime: 0,
  destination: {},
  state: 'running',
  resume: vi.fn(),
};

vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => mockAudioContext));
vi.mock('@/lib/logger');

import {
  playNotificationSound,
  requestNotificationPermission,
  showBrowserNotification,
  previewSound,
} from '@/utils/notificationSounds';

describe('notificationSounds (unified v2.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('playNotificationSound', () => {
    describe('Modern API (config-based)', () => {
      it('plays default message sound without error', () => {
        expect(() => playNotificationSound('message')).not.toThrow();
      });

      it('plays with chime sound type', () => {
        expect(() => playNotificationSound('message', 'chime')).not.toThrow();
      });

      it('plays with bell sound type', () => {
        expect(() => playNotificationSound('mention', 'bell')).not.toThrow();
      });

      it('plays with alert sound type', () => {
        expect(() => playNotificationSound('sla_breach', 'alert')).not.toThrow();
      });

      it('plays with beep sound type', () => {
        expect(() => playNotificationSound('message', 'beep')).not.toThrow();
      });

      it('plays with soft sound type', () => {
        expect(() => playNotificationSound('message', 'soft')).not.toThrow();
      });

      it('plays achievement sound', () => {
        expect(() => playNotificationSound('achievement')).not.toThrow();
      });

      it('plays goal_achieved sound', () => {
        expect(() => playNotificationSound('goal_achieved')).not.toThrow();
      });

      it('plays sla_warning sound', () => {
        expect(() => playNotificationSound('sla_warning')).not.toThrow();
      });

      it('respects custom volume', () => {
        expect(() => playNotificationSound('message', 'chime', 50)).not.toThrow();
      });

      it('handles zero volume', () => {
        expect(() => playNotificationSound('message', 'chime', 0)).not.toThrow();
      });

      it('all notification types are playable', () => {
        const types = ['message', 'mention', 'sla_breach', 'sla_warning', 'achievement', 'goal_achieved', 'record_start', 'record_stop'] as const;
        types.forEach(type => {
          expect(() => playNotificationSound(type)).not.toThrow();
        });
      });

      it('all sound types work with message', () => {
        const sounds = ['beep', 'chime', 'bell', 'alert', 'soft'] as const;
        sounds.forEach(sound => {
          expect(() => playNotificationSound('message', sound)).not.toThrow();
        });
      });
    });

    describe('Backward compatibility (legacy API)', () => {
      it('plays message sound (legacy)', () => {
        expect(() => playNotificationSound('message')).not.toThrow();
      });

      it('plays mention sound (legacy)', () => {
        expect(() => playNotificationSound('mention')).not.toThrow();
      });

      it('plays alert sound (legacy)', () => {
        expect(() => playNotificationSound('alert')).not.toThrow();
      });
    });
  });

  describe('previewSound', () => {
    it('previews beep sound', () => {
      expect(() => previewSound('beep')).not.toThrow();
    });

    it('previews with custom volume', () => {
      expect(() => previewSound('chime', 50)).not.toThrow();
    });
  });

  describe('requestNotificationPermission', () => {
    it('returns true when granted', async () => {
      const requestPermission = vi.fn().mockResolvedValue('granted');
      vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
      const result = await requestNotificationPermission();
      expect(result).toBe(true);
    });

    it('requests permission when default', async () => {
      const requestPermission = vi.fn().mockResolvedValue('granted');
      vi.stubGlobal('Notification', { permission: 'default', requestPermission });
      await requestNotificationPermission();
      expect(requestPermission).toHaveBeenCalled();
    });

    it('returns false when denied', async () => {
      vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
      const result = await requestNotificationPermission();
      expect(result).toBe(false);
    });

    it('returns false when Notification not in window', async () => {
      const win = window as Record<string, unknown>;
      delete win.Notification;
      const result = await requestNotificationPermission();
      expect(result).toBe(false);
    });
  });

  describe('showBrowserNotification', () => {
    it('creates notification when granted', () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal('Notification', { permission: 'granted' });
      (global as any).Notification = NotificationSpy;
      Object.defineProperty(NotificationSpy, 'permission', { value: 'granted', configurable: true });
      showBrowserNotification('Test', 'Body');
      expect(NotificationSpy).toHaveBeenCalledWith('Test', expect.objectContaining({ body: 'Body' }));
    });

    it('accepts legacy icon parameter as string', () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal('Notification', NotificationSpy);
      Object.defineProperty(NotificationSpy, 'permission', { value: 'granted', configurable: true });
      showBrowserNotification('Test', 'Body', '/custom-icon.png');
      expect(NotificationSpy).toHaveBeenCalledWith('Test', expect.objectContaining({ icon: '/custom-icon.png' }));
    });

    it('accepts options object', () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal('Notification', NotificationSpy);
      Object.defineProperty(NotificationSpy, 'permission', { value: 'granted', configurable: true });
      showBrowserNotification('Test', 'Body', { icon: '/custom.png', onClick: vi.fn() });
      expect(NotificationSpy).toHaveBeenCalledWith('Test', expect.objectContaining({ icon: '/custom.png' }));
    });

    it('does not create notification when denied', () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal('Notification', NotificationSpy);
      Object.defineProperty(NotificationSpy, 'permission', { value: 'denied', configurable: true });
      showBrowserNotification('Test', 'Body');
      expect(NotificationSpy).not.toHaveBeenCalled();
    });

    it('closes notification after timeout', () => {
      const mockNotification = { close: vi.fn(), onclick: undefined };
      const NotificationSpy = vi.fn().mockReturnValue(mockNotification);
      vi.stubGlobal('Notification', NotificationSpy);
      Object.defineProperty(NotificationSpy, 'permission', { value: 'granted', configurable: true });
      showBrowserNotification('Test', 'Body');
      vi.advanceTimersByTime(5000);
      expect(mockNotification.close).toHaveBeenCalled();
    });

    it('calls onClick when notification is clicked', () => {
      const onClick = vi.fn();
      const mockNotification = { close: vi.fn(), onclick: undefined };
      const NotificationSpy = vi.fn().mockReturnValue(mockNotification);
      vi.stubGlobal('Notification', NotificationSpy);
      Object.defineProperty(NotificationSpy, 'permission', { value: 'granted', configurable: true });
      vi.stubGlobal('window', { focus: vi.fn() });
      showBrowserNotification('Test', 'Body', { onClick });
      mockNotification.onclick?.({} as Event);
      expect(onClick).toHaveBeenCalled();
      expect(mockNotification.close).toHaveBeenCalled();
    });
  });
});