import { z } from 'zod';

export const DEFAULT_TTS_VOICE_ID = 'TY3h8ANhQUsJaa0Bga5F';
export const DEFAULT_TTS_SPEED = 1.0;

const TimeFormatRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

export const UserSettingsSchema = z
  .object({
    user_id: z.string().uuid(),
    business_hours_enabled: z.boolean(),
    business_hours_start: z.string().regex(TimeFormatRegex, 'Must be HH:MM format'),
    business_hours_end: z.string().regex(TimeFormatRegex, 'Must be HH:MM format'),
    work_days: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
    welcome_message: z.string().max(500).default(''),
    away_message: z.string().max(500).default(''),
    closing_message: z.string().max(500).default(''),
    auto_assignment_enabled: z.boolean(),
    auto_assignment_method: z.enum(['roundrobin', 'random', 'least_active']).default('roundrobin'),
    inactivity_timeout: z.number().min(1).max(300).default(30),
    auto_transcription_enabled: z.boolean(),
    sound_enabled: z.boolean(),
    browser_notifications_enabled: z.boolean(),
    quiet_hours_enabled: z.boolean(),
    quiet_hours_start: z.string().regex(TimeFormatRegex, 'Must be HH:MM format'),
    quiet_hours_end: z.string().regex(TimeFormatRegex, 'Must be HH:MM format'),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    language: z.string().default('pt-BR'),
    compact_mode: z.boolean(),
    tts_voice_id: z.string().default(DEFAULT_TTS_VOICE_ID),
    tts_speed: z.number().min(0.5).max(2.0).default(DEFAULT_TTS_SPEED),
    simulation_mode_enabled: z.boolean(),
    global_sla_warning_minutes: z.number().min(1).max(1440).default(30),
    global_sla_critical_minutes: z.number().min(1).max(1440).default(60),
    global_sla_notification_message: z
      .string()
      .max(1000)
      .default('Alerta SLA: Tempo limite excedido para resposta.'),
  })
  .refine(
    (data) => {
      const [startH, startM] = data.business_hours_start.split(':').map(Number);
      const [endH, endM] = data.business_hours_end.split(':').map(Number);
      return startH * 60 + startM < endH * 60 + endM;
    },
    { message: 'Business hours: end time must be after start time', path: ['business_hours_end'] }
  )
  .refine(
    (data) => {
      const [startH, startM] = data.quiet_hours_start.split(':').map(Number);
      const [endH, endM] = data.quiet_hours_end.split(':').map(Number);
      return data.quiet_hours_enabled ? startH * 60 + startM !== endH * 60 + endM : true;
    },
    { message: 'Quiet hours: start and end times must be different', path: ['quiet_hours_end'] }
  );

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 100
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.includes('CONFLICT') || lastError.message.includes('version')) {
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, initialDelayMs * Math.pow(2, attempt))
          );
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError || new Error('Retry failed');
}

export interface UserSettings {
  id?: string;
  user_id?: string;
  version?: number;

  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  work_days: number[];

  welcome_message: string;
  away_message: string;
  closing_message: string;

  auto_assignment_enabled: boolean;
  auto_assignment_method: string;
  inactivity_timeout: number;
  auto_transcription_enabled: boolean;

  sound_enabled: boolean;
  browser_notifications_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;

  theme: string;
  language: string;
  compact_mode: boolean;

  tts_voice_id: string;
  tts_speed: number;

  simulation_mode_enabled: boolean;

  global_sla_warning_minutes: number;
  global_sla_critical_minutes: number;
  global_sla_notification_message: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  version: 1,
  business_hours_enabled: true,
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  work_days: [1, 2, 3, 4, 5],

  welcome_message: '',
  away_message: '',
  closing_message: '',

  auto_assignment_enabled: true,
  auto_assignment_method: 'roundrobin',
  inactivity_timeout: 30,
  auto_transcription_enabled: true,

  sound_enabled: true,
  browser_notifications_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',

  theme: 'system',
  language: 'pt-BR',
  compact_mode: false,

  tts_voice_id: DEFAULT_TTS_VOICE_ID,
  tts_speed: DEFAULT_TTS_SPEED,

  simulation_mode_enabled: false,

  global_sla_warning_minutes: 30,
  global_sla_critical_minutes: 60,
  global_sla_notification_message: 'Alerta SLA: Tempo limite excedido para resposta.',
};
