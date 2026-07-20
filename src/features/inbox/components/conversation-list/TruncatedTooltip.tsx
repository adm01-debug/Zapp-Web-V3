import { useRef, useState, useEffect, useCallback, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Truncated Tooltip component for the conversation list section. */
export function TruncatedTooltip({
  fullText,
  children,
  className,
  side = 'top',
}: {
  fullText: string;
  children: (ref: React.RefObject<HTMLSpanElement>) => ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useEffect(() => {
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [check, fullText]);

  if (!isTruncated) return <>{children(ref)}</>;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children(ref)}</TooltipTrigger>
      <TooltipContent side={side} className={cn('max-w-xs text-xs', className)}>
        {fullText}
      </TooltipContent>
    </Tooltip>
  );
}
