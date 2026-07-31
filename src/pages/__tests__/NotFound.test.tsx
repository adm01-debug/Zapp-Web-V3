import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from '../NotFound';

// Mock framer-motion to avoid animation side-effects in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: ComponentProps<'div'>) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: ComponentProps<'h1'>) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: ComponentProps<'p'>) => <p {...props}>{children}</p>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('NotFound page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 404 heading', () => {
    render(
      <MemoryRouter initialEntries={['/nonexistent']}>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText('404')).toBeDefined();
  });

  it('renders "Página não encontrada"', () => {
    render(
      <MemoryRouter initialEntries={['/invalid-route']}>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText('Página não encontrada')).toBeDefined();
  });

  it('shows the attempted pathname', () => {
    render(
      <MemoryRouter initialEntries={['/some/broken/link']}>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText(/\/some\/broken\/link/)).toBeDefined();
  });

  it('renders "Voltar" button', () => {
    render(
      <MemoryRouter initialEntries={['/nowhere']}>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText('Voltar')).toBeDefined();
  });

  it('renders "Início" link', () => {
    render(
      <MemoryRouter initialEntries={['/nowhere']}>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText('Início')).toBeDefined();
  });

  it('renders keyboard shortcut hint', () => {
    render(
      <MemoryRouter initialEntries={['/nowhere']}>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText(/⌘K/)).toBeDefined();
  });

  it('handles root path', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText('404')).toBeDefined();
  });
});
