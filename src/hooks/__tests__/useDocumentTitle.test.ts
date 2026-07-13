/**
 * Tests for useDocumentTitle().
 *
 * Covers title composition and cleanup on unmount.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from '../useDocumentTitle';

const BASE_TITLE = 'WhatsApp Omnichannel';

beforeEach(() => {
  document.title = 'Previous Title';
});

describe('useDocumentTitle', () => {
  it('sets document.title to BASE_TITLE when no title is provided', () => {
    renderHook(() => useDocumentTitle());
    expect(document.title).toBe(BASE_TITLE);
  });

  it('sets document.title to "<title> | BASE_TITLE" when title is provided', () => {
    renderHook(() => useDocumentTitle('Inbox'));
    expect(document.title).toBe(`Inbox | ${BASE_TITLE}`);
  });

  it('restores the previous title on unmount', () => {
    document.title = 'Original Title';
    const { unmount } = renderHook(() => useDocumentTitle('Chat'));
    expect(document.title).toBe(`Chat | ${BASE_TITLE}`);
    unmount();
    expect(document.title).toBe('Original Title');
  });

  it('updates the title when the prop changes', () => {
    let title = 'Page A';
    const { rerender } = renderHook(() => useDocumentTitle(title));
    expect(document.title).toBe(`Page A | ${BASE_TITLE}`);

    title = 'Page B';
    rerender();
    expect(document.title).toBe(`Page B | ${BASE_TITLE}`);
  });

  it('switches to BASE_TITLE when title changes from defined to undefined', () => {
    let title: string | undefined = 'Dashboard';
    const { rerender } = renderHook(() => useDocumentTitle(title));
    expect(document.title).toBe(`Dashboard | ${BASE_TITLE}`);

    title = undefined;
    rerender();
    expect(document.title).toBe(BASE_TITLE);
  });
});
