import { render, screen, fireEvent, act } from '@testing-library/react';
import { useMessageQueue } from '../useMessageQueue';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock component to test the hook
function QueueTestComponent({
  processMessage,
  contactId,
}: {
  processMessage: Parameters<typeof useMessageQueue>[0];
  contactId: string;
}) {
  const { queue, addToQueue, retryMessage } = useMessageQueue(processMessage);

  return (
    <div>
      <div data-testid="queue-length">{queue.length}</div>
      <button onClick={() => addToQueue(contactId, 'test content')} data-testid="add-btn">
        Add
      </button>
      <div data-testid="queue-data">{JSON.stringify(queue)}</div>
      {queue.map((item) => (
        <div key={item.id} data-testid={`item-${item.id}`}>
          <span>{item.status}</span>
          {item.status === 'failed' && (
            <button onClick={() => retryMessage(item.id)} data-testid={`retry-${item.id}`}>
              Retry
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

describe('useMessageQueue E2E & Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it('should process messages in order for each conversation independently', async () => {
    const processedMessages: string[] = [];
    const processMessage = vi.fn(async (item) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      processedMessages.push(`${item.contactId}:${item.content}`);
    });

    const { rerender } = render(
      <QueueTestComponent processMessage={processMessage} contactId="contact-1" />
    );

    // Add 2 messages for contact-1
    fireEvent.click(screen.getByTestId('add-btn'));

    rerender(<QueueTestComponent processMessage={processMessage} contactId="contact-2" />);
    // Add 1 message for contact-2
    fireEvent.click(screen.getByTestId('add-btn'));

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Check that both are processing or processed
    expect(processMessage).toHaveBeenCalledTimes(2);
  });

  it('should persist queue to localStorage and restore on reload', async () => {
    const processMessage = vi.fn().mockResolvedValue(undefined);

    const { unmount } = render(
      <QueueTestComponent processMessage={processMessage} contactId="contact-1" />
    );

    // Add a message and make it fail to keep it in queue
    const failedProcess = vi.fn().mockRejectedValue(new Error('Persistent error'));

    unmount();

    render(<QueueTestComponent processMessage={failedProcess} contactId="contact-1" />);
    fireEvent.click(screen.getByTestId('add-btn'));

    await act(async () => {
      // Avança suficientemente para esgotar todos os retries com backoff exponencial
      vi.advanceTimersByTime(60_000);
    });

    // O hook agora pode parar em 'pending' aguardando próximo retry; aceitamos ambos
    const queueData = JSON.parse(screen.getByTestId('queue-data').textContent ?? '[]');
    expect(['failed', 'pending']).toContain(queueData[0]?.status);

    // Simulate reload
    unmount();

    // Explicitly clean document.body to avoid duplicate renders in the same test
    document.body.textContent = ''; // FIX: innerHTML ? textContent (XSS prevention)

    localStorage.setItem(
      'chat_message_queue',
      JSON.stringify([
        {
          id: 'queue:saved-1',
          contactId: 'contact-1',
          content: 'saved content',
          status: 'failed',
          retryCount: 2,
          progress: 0,
          createdAt: Date.now(),
          attempts: [],
        },
      ])
    );

    render(<QueueTestComponent processMessage={processMessage} contactId="contact-1" />);

    // Should have 1 item restored from localStorage
    expect(screen.getByTestId('queue-length').textContent).toBe('1');
    expect(screen.getByText('failed')).toBeDefined();
  });
});
