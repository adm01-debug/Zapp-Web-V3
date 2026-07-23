import { Conversation } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { ArrowRight } from 'lucide-react';

interface ChatAssignedBarProps {
  conversation: Conversation;
  onOpenTransfer: () => void;
}

/** Chat Assigned Bar component for the chat section. */
export function ChatAssignedBar({ conversation, onOpenTransfer }: ChatAssignedBarProps) {
  return (
    <AnimatePresence>
      {conversation.assignedTo && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center justify-between px-4 py-1.5 bg-background border-b border-border/5"
        >
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Atribuído a:</span>
            <Avatar className="w-5 h-5">
              <AvatarImage src={conversation.assignedTo.avatar} alt={conversation.assignedTo.name} />
              <AvatarFallback className="text-[10px]">
                {conversation.assignedTo.name[0]}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{conversation.assignedTo.name}</span>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs h-7"
              onClick={onOpenTransfer}
            >
              <ArrowRight className="w-3 h-3 mr-1" />
              Transferir
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
