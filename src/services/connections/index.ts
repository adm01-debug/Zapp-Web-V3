/**
 * Connections Service Index
 *
 * Centralized exports for connections service layer.
 * Components and hooks should import from here, not from individual files.
 */

// Repository
export { connectionsRepository, type WhatsAppConnection, type ChannelConnection, type Connection } from './connectionsRepository';

// Service
export { connectionsService } from './connectionsService';

// Query Hooks
export {
  useWhatsAppConnectionsList,
  useWhatsAppConnection,
  useSearchWhatsAppConnections,
  useConnectionHealth,
  useConnectionStatus,
  useInvalidateConnections,
} from './useConnectionsQueries';

// Mutation Hooks
export {
  useCreateWhatsAppConnection,
  useUpdateWhatsAppConnection,
  useDeleteWhatsAppConnection,
  useDeleteWhatsAppConnectionsBulk,
} from './useConnectionsMutations';
