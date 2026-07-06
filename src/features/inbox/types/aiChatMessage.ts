/**
 * Canonical ChatMessage for inbox AI tools (Wave 4).
 * Consolidates 4 structurally identical local interfaces:
 * ObjectionDetector, UniversityHelp (components + hooks).
 */
export interface ChatMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  created_at?: string;
}
