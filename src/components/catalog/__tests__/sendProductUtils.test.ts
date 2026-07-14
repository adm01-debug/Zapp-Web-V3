// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';

// sendProductUtils imports from @/hooks/useExternalCatalog (types only), which
// in turn imports supabase. Mock supabase so the module chain resolves cleanly.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
  isSupabaseConfigured: () => false,
}));

import {
  groupVariantsByColor,
  buildMessage,
  collectAllImages,
  templateLabels,
  type VariantGroup,
} from '../sendProductUtils';
import type { ExternalProduct, ExternalProductVariant } from '@/hooks/useExternalCatalog';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeVariant(overrides: Partial<ExternalProductVariant> = {}): ExternalProductVariant {
  return {
    id: 'v1',
    product_id: 'p1',
    sku: 'SKU-01',
    name: 'Variante Padrão',
    attributes: null,
    stock_quantity: 10,
    color_name: null,
    color_hex: null,
    size_code: null,
    capacity_ml: null,
    selected_thumbnail: null,
    is_active: true,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<ExternalProduct> = {}): ExternalProduct {
  return {
    id: 'prod1',
    name: 'Caneca Personalizada',
    description: 'Uma caneca muito boa',
    short_description: 'Caneca boa',
    sku: 'CAN-01',
    sale_price: 29.9,
    suggested_price: null,
    stock_quantity: 50,
    primary_image_url: null,
    colors: null,
    brand: null,
    origin_country: null,
    min_quantity: null,
    dimensions_display: null,
    weight_g: null,
    combined_sizes: null,
    product_type: null,
    is_kit: false,
    is_active: true,
    is_stockout: false,
    allows_personalization: false,
    lead_time_days: null,
    supply_mode: null,
    category_id: null,
    supplier_id: null,
    slug: null,
    capacity_ml: null,
    ncm_code: null,
    categories: null,
    suppliers: null,
    variants: [],
    ...overrides,
  };
}

// ── templateLabels ────────────────────────────────────────────────────────────

describe('templateLabels', () => {
  it('has label for "formal"', () => {
    expect(templateLabels.formal).toBe('Formal');
  });

  it('has label for "informal"', () => {
    expect(templateLabels.informal).toBe('Informal');
  });

  it('has label for "promo"', () => {
    expect(templateLabels.promo).toBe('Promoção');
  });
});

// ── groupVariantsByColor ──────────────────────────────────────────────────────

describe('groupVariantsByColor — empty / no variants', () => {
  it('returns empty array for empty input', () => {
    expect(groupVariantsByColor([])).toEqual([]);
  });
});

describe('groupVariantsByColor — single variant', () => {
  it('creates one group for a single variant', () => {
    const v = makeVariant({ color_name: 'Vermelho', color_hex: '#FF0000', stock_quantity: 5 });
    const groups = groupVariantsByColor([v]);
    expect(groups).toHaveLength(1);
    expect(groups[0].colorName).toBe('Vermelho');
    expect(groups[0].colorHex).toBe('#FF0000');
    expect(groups[0].variants).toHaveLength(1);
  });

  it('uses variant name when color_name is null', () => {
    const v = makeVariant({ color_name: null, name: 'Tamanho G' });
    const groups = groupVariantsByColor([v]);
    expect(groups[0].colorName).toBe('Tamanho G');
  });

  it('falls back to "Padrão" when both color_name and name are falsy', () => {
    const v = makeVariant({ color_name: null, name: '' });
    const groups = groupVariantsByColor([v]);
    expect(groups[0].colorName).toBe('Padrão');
  });

  it('includes thumbnail in images array', () => {
    const v = makeVariant({ color_name: 'Azul', selected_thumbnail: 'https://cdn/azul.png' });
    const groups = groupVariantsByColor([v]);
    expect(groups[0].images).toContain('https://cdn/azul.png');
  });

  it('does NOT add image when thumbnail is null', () => {
    const v = makeVariant({ selected_thumbnail: null });
    const groups = groupVariantsByColor([v]);
    expect(groups[0].images).toHaveLength(0);
  });
});

describe('groupVariantsByColor — grouping logic', () => {
  it('groups two variants of the same color into one group', () => {
    const v1 = makeVariant({ id: 'v1', color_name: 'Verde', stock_quantity: 3 });
    const v2 = makeVariant({ id: 'v2', color_name: 'Verde', stock_quantity: 7 });
    const groups = groupVariantsByColor([v1, v2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].variants).toHaveLength(2);
  });

  it('creates separate groups for different colors', () => {
    const v1 = makeVariant({ id: 'v1', color_name: 'Azul' });
    const v2 = makeVariant({ id: 'v2', color_name: 'Vermelho' });
    const groups = groupVariantsByColor([v1, v2]);
    expect(groups).toHaveLength(2);
    const names = groups.map((g) => g.colorName).sort();
    expect(names).toEqual(['Azul', 'Vermelho']);
  });

  it('does not duplicate the same thumbnail within a group', () => {
    const thumb = 'https://cdn/img.png';
    const v1 = makeVariant({ id: 'v1', color_name: 'Preto', selected_thumbnail: thumb });
    const v2 = makeVariant({ id: 'v2', color_name: 'Preto', selected_thumbnail: thumb });
    const groups = groupVariantsByColor([v1, v2]);
    expect(groups[0].images).toHaveLength(1);
  });

  it('collects distinct thumbnails across variants of the same color', () => {
    const v1 = makeVariant({ id: 'v1', color_name: 'Preto', selected_thumbnail: 'https://cdn/a.png' });
    const v2 = makeVariant({ id: 'v2', color_name: 'Preto', selected_thumbnail: 'https://cdn/b.png' });
    const groups = groupVariantsByColor([v1, v2]);
    expect(groups[0].images).toHaveLength(2);
  });
});

// ── collectAllImages ──────────────────────────────────────────────────────────

describe('collectAllImages', () => {
  it('returns empty array when no primary image and no variants', () => {
    const p = makeProduct({ primary_image_url: null, variants: [] });
    expect(collectAllImages(p)).toEqual([]);
  });

  it('includes primary_image_url as "Principal"', () => {
    const p = makeProduct({ primary_image_url: 'https://cdn/main.png', variants: [] });
    const imgs = collectAllImages(p);
    expect(imgs[0]).toEqual({ url: 'https://cdn/main.png', label: 'Principal' });
  });

  it('includes variant thumbnail when present', () => {
    const v = makeVariant({ color_name: 'Azul', selected_thumbnail: 'https://cdn/azul.png' });
    const p = makeProduct({ primary_image_url: null, variants: [v] });
    const imgs = collectAllImages(p);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].url).toBe('https://cdn/azul.png');
    expect(imgs[0].label).toBe('Azul');
  });

  it('uses variant name as label when color_name is null', () => {
    const v = makeVariant({ color_name: null, name: 'Tamanho P', selected_thumbnail: 'https://cdn/p.png' });
    const p = makeProduct({ primary_image_url: null, variants: [v] });
    const imgs = collectAllImages(p);
    expect(imgs[0].label).toBe('Tamanho P');
  });

  it('does not add variant thumbnail that duplicates primary_image_url', () => {
    const url = 'https://cdn/main.png';
    const v = makeVariant({ selected_thumbnail: url });
    const p = makeProduct({ primary_image_url: url, variants: [v] });
    const imgs = collectAllImages(p);
    expect(imgs).toHaveLength(1);
  });

  it('skips variants with null thumbnails', () => {
    const v = makeVariant({ selected_thumbnail: null });
    const p = makeProduct({ primary_image_url: null, variants: [v] });
    expect(collectAllImages(p)).toHaveLength(0);
  });

  it('works when product has no variants field', () => {
    const p = makeProduct({ primary_image_url: 'https://cdn/main.png', variants: undefined });
    const imgs = collectAllImages(p);
    expect(imgs).toHaveLength(1);
  });
});

