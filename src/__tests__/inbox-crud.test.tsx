import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessages } from '../features/inbox/hooks/useMessages';
import { messageService } from '../features/inbox/services/messageService';
import type { Message } from '../types/chat';

vi.mock('../features/inbox/services/messageService', () => ({
  messageService: {
    getAllMessagesForContact: vi.fn(),
    mapMessage: vi.fn((m) => ({ ...m, id: m.id || 'mapped-id' })),
  },
}));

vi.mock('../features/inbox/data-access/messageRepository', () => ({
  messageRepository: {
    subscribeToMessages: vi.fn(() => ({ subscribe: vi.fn() })),
    unsubscribe: vi.fn(),
  },
}));

describe('Inbox CRUD Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch messages for a contact', async () => {
    const mockMessages = [{ id: '1', content: 'Hello', sender: 'contact', timestamp: new Date() }];
    vi.mocked(messageService.getAllMessagesForContact).mockResolvedValueOnce(mockMessages);

    const { result } = renderHook(() => useMessages({ contactId: 'contact-1' }));

    // Wait for the initial fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(messageService.getAllMessagesForContact).toHaveBeenCalledWith('contact-1');
    expect(result.current.messages).toEqual(mockMessages);
  });

  it('should add messages optimistically', async () => {
    const { result } = renderHook(() => useMessages({ contactId: 'contact-1' }));

    const newMessage: Message = {
      id: '2',
      content: 'New message',
      sender: 'agent',
      timestamp: new Date(),
      conversationId: 'contact-1',
      type: 'text',
      status: 'sent',
    };

    act(() => {
      result.current.addMessage(newMessage);
    });

    expect(result.current.messages).toContainEqual(newMessage);
  });

  it('should remove messages optimistically', async () => {
    const mockMessages = [{ id: '1', content: 'Hello', sender: 'contact', timestamp: new Date() }];
    vi.mocked(messageService.getAllMessagesForContact).mockResolvedValueOnce(mockMessages);

    const { result } = renderHook(() => useMessages({ contactId: 'contact-1' }));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.removeMessage('1');
    });

    expect(result.current.messages).toHaveLength(0);
  });
});
