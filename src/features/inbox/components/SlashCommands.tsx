import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SLASH_COMMANDS, categoryColors, categoryLabels } from './slash-commands/slashCommandsData';
import type { SlashCommand } from './slash-commands/slashCommandsData';

interface SlashCommandsProps {
  inputValue: string;
  onSelectCommand: (command: SlashCommand, subCommand?: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

/** Slash Commands component. */
export function SlashCommands({
  inputValue,
  onSelectCommand,
  onClose,
  isOpen,
}: SlashCommandsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState<SlashCommand | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCommands = useMemo(() => {
    if (!inputValue.startsWith('/')) return [];
    const searchTerm = inputValue.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.command.slice(1).toLowerCase().includes(searchTerm) ||
        cmd.label.toLowerCase().includes(searchTerm) ||
        cmd.description.toLowerCase().includes(searchTerm)
    );
  }, [inputValue]);

  useEffect(() => {
    setSelectedIndex(0);
    setSelectedCommand(null);
  }, [inputValue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      const items = selectedCommand?.subCommands || filteredCommands;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedCommand?.subCommands) {
            const s = selectedCommand.subCommands[selectedIndex];
            if (s) onSelectCommand(selectedCommand, s.value);
          } else if (filteredCommands[selectedIndex]) {
            const cmd = filteredCommands[selectedIndex];
            if (cmd.subCommands) {
              setSelectedCommand(cmd);
              setSelectedIndex(0);
            } else onSelectCommand(cmd);
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (selectedCommand) {
            setSelectedCommand(null);
            setSelectedIndex(0);
          } else onClose();
          break;
        case 'Tab':
          e.preventDefault();
          if (filteredCommands[selectedIndex] && !selectedCommand) {
            const cmd = filteredCommands[selectedIndex];
            if (cmd.subCommands) {
              setSelectedCommand(cmd);
              setSelectedIndex(0);
            } else onSelectCommand(cmd);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    filteredCommands,
    selectedIndex,
    selectedCommand,
    onSelectCommand,
    onClose,
    inputValue,
  ]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const groupedCommands = useMemo(
    () =>
      filteredCommands.reduce(
        (acc, cmd) => {
          if (!acc[cmd.category]) acc[cmd.category] = [];
          acc[cmd.category].push(cmd);
          return acc;
        },
        {} as Record<string, SlashCommand[]>
      ),
    [filteredCommands]
  );

  if (!isOpen || (filteredCommands.length === 0 && !selectedCommand)) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-full left-0 right-0 z-50 mx-4 mb-2 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {selectedCommand ? (
                <span className="flex items-center gap-1.5">
                  <selectedCommand.icon className={cn('h-4 w-4', selectedCommand.color)} />
                  {selectedCommand.label}
                </span>
              ) : (
                'Comandos'
              )}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              ↑↓
            </kbd>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Enter
            </kbd>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Esc
            </kbd>
          </div>
        </div>

        <ScrollArea className="max-h-64">
          <div ref={listRef} className="p-1">
            {selectedCommand?.subCommands ? (
              <div className="space-y-0.5">
                {selectedCommand.subCommands.map((subCmd, idx) => (
                  <motion.button
                    key={subCmd.id}
                    data-index={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => onSelectCommand(selectedCommand, subCmd.value)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      selectedIndex === idx
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted/50'
                    )}
                  >
                    <span className="font-medium">{subCmd.label}</span>
                  </motion.button>
                ))}
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, commands]) => (
                <div key={category} className="mb-2 last:mb-0">
                  <div className="px-3 py-1">
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] font-medium', categoryColors[category])}
                    >
                      {categoryLabels[category]}
                    </Badge>
                  </div>
                  <div className="space-y-0.5">
                    {commands.map((cmd) => {
                      const globalIndex = filteredCommands.indexOf(cmd);
                      const Icon = cmd.icon;
                      return (
                        <motion.button
                          key={cmd.id}
                          data-index={globalIndex}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: globalIndex * 0.02 }}
                          onClick={() => {
                            if (cmd.subCommands) {
                              setSelectedCommand(cmd);
                              setSelectedIndex(0);
                            } else onSelectCommand(cmd);
                          }}
                          className={cn(
                            'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                            selectedIndex === globalIndex ? 'bg-primary/10' : 'hover:bg-muted/50'
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-lg transition-transform group-hover:scale-110',
                              selectedIndex === globalIndex ? 'bg-primary/20' : 'bg-muted'
                            )}
                          >
                            <Icon className={cn('h-4 w-4', cmd.color)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'font-medium',
                                  selectedIndex === globalIndex ? 'text-primary' : 'text-foreground'
                                )}
                              >
                                {cmd.label}
                              </span>
                              <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {cmd.command}
                              </code>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {cmd.description}
                            </p>
                          </div>
                          {cmd.shortcut && (
                            <kbd className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                              ⌘{cmd.shortcut}
                            </kbd>
                          )}
                          {cmd.subCommands && (
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-center text-[11px] text-muted-foreground">
            Digite <code className="rounded bg-muted px-1 py-0.5">/</code> para ver todos os
            comandos disponíveis
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Re-exported module members. */
export { SLASH_COMMANDS };
/** Re-exported module members. */
export type { SlashCommand };
