/**
 * Testes do ChatInputArea REAL (render completo) com mocks das dependências
 * pesadas (framer-motion, tooltip/popover, feature flags, children).
 *
 * Cobre dois bugs corrigidos no componente:
 *  - BUG-16: ArrowUp com input vazio chama onEditStart com a última mensagem
 *    própria (não-deletada), abrindo o modo de edição no ChatPanel.
 *  - BUG-13: ChatSendProgress (barra do contrato onProgress) só renderiza
 *    quando a fila está vazia, evitando duplicar com a barra de fila.
 *
 * Os guards de queue/attempts continuam cobertos em ChatInputArea.guards.test.tsx
 * (que usa réplica justamente porque o render completo exige estes mocks).
 */
import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Message } from '@/types/chat';

vi.mock('framer-motion', () => {
  const passthrough = (props: { children?: unknown }) => props?.children ?? null;
  return {
    motion: new Proxy({}, { get: () => passthrough }),
    AnimatePresence: (props: { children?: unknown }) => props?.children ?? null,
    useReducedMotion: () => false,
  };
});
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: (p: { children?: unknown }) => p?.children ?? null,
  TooltipTrigger: (p: { children?: unknown }) => p?.children ?? null,
  TooltipContent: () => null,
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: (p: { children?: unknown }) => p?.children ?? null,
  PopoverTrigger: (p: { children?: unknown }) => p?.children ?? null,
  PopoverContent: () => null,
}));
vi.mock('@/lib/featureFlags', () => ({ isFeatureEnabled: () => false }));
vi.mock('@/utils/whatsappFileTypes', () => ({ formatFileSize: () => '1 KB' }));
vi.mock('@/utils/notificationSounds', () => ({ playNotificationSound: vi.fn() }));
vi.mock('../RichTextToolbar', () => ({
  RichTextToolbar: () => null,
  RichTextToggle: () => null,
}));
vi.mock('../AIRewriteButton', () => ({ AIRewriteButton: () => null }));
vi.mock('../MentionAutocomplete', () => ({
  MentionAutocomplete: () => null,
  useMentions: () => ({
    isOpen: false,
    cursorPos: 0,
    checkForMention: vi.fn(),
    handleSelect: vi.fn(),
    close: vi.fn(),
  }),
}));
vi.mock('../MarkdownPreview', () => ({ MarkdownPreview: () => null }));
vi.mock('../../SlashCommands', () => ({ SlashCommands: () => null }));
vi.mock('../../AudioRecorder', () => ({ AudioRecorder: () => null }));
vi.mock('../ChatInputToolbars', () => ({
  SecondaryToolbar: () => null,
  TertiaryToolsMenu: () => null,
}));
vi.mock('../../StickerPicker', () => ({ StickerPicker: () => null }));
vi.mock('../../CustomEmojiPicker', () => ({ CustomEmojiPicker: () => null }));
vi.mock('../InputPreviewBars', () => ({ InputPreviewBars: () => null }));
vi.mock('../../FileUploader', () => ({}));
// ChatInputArea importa `QueueItem` de useMessageQueue — o esbuild NÃO elide
// imports type-only, então o módulo real executaria datasource/db → supabase →
// auth (zod quebra sob bun). Mock vazio corta o grafo; QueueItem é type-only.
vi.mock('../../hooks/useMessageQueue', () => ({}));
// Import type-only no ChatInputArea (ExternalProduct), mas o esbuild não elide
// — o módulo real puxa react-query + supabase. Mock vazio corta o grafo.
vi.mock('@/hooks/useExternalApiManagement', () => ({}));
vi.mock('../useChatInputLogic', () => ({
  useChatInputLogic: () => ({
    removeAttachment: vi.fn(),
    handleSendWithAnimation: vi.fn(),
    canSend: false,
    handlePaste: vi.fn(),
    showMarkdownPreview: false,
    hasText: false,
    showRichToolbar: false,
    setShowRichToolbar: vi.fn(),
    charCount: 0,
    CHAR_LIMIT: 4096,
    isOverLimit: false,
    isNearLimit: false,
    isMobile: false,
    isMicActive: false,
    handleVoiceDictation: vi.fn(),
    handleFileSelect: vi.fn(),
    attachments: [],
  }),
  setNativeValue: vi.fn(),
}));

import { ChatInputArea } from '../ChatInputArea';

/**
 * Tipo LOCAL mínimo no lugar de `import type { QueueItem } from
 * '../../hooks/useMessageQueue'` — o esbuild não elide imports type-only,
 * e o módulo real executa useMessageQueue → datasource/db → supabase/auth
 * (zod quebra sob bun). O componente só usa estes campos na UI da fila.
 */
interface QueueItemLike {
  id: string;
  status: 'pending' | 'sending' | 'failed' | 'confirmed';
  progress?: number;
  attempts?: Array<{ duration?: number }>;
}

function makeQueueItem(overrides: Partial<QueueItemLike>): QueueItemLike {
  return {
    id: 'q1',
    status: 'sending',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: 'm1',
    conversationId: 'conv-1',
    content: 'texto',
    type: 'text',
    sender: 'agent',
    timestamp: new Date(),
    status: 'sent',
    ...overrides,
  };
}

