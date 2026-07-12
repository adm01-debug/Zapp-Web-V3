import { useState, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('ExternalCatalog');
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────
export interface ExternalCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

export interface ExternalSupplier {
  id: string;
  name: string;
}

export interface ExternalProductVariant {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  attributes: Record<string, string> | null;
  stock_quantity: number;
  color_name: string | null;
  color_hex: string | null;
  size_code: string | null;
  capacity_ml: number | null;
  selected_thumbnail: string | null;
  is_active: boolean;
}

export interface ExternalProduct {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  sku: string;
  sale_price: number;
  suggested_price: number | null;
  stock_quantity: number;
  primary_image_url: string | null;
  colors: string[] | null;
  brand: string | null;
  origin_country: string | null;
  min_quantity: number | null;
  dimensions_display: string | null;
  weight_g: number | null;
  combined_sizes: string | null;
  product_type: string | null;
  is_kit: boolean;
  is_active: boolean;
  is_stockout: boolean;
  allows_personalization: boolean;
  lead_time_days: number | null;
  supply_mode: string | null;
  category_id: string | null;
  supplier_id: string | null;
  slug: string | null;
  capacity_ml: number | null;
  ncm_code: string | null;
  categories: ExternalCategory | null;
  suppliers: ExternalSupplier | null;
  variants?: ExternalProductVariant[];
}

export interface CatalogFilters {
  search?: string;
  category_id?: string;
  supplier_id?: string;
  only_active?: boolean;
  only_in_stock?: boolean;
  limit?: number;
  offset?: number;
  order_by?: string;
  ascending?: boolean;
}

// ─── API invoke ───────────────────────────────────────────────
import { hasField, readArray, readVariants } from '@/lib/runtimeGuards';

async function invokeAction<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('promogifts-catalog', {
    body: { action, params },
  });
  if (error) throw new Error(error.message);
  if (hasField(data, 'error') && typeof data.error === 'string') {
    throw new Error(data.error);
  }
  return data as T; // ignore-audit: narrows Supabase query result to local interface
}

/** Ensures a product object always exposes a typed `variants` array. */
export function withSafeVariants(product: ExternalProduct | null | undefined): ExternalProduct | null {
  if (!product) return null;
  return {
    ...product,
    variants: readVariants<ExternalProductVariant>(product),
  };
}

// ─── Hook ─────────────────────────────────────────────────────
export function useExternalCatalog() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [ready, setReady] = useState(false);

  // Products query - auto-fetches when filters change and ready=true
  const productsQuery = useQuery({
    queryKey: ['external-catalog', 'products', filters],
    queryFn: async () => {
      log.debug('Fetching products with filters:', JSON.stringify(filters));
      const result = await invokeAction<unknown>('list_products', filters as Record<string, unknown>);
      const products = readArray<ExternalProduct>(result, 'data').map((p) => ({
        ...p,
        variants: readVariants<ExternalProductVariant>(p),
      }));
      const meta = (result && typeof result === 'object' && 'meta' in result
        ? (result as { meta?: { total?: number; duration_ms?: number } }).meta
        : undefined) ?? { total: 0, duration_ms: 0 };
      log.debug('Got', products.length, 'products, total:', meta.total);
      return { data: products, meta: { total: meta.total ?? 0, duration_ms: meta.duration_ms ?? 0 } };
    },
    enabled: ready,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  // Categories
  const categoriesQuery = useQuery({
    queryKey: ['external-catalog', 'categories'],
    queryFn: async () => {
      const result = await invokeAction<unknown>('list_categories');
      return readArray<ExternalCategory>(result, 'data');
    },
    enabled: ready,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Suppliers
  const suppliersQuery = useQuery({
    queryKey: ['external-catalog', 'suppliers'],
    queryFn: async () => {
      const result = await invokeAction<unknown>('list_suppliers');
      return readArray<ExternalSupplier>(result, 'data');
    },
    enabled: ready,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Called by component to set filters and trigger fetch
  const fetchProducts = useCallback((newFilters: CatalogFilters = {}) => {
    setFilters(newFilters);
    setReady(true);
  }, []);

  const fetchProduct = useCallback(async (productId: string): Promise<ExternalProduct | null> => {
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ['external-catalog', 'product', productId],
        queryFn: async () => {
          const res = await invokeAction<unknown>('get_product', { product_id: productId });
          const product = (res && typeof res === 'object' && 'data' in res
            ? (res as { data?: ExternalProduct }).data
            : null) ?? null;
          return withSafeVariants(product);
        },
        staleTime: 5 * 60 * 1000,
      });
      return result;
    } catch (err) {
      log.error('Failed to fetch product', err);
      return null;
    }
  }, [queryClient]);

  const fetchCategories = useCallback(() => {
    setReady(true);
  }, []);

  const fetchSuppliers = useCallback(() => {
    setReady(true);
  }, []);

  return {
    products: productsQuery.data?.data || [],
    totalProducts: productsQuery.data?.meta?.total ?? 0,
    categories: categoriesQuery.data || [],
    suppliers: suppliersQuery.data || [],
    loading: productsQuery.isLoading || productsQuery.isFetching,
    error: productsQuery.error?.message || null,
    fetchProducts,
    fetchProduct,
    fetchCategories,
    fetchSuppliers,
  };
}