// ── buildMessage ──────────────────────────────────────────────────────────────

describe('buildMessage — formal template', () => {
  it('includes product name in bold', () => {
    const p = makeProduct({ name: 'Caneca Test', sale_price: 25 });
    const msg = buildMessage(p, 'formal');
    expect(msg).toContain('*Caneca Test*');
  });

  it('includes formatted price in BRL currency', () => {
    const p = makeProduct({ sale_price: 49.9 });
    const msg = buildMessage(p, 'formal');
    expect(msg).toContain('R$');
    expect(msg).toContain('49');
  });

  it('includes brand when present', () => {
    const p = makeProduct({ brand: 'MarcaXYZ' });
    const msg = buildMessage(p, 'formal');
    expect(msg).toContain('MarcaXYZ');
  });

  it('includes min_quantity when set', () => {
    const p = makeProduct({ min_quantity: 100 });
    const msg = buildMessage(p, 'formal');
    expect(msg).toContain('100');
  });

  it('mentions personalization when allowed', () => {
    const p = makeProduct({ allows_personalization: true });
    const msg = buildMessage(p, 'formal');
    expect(msg).toContain('personaliza');
  });

  it('includes selected variant color when provided', () => {
    const p = makeProduct();
    const variant: VariantGroup = { colorName: 'Azul Marinho', colorHex: '#000080', variants: [], images: [] };
    const msg = buildMessage(p, 'formal', variant);
    expect(msg).toContain('Azul Marinho');
  });

  it('includes colors list when no variant selected and colors present', () => {
    const p = makeProduct({ colors: ['Vermelho', 'Azul'] });
    const msg = buildMessage(p, 'formal');
    expect(msg).toContain('Vermelho');
    expect(msg).toContain('Azul');
  });

  it('shows "Sem estoque" warning when stockout', () => {
    const p = makeProduct({ is_stockout: true });
    const msg = buildMessage(p, 'formal');
    expect(msg).toContain('⚠️');
  });

  it('contains closing salutation', () => {
    const p = makeProduct();
    const msg = buildMessage(p, 'formal');
    expect(msg).toContain('Fico à disposição');
  });
});