const baseProps = {
  inputValue: '',
  replyToMessage: null,
  isRecordingAudio: false,
  showSlashCommands: false,
  contactId: 'c1',
  contactPhone: '5511999999999',
  contactName: 'Contato Teste',
  messages: [] as Message[],
  quickReplies: [],
  onInputChange: vi.fn(),
  onKeyDown: vi.fn(),
  onBlur: vi.fn(),
  onSend: vi.fn(),
  onCancelReply: vi.fn(),
  onSlashCommand: vi.fn(),
  onCloseSlashCommands: vi.fn(),
  onQuickReply: vi.fn(),
  onRecordToggle: vi.fn(),
  onAudioSend: vi.fn(),
  onAudioCancel: vi.fn(),
  onOpenInteractiveBuilder: vi.fn(),
  onOpenSchedule: vi.fn(),
  onOpenLocationPicker: vi.fn(),
  onSendProduct: vi.fn(),
  onSendSticker: vi.fn(),
  onSendAudioMeme: vi.fn(),
  onSendCustomEmoji: vi.fn(),
  onSelectSuggestion: vi.fn(),
  onSelectTemplate: vi.fn(),
  fileUploaderRef: createRef(),
  inputRef: createRef(),
} as unknown as React.ComponentProps<typeof ChatInputArea>;

describe('ChatInputArea — ArrowUp → onEditStart (BUG-16)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ArrowUp com input vazio chama onEditStart com a última mensagem própria não-deletada', () => {
    const onEditStart = vi.fn<(message: Message) => void>();
    const messages = [
      makeMessage({ id: '1', sender: 'contact', content: 'pergunta do contato' }),
      makeMessage({ id: '2', sender: 'agent', content: 'resposta antiga', is_deleted: true }),
      makeMessage({ id: '3', sender: 'agent', content: 'resposta mais recente' }),
    ];
    render(
      <ChatInputArea {...baseProps} messages={messages} onEditStart={onEditStart} />
    );
    fireEvent.keyDown(screen.getByLabelText('Digite sua mensagem'), { key: 'ArrowUp' });
    expect(onEditStart).toHaveBeenCalledTimes(1);
    expect(onEditStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: '3', content: 'resposta mais recente' })
    );
  });

  it('não chama onEditStart quando a prop não existe (comportamento antigo preservado)', () => {
    const messages = [makeMessage({ id: '1', sender: 'agent' })];
    render(<ChatInputArea {...baseProps} messages={messages} />);
    expect(() =>
      fireEvent.keyDown(screen.getByLabelText('Digite sua mensagem'), { key: 'ArrowUp' })
    ).not.toThrow();
  });

  it('não chama onEditStart com input preenchido', () => {
    const onEditStart = vi.fn<(message: Message) => void>();
    const messages = [makeMessage({ id: '1', sender: 'agent' })];
    render(
      <ChatInputArea
        {...baseProps}
        messages={messages}
        inputValue="texto digitado"
        onEditStart={onEditStart}
      />
    );
    fireEvent.keyDown(screen.getByLabelText('Digite sua mensagem'), { key: 'ArrowUp' });
    expect(onEditStart).not.toHaveBeenCalled();
  });

  it('não chama onEditStart quando não há mensagem própria', () => {
    const onEditStart = vi.fn<(message: Message) => void>();
    const messages = [makeMessage({ id: '1', sender: 'contact' })];
    render(
      <ChatInputArea {...baseProps} messages={messages} onEditStart={onEditStart} />
    );
    fireEvent.keyDown(screen.getByLabelText('Digite sua mensagem'), { key: 'ArrowUp' });
    expect(onEditStart).not.toHaveBeenCalled();
  });

  it('continua repassando o evento para onKeyDown do painel', () => {
    const onKeyDown = vi.fn();
    const messages = [makeMessage({ id: '1', sender: 'agent' })];
    render(
      <ChatInputArea
        {...baseProps}
        messages={messages}
        onKeyDown={onKeyDown}
        onEditStart={vi.fn<(message: Message) => void>()}
      />
    );
    fireEvent.keyDown(screen.getByLabelText('Digite sua mensagem'), { key: 'ArrowUp' });
    expect(onKeyDown).toHaveBeenCalled();
  });
});

describe('ChatInputArea — ChatSendProgress (BUG-13)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza a barra de progresso quando enviando, com progresso > 0 e fila vazia', () => {
    render(<ChatInputArea {...baseProps} isSending sendProgress={42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('NÃO renderiza a barra de progresso quando a fila não está vazia (evita duplicação)', () => {
    render(
      <ChatInputArea
        {...baseProps}
        isSending
        sendProgress={42}
        queue={[makeQueueItem({ id: 'q1', status: 'sending', progress: 10 }) as unknown as NonNullable<React.ComponentProps<typeof ChatInputArea>['queue']>[number]]}
      />
    );
    // Barra da fila visível com o progresso do item...
    expect(screen.getByText('10%')).toBeInTheDocument();
    // ...e a barra do contrato onProgress suprimida para não duplicar.
    expect(screen.queryByText('42%')).not.toBeInTheDocument();
  });

  it('não renderiza a barra de progresso com sendProgress 0', () => {
    render(<ChatInputArea {...baseProps} isSending sendProgress={0} />);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
