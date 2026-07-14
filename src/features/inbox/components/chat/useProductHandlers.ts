import { useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { InteractiveMessage, InteractiveButton, LocationMessage } from '@/types/chat';
import { ExternalProduct } from '@/hooks/useExternalApiManagement';

interface UseProductHandlersOptions {
  onSendMessage: (content: string) => void;
}

export function useProductHandlers({ onSendMessage }: UseProductHandlersOptions) {
  const handleSendProduct = useCallback(
    (product: ExternalProduct) => {
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
      onSendMessage(lines);
      toast({ title: 'Produto enviado!', description: `${product.name} - ${price}` });
    },
    [onSendMessage]
  );

  const handleSendInteractiveMessage = useCallback((interactive: InteractiveMessage) => {
    toast({
      title: 'Mensagem interativa enviada!',
      description: `Mensagem com ${interactive.buttons?.length || 0} botoes enviada.`,
    });
  }, []);

  const handleInteractiveButtonClick = useCallback((button: InteractiveButton) => {
    toast({ title: 'Botao clicado', description: `Resposta: ${button.title}` });
  }, []);

  const handleSendLocation = useCallback((location: LocationMessage) => {
    toast({
      title: 'Localizacao enviada!',
      description: location.isLive
        ? `Localizacao em tempo real por ${location.liveUntil ? Math.round((location.liveUntil.getTime() - Date.now()) / 60000) : 15} minutos`
        : location.name || 'Localizacao compartilhada',
    });
  }, []);

  return {
    handleSendProduct,
    handleSendInteractiveMessage,
    handleInteractiveButtonClick,
    handleSendLocation,
  };
}
