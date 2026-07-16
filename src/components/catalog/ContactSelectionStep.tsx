import { Search, User, Check, ArrowLeft, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ContactResult } from '@/hooks/catalog/useSendProduct';
import type { MessageTemplate } from './sendProductUtils';

interface ContactSelectionStepProps {
  productName: string;
  productImageUrl?: string;
  selectedImagesCount: number;
  template: MessageTemplate;
  variantLabel?: string;
  templateLabels: Record<MessageTemplate, string>;
  contactSearch: string;
  onContactSearchChange: (v: string) => void;
  contactResults: ContactResult[];
  searchingContacts: boolean;
  selectedContact: ContactResult | null;
  onSelectContact: (c: ContactResult) => void;
  isSending: boolean;
  onBack: () => void;
  onSend: () => void;
}

export function ContactSelectionStep({
  productName,
  productImageUrl,
  selectedImagesCount,
  template,
  variantLabel,
  templateLabels,
  contactSearch,
  onContactSearchChange,
  contactResults,
  searchingContacts,
  selectedContact,
  onSelectContact,
  isSending,
  onBack,
  onSend,
}: ContactSelectionStepProps) {
  return (
    <>
      <DialogHeader className="p-5 pb-3">
        <DialogTitle className="flex items-center gap-2 text-lg">
          <User className="h-5 w-5 text-primary" />
          Selecionar Contato
        </DialogTitle>
        <p className="text-sm text-muted-foreground">
          Escolha para quem enviar{' '}
          <span className="font-medium text-foreground">{productName}</span>
        </p>
      </DialogHeader>

      <div className="space-y-3 px-5">
        <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/50 p-2.5">
          {productImageUrl && (
            <img
              src={productImageUrl}
              alt={productName}
              className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{productName}</p>
            <p className="text-xs text-muted-foreground">
              {selectedImagesCount} foto(s) · Modelo {templateLabels[template]}
              {variantLabel ? ` · ${variantLabel}` : ''}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar contato por nome ou telefone..."
            value={contactSearch}
            onChange={(e) => onContactSearchChange(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
      </div>

      <ScrollArea className="max-h-[45vh] px-5 py-2">
        {searchingContacts ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : contactResults.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <User className="mx-auto mb-2 h-10 w-10 opacity-40" />
            <p className="text-sm">
              {contactSearch.trim() ? 'Nenhum contato encontrado' : 'Busque por nome ou telefone'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {contactResults.map((contact) => (
              <button
                type="button"
                key={contact.id}
                onClick={() => onSelectContact(contact)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-all',
                  selectedContact?.id === contact.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-transparent hover:bg-muted/50'
                )}
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={contact.avatar_url || undefined} alt={contact.name || ''} />
                  <AvatarFallback className="bg-primary/10 text-sm text-primary">
                    {contact.name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">{contact.phone}</p>
                </div>
                {selectedContact?.id === contact.id && (
                  <Check className="h-5 w-5 flex-shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="flex items-center gap-2 border-t p-4">
        <Button variant="outline" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button className="flex-1 gap-2" disabled={!selectedContact || isSending} onClick={onSend}>
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isSending
            ? 'Enviando...'
            : selectedContact
              ? `Enviar para ${selectedContact.name}`
              : 'Selecione um contato'}
        </Button>
      </div>
    </>
  );
}
