import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { sections, totalFeatures } from './featuresSectionsData';

export function SystemFeaturesView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const toggleSection = (id: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedSections(new Set(sections.map((s) => s.id)));
  const collapseAll = () => setExpandedSections(new Set());

  const filteredSections = searchTerm
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.items.some((i) => i.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : sections;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
              📋 Funcionalidades do Sistema
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold text-primary">{totalFeatures}+</span> funcionalidades
              em <span className="font-semibold text-primary">34</span> seções •{' '}
              <Badge variant="default" className="text-xs">
                100% Implementado
              </Badge>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={expandAll}
              className="text-xs text-primary hover:underline"
            >
              Expandir tudo
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              type="button"
              onClick={collapseAll}
              className="text-xs text-primary hover:underline"
            >
              Recolher tudo
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar funcionalidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="grid gap-3 p-6">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections.has(section.id) || !!searchTerm;
            const filteredItems = searchTerm
              ? section.items.filter((i) => i.toLowerCase().includes(searchTerm.toLowerCase()))
              : section.items;

            return (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: section.id * 0.02 }}
              >
                <Card
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  className="cursor-pointer border-border/50 transition-shadow hover:shadow-md"
                  onClick={() => !searchTerm && toggleSection(section.id)}
                  onKeyDown={(e) => e.key === 'Enter' && !searchTerm && toggleSection(section.id)}
                >
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg bg-muted p-1.5 ${section.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="font-semibold text-foreground">
                          {section.id}. {section.title}
                        </span>
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {section.items.length}
                        </Badge>
                      </div>
                      {!searchTerm &&
                        (isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ))}
                    </CardTitle>
                  </CardHeader>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CardContent className="px-4 pb-4 pt-0">
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {filteredItems.map((item, idx) => (
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -5 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.01 }}
                                className="flex items-start gap-2 rounded-md px-2 py-1 text-sm text-foreground/80 transition-colors hover:bg-muted/50"
                              >
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                                <span>{item}</span>
                              </motion.div>
                            ))}
                          </div>
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
