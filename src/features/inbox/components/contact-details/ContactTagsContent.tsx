import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, TagsIcon, X } from 'lucide-react';
import { Conversation, Contact } from '@/types/chat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTags, useContactTags } from '@/hooks/useTags';
import { isValidUUID } from '@/utils/uuid';

interface ContactTagsContentProps {
  contact: Contact;
  conversation: Conversation;
}

/** Contact Tags Content component for the contact details section. */
export function ContactTagsContent({ contact, conversation }: ContactTagsContentProps) {
  // Etapa 42: tags REAIS do contato (zapp.contact_tags via useContactTags) em
  // vez de exibir apenas os arrays legados decorativos. O hook já existia órfão.
  const contactId = contact.id;
  const validContact = !!contactId && isValidUUID(contactId);
  const { contactTags: realTags, addTag, removeTag, isLoading } = useContactTags(validContact ? contactId : undefined);
  const { tags: allTags } = useTags();

  // Fallback legado quando o contato não tem UUID válido (ex.: contato JID-only)
  const contactTags = validContact ? realTags : (contact.tags ?? []);
  const legacyConversationTags = validContact ? [] : conversation.tags;

  const availableTags = (allTags ?? []).filter(
    (t) => !contactTags.some((ct) => ct.id === t.id)
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {!validContact && conversation.tags.map((tag, i) => (
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
          </Badge>
        </motion.div>
      ))}

      {contactTags.map((tag, i) => (
        <motion.div
          key={`contact-${tag.id ?? tag}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
        >
          <Badge
            variant="secondary"
            className="group/tag flex cursor-default items-center gap-1 border border-primary/20 bg-primary/10 text-foreground transition-all hover:scale-105 hover:bg-primary/20"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {tag.name ?? tag}
            {validContact && (
              <button
                type="button"
                aria-label={`Remover etiqueta ${tag.name ?? tag}`}
                className="cursor-pointer opacity-0 transition-all hover:text-destructive group-hover/tag:opacity-100"
                onClick={() => {
                  if (tag.id) void removeTag(tag.id);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        </motion.div>
      ))}

      {legacyConversationTags.length === 0 && contactTags.length === 0 && (
        <div className="flex w-full flex-col items-center gap-1.5 py-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/20">
            <TagsIcon className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-xs text-muted-foreground/60">
            {isLoading ? 'Carregando…' : 'Nenhuma tag adicionada'}
          </p>
        </div>
      )}

      {validContact && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 border border-dashed border-border/40 text-xs hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            >
              <Plus className="mr-1 h-3 w-3" />
              Adicionar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {availableTags.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                Nenhuma etiqueta disponível
              </DropdownMenuItem>
            ) : (
              availableTags.map((tag) => (
                <DropdownMenuItem
                  key={tag.id}
                  className="cursor-pointer gap-2 text-xs"
                  onClick={() => void addTag(tag.id)}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color || 'var(--primary)' }} />
                  {tag.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
