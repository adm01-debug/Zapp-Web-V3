/**
 * Testes focados nos guards de runtime que o ChatInputArea usa para lidar
 * com `queue` e `attempts` possivelmente `undefined`, além do padrão de
 * consumo do `inputRef` (que aceita `RefObject<HTMLTextAreaElement | null>`).
 *
 * Renderizar o `ChatInputArea` inteiro exige mockar dezenas de dependências
 * (hooks de mentions, Supabase, feature flags, motion). Em vez disso,
 * exercitamos aqui a mesma lógica que o componente aplica, garantindo o
 * comportamento observável — a UI de fila e o repasse do ref.
 */
import { useRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  getQueueLength,
  normalizeAttempts,
  getLastAttemptDuration,
  type QueueItemLike,
} from '../chatInputGuards';
import { asRef } from '@/lib/reactRefs';

/** Reproduz o bloco de UI da fila do ChatInputArea, usando os mesmos guards. */
function QueueBlock({ queue }: { queue?: QueueItemLike[] }) {
  if (getQueueLength(queue) === 0) return null;
  return (
    <ul aria-label="fila">
      {(queue ?? []).map((item) => {
        const attempts = normalizeAttempts(item.attempts);
        const lastDuration = getLastAttemptDuration(item.attempts);
        return (
          <li key={item.id} data-testid={`queue-item-${item.id}`}>
            <span data-testid="status">{item.status}</span>
            {attempts.length > 0 && (
              <span data-testid="attempts">
                {attempts.length} {attempts.length === 1 ? 'tentativa' : 'tentativas'}
              </span>
            )}
            {typeof lastDuration === 'number' && (
              <span data-testid="duration">{lastDuration}ms</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Reproduz o consumo do inputRef via asRef. */
function TextareaWithRef() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  return <textarea ref={asRef(inputRef)} data-testid="chat-textarea" />;
}

describe('ChatInputArea — guards e ref', () => {
  it('não renderiza o bloco de fila quando queue é undefined', () => {
    render(<QueueBlock queue={undefined} />);
    expect(screen.queryByLabelText('fila')).not.toBeInTheDocument();
  });

  it('não renderiza o bloco de fila quando queue está vazia', () => {
    render(<QueueBlock queue={[]} />);
    expect(screen.queryByLabelText('fila')).not.toBeInTheDocument();
  });

  it('renderiza item sem seção de tentativas quando attempts é undefined', () => {
    render(<QueueBlock queue={[{ id: '1', status: 'sending' }]} />);
    expect(screen.getByTestId('queue-item-1')).toBeInTheDocument();
    expect(screen.queryByTestId('attempts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('duration')).not.toBeInTheDocument();
  });

  it('pluraliza tentativas e mostra duração da última quando presente', () => {
    render(
      <QueueBlock
        queue={[
          {
            id: '2',
            status: 'failed',
            attempts: [{ duration: 120 }, { duration: 340 }],
          },
        ]}
      />
    );
    expect(screen.getByTestId('attempts')).toHaveTextContent('2 tentativas');
    expect(screen.getByTestId('duration')).toHaveTextContent('340ms');
  });

  it('usa singular com 1 tentativa e omite duração inválida', () => {
    render(
      <QueueBlock
        queue={[{ id: '3', status: 'failed', attempts: [{ duration: undefined }] }]}
      />
    );
    expect(screen.getByTestId('attempts')).toHaveTextContent('1 tentativa');
    expect(screen.queryByTestId('duration')).not.toBeInTheDocument();
  });

  it('aceita ref do padrão useRef<T>(null) via asRef sem erro de tipagem/runtime', () => {
    render(<TextareaWithRef />);
    const textarea = screen.getByTestId('chat-textarea');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });
});