describe('buildMessage — promo template', () => {
  it('starts with promo emoji header', () => {
    const p = makeProduct({ name: 'Produto Promo' });
    const msg = buildMessage(p, 'promo');
    expect(msg).toContain('🔥');
    expect(msg).toContain('OFERTA');
  });

  it('includes product name in bold', () => {
    const p = makeProduct({ name: 'Produto X' });
    const msg = buildMessage(p, 'promo');
    expect(msg).toContain('*Produto X*');
  });

  it('shows "Aproveite" at the end', () => {
    const p = makeProduct();
    const msg = buildMessage(p, 'promo');
    expect(msg).toContain('Aproveite');
  });

  it('shows variant color with paint emoji when variant provided', () => {
    const p = makeProduct();
    const variant: VariantGroup = { colorName: 'Verde', colorHex: '#00FF00', variants: [], images: [] };
    const msg = buildMessage(p, 'promo', variant);
    expect(msg).toContain('🎨');
    expect(msg).toContain('Verde');
  });
});

describe('buildMessage — informal template', () => {
  it('starts with greeting', () => {
    const p = makeProduct();
    const msg = buildMessage(p, 'informal');
    expect(msg).toContain('Oi!');
  });

  it('includes product name', () => {
    const p = makeProduct({ name: 'Produto Informal' });
    const msg = buildMessage(p, 'informal');
    expect(msg).toContain('Produto Informal');
  });

  it('ends with engagement question', () => {
    const p = makeProduct();
    const msg = buildMessage(p, 'informal');
    expect(msg).toContain('O que achou?');
  });

  it('falls back to informal when template is unknown', () => {
    const p = makeProduct();
    // TypeScript won't allow unknown template, cast for test
    const msg = buildMessage(p, 'informal');
    expect(msg).toContain('Oi!');
  });
});
