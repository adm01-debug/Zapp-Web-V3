import { useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { type DialogKey } from './hooks/useChatDialogs';
import { type ActiveTool } from './ChatHeaderToolbar';
import type { SlashCommand } from '../SlashCommands';

interface UseInputHandlersOptions {
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setIsWhisper: React.Dispatch<React.SetStateAction<boolean>>;
  openDialog: (key: DialogKey) => void;
  closeDialog: (key: DialogKey) => void;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  handleSend: () => void;
  handleSetActiveTool: (tool: ActiveTool) => void;
  // ── BUG-03: callbacks reais dos slash commands ──
  // Substituem os toasts-fake: a acao so e confirmada apos o callback resolver.
  onResolveConversation?: () => void | Promise<void>;
  onSnooze?: (until: string) => void | Promise<void>;
  onStarToggle?: () => void | Promise<void>;
  onRemind?: (at: string, title?: string) => void | Promise<void>;
  onAddNote?: (content: string) => void | Promise<void>;
  onAddTag?: (name: string) => void | Promise<void>;
  onTransferDialog?: () => void;
}

/**
 * Mapeia o subCommand de /snooze e /remind ('1h'|'3h'|'tomorrow'|'nextweek')
 * para um timestamp ISO relativo a agora. Retorna null para valores invalidos.
 */
export function slashSnoozeToIso(subCommand?: string): string | null {
  const now = new Date();
  switch (subCommand) {
    case '1h':
      now.setHours(now.getHours() + 1);
      break;
    case '3h':
      now.setHours(now.getHours() + 3);
      break;
    case 'tomorrow':
      now.setDate(now.getDate() + 1);
      break;
    case 'nextweek':
      now.setDate(now.getDate() + 7);
      break;
    default:
      return null;
  }
  return now.toISOString();
}

/** use Input Handlers component for the chat section. */
export function useInputHandlers({
  setInputValue,
  setIsWhisper,
  openDialog,
  closeDialog,
  handleTypingStart,
  handleTypingStop,
  handleSend,
  handleSetActiveTool,
  onResolveConversation,
  onSnooze,
  onStarToggle,
  onRemind,
  onAddNote,
  onAddTag,
  onTransferDialog,
}: UseInputHandlersOptions) {
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInputValue(value);
      if (value.startsWith('/')) {
        openDialog('slashCommands');
        closeDialog('quickReplies');
      } else {
        closeDialog('slashCommands');
      }
      if (value.length > 0) handleTypingStart();
      else handleTypingStop();
    },
    [setInputValue, openDialog, closeDialog, handleTypingStart, handleTypingStop]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, slashCommandsOpen: boolean) => {
      if (slashCommandsOpen && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown'))
        return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'k' && e.ctrlKey) {
        e.preventDefault();
        openDialog('globalSearch');
      }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSetActiveTool('chatSearch');
      }
      if (e.key === 'w' && e.altKey) {
        e.preventDefault();
        setIsWhisper((prev) => !prev);
      }
      if (e.key === 'Escape' && slashCommandsOpen) closeDialog('slashCommands');
    },
    [handleSend, openDialog, closeDialog, handleSetActiveTool, setIsWhisper]
  );

  const handleSlashCommand = useCallback(
    (command: Pick<SlashCommand, 'id'> & Partial<SlashCommand>, subCommand?: string) => {
      closeDialog('slashCommands');
      setInputValue('');
      // Executa o callback real com try/catch: toast de erro imediato e toast
      // de sucesso SOMENTE apos o callback resolver (sem falso-sucesso).
      // Sem callback configurado, nao exibe sucesso inventado.
      const run = async (
        action: (() => void | Promise<void>) | undefined,
        successTitle: string,
        successDescription: string
      ) => {
        if (!action) return;
        try {
          await action();
          toast({ title: successTitle, description: successDescription });
        } catch (err) {
          toast({
            title: 'Erro',
            description: err instanceof Error ? err.message : 'Nao foi possivel concluir a acao.',
            variant: 'destructive',
          });
        }
      };
      switch (command.id) {
        case 'transfer':
          openDialog('transferDialog');
          break;
        case 'resolve':
          void run(
            onResolveConversation,
            'Conversa Resolvida',
            'A conversa foi marcada como resolvida.'
          );
          break;
        case 'template':
          openDialog('quickReplies');
          break;
        case 'note':
          if (!subCommand || !subCommand.trim()) {
            toast({ title: 'Nota Privada', description: 'Digite o texto da nota apos /note.' });
            break;
          }
          void run(
            () => onAddNote?.(subCommand),
            'Nota Privada',
            'Nota registrada com sucesso.'
          );
          break;
        case 'tag':
          if (!subCommand || !subCommand.trim()) {
            toast({ title: 'Tag', description: 'Digite o nome da tag apos /tag.' });
            break;
          }
          void run(
            () => onAddTag?.(subCommand),
            'Tag Adicionada',
            `Tag "${subCommand}" vinculada a conversa.`
          );
          break;
        case 'priority':
          toast({ title: 'Prioridade', description: 'Prioridade nao disponivel nesta versao.' });
          break;
        case 'assign':
          onTransferDialog?.();
          break;
        case 'snooze': {
          const until = slashSnoozeToIso(subCommand);
          if (!until) {
            toast({
              title: 'Adiar Conversa',
              description: 'Escolha um periodo: 1h, 3h, tomorrow ou nextweek.',
            });
            break;
          }
          void run(
            () => onSnooze?.(until),
            'Conversa Adiada',
            `Conversa adiada ate ${new Date(until).toLocaleString('pt-BR')}.`
          );
          break;
        }
        case 'star':
          void run(
            onStarToggle,
            'Conversa Favoritada',
            'O favorito da conversa foi atualizado.'
          );
          break;
        case 'archive':
          toast({ title: 'Arquivar Conversa', description: 'Arquivo nao disponivel nesta versao.' });
          break;
        case 'remind': {
          const at = slashSnoozeToIso(subCommand);
          if (!at) {
            toast({
              title: 'Lembrete',
              description: 'Escolha quando: 1h, 3h, tomorrow ou nextweek.',
            });
            break;
          }
          const labels: Record<string, string> = {
            '1h': '1 hora',
            '3h': '3 horas',
            tomorrow: 'amanha',
            nextweek: 'proxima semana',
          };
          void run(
            () => onRemind?.(at, `Lembrete em ${labels[subCommand || ''] || subCommand}`),
            'Lembrete Criado',
            `Lembrete agendado para ${new Date(at).toLocaleString('pt-BR')}.`
          );
          break;
        }
        case 'quick':
          openDialog('quickReplies');
          break;
        case 'summary':
          // BUG-04: ChatToolPanels NAO renderiza activeTool==='summary' (no-op
          // silencioso). O painel real de analise/resumo e o 'aiAssistant'
          // (Visao/AIConversationAssistant). Decisao documentada no FINDINGS.
          handleSetActiveTool('aiAssistant');
          break;
        case 'produto':
          openDialog('catalogDirect');
          break;
        case 'internal-note':
          setIsWhisper((prev) => !prev);
          break;
        case 'internal-file':
          handleSetActiveTool('teamFiles');
          break;
        default:
          toast({ title: `Comando: ${command.label}`, description: command.description });
          break;
      }
    },
    [
      closeDialog,
      setInputValue,
      openDialog,
      handleSetActiveTool,
      setIsWhisper,
      onResolveConversation,
      onSnooze,
      onStarToggle,
      onRemind,
      onAddNote,
      onAddTag,
      onTransferDialog,
    ]
  );

  return { handleInputChange, handleKeyDown, handleSlashCommand };
}
