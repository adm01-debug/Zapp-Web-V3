import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trophy, Trash2, FlaskConical } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCampaignABTesting, type ABVariant } from '@/hooks/campaigns/useCampaignABTesting';

interface CampaignABTestingProps {
  campaignId: string;
}

/** Campaign ABTesting component for the campaigns section. */
export function CampaignABTesting({ campaignId }: CampaignABTestingProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const { variants, loading, addVariant, deleteVariant, declareWinner } =
    useCampaignABTesting(campaignId);

  const handleAddVariant = async () => {
    const ok = await addVariant(newName, newContent);
    if (ok) {
      setDialogOpen(false);
      setNewName('');
      setNewContent('');
    }
  };

  const getConversionRate = (v: ABVariant) => {
    if (v.send_count === 0) return 0;
    return Math.round((v.response_count / v.send_count) * 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Teste A/B</span>
          <Badge variant="outline" className="text-[10px]">
            {variants.length} variantes
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="mr-1 h-3 w-3" /> Variante
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/20" />
          ))}
        </div>
      ) : variants.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma variante. Crie pelo menos 2 para testar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {variants.map((v, idx) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className={`${v.is_winner ? 'border-success/50 bg-success/5' : ''}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={v.is_winner ? 'default' : 'outline'} className="text-xs">
                        {v.is_winner && <Trophy className="mr-1 h-3 w-3" />}
                        Variante {v.variant_name}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      {!v.is_winner && variants.length >= 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={() => declareWinner(v.id)}
                        >
                          <Trophy className="mr-1 h-3 w-3" /> Vencedor
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label="Excluir variante"
                        onClick={() => deleteVariant(v.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="line-clamp-3 rounded-lg bg-muted/20 p-2 text-xs">
                    {v.message_content}
                  </p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-sm font-bold">{v.send_count}</p>
                      <p className="text-[9px] text-muted-foreground">Enviadas</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold">{v.delivered_count}</p>
                      <p className="text-[9px] text-muted-foreground">Entregues</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold">{v.read_count}</p>
                      <p className="text-[9px] text-muted-foreground">Lidas</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-primary">{getConversionRate(v)}%</p>
                      <p className="text-[9px] text-muted-foreground">Conversão</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Variante A/B</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Nome (ex: ${String.fromCharCode(65 + variants.length)})`}
              className="h-8 text-sm"
            />
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Conteúdo da mensagem..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddVariant} disabled={!newContent.trim()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
