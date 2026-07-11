// @ts-nocheck
import { useEffect, useRef, useCallback, useState } from 'react';
import { useConversationRealtime } from '../hooks/realtime/useConversationRealtime';
import { useInboxState } from '../hooks/useInboxState';
import { useInboxFilters } from '../hooks/useInboxFilters';
import { useContactsCache } from '../hooks/useContactsCache';
import { useConnectionHealth } from '@/hooks/monitoring/useConnectionHealth';
import { useRealtimeInbox } from '../hooks/useRealtimeInbox';
import { InboxView } from './InboxView';
import { getLogger } from '@/lib/logger';
import { useConversationSummarySync } from '../hooks/useConversationSummarySync';
import { useSLAAlerts } from '@/features/sla';
import type { Conversation } from '../types';

const log = getLogger('RealtimeInboxView');
