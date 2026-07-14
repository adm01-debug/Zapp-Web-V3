import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Image } from 'lucide-react';
import { dbFrom } from '@/integrations/datasource/db';

interface SharedMediaAccordionItemProps {
  contactId: string;
  onOpen: () => void;
}

export function SharedMediaAccordionItem({ contactId, onOpen }: SharedMediaAccordionItemProps) {
  const queryClient = useQueryClient();
  const itemRef = useRef<HTMLDivElement>(null);
  const prefetchedRef = useRef(false);

  const { data: count, isLoading } = useQuery({
    queryKey: ['shared-media-count', contactId],
    queryFn: async () => {
      const { count, error } = await dbFrom('messages')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .not('media_url', 'is', null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });

  useEffect(() => {
    prefetchedRef.current = false;
  }, [contactId]);

  // Prefetch first page on accordion open so the gallery opens instantly.
  useEffect(() => {
    const el = itemRef.current;
    if (!el || !contactId) return;

    const PAGE_SIZE = 24;
    const prefetchFirstPage = () => {
      if (prefetchedRef.current) return;
      prefetchedRef.current = true;
      queryClient.prefetchQuery({
        queryKey: ['media-gallery-preview', contactId, PAGE_SIZE],
        queryFn: async () => {
          const { data, error } = await dbFrom('messages')
            .select('id, media_url, message_type, content, created_at')
            .eq('contact_id', contactId)
            .not('media_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);
          if (error) throw error;
          return data || [];
        },
        staleTime: 30_000,
      });
    };

    if (el.getAttribute('data-state') === 'open') prefetchFirstPage();
    const obs = new MutationObserver(() => {
      if (el.getAttribute('data-state') === 'open') prefetchFirstPage();
    });
    obs.observe(el, { attributes: true, attributeFilter: ['data-state'] });
    return () => obs.disconnect();
  }, [contactId, queryClient]);

  const label = isLoading
    ? '…'
    : count === 0
      ? 'vazio'
      : `${count} ${count === 1 ? 'arquivo' : 'arquivos'}`;

  return (
    <AccordionItem ref={itemRef} value="media" className="border-border/10">
      <AccordionTrigger className="bg-background px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-background/5 hover:no-underline dark:bg-background">
        <div className="flex w-full items-center justify-between gap-2 pr-2">
          <div className="flex items-center gap-2">
            <Image className="h-3.5 w-3.5" />
            Mídia Compartilhada
          </div>
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-[10px] font-medium normal-case tracking-normal"
            aria-label={`${count ?? 0} arquivos compartilhados`}
          >
            {label}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={onOpen}
          disabled={count === 0}
        >
          <Image className="h-3.5 w-3.5" />
          {count && count > 0 ? `Abrir galeria (${count})` : 'Sem mídias compartilhadas'}
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
}
