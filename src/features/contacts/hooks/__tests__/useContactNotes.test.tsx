import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContactNotes } from '../useContactNotes';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// Estado mutável do "banco"
let notesRows: Array<{
  id: string;
  contact_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}> = [];
let insertResolver: ((v: unknown) => void) | null = null;
let deleteResolver: ((v: unknown) => void) | null = null;

function makeSelectChain(rows: unknown[]) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => Promise.resolve({ data: rows, error: null }),
    order: () => Promise.resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => makeSelectChain([{ id: 'profile-1', name: 'Alice', avatar_url: null }]),
        };
      }
      if (table === 'contact_notes') {
        return {
          select: () => makeSelectChain(notesRows),
          insert: (payload: any) => ({
            select: () => ({
              maybeSingle: () =>
                new Promise((resolve) => {
                  const finish = () => {
                    const row = {
                      id: 'note-new',
                      contact_id: payload.contact_id,
                      author_id: payload.author_id,
                      content: payload.content,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    notesRows = [row, ...notesRows];
                    resolve({ data: row, error: null });
                  };
                  insertResolver = finish;
                }),
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) =>
              new Promise((resolve) => {
                const finish = () => {
                  notesRows = notesRows.filter((n) => n.id !== id);
                  resolve({ error: null });
                };
                deleteResolver = finish;
              }),
          }),
        };
      }
      return { select: () => makeSelectChain([]) };
    },
  },
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { Wrapper, client };
}

beforeEach(() => {
  notesRows = [];
  insertResolver = null;
  deleteResolver = null;
  mockToast.mockReset();
});

describe('useContactNotes', () => {
  it('expõe currentProfileId consistente após carregar o perfil', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useContactNotes('contact-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.currentProfileId).toBe('profile-1'));
  });

  it('addNote: isAdding fica true durante a mutação e volta a false ao concluir', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useContactNotes('contact-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.currentProfileId).toBe('profile-1'));

    expect(result.current.isAdding).toBe(false);
    let addPromise!: Promise<unknown>;
    act(() => {
      addPromise = result.current.addNote('Nova nota');
    });
    await waitFor(() => expect(result.current.isAdding).toBe(true));

    // Libera a promise do insert
    await act(async () => {
      insertResolver?.(null);
      await addPromise;
    });

    await waitFor(() => expect(result.current.isAdding).toBe(false));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nota adicionada' })
    );
  });

  it('deleteNote: isDeleting fica true durante a mutação e remove a nota ao concluir', async () => {
    notesRows = [
      {
        id: 'note-1',
        contact_id: 'contact-1',
        author_id: 'profile-1',
        content: 'oi',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useContactNotes('contact-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.notes.length).toBe(1));

    expect(result.current.isDeleting).toBe(false);
    let delPromise!: Promise<unknown>;
    act(() => {
      delPromise = result.current.deleteNote('note-1');
    });
    await waitFor(() => expect(result.current.isDeleting).toBe(true));

    await act(async () => {
      deleteResolver?.(null);
      await delPromise;
    });

    await waitFor(() => expect(result.current.isDeleting).toBe(false));
    await waitFor(() => expect(result.current.notes.length).toBe(0));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nota removida' })
    );
  });

  it('notes carregadas têm author sempre presente (placeholder quando profile ausente)', async () => {
    notesRows = [
      {
        id: 'note-x',
        contact_id: 'contact-1',
        author_id: 'ghost-author',
        content: 'órfã',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useContactNotes('contact-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.notes.length).toBe(1));
    expect(result.current.notes[0].author).toEqual({
      id: 'ghost-author',
      name: null,
      avatar_url: null,
    });
  });
});
