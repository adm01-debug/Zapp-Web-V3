import { useReducer, useCallback } from 'react';

/**
 * Hook: Dialog Key.
 *
 * Auditoria (etapas 53–54 do plano ChatPanel, 2026-08-21):
 * - `globalSearch` está VIVO — aberto por Ctrl+K (useInputHandlers) e
 *   renderizado pelo ChatDialogs (não confundir com o globalSearchOpen do
 *   useRealtimeInbox, que é outro estado fora do painel).
 * - `templatesWithVars` e `realtimeTranscription` NÃO têm nenhum
 *   openDialog(...) no código — dead keys de abertura; o ChatDialogs mantém
 *   os componentes lazy prontos. Religar ou remover é decisão de produto
 *   (registrada no PR do plano); não remover as chaves sem remover os blocos.
 */
export type DialogKey =
  | 'quickReplies'
  | 'slashCommands'
  | 'transferDialog'
  | 'scheduleDialog'
  | 'callDialog'
  | 'globalSearch'
  | 'chatSearch'
  | 'interactiveBuilder'
  | 'forwardDialog'
  | 'locationPicker'
  | 'aiAssistant'
  | 'catalogDirect'
  | 'whisper'
  | 'templatesWithVars'
  | 'realtimeTranscription'
  | 'closeDialog'
  | 'visualValidation';

/** Hook: Dialog State. */
export type DialogState = Record<DialogKey, boolean>;

type DialogAction =
  | { type: 'TOGGLE'; key: DialogKey }
  | { type: 'OPEN'; key: DialogKey }
  | { type: 'CLOSE'; key: DialogKey }
  | { type: 'RESET'; keys: DialogKey[] }
  | { type: 'RESET_ALL' };

const initialDialogState: DialogState = {
  quickReplies: false,
  slashCommands: false,
  transferDialog: false,
  scheduleDialog: false,
  callDialog: false,
  globalSearch: false,
  chatSearch: false,
  interactiveBuilder: false,
  forwardDialog: false,
  locationPicker: false,
  aiAssistant: false,
  catalogDirect: false,
  whisper: false,
  templatesWithVars: false,
  realtimeTranscription: false,
  closeDialog: false,
  visualValidation: false,
};

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'TOGGLE':
      return { ...state, [action.key]: !state[action.key] };
    case 'OPEN':
      return state[action.key] ? state : { ...state, [action.key]: true };
    case 'CLOSE':
      return state[action.key] ? { ...state, [action.key]: false } : state;
    case 'RESET': {
      const next = { ...state };
      let changed = false;
      for (const k of action.keys) {
        if (next[k]) {
          next[k] = false;
          changed = true;
        }
      }
      return changed ? next : state;
    }
    case 'RESET_ALL': {
      for (const k in state) {
        if (state[k as DialogKey]) return initialDialogState;
      }
      return state;
    }
    default:
      return state;
  }
}

/** Hook: use Chat Dialogs. */
export function useChatDialogs() {
  const [state, dispatch] = useReducer(dialogReducer, initialDialogState);

  const openDialog = useCallback((key: DialogKey) => dispatch({ type: 'OPEN', key }), []);
  const closeDialog = useCallback((key: DialogKey) => dispatch({ type: 'CLOSE', key }), []);
  const toggleDialog = useCallback((key: DialogKey) => dispatch({ type: 'TOGGLE', key }), []);
  const resetDialogs = useCallback((keys: DialogKey[]) => dispatch({ type: 'RESET', keys }), []);
  const resetAllDialogs = useCallback(() => dispatch({ type: 'RESET_ALL' }), []);

  return {
    dialogs: state,
    openDialog,
    closeDialog,
    toggleDialog,
    resetDialogs,
    resetAllDialogs,
  };
}
