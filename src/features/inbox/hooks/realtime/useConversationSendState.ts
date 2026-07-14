import { useState, useEffect } from 'react';
import { subscribeAllSendStatus, getSendStatus } from './sendStatusBus';
import type { ConversationWithMessages } from './types';

export type ConversationSendState = 'idle' | 'retrying' | 'failed';

export function useConversationSendState(conversations: ConversationWithMessages[]) {
  const [sendStateTick, setSendStateTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeAllSendStatus(() => setSendStateTick((t) => t + 1));
    return unsub;
  }, []);

  const conversationSendState: Record<string, ConversationSendState> = {};
  for (const c of conversations) {
    let state: ConversationSendState = 'idle';
    const outbound = c.messages.filter((m) => m.sender === 'agent');
    const anyRetrying = outbound.some((m) => {
      const bus = getSendStatus(m.id);
      return bus?.status === 'retrying';
    });
    if (anyRetrying) {
      state = 'retrying';
    } else {
      const lastOutbound = outbound[outbound.length - 1];
      if (lastOutbound) {
        const bus = getSendStatus(lastOutbound.id);
        const effective = bus?.status ?? lastOutbound.status;
        if (
          effective === 'failed' ||
          effective === 'failed_auth' ||
          effective === 'failed_retries'
        ) {
          state = 'failed';
        }
      }
    }
    conversationSendState[c.contact.id] = state;
  }
  void sendStateTick;

  return { conversationSendState };
}
