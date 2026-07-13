import { motion, AnimatePresence } from 'framer-motion';
import {
  Forward,
  Search,
  Users,
  User,
  Check,
  MessageSquare,
  Phone,
  Send,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { useForwardMessage } from '@/hooks/useForwardMessage';

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  onForward: (targetIds: string[], targetType: 'contact' | 'group') => void;
}

function truncateMessage(content: string, maxLength = 100) {
  return content.length <= maxLength ? content : content.slice(0, maxLength) + '...';
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  message,
  onForward,
}: ForwardMessageDialogProps) {
  const fwd = useForwardMessage(open, onForward, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={fwd.handleClose}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5 text-primary" />
            Encaminhar Mensagem
          </DialogTitle>
          <DialogDescription>Selecione contatos ou grupos para encaminhar</DialogDescription>
        </DialogHeader>

        {message && (
          <div className="border-b border-border bg-muted/50 px-4 py-3">
            <div className="flex items-start gap-2">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="line-clamp-2 text-sm text-foreground">
                {message.type === 'image' && '📷 Imagem'}
                {message.type === 'audio' && '🎤 Áudio'}
                {message.type === 'video' && '🎬 Vídeo'}
                {message.type === 'document' && '📄 Documento'}
                {(message.type === 'text' || message.type === 'interactive') &&
                  truncateMessage(message.content)}
              </p>
            </div>
          </div>
        )}

        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar contatos ou grupos..."
              value={fwd.searchQuery}
              onChange={(e) => fwd.setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Tabs
          value={fwd.activeTab}
          onValueChange={(v) =>
            fwd.setActiveTab(
              v as
                | 'contacts'
                | 'groups' /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
            )
          }
          className="px-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="contacts" className="gap-2">
              <User className="h-4 w-4" />
              Contatos
              {fwd.selectedContacts.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5">
                  {fwd.selectedContacts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2">
              <Users className="h-4 w-4" />
              Grupos
              {fwd.selectedGroups.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5">
                  {fwd.selectedGroups.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-2">
            <ScrollArea className="h-[300px]">
              {fwd.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : fwd.filteredContacts.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <User className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">Nenhum contato encontrado</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <AnimatePresence>
                    {fwd.filteredContacts.map((contact, i) => {
                      const isSelected = fwd.selectedContacts.includes(contact.id);
                      return (
                        <motion.button
                          key={contact.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => fwd.toggleContact(contact.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-all',
                            isSelected
                              ? 'border border-primary/30 bg-primary/10'
                              : 'border border-transparent hover:bg-muted/80'
                          )}
                        >
                          <Checkbox checked={isSelected} className="pointer-events-none" />
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={contact.avatar_url} alt={contact.name} />
                            <AvatarFallback className="bg-primary/10 text-sm text-primary">
                              {contact.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{contact.name}</p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </p>
                          </div>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="groups" className="mt-2">
            <ScrollArea className="h-[300px]">
              {fwd.filteredGroups.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">Nenhum grupo encontrado</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <AnimatePresence>
                    {fwd.filteredGroups.map((group, i) => {
                      const isSelected = fwd.selectedGroups.includes(group.id);
                      return (
                        <motion.button
                          key={group.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => fwd.toggleGroup(group.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-all',
                            isSelected
                              ? 'border border-primary/30 bg-primary/10'
                              : 'border border-transparent hover:bg-muted/80'
                          )}
                        >
                          <Checkbox checked={isSelected} className="pointer-events-none" />
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={group.avatar_url} alt={group.name} />
                            <AvatarFallback className="bg-secondary text-sm text-secondary-foreground">
                              <Users className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{group.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.participant_count} participantes
                            </p>
                          </div>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-row items-center justify-between border-t border-border p-4 pt-3">
          <div className="text-sm text-muted-foreground">
            {fwd.totalSelected > 0 ? (
              <span className="font-medium text-foreground">
                {fwd.totalSelected} {fwd.totalSelected === 1 ? 'selecionado' : 'selecionados'}
              </span>
            ) : (
              'Selecione destinatários'
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fwd.handleClose}>
              Cancelar
            </Button>
            <Button
              onClick={fwd.handleForward}
              disabled={fwd.totalSelected === 0 || fwd.isSending}
              className="gap-2"
            >
              {fwd.isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Encaminhar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
