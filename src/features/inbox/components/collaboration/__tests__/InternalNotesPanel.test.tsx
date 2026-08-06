import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InternalNotesPanel } from '../InternalNotesPanel';

const { mockSafeFrom } = vi.hoisted(() => ({ mockSafeFrom: vi.fn() }));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { from: (...args: unknown[]) => mockSafeFrom(...args) },
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
// Alias completo: relativo a partir de __tests__/ não resolve o componente irmão.
vi.mock('@/features/inbox/components/collaboration/MentionInput', () => ({
  MentionInput: () => null,
}));
vi.mock('@/features/inbox/hooks/useContactNotesMutations', () => ({
  fetchProfileIdByUserId: vi.fn().mockResolvedValue({ id: 'profile-1' }),
  insertContactNote: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CONTACT_UUID = '00000000-0000-4000-8000-000000000001';
const OTHER_CONTACT_UUID = '00000000-0000-4000-8000-000000000002';

const NOTES_FIXTURE = [
  {
    id: 'note-1',
    content: 'Nota de teste',
    created_at: '2026-08-06T10:00:00.000Z',
    author: { id: 'profile-1', name: 'Alice', avatar_url: null },
  },
];

let queryClient: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockSafeFrom.mockResolvedValue({ data: NOTES_FIXTURE, error: null });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

function renderPanel(contactId: string = CONTACT_UUID) {
  return render(
    <QueryClientProvider client={queryClient}>
      <InternalNotesPanel contactId={contactId} />
    </QueryClientProvider>
  );
}

describe('InternalNotesPanel — dedupe/lazy no remount', () => {
  it('abrir/fechar 3x dentro do staleTime → 1 fetch no primeiro mount, 0 nos seguintes', async () => {
    // 1º mount: único fetch
    const first = renderPanel();
    await waitFor(() => expect(screen.getByText('Nota de teste')).toBeInTheDocument());
    expect(mockSafeFrom).toHaveBeenCalledTimes(1);
    first.unmount();

    // 2º mount: dados vêm do cache (staleTime 60s) — 0 fetches novos
    const second = renderPanel();
    await waitFor(() => expect(screen.getByText('Nota de teste')).toBeInTheDocument());
    expect(mockSafeFrom).toHaveBeenCalledTimes(1);
    second.unmount();

    // 3º mount: idem — 0 fetches novos
    const third = renderPanel();
    await waitFor(() => expect(screen.getByText('Nota de teste')).toBeInTheDocument());
    expect(mockSafeFrom).toHaveBeenCalledTimes(1);
    third.unmount();
  });

  it('query de notas: staleTime >= 30s e enabled com contactId válido', async () => {
    renderPanel();
    await waitFor(() => expect(mockSafeFrom).toHaveBeenCalledTimes(1));

    const query = queryClient
      .getQueryCache()
      .find({ queryKey: ['internal-notes', CONTACT_UUID] });
    expect(query).toBeDefined();
    expect(query?.observers[0]?.options.staleTime).toBeGreaterThanOrEqual(30_000);
    expect(query?.observers[0]?.options.enabled).toBe(true);
  });

  it('dedupe é por contactId: outro contato refaz fetch', async () => {
    const first = renderPanel();
    await waitFor(() => expect(mockSafeFrom).toHaveBeenCalledTimes(1));
    first.unmount();

    const other = renderPanel(OTHER_CONTACT_UUID);
    await waitFor(() => expect(mockSafeFrom).toHaveBeenCalledTimes(2));
    expect(
      queryClient.getQueryCache().find({ queryKey: ['internal-notes', OTHER_CONTACT_UUID] })
    ).toBeDefined();
    other.unmount();
  });
});
