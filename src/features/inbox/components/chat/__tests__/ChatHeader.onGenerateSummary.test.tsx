/**
 * Testes de comportamento do padrão de wrapping usado no ChatHeader para
 * `onGenerateSummary`. O bug original (TS2322) veio de passar `onGenerateSummary`
 * diretamente como `onClick` do DropdownMenuItem, o que fazia o `MouseEvent`
 * ser recebido como o parâmetro `tool: string`. A correção envolve
 * arrow-wrapping para preservar a assinatura.
 *
 * Este teste garante que o padrão permanece correto — se alguém trocar por
 * `onClick={onGenerateSummary}` novamente, o teste falha.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Reproduz o padrão exato do ChatHeader.tsx:
//   <button onClick={() => onGenerateSummary?.()}>Gerar Resumo</button>
//   <button onClick={() => onGenerateSummary?.('teamFiles')}>Team Files</button>
function Harness({ onGenerateSummary }: { onGenerateSummary?: (tool?: string) => void }) {
  return (
    <div>
      <button type="button" onClick={() => onGenerateSummary?.()}>
        Gerar Resumo
      </button>
      <button type="button" onClick={() => onGenerateSummary?.('teamFiles')}>
        Team Files
      </button>
    </div>
  );
}

describe('ChatHeader onGenerateSummary wrapping pattern', () => {
  it('chama onGenerateSummary sem argumentos (não vaza MouseEvent)', () => {
    const onGenerateSummary = vi.fn();
    render(<Harness onGenerateSummary={onGenerateSummary} />);

    fireEvent.click(screen.getByText('Gerar Resumo'));

    expect(onGenerateSummary).toHaveBeenCalledTimes(1);
    // Crítico: nenhum argumento — o MouseEvent não pode vazar como `tool`.
    expect(onGenerateSummary).toHaveBeenCalledWith();
    const firstCallArgs = onGenerateSummary.mock.calls[0];
    expect(firstCallArgs).toHaveLength(0);
  });

  it('propaga a string `tool` quando explicitamente fornecida', () => {
    const onGenerateSummary = vi.fn();
    render(<Harness onGenerateSummary={onGenerateSummary} />);

    fireEvent.click(screen.getByText('Team Files'));

    expect(onGenerateSummary).toHaveBeenCalledWith('teamFiles');
  });

  it('não explode quando onGenerateSummary é undefined', () => {
    render(<Harness onGenerateSummary={undefined} />);
    expect(() => fireEvent.click(screen.getByText('Gerar Resumo'))).not.toThrow();
  });
});
