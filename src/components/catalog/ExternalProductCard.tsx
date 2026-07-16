import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Send, Eye, Palette } from 'lucide-react';
import { motion } from 'framer-motion';
import { ExternalProduct } from '@/hooks/useExternalApiManagement';
import { ProductDetailDialog } from './ProductDetailDialog';

interface ExternalProductCardProps {
  product: ExternalProduct;
  onSend?: (product: ExternalProduct) => void;
  compact?: boolean;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none';
  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
  if (fallback) fallback.style.display = 'flex';
};

const ProductImage: React.FC<{ src: string | null; alt: string; iconSize?: string }> = ({
  src,
  alt,
  iconSize = 'w-6 h-6',
}) => (
  <>
    {src ? (
      <>
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={handleImageError}
        />
        <div className="hidden h-full w-full items-center justify-center">
          <Package className={`${iconSize} text-muted-foreground`} />
        </div>
      </>
    ) : (
      <div className="flex h-full w-full items-center justify-center">
        <Package className={`${iconSize} text-muted-foreground`} />
      </div>
    )}
  </>
);

export const ExternalProductCard: React.FC<ExternalProductCardProps> = React.memo(
  ({ product, onSend, compact = false }) => {
    const [showDetails, setShowDetails] = useState(false);

    if (compact) {
      return (
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="flex items-center gap-3 rounded-lg border border-border/30 bg-card p-3 transition-colors hover:border-primary/30"
        >
          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted">
            <ProductImage src={product.primary_image_url} alt={product.name} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-medium">{product.name}</h4>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-sm font-semibold text-primary">
                {formatPrice(product.sale_price)}
              </span>
              {product.brand && (
                <Badge variant="outline" className="px-1 py-0 text-[10px]">
                  {product.brand}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              {product.is_stockout ? (
                <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                  Sem estoque
                </Badge>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {product.stock_quantity} un.
                </span>
              )}
              {product.colors && product.colors.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {product.colors.length} cores
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 gap-1">
            <Button
              aria-label="Ver detalhes do produto"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setShowDetails(true)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {onSend && (
              <Button
                aria-label="Enviar produto"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onSend(product)}
                disabled={product.is_stockout}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <ProductDetailDialog
            product={product}
            open={showDetails}
            onOpenChange={setShowDetails}
            onSend={onSend}
          />
        </motion.div>
      );
    }

    return (
      <>
        <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="flex h-full flex-col overflow-hidden border-border/30 transition-colors hover:border-primary/30">
            <div className="relative aspect-square bg-muted">
              <ProductImage
                src={product.primary_image_url}
                alt={product.name}
                iconSize="w-12 h-12"
              />
              {product.is_stockout && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <Badge variant="destructive">Esgotado</Badge>
                </div>
              )}
              {product.categories && (
                <Badge variant="secondary" className="absolute left-2 top-2 text-[10px]">
                  {product.categories.name}
                </Badge>
              )}
              {product.is_kit && (
                <Badge className="absolute right-2 top-2 bg-accent text-[10px] text-accent-foreground">
                  Kit
                </Badge>
              )}
            </div>
            <CardContent className="flex flex-1 flex-col space-y-2 p-3">
              <div className="flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                  {product.name}
                </h3>
                {product.brand && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{product.brand}</p>
                )}
              </div>
              {product.colors && product.colors.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <Palette className="h-3 w-3 text-muted-foreground" />
                  {product.colors.slice(0, 4).map((c) => (
                    <Badge key={c} variant="outline" className="px-1 py-0 text-[9px]">
                      {c}
                    </Badge>
                  ))}
                  {product.colors.length > 4 && (
                    <span className="text-[9px] text-muted-foreground">
                      +{product.colors.length - 4}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-primary">
                  {formatPrice(product.sale_price)}
                </span>
                {!product.is_stockout && product.stock_quantity <= 10 && (
                  <Badge variant="outline" className="border-warning/50 text-[10px] text-warning">
                    {product.stock_quantity} un.
                  </Badge>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 text-xs"
                  onClick={() => setShowDetails(true)}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                </Button>
                {onSend && (
                  <Button
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    onClick={() => onSend(product)}
                    disabled={product.is_stockout}
                  >
                    <Send className="mr-1 h-3.5 w-3.5" /> Enviar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <ProductDetailDialog
          product={product}
          open={showDetails}
          onOpenChange={setShowDetails}
          onSend={onSend}
        />
      </>
    );
  }
);
