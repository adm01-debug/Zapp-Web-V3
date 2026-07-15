// @ts-nocheck
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, TrendingUp, Star, Filter } from 'lucide-react';
import type { MediaItem, MediaType } from '@/hooks/media-library/useMediaLibrary';

export function StatsCards({ items, type: _type }: { items: MediaItem[]; type: MediaType }) {
  const total = items.length;
  const totalUses = items.reduce((s, i) => s + (i.use_count || 0), 0);
  const favorites = items.filter((i) => i.is_favorite).length;
  const categories = [...new Set(items.map((i) => i.category))].length;
  const topUsed = [...items].sort((a, b) => (b.use_count || 0) - (a.use_count || 0)).slice(0, 3);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card className="border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <div>
              <p className="text-lg font-bold text-foreground">{total}</p>
              <p className="text-[10px] text-muted-foreground">Total de itens</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <div>
              <p className="text-lg font-bold text-foreground">{totalUses}</p>
              <p className="text-[10px] text-muted-foreground">Usos totais</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-warning" />
            <div>
              <p className="text-lg font-bold text-foreground">{favorites}</p>
              <p className="text-[10px] text-muted-foreground">Favoritos</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-info" />
            <div>
              <p className="text-lg font-bold text-foreground">{categories}</p>
              <p className="text-[10px] text-muted-foreground">Categorias</p>
            </div>
          </div>
        </CardContent>
      </Card>
      {topUsed.length > 0 && (
        <Card className="col-span-2 border-border/50 md:col-span-4">
          <CardContent className="p-3">
            <p className="mb-2 text-[10px] font-medium text-muted-foreground">🏆 Mais usados</p>
            <div className="flex gap-3">
              {topUsed.map((item, i) => (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="max-w-[120px] truncate font-medium">
                    {item.name || 'Sem nome'}
                  </span>
                  <Badge variant="secondary" className="px-1 text-[9px]">
                    {item.use_count}x
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
