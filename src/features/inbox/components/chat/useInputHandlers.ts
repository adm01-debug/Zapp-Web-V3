import { useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { type DialogKey } from './hooks/useChatDialogs';
import { type ActiveTool } from './ChatHeaderToolbar';
import { SlashCommand } from '../SlashCommands';

interface UseInputHandlersOptions {
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setIsWhisper: React.Dispatch<React.SetStateAction<boolean>>;
  openDialog: (key: DialogKey) => void;
  closeDialog: (key: DialogKey) => void;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  handleSend: () => void;
  handleSetActiveTool: (tool: ActiveTool) => void;
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
      switch (command.id) {
        case 'transfer':
          openDialog('transferDialog');
          break;
        case 'resolve':
          toast({
            title: 'Conversa Resolvida',
            description: 'A conversa foi marcada como resolvida.',
          });
          break;
        case 'template':
          openDialog('quickReplies');
          break;
        case 'note':
          toast({ title: 'Nota Privada', description: 'Funcionalidade de notas sera aberta.' });
          break;
        case 'tag':
          toast({
            title: subCommand === 'add' ? 'Adicionar Tag' : 'Remover Tag',
            description:
              subCommand === 'add'
                ? 'Selecione uma tag para adicionar.'
                : 'Selecione uma tag para remover.',
          });
          break;
        case 'priority': {
          const labels: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baixa' };
          toast({
            title: 'Prioridade Definida',
            description: `Prioridade definida como ${labels[subCommand || ''] || subCommand}.`,
          });
          break;
        }
        case 'assign':
          toast({ title: 'Atribuir Conversa', description: 'Selecione um agente para atribuir.' });
          break;
        case 'snooze': {
          const labels: Record<string, string> = {
            '1h': '1 hora',
            '3h': '3 horas',
            tomorrow: 'amanha',
            nextweek: 'proxima semana',
          };
          toast({
            title: 'Conversa Adiada',
            description: `Conversa adiada para ${labels[subCommand || ''] || subCommand}.`,
          });
          break;
        }
        case 'star':
          toast({
            title: 'Conversa Favoritada',
            description: 'A conversa foi marcada como favorita.',
          });
          break;
        case 'archive':
          toast({ title: 'Conversa Arquivada', description: 'A conversa foi arquivada.' });
          break;
        case 'remind':
          toast({
            title: 'Lembrete Criado',
            description: 'Um lembrete foi criado para esta conversa.',
          });
          break;
        case 'quick':
          openDialog('quickReplies');
          break;
        case 'summary':
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
    [closeDialog, setInputValue, openDialog, handleSetActiveTool, setIsWhisper]
  );

  return { handleInputChange, handleKeyDown, handleSlashCommand };
}
