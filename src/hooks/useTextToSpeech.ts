import { useState, useCallback } from 'react';

/** Hook: use Text To Speech. */
export function useTextToSpeech(text?: string) {
  return useTextToSpeechManagement(text ?? '');
}
