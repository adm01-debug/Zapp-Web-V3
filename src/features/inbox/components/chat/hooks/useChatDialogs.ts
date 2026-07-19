import { useReducer, useCallback } from 'react';

/** Hook: Dialog Key. */
export type DialogKey = 'quickReplies' | 'slashCommands' | 'transferDialog' | 'scheduleDialog' | 
  'callDialog' | 'globalSearch' | 'chatSearch' | 'interactiveBuilder' | 'forwardDialog' | 
  'locationPicker' | 'aiAssistant' | 'catalogDirect' | 'whisper' | 'templatesWithVars' | 
  'realtimeTranscription' | 'closeDialog' | 'visualValidation';

/** Hook: Dialog State. */
export type DialogState = Record<DialogKey, boolean>;

type DialogAction = 
  | { type: 'TOGGLE'; key: DialogKey }
  | { type: 'OPEN'; key: DialogKey }
  | { type: 'CLOSE'; key: DialogKey }
  | { type: 'RESET'; keys: DialogKey[] };

const initialDialogState: DialogState = {
  quickReplies: false, slashCommands: false, transferDialog: false, scheduleDialog: false,
  callDialog: false, globalSearch: false, chatSearch: false, interactiveBuilder: false,
  forwardDialog: false, locationPicker: false, aiAssistant: false, catalogDirect: false,
  whisper: false, templatesWithVars: false, realtimeTranscription: false, closeDialog: false,
  visualValidation: false,
};

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'TOGGLE': return { ...state, [action.key]: !state[action.key] };
    case 'OPEN': return state[action.key] ? state : { ...state, [action.key]: true };
    case 'CLOSE': return state[action.key] ? { ...state, [action.key]: false } : state;
    case 'RESET': {
      const next = { ...state };
      let changed = false;
      for (const k of action.keys) { if (next[k]) { next[k] = false; changed = true; } }
      return changed ? next : state;
    }
    default: return state;
  }
}

/** Hook: use Chat Dialogs. */
export function useChatDialogs() {
  const [state, dispatch] = useReducer(dialogReducer, initialDialogState);

  const openDialog = useCallback((key: DialogKey) => dispatch({ type: 'OPEN', key }), []);
  const closeDialog = useCallback((key: DialogKey) => dispatch({ type: 'CLOSE', key }), []);
  const toggleDialog = useCallback((key: DialogKey) => dispatch({ type: 'TOGGLE', key }), []);
  const resetDialogs = useCallback((keys: DialogKey[]) => dispatch({ type: 'RESET', keys }), []);

  return {
    dialogs: state,
    openDialog,
    closeDialog,
    toggleDialog,
    resetDialogs
  };
}
