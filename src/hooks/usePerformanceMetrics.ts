import { useEffect, useRef } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('PerformanceMetrics');

export function usePerformanceMetrics(componentName: string) {
  const lastRenderTime = useRef(performance.now());
  const renderCount = useRef(0);

  useEffect(() => {
    const now = performance.now();
    const duration = now - lastRenderTime.current;
    renderCount.current++;

    if (duration > 16.67) { // Missed a frame (60fps)
      log.warn(`[${componentName}] Long task detected: ${duration.toFixed(2)}ms (Render #${renderCount.current})`);
    }

    lastRenderTime.current = now;
  });

  useEffect(() => {
    // LCP
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        log.info(`[${componentName}] LCP: ${entry.startTime.toFixed(2)}ms`, entry);
      });
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // INP (Interaction to Next Paint)
    const inpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.duration > 0) {
          log.info(`[${componentName}] INP candidate: ${entry.duration.toFixed(2)}ms`, entry);
        }
      });
    });
    inpObserver.observe({ type: 'event-timing', buffered: true, durationThreshold: 40 } as PerformanceObserverInit & { durationThreshold: number });

    // Layout Shifts (CLS)
    const clsObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[];
      entries.forEach((entry) => {
        if (!entry.hadRecentInput) {
          log.warn(`[${componentName}] Layout Shift: ${entry.value?.toFixed(4)}`, entry);
        }
      });
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    return () => {
      lcpObserver.disconnect();
      inpObserver.disconnect();
      clsObserver.disconnect();
    };
  }, [componentName]);
}
