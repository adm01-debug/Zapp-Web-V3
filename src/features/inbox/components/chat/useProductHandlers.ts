import { useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { InteractiveMessage, InteractiveButton, LocationMessage } from '@/types/chat';
import { ExternalProduct } from '@/hooks/useExternalApiManagement';
import { whatsapp } from '@/lib/whatsappAdapter';
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';

interface UseProductHandlersOptions {
  contactId?: string;
  contactPhone?: string;
  instanceName?: string;
  onSendMessage: (content: string, attachments?: File[], onProgress?: (p: number) => void) => void | Promise<void>;
}

/** use Product Handlers component for the chat section. */
export function useProductHandlers({
  onSendMessage,
  contactId,
  contactPhone,
  instanceName,
}: UseProductHandlersOptions) {
  const handleSendProduct = useCallback(
    async (product: ExternalProduct) => {
      const price = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        product.sale_price
      );
      const lines = [
        `Produto: *${product.name}*`,
        product.brand ? `Marca: ${product.brand}` : '',
        `Preco: ${price}`,
        product.min_quantity ? `Qtd. minima: ${product.min_quantity} un.` : '',
        product.colors?.length ? `Cores: ${product.colors.join(', ')}` : '',
        product.dimensions_display ? `Dimensoes: ${product.dimensions_display}` : '',
        product.allows_personalization ? 'Permite personalizacao' : '',
        product.lead_time_days ? `Prazo: ${product.lead_time_days} dias uteis` : '',
        product.is_stockout
          ? '*Sem estoque no momento*'
          : `Em estoque: ${product.stock_quantity} un.`,
        product.short_description || product.description
          ? `\n${(product.short_description || product.description || '').slice(0, 300)}`
          : '',
        product.primary_image_url ? `\n${product.primary_image_url}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      // Envio com await: toast de sucesso so apos o envio realmente resolver.
      try {
        await onSendMessage(lines);
        toast({ title: 'Produto enviado!', description: `${product.name} - ${price}` });
      } catch (err) {
        toast({
          title: 'Erro ao enviar produto',
          description: err instanceof Error ? err.message : 'Falha ao enviar o produto.',
          variant: 'destructive',
        });
      }
    },
    [onSendMessage]
  );

  const handleSendInteractiveMessage = useCallback(
    async (interactive: InteractiveMessage) => {
      // Guard: sem telefone nao ha para onde enviar a mensagem interativa.
      const phone = (contactPhone || '').replace(/\D/g, '');
      if (!phone) {
        toast({ title: 'Contato sem telefone', variant: 'destructive' });
        return;
      }
      try {
        await whatsapp.sendInteractive({
          remoteJid: `${phone}@s.whatsapp.net`,
          instance: instanceName,
          ...interactive,
        });
        // Toast de sucesso so apos o envio realmente resolver.
        toast({
          title: 'Mensagem interativa enviada!',
          description: `Mensagem com ${interactive.buttons?.length || 0} botoes enviada.`,
        });
      } catch (err) {
        toast({
          title: 'Erro ao enviar mensagem interativa',
          description:
            err instanceof Error ? err.message : 'Falha ao enviar a mensagem interativa.',
          variant: 'destructive',
        });
      }
    },
    [contactPhone, instanceName]
  );

  const handleInteractiveButtonClick = useCallback(
    (button: InteractiveButton) => {
      // BUG-08: o clique em botao interativo agora responde no chat,
      // enviando o titulo do botao como mensagem (em vez de so um toast fake).
      onSendMessage(button.title ?? button.id);
    },
    [onSendMessage]
  );

  const handleSendLocation = useCallback(
    async (location: LocationMessage) => {
      // Guard: sem telefone nao ha para onde enviar a localizacao.
      const phone = (contactPhone || '').replace(/\D/g, '');
      if (!phone) {
        toast({ title: 'Contato sem telefone', variant: 'destructive' });
        return;
      }
      try {
        await whatsapp.sendLocation({
          remoteJid: `${phone}@s.whatsapp.net`,
          latitude: location.latitude,
          longitude: location.longitude,
          name: location.name,
          address: location.address,
          instance: instanceName,
        });
        // Persiste a mensagem apenas quando contactId e um UUID valido
        // (JID do WhatsApp violaria a FK da coluna contact_id).
        // Convencao do repo (messageSenderHelpers.ts): coordenadas vao como
        // JSON no content com message_type='location' — a tabela messages
        // NAO tem colunas latitude/longitude.
        if (contactId && isValidUUID(contactId)) {
          const { error: persistError } = await dbFrom('messages').insert({
            contact_id: contactId,
            content: JSON.stringify({
              latitude: location.latitude,
              longitude: location.longitude,
              name: location.name ?? null,
              address: location.address ?? null,
            }),
            message_type: 'location',
            sender: 'agent',
            status: 'sent',
            whatsapp_connection_id: null,
          });
          if (persistError) {
            log.error('Failed to persist location message:', persistError);
          }
        }
        toast({
          title: 'Localizacao enviada!',
          description: location.isLive
            ? `Localizacao em tempo real por ${location.liveUntil ? Math.round((location.liveUntil.getTime() - Date.now()) / 60000) : 15} minutos`
            : location.name || 'Localizacao compartilhada',
        });
      } catch (err) {
        toast({
          title: 'Erro ao enviar localizacao',
          description: err instanceof Error ? err.message : 'Falha ao enviar a localizacao.',
          variant: 'destructive',
        });
      }
    },
    [contactId, contactPhone, instanceName]
  );

  return {
    handleSendProduct,
    handleSendInteractiveMessage,
    handleInteractiveButtonClick,
    handleSendLocation,
  };
}
