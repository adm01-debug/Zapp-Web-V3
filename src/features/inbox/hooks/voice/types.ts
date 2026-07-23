/** Hook: Voice Agent Action. */
export interface VoiceAgentAction {
  action: "search" | "filter" | "navigate" | "sort" | "clear" | "answer";
  response: string;
  data?: {
    query?: string;
    route?: string;
    sortBy?: string;
    filters?: {
      sentiment?: string;
      assigned?: boolean;
      unread?: boolean;
      contactType?: string;
      category?: string;
      status?: string;
    };
  };
}

/** Hook: Voice Agent Phase. */
export type VoiceAgentPhase = "idle" | "booting" | "listening" | "processing" | "speaking" | "error";

/** Hook: Use Voice Agent Options. */
export interface UseVoiceAgentOptions {
  onAction?: (action: VoiceAgentAction) => void;
  onError?: (error: string) => void;
}

/** Hook: Use Voice Agent Return. */
export interface UseVoiceAgentReturn {
  phase: VoiceAgentPhase;
  partialTranscript: string;
  finalTranscript: string;
  agentResponse: string;
  error: string;
  startListening: () => Promise<void>;
  stopListening: () => void;
  stopSpeaking: () => void;
  reset: () => void;
}
