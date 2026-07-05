import { useRef, useState, useCallback } from 'react';
import type { FileUploaderRef } from '../../FileUploader';

/**
 * Encapsulates drag & drop file upload state and handlers for the chat panel.
 */
export function useChatDragAndDrop(fileUploaderRef: React.RefObject<FileUploaderRef>) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDraggingOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0 && fileUploaderRef.current) {
        fileUploaderRef.current.handleExternalFiles(files);
      }
    },
    [fileUploaderRef],
  );

  return {
    isDraggingOver,
    dragHandlers: { onDragEnter: handleDragEnter, onDragLeave: handleDragLeave, onDragOver: handleDragOver, onDrop: handleDrop },
  };
}
