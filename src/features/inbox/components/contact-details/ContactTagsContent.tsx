// @ts-nocheck
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, TagsIcon, X } from 'lucide-react';
import { Conversation, Contact } from '@/types/chat';

interface ContactTagsContentProps {
  contact: Contact;
  conversation: Conversation;
}

export function ContactTagsContent({ contact, conversation }: ContactTagsContentProps) {
  const contactTags = contact.tags ?? [];

  return (
    <div className="flex flex-wrap gap-1.5">
      {contactTags.map((tag, i) => (
        <motion.div
          key={`contact-${tag}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
        >
          <Badge
            variant="secondary"
            className="group/tag flex cursor-default items-center gap-1 border border-primary/20 bg-primary/10 text-foreground transition-all hover:scale-105 hover:bg-primary/20"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {tag}
            <X className="h-3 w-3 cursor-pointer opacity-0 transition-all hover:text-destructive group-hover/tag:opacity-100" />
          </Badge>
        </motion.div>
      ))}
      {conversation.tags.map((tag, i) => (
        <motion.div
          key={`conv-${tag}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: (contactTags.length + i) * 0.03 }}
        >
          <Badge
            variant="outline"
            className="group/tag flex cursor-default items-center gap-1 border-border/30 transition-all hover:scale-105 hover:border-primary/30"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            {tag}
            <X className="h-3 w-3 cursor-pointer opacity-0 transition-all hover:text-destructive group-hover/tag:opacity-100" />
          </Badge>
        </motion.div>
      ))}
      {contactTags.length === 0 && conversation.tags.length === 0 && (
        <div className="flex w-full flex-col items-center gap-1.5 py-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/20">
            <TagsIcon className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-xs text-muted-foreground/60">Nenhuma tag adicionada</p>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 border border-dashed border-border/40 text-xs hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="mr-1 h-3 w-3" />
        Adicionar
      </Button>
    </div>
  );
}
