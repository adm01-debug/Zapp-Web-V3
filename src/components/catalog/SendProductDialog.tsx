// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Send, ChevronDown, Copy, Download, Pencil, User } from 'lucide-react';
import { ExternalProduct, useExternalCatalog } from '@/hooks/useExternalApiManagement';
import { toast } from '@/hooks/use-toast';
import {
  type MessageTemplate,
  type SendMode,
  buildMessage,
  collectAllImages,
  groupVariantsByColor,
} from './sendProductUtils';
import { useContactSearch, useSendToContact } from '@/hooks/catalog/useSendProduct';
import { ContactSelectionStep } from './ContactSelectionStep';
import { ProductVariantSelector } from './ProductVariantSelector';
import { ProductImageGrid } from './ProductImageGrid';

interface SendProductDialogProps {
  product: ExternalProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSend?: (text: string, images: string[]) => void;
}

const TEMPLATE_LABELS: Record<MessageTemplate, string> = {
  formal: 'Formal',
  informal: 'Informal',
  promo: 'Promoção',
};

export const SendProductDialog: React.FC<SendProductDialogProps> = ({
  product,
  open,
  onOpenChange,
  onConfirmSend,
}) => {
  const { fetchProduct } = useExternalCatalog();
  const [fullProduct, setFullProduct] = useState<ExternalProduct>(product);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [template, setTemplate] = useState<MessageTemplate>('informal');
  const [isEditing, setIsEditing] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('product');
  const [selectedColorGroup, setSelectedColorGroup] = useState<string | null>(null);
  const [step, setStep] = useState<'configure' | 'selectContact'>('configure');

  const {
    contactSearch,
    setContactSearch,
    contactResults,
    searchingContacts,
    selectedContact,
    setSelectedContact,
    resetContactSelection,
  } = useContactSearch(step);

  const { isSending, sendProductToContact } = useSendToContact(() => {
    onOpenChange(false);
    setStep('configure');
    resetContactSelection();
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (open && (!product.variants || product.variants.length === 0)) {
      setLoadingVariants(true);
      fetchProduct(product.id)
        .then((p) => {
          if (mountedRef.current && p) setFullProduct(p);
        })
        .finally(() => {
          if (mountedRef.current) setLoadingVariants(false);
        });
    } else {
      setFullProduct(product);
    }
  }, [open, product.id]);

  const variantGroups = useMemo(
    () => groupVariantsByColor(fullProduct.variants || []),
    [fullProduct.variants]
  );

  const activeGroup = selectedColorGroup
    ? variantGroups.find((g) => g.colorName === selectedColorGroup) || null
    : null;

  const allImages = useMemo(() => collectAllImages(fullProduct), [fullProduct]);
  const visibleImages = useMemo(() => {
    if (sendMode === 'variant' && activeGroup) {
      const imgs: { url: string; label: string }[] = [];
      if (fullProduct.primary_image_url)
        imgs.push({ url: fullProduct.primary_image_url, label: 'Principal' });
      activeGroup.images.forEach((url: string) => {
        if (!imgs.some((i) => i.url === url)) imgs.push({ url, label: activeGroup.colorName });
      });
      return imgs;
    }
    return allImages;
  }, [sendMode, activeGroup, allImages, fullProduct.primary_image_url]);

  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedImages(new Set(visibleImages.map((i) => i.url)));
  }, [visibleImages]);

  const message = isEditing
    ? customMessage
    : buildMessage(fullProduct, template, sendMode === 'variant' ? activeGroup : null);

  const toggleImage = (url: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleEditMessage = () => {
    if (!isEditing) setCustomMessage(message);
    setIsEditing(!isEditing);
  };

  const handleCopyDescription = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast({ title: '✅ Copiado!' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const handleDownloadImages = () => {
    const urls = Array.from(selectedImages);
    if (urls.length === 0) {
      toast({ title: 'Nenhuma foto selecionada', variant: 'destructive' });
      return;
    }
    urls.forEach((url, i) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fullProduct.name.replace(/\s+/g, '_')}_${i + 1}.jpg`;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    toast({ title: `📥 Download iniciado`, description: `${urls.length} foto(s)` });
  };

  const handleSend = () => {
    const imgs = Array.from(selectedImages);
    if (onConfirmSend) {
      onConfirmSend(message, imgs);
      onOpenChange(false);
    } else {
      setStep('selectContact');
      resetContactSelection();
    }
  };

  const handleSendToContact = async () => {
    if (!selectedContact) {
      toast({ title: 'Selecione um contato', variant: 'destructive' });
      return;
    }
    await sendProductToContact(selectedContact, message, Array.from(selectedImages));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setStep('configure');
          resetContactSelection();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg gap-0 p-0">
        {step === 'configure' && (
          <>
            <DialogHeader className="p-5 pb-3">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Send className="h-5 w-5 text-primary" />
                {sendMode === 'variant' && activeGroup
                  ? `Enviar ${activeGroup.colorName}`
                  : 'Enviar Produto'}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {sendMode === 'variant'
                  ? 'Enviando variação específica do produto'
                  : 'Selecione fotos, modelo de mensagem e envie'}
              </p>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 px-5 pb-5">
                {variantGroups.length > 0 && (
                  <ProductVariantSelector
                    variantGroups={variantGroups}
                    sendMode={sendMode}
                    setSendMode={setSendMode}
                    selectedColorGroup={selectedColorGroup}
                    setSelectedColorGroup={setSelectedColorGroup}
                    setIsEditing={setIsEditing}
                  />
                )}

                {loadingVariants && (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Carregando variantes...
                  </div>
                )}

                <Separator />

                {visibleImages.length > 0 && (
                  <ProductImageGrid
                    visibleImages={visibleImages}
                    selectedImages={selectedImages}
                    setSelectedImages={setSelectedImages}
                    toggleImage={toggleImage}
                  />
                )}

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Modelo de mensagem</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={handleEditMessage}
                    >
                      <Pencil className="h-3 w-3" />
                      {isEditing ? 'Usar modelo' : 'Editar'}
                    </Button>
                  </div>
                  {!isEditing && (
                    <div className="flex gap-2">
                      {(Object.keys(TEMPLATE_LABELS) as MessageTemplate[]).map((t) => (
                        <Button
                          key={t}
                          variant={template === t ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setTemplate(t);
                            setIsEditing(false);
                          }}
                        >
                          {TEMPLATE_LABELS[t]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/50 p-4">
                  {isEditing ? (
                    <Textarea
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="min-h-[150px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                      placeholder="Escreva sua mensagem personalizada..."
                    />
                  ) : (
                    <p className="whitespace-pre-line text-sm leading-relaxed">{message}</p>
                  )}
                </div>
              </div>
            </ScrollArea>

            <div className="flex items-center gap-2 border-t p-4">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <div className="flex flex-1">
                <Button className="flex-1 gap-2 rounded-r-none" onClick={handleSend}>
                  <User className="h-4 w-4" />
                  Selecionar Contato
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="rounded-l-none border-l border-primary-foreground/20 px-2">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={handleCopyDescription}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar Descrição
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadImages}>
                      <Download className="mr-2 h-4 w-4" />
                      Download ({selectedImages.size} fotos)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </>
        )}

        {step === 'selectContact' && (
          <ContactSelectionStep
            productName={fullProduct.name}
            productImageUrl={fullProduct.primary_image_url ?? undefined}
            selectedImagesCount={selectedImages.size}
            template={template}
            variantLabel={sendMode === 'variant' && activeGroup ? activeGroup.colorName : undefined}
            templateLabels={TEMPLATE_LABELS}
            contactSearch={contactSearch}
            onContactSearchChange={setContactSearch}
            contactResults={contactResults}
            searchingContacts={searchingContacts}
            selectedContact={selectedContact}
            onSelectContact={setSelectedContact}
            isSending={isSending}
            onBack={() => setStep('configure')}
            onSend={handleSendToContact}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
