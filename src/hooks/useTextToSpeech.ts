import { useState, useCallback } from 'react';

export function useTextToSpeech(text?: string) {
  return useTextToSpeechManagement(text ?? '');
}
