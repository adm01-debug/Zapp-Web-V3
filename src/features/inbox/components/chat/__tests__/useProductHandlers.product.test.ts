/**
 * BUG-10 — Regression tests for awaited product sending in useProductHandlers.
 *
 * Antes: handleSendProduct chamava onSendMessage SEM await e mostrava
 * 'Produto enviado!' imediatamente (toast mentiroso se o envio falhasse).
 * Agora: await dentro de try — toast de sucesso so apos resolver; catch
 * mostra toast destructive 'Erro ao enviar produto'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProductHandlers } from '../useProductHandlers';
import type { ExternalProduct } from '@/hooks/useExternalApiManagement';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

// O adapter nunca deve ser chamado por handleSendProduct — mock vazio
// garante que qualquer uso indevido quebre o teste.
vi.mock('@/lib/whatsappAdapter', () => ({
  whatsapp: { sendLocation: vi.fn() },
}));
vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: vi.fn(() => ({ insert: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCT: ExternalProduct = {
  id: 'prod-1',
  name: 'Camiseta Premium',
  description: 'Camiseta 100% algodao.',
  short_description: 'Camiseta premium',
  sku: 'CAM-PRE-001',
  sale_price: 89.9,
  suggested_price: null,
  stock_quantity: 12,
  primary_image_url: null,
  colors: ['Preto', 'Branco'],
  brand: 'MarcaX',
  origin_country: 'BR',
  min_quantity: 2,
  dimensions_display: '30x20x5 cm',
  weight_g: null,
  combined_sizes: null,
  product_type: 'apparel',
  is_kit: false,
  is_active: true,
  is_stockout: false,
  allows_personalization: true,
  lead_time_days: 5,
  supply_mode: 'stock',
  category_id: null,
  supplier_id: null,
  slug: null,
  capacity_ml: null,
  ncm_code: null,
  categories: null,
  suppliers: null,
  variants: [],
};

function makeHandlers(onSendMessage: (content: string) => void | Promise<void>) {
  return renderHook(() =>
    useProductHandlers({
      onSendMessage,
      contactId: '123e4567-e89b-12d3-a456-426614174000',
      contactPhone: '5511999887766',
      instanceName: 'wpp2',
    })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useProductHandlers — handleSendProduct (BUG-10)', () => {
  beforeEach(() => {
    mockToast.mockReset();
  });

  it('mostra toast de sucesso apenas quando onSendMessage resolve', async () => {
    const onSendMessage = vi.fn((_content: string) => Promise.resolve());
    const { result } = makeHandlers(onSendMessage);

    await act(async () => {
      await result.current.handleSendProduct(PRODUCT);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][0]).toContain('Produto: *Camiseta Premium*');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Produto enviado!' })
    );
  });

  it('suporta onSendMessage sincrono (void)', async () => {
    const onSendMessage = vi.fn(() => undefined);
    const { result } = makeHandlers(onSendMessage);

    await act(async () => {
      await result.current.handleSendProduct(PRODUCT);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Produto enviado!' })
    );
  });

  it('mostra toast destructive (nao sucesso) quando onSendMessage rejeita', async () => {
    const onSendMessage = vi.fn(() => Promise.reject(new Error('rate limit 429')));
    const { result } = makeHandlers(onSendMessage);

    await act(async () => {
      await result.current.handleSendProduct(PRODUCT);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao enviar produto',
        description: 'rate limit 429',
        variant: 'destructive',
      })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Produto enviado!' })
    );
  });
});
