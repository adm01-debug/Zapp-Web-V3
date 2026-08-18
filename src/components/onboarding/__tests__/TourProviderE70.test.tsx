/**
 * E70 — TourProvider: startTour filtra steps com seletor ausente (70.2) e
 * useTour fora do provider lança mensagem amigável de diagnóstico (70.3).
 *
 * RED esperado ANTES da implementação:
 *   - startTour não filtra (total-steps continua 6 com DOM parcial) → falha;
 *   - useTour fora do provider lança mensagem GENÉRICA ("useTour must be used
 *     within a TourProvider") sem o diagnóstico amigável → falha no assert da
 *     mensagem estendida.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TourProvider, useTour, DEFAULT_ONBOARDING_STEPS, TourStep } from '../OnboardingTour';

const warnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: warnMock, info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

function TourConsumer({ steps }: { steps?: TourStep[] }) {
  const { isActive, currentStep, startTour, endTour, nextStep, prevStep, goToStep, steps: tourSteps } =
    useTour();

  return (
    <div>
      <span data-testid="is-active">{String(isActive)}</span>
      <span data-testid="current-step">{currentStep}</span>
      <span data-testid="total-steps">{tourSteps.length}</span>
      <button data-testid="start-tour" onClick={() => startTour(steps || DEFAULT_ONBOARDING_STEPS)}>
        Start
      </button>
      <button data-testid="end-tour" onClick={endTour}>
        End
      </button>
      <button data-testid="next-step" onClick={nextStep}>
        Next
      </button>
      <button data-testid="prev-step" onClick={prevStep}>
        Prev
      </button>
      <button data-testid="go-to-2" onClick={() => goToStep(2)}>
        Go to 2
      </button>
    </div>
  );
}

function seedDom(ids: string[]) {
  document.body.innerHTML = ids.map((id) => `<div data-tour="${id}"></div>`).join('');
}

describe('TourProvider — filtra steps indisponíveis (E70.2)', () => {
  beforeEach(() => {
    warnMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('inicia o tour apenas com os steps cujos seletores existem no DOM', () => {
    seedDom(['inbox', 'dashboard']);
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));

    expect(screen.getByTestId('is-active').textContent).toBe('true');
    expect(screen.getByTestId('total-steps').textContent).toBe('2');
    expect(screen.getByTestId('current-step').textContent).toBe('0');
    expect(warnMock).toHaveBeenCalled();
  });

  it('com todos os seletores presentes, todos os 6 steps iniciam', () => {
    seedDom(['inbox', 'contacts', 'dashboard', 'queues', 'notifications', 'theme']);
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));

    expect(screen.getByTestId('total-steps').textContent).toBe('6');
  });

  it('navegação progride pelos steps disponíveis (2 steps: próximo encerra)', () => {
    seedDom(['inbox', 'dashboard']);
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('next-step')); // vai para o 2º (dashboard)
    expect(screen.getByTestId('current-step').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('next-step')); // encerra
    expect(screen.getByTestId('is-active').textContent).toBe('false');
  });
});

describe('useTour fora do provider — mensagem amigável de diagnóstico (E70.3)', () => {
  it('lança erro que NOMEIA o provider e aponta o diagnóstico', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<TourConsumer />);
    }).toThrow(/useTour must be used within a TourProvider/);
    let threw: unknown;
    try {
      render(<TourConsumer />);
    } catch (e) {
      threw = e;
    }
    expect(String((threw as Error).message)).toMatch(/TourProvider/);
    expect(String((threw as Error).message)).toMatch(/montad|verifique|diagn.stic/i);
    spy.mockRestore();
  });
});
