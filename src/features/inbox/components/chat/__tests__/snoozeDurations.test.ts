/**
 * Etapa 93 do plano ChatPanel — durações do snooze da toolbar.
 * Caso âncora do plano: 'nextweek' NUMA SEGUNDA-FEIRA = +7 dias (segunda
 * seguinte), nunca "hoje às 9h".
 */
import { describe, it, expect } from 'vitest';
import { snoozeDurationToDate } from '../snoozeDurations';

// Datas locais fixas (2026-08-17 é segunda-feira; 2026-08-21 é sexta).
const MONDAY = new Date(2026, 7, 17, 15, 30, 0, 0);
const FRIDAY = new Date(2026, 7, 21, 15, 30, 0, 0);
const SUNDAY = new Date(2026, 7, 23, 8, 0, 0, 0);

describe('snoozeDurationToDate', () => {
  it("'1h' e '3h' são deslocamentos exatos a partir de now", () => {
    expect(snoozeDurationToDate('1h', FRIDAY).getTime()).toBe(
      FRIDAY.getTime() + 60 * 60 * 1000
    );
    expect(snoozeDurationToDate('3h', FRIDAY).getTime()).toBe(
      FRIDAY.getTime() + 3 * 60 * 60 * 1000
    );
  });

  it("'tomorrow' é o dia seguinte às 09:00 locais", () => {
    const t = snoozeDurationToDate('tomorrow', FRIDAY);
    expect(t.getDate()).toBe(22);
    expect(t.getMonth()).toBe(7);
    expect(t.getHours()).toBe(9);
    expect(t.getMinutes()).toBe(0);
  });

  it("'nextweek' na SEGUNDA vai para a segunda SEGUINTE (+7), às 09:00", () => {
    const t = snoozeDurationToDate('nextweek', MONDAY);
    expect(t.getDay()).toBe(1); // segunda
    expect(t.getDate()).toBe(24); // 17 + 7
    expect(t.getHours()).toBe(9);
  });

  it("'nextweek' na sexta e no domingo caem na próxima segunda às 09:00", () => {
    const fromFriday = snoozeDurationToDate('nextweek', FRIDAY);
    expect(fromFriday.getDay()).toBe(1);
    expect(fromFriday.getDate()).toBe(24);

    const fromSunday = snoozeDurationToDate('nextweek', SUNDAY);
    expect(fromSunday.getDay()).toBe(1);
    expect(fromSunday.getDate()).toBe(24);
    expect(fromSunday.getHours()).toBe(9);
  });

  it('nunca retorna data no passado em relação a now', () => {
    for (const d of ['1h', '3h', 'tomorrow', 'nextweek'] as const) {
      expect(snoozeDurationToDate(d, FRIDAY).getTime()).toBeGreaterThan(FRIDAY.getTime());
    }
  });
});
