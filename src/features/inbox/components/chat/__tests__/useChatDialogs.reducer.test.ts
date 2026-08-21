/**
 * Etapa 91 do plano ChatPanel — reducer de dialogs (RESET_ALL do Bloco 0).
 * Invariantes:
 *  - RESET_ALL com tudo fechado PRESERVA a referência do estado (React não
 *    re-renderiza — o effect de troca de conversa dispara isto a cada troca).
 *  - RESET_ALL com qualquer dialog aberto fecha TODOS.
 *  - OPEN idempotente também preserva referência.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatDialogs } from '../hooks/useChatDialogs';

describe('useChatDialogs — RESET_ALL', () => {
  it('preserva a referência do estado quando nada está aberto', () => {
    const { result } = renderHook(() => useChatDialogs());
    const before = result.current.dialogs;
    act(() => {
      result.current.resetAllDialogs();
    });
    expect(result.current.dialogs).toBe(before);
  });

  it('fecha TODOS os dialogs quando ao menos um está aberto', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => {
      result.current.openDialog('scheduleDialog');
      result.current.openDialog('transferDialog');
      result.current.openDialog('whisper');
    });
    expect(result.current.dialogs.scheduleDialog).toBe(true);
    expect(result.current.dialogs.transferDialog).toBe(true);

    act(() => {
      result.current.resetAllDialogs();
    });
    const after = result.current.dialogs;
    for (const [key, open] of Object.entries(after)) {
      expect(open, `dialog "${key}" deveria estar fechado após RESET_ALL`).toBe(false);
    }
  });

  it('OPEN idempotente preserva a referência (sem re-render por no-op)', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => {
      result.current.openDialog('callDialog');
    });
    const before = result.current.dialogs;
    act(() => {
      result.current.openDialog('callDialog');
    });
    expect(result.current.dialogs).toBe(before);
  });

  it('CLOSE de dialog já fechado preserva a referência', () => {
    const { result } = renderHook(() => useChatDialogs());
    const before = result.current.dialogs;
    act(() => {
      result.current.closeDialog('locationPicker');
    });
    expect(result.current.dialogs).toBe(before);
  });
});
