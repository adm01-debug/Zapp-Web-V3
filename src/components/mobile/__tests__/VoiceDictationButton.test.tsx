// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { VoiceDictationButton } from '@/components/mobile/VoiceDictationButton';

// Mock useSpeechToText
const mockToggleListening = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useSpeechToText', () => ({
  useSpeechToText: vi.fn(() => ({
    isListening: false,
    isSupported: true,
    transcript: '',
    startListening: vi.fn(),
    stopListening: vi.fn(),
    toggleListening: mockToggleListening,
  })),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    span: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock tooltip
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

describe('VoiceDictationButton', () => {
  it('renders when speech is supported', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('returns null when not supported', async () => {
    const { useSpeechToText } = await import('@/hooks/useSpeechToText');
    vi.mocked(useSpeechToText).mockReturnValueOnce({
      isListening: false,
      isSupported: false,
      transcript: '',
      startListening: vi.fn(),
      stopListening: vi.fn(),
      toggleListening: vi.fn(),
    });

    const { container } = render(<VoiceDictationButton onTranscript={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('has correct aria-label when idle', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />);
    expect(screen.getByLabelText('Ditar mensagem')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});