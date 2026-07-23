import { Button } from '@/components/ui/button';
import { Package, Palette, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VariantGroup, SendMode } from './sendProductUtils';

interface ProductVariantSelectorProps {
  variantGroups: VariantGroup[];
  sendMode: SendMode;
  setSendMode: (mode: SendMode) => void;
  selectedColorGroup: string | null;
  setSelectedColorGroup: (group: string | null) => void;
  setIsEditing: (editing: boolean) => void;
}

/** Product Variant Selector component for the catalog section. */
export function ProductVariantSelector({
  variantGroups,
  sendMode,
  setSendMode,
  selectedColorGroup,
  setSelectedColorGroup,
  setIsEditing,
}: ProductVariantSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          variant={sendMode === 'product' ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => {
            setSendMode('product');
            setSelectedColorGroup(null);
            setIsEditing(false);
          }}
        >
          <Package className="h-3.5 w-3.5" />
          Produto Completo
        </Button>
        <Button
          variant={sendMode === 'variant' ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => {
            setSendMode('variant');
            if (!selectedColorGroup && variantGroups.length > 0)
              setSelectedColorGroup(variantGroups[0].colorName);
            setIsEditing(false);
          }}
        >
          <Palette className="h-3.5 w-3.5" />
          Variação Específica
        </Button>
      </div>

      {sendMode === 'variant' && (
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Selecione a variação
          </span>
          <div className="grid grid-cols-2 gap-2">
            {variantGroups.map((group) => {
              const isSelected = selectedColorGroup === group.colorName;
              const groupStock = group.variants.reduce((s, v) => s + v.stock_quantity, 0);
              return (
                <button type="button"
                  key={group.colorName}
                  onClick={() => {
                    setSelectedColorGroup(group.colorName);
                    setIsEditing(false);
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border-2 p-2.5 text-left transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border/50 hover:border-border'
                  )}
                >
                  {group.images[0] ? (
                    <img
                      src={group.images[0]}
                      alt={group.colorName}
                      className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                      loading="lazy"
                    />
                  ) : group.colorHex ? (
                    <div
                      className="h-10 w-10 flex-shrink-0 rounded-md border"
                      style={{ backgroundColor: group.colorHex }}
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-muted">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {group.colorHex && (
                        <div
                          className="h-3 w-3 flex-shrink-0 rounded-full border border-border/50"
                          style={{ backgroundColor: group.colorHex }}
                        />
                      )}
                      <span className="truncate text-sm font-medium">{group.colorName}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {group.images.length} foto{group.images.length !== 1 ? 's' : ''} ·{' '}
                      {groupStock} un.
                    </span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
