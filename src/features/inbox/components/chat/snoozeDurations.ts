/**
 * Conversão de duração da toolbar de snooze em data-alvo (etapa 93 do plano
 * ChatPanel — regra extraída do ChatPanel.handleSnoozeFromToolbar para ser
 * testável com relógio fake).
 *
 * Regras:
 * - '1h' / '3h': deslocamento simples a partir de `now`.
 * - 'tomorrow': dia seguinte às 09:00 locais.
 * - 'nextweek': PRÓXIMA segunda-feira às 09:00 — se hoje já é segunda, vai
 *   para a segunda seguinte (+7), nunca "hoje".
 */
export type SnoozeToolbarDuration = '1h' | '3h' | 'tomorrow' | 'nextweek';

export function snoozeDurationToDate(
  duration: SnoozeToolbarDuration,
  now: Date = new Date()
): Date {
  switch (duration) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '3h':
      return new Date(now.getTime() + 3 * 60 * 60 * 1000);
    case 'tomorrow': {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(9, 0, 0, 0);
      return t;
    }
    case 'nextweek': {
      const t = new Date(now);
      const daysUntilMonday = (1 - t.getDay() + 7) % 7 || 7;
      t.setDate(t.getDate() + daysUntilMonday);
      t.setHours(9, 0, 0, 0);
      return t;
    }
    default:
      return new Date(now.getTime() + 60 * 60 * 1000);
  }
}
