import { useState, useEffect } from 'react';
import { subscribeAllSendStatus, getSendStatus } from './sendStatusBus';
import type { ConversationWithMessages } from './types';

/** Aggregate send state for a conversation: idle when no outbound is in-flight, retrying if any message is being retried, failed if the last outbound hit a terminal error. */
export type ConversationSendState = 'idle' | 'retrying' | 'failed';

/** Subscribes to the send-status bus and derives a per-conversation send state map (idle/retrying/failed) from outbound message statuses. */
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
