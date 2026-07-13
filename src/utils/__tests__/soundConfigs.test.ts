import { describe, it, expect } from 'vitest';
import { SOUND_CONFIGS, SoundType, NotificationType } from '../soundConfigs';

const SOUND_TYPES: SoundType[] = ['beep', 'chime', 'bell', 'alert', 'soft'];
const NOTIFICATION_TYPES: NotificationType[] = [
  'message', 'mention', 'sla_breach', 'sla_warning',
  'achievement', 'goal_achieved', 'record_start', 'record_stop',
];

// ── completeness ──────────────────────────────────────────────────────────────

describe('SOUND_CONFIGS — completeness', () => {
  it('has all 5 SoundType keys', () => {
    SOUND_TYPES.forEach((st) => {
      expect(SOUND_CONFIGS[st]).toBeDefined();
    });
  });

  it.each(SOUND_TYPES)('"%s" has all 8 NotificationType keys', (soundType) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      expect(SOUND_CONFIGS[soundType][nt]).toBeDefined();
    });
  });

  it('has exactly 5 top-level keys', () => {
    expect(Object.keys(SOUND_CONFIGS)).toHaveLength(5);
  });

  it('each SoundType has exactly 8 NotificationType entries', () => {
    SOUND_TYPES.forEach((st) => {
      expect(Object.keys(SOUND_CONFIGS[st])).toHaveLength(8);
    });
  });
});

// ── SoundConfig shape ─────────────────────────────────────────────────────────

describe('SOUND_CONFIGS — SoundConfig shape', () => {
  it.each(SOUND_TYPES)('every "%s" entry has a non-empty frequencies array', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      expect(SOUND_CONFIGS[st][nt].frequencies.length).toBeGreaterThan(0);
    });
  });

  it.each(SOUND_TYPES)('every "%s" entry has a non-empty durations array', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      expect(SOUND_CONFIGS[st][nt].durations.length).toBeGreaterThan(0);
    });
  });

  it.each(SOUND_TYPES)('every "%s" entry has a non-empty gains array', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      expect(SOUND_CONFIGS[st][nt].gains.length).toBeGreaterThan(0);
    });
  });

  it.each(SOUND_TYPES)('every "%s" entry has a non-empty delays array', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      expect(SOUND_CONFIGS[st][nt].delays.length).toBeGreaterThan(0);
    });
  });

  it.each(SOUND_TYPES)('every "%s" entry has a valid waveform string', (st) => {
    const VALID_WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth'];
    NOTIFICATION_TYPES.forEach((nt) => {
      expect(VALID_WAVEFORMS).toContain(SOUND_CONFIGS[st][nt].waveform);
    });
  });
});

// ── value constraints ─────────────────────────────────────────────────────────

describe('SOUND_CONFIGS — value constraints', () => {
  it.each(SOUND_TYPES)('all "%s" frequencies are positive numbers', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      SOUND_CONFIGS[st][nt].frequencies.forEach((f) => {
        expect(f).toBeGreaterThan(0);
      });
    });
  });

  it.each(SOUND_TYPES)('all "%s" durations are positive numbers', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      SOUND_CONFIGS[st][nt].durations.forEach((d) => {
        expect(d).toBeGreaterThan(0);
      });
    });
  });

  it.each(SOUND_TYPES)('all "%s" gains are in range (0, 1]', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      SOUND_CONFIGS[st][nt].gains.forEach((g) => {
        expect(g).toBeGreaterThan(0);
        expect(g).toBeLessThanOrEqual(1);
      });
    });
  });

  it.each(SOUND_TYPES)('all "%s" delays are non-negative', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      SOUND_CONFIGS[st][nt].delays.forEach((dl) => {
        expect(dl).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it.each(SOUND_TYPES)('frequencies/durations/gains/delays arrays have consistent lengths', (st) => {
    NOTIFICATION_TYPES.forEach((nt) => {
      const cfg = SOUND_CONFIGS[st][nt];
      expect(cfg.durations).toHaveLength(cfg.frequencies.length);
      expect(cfg.gains).toHaveLength(cfg.frequencies.length);
      expect(cfg.delays).toHaveLength(cfg.frequencies.length);
    });
  });
});

// ── spot-checks ───────────────────────────────────────────────────────────────

describe('SOUND_CONFIGS — spot-checks', () => {
  it('beep.message starts at delay 0', () => {
    expect(SOUND_CONFIGS.beep.message.delays[0]).toBe(0);
  });

  it('alert waveform uses square for sla_breach', () => {
    expect(SOUND_CONFIGS.alert.sla_breach.waveform).toBe('square');
  });

  it('soft uses sine for all notification types', () => {
    NOTIFICATION_TYPES.forEach((nt) => {
      expect(SOUND_CONFIGS.soft[nt].waveform).toBe('sine');
    });
  });
});
