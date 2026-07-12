import { useState, useEffect } from 'react';
import { motion } from '@/components/ui/motion';
import { CheckCircle2, Circle, Layout, Type, Move, Palette, Save, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useThemeAudit } from '@/hooks/useThemeAudit';

interface ValidationItem {
  id: string;
  category: 'font' | 'spacing' | 'alignment' | 'style';
  label: string;
  description: string;
  isApproved: boolean;
  autoValidate?: boolean;
}

const DEFAULT_ITEMS: ValidationItem[] = [
  { id: '', category: 'font', label: 'Fonte Inter', description: 'Garantir que a fonte Inter está carregada e aplicada em toda a tela.', isApproved: false, autoValidate: true },
  { id: 'color-primary', category: 'style', label: 'Cor Primária', description: 'Variáveis HSL da cor primária devem estar carregadas e válidas.', isApproved: false, autoValidate: true },
  { id: 'oled-pure-black', category: 'style', label: 'Preto OLED Puro', description: 'Background deve ser 0 0% 0% no modo dark.', isApproved: false, autoValidate: true },
  { id: 'font-sizes', category: 'font', label: 'Tamanhos de Fonte', description: 'Nomes 15px, timestamps 11px, mensagens 15px.', isApproved: true },
  { id: 'spacing-inbox', category: 'spacing', label: 'Espaçamento Inbox', description: 'Margens de 12px (p-3) entre itens da lista e 14px de gap no avatar.', isApproved: false },
  { id: 'style-selected', category: 'style', label: 'Estado Selecionado', description: 'Fundo sutil e borda lateral no item ativo.', isApproved: false },
];

export function VisualValidationChecklist({ onClose }: { onClose: () => void }) {
  const audit = useThemeAudit();
  const [items, setItems] = useState<ValidationItem[]>(() => {
    const saved = localStorage.getItem('visual-validation-checklist');
    return saved ? JSON.parse(saved) : DEFAULT_ITEMS;
  });

  useEffect(() => {
    setItems(prev => prev.map(item => {
      if (item.id === '') return { ...item, isApproved: audit.fontPass };
      if (item.id === 'oled-pure-black') return { ...item, isApproved: audit.oledPass };
      if (item.id === 'color-primary') return { ...item, isApproved: audit.colorPass };
      return item;
    }));
  }, [audit.fontPass, audit.oledPass, audit.colorPass]);

  useEffect(() => {
    localStorage.setItem('visual-validation-checklist', JSON.stringify(items));
  }, [items]);

  const toggleItem = (id: string) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, isApproved: !item.isApproved } : item
    ));
  };

  const approvedCount = items.filter(i => i.isApproved).length;
  const progress = Math.round((approvedCount / items.length) * 100);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'font': return <Type className="w-4 h-4" />;
      case 'spacing': return <Move className="w-4 h-4" />;
      case 'alignment': return <Layout className="w-4 h-4" />;
      case 'palette': return <Palette className="w-4 h-4" />;
      default: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="fixed right-0 top-0 bottom-0 w-[380px] bg-background/95 backdrop-blur-xl border-l border-border z-[45] shadow-2xl flex flex-col "
    >
      <div className="p-6 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold tracking-tight">Validação Visual</h2>
          </div>
          <Button aria-label="Fechar checklist de validação" variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Progresso da Meta 10/10</span>
            <span className="text-sm font-black text-primary">{approvedCount}/{items.length} ({progress}%)</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <motion.div 
              initial={false}
              animate={{ width: `${progress}%` }}
              className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {audit.violations.length > 0 && (
          <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 mb-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Erros Detectados</span>
            </div>
            <ul className="space-y-1">
              {audit.violations.map((v, i) => (
                <li key={`${v}-${i}`} className="text-[11px] text-destructive/80 leading-tight">• {v}</li>
              ))}
            </ul>
          </div>
        )}

        {items.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => toggleItem(item.id)}
            className={cn(
              "p-4 rounded-2xl border cursor-pointer transition-all duration-300 group",
              item.isApproved 
                ? "bg-primary/5 border-primary/20" 
                : "bg-card border-border/50 hover:border-primary/30"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "mt-0.5 shrink-0 transition-colors",
                item.isApproved ? "text-primary" : "text-muted-foreground/30 group-hover:text-primary/50"
              )}>
                {item.isApproved ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted flex items-center gap-1",
                    item.isApproved ? "text-primary bg-primary/10" : "text-muted-foreground"
                  )}>
                    {getCategoryIcon(item.category)}
                    {item.category}
                  </span>
                  <span className={cn(
                    "text-[14px] font-bold tracking-tight block truncate",
                    item.isApproved ? "text-primary" : "text-foreground"
                  )}>
                    {item.label}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground leading-snug">
                  {item.description}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="p-6 border-t border-border/50 bg-muted/10">
        <Button 
          className="w-full gap-2 rounded-xl h-11 font-bold"
          onClick={() => {
            localStorage.setItem('visual-validation-checklist', JSON.stringify(items));
            toast.success("Checkpoint salvo! Rumo ao 10/10.", {
              description: `Progresso atual: ${approvedCount}/${items.length} itens validados.`
            });
            onClose();
          }}
        >
          <Save className="w-4 h-4" />
          Salvar Checkpoint
        </Button>
        <p className="text-[10px] text-center text-muted-foreground mt-3 italic">
          Meta: Perfeição Visual e UX Consistente
        </p>
      </div>
    </motion.div>
  );
}