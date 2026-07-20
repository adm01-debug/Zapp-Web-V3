import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { useIsMobile } from '@/hooks/use-mobile';

function buildStorageKey(profileId?: string, departmentId?: string | null): string {
  const workspacePart = departmentId ? `:${departmentId}` : '';
  return profileId ? `zapp:sidebarWidth:${profileId}${workspacePart}` : 'zapp:sidebarWidth';
}

/** use Inbox Sidebar Resize component. */
export function useInboxSidebarResize() {
  const isMobile = useIsMobile();
  const { profile } = useAuth();

  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const key = buildStorageKey(profile?.id, profile?.department_id);
    const saved = localStorage.getItem(key);
    const initialWidth = saved ? parseInt(saved, 10) : 391;
    const maxWidth =
      typeof window !== 'undefined' ? Math.min(600, window.innerWidth - (isMobile ? 0 : 60)) : 600;
    return Math.min(initialWidth, maxWidth);
  });

  const isResizing = useRef(false);

  const saveWidth = useCallback(
    (width: number) => {
      const key = buildStorageKey(profile?.id, profile?.department_id);
      localStorage.setItem(key, width.toString());
    },
    [profile?.id, profile?.department_id]
  );

  const handleMouseMoveRef = useRef<(e: MouseEvent) => void>(() => {});
  const handleTouchMoveRef = useRef<(e: TouchEvent) => void>(() => {});
  const stopResizingRef = useRef<() => void>(() => {});

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMoveRef.current);
    document.removeEventListener('mouseup', stopResizingRef.current);
    document.removeEventListener('touchmove', handleTouchMoveRef.current);
    document.removeEventListener('touchend', stopResizingRef.current);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const handleResize = useCallback(
    (clientX: number) => {
      const minWidth = 280;
      const maxWidth = Math.min(600, window.innerWidth - (isMobile ? 0 : 60));
      let newWidth = clientX;
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setSidebarWidth(newWidth);
      saveWidth(newWidth);
    },
    [saveWidth, isMobile]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing.current) return;
      handleResize(e.clientX);
    },
    [handleResize]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isResizing.current) return;
      handleResize(e.touches[0].clientX);
    },
    [handleResize]
  );

  useEffect(() => {
    handleMouseMoveRef.current = handleMouseMove;
    handleTouchMoveRef.current = handleTouchMove;
    stopResizingRef.current = stopResizing;
  }, [handleMouseMove, handleTouchMove, stopResizing]);

  useEffect(() => {
    if (profile?.id) {
      const key = buildStorageKey(profile.id, profile?.department_id);
      const saved = localStorage.getItem(key);
      if (saved) setSidebarWidth(parseInt(saved, 10));
    }
  }, [profile?.id, profile?.department_id]);

  useEffect(() => {
    const onWindowResize = () => {
      setWindowWidth(window.innerWidth);
      setSidebarWidth((prev) => {
        const maxWidth = Math.min(600, window.innerWidth - (isMobile ? 0 : 60));
        if (prev > maxWidth) return maxWidth;
        return prev;
      });
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, [isMobile]);

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMoveRef.current);
    document.addEventListener('mouseup', stopResizingRef.current);
    document.addEventListener('touchmove', handleTouchMoveRef.current, { passive: false });
    document.addEventListener('touchend', stopResizingRef.current);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const resetWidth = useCallback(() => {
    setSidebarWidth(391);
    saveWidth(391);
  }, [saveWidth]);

  return { sidebarWidth, windowWidth, startResizing, resetWidth };
}
