/**
 * Connections Service
 *
 * Business logic layer for connections.
 * Validates data and applies business rules before calling repository.
 */

import { connectionsRepository, type WhatsAppConnection } from './connectionsRepository';
import type { ListResponse, QueryParams } from '@/services/api/types';

export const connectionsService = {
  // WhatsApp Connections
  listWhatsAppConnections: async (filters?: Partial<WhatsAppConnection> & QueryParams): Promise<ListResponse<WhatsAppConnection>> => {
    return connectionsRepository.listWhatsAppConnections(filters);
  },

  getWhatsAppConnection: async (id: string): Promise<WhatsAppConnection | null> => {
    if (!id) throw new Error('Connection ID is required');
    return connectionsRepository.getWhatsAppConnection(id);
  },

  searchWhatsAppConnections: async (query: string): Promise<WhatsAppConnection[]> => {
    if (!query || query.length < 2) return [];
    return connectionsRepository.searchWhatsAppConnections(query.toLowerCase());
  },

  createWhatsAppConnection: async (data: Partial<WhatsAppConnection>): Promise<WhatsAppConnection> => {
    if (!data.instance_name || data.instance_name.trim().length === 0) {
      throw new Error('Instance name is required');
    }
    if (!data.account_id) {
      throw new Error('Account ID is required');
    }

    return connectionsRepository.createWhatsAppConnection({
      ...data,
      instance_name: data.instance_name.trim(),
      connection_status: 'disconnected',
    });
  },

  updateWhatsAppConnection: async (id: string, updates: Partial<WhatsAppConnection>): Promise<WhatsAppConnection> => {
    if (!id) throw new Error('Connection ID is required');

    if (updates.instance_name && updates.instance_name.trim().length === 0) {
      throw new Error('Instance name cannot be empty');
    }

    return connectionsRepository.updateWhatsAppConnection(id, {
      ...updates,
      instance_name: updates.instance_name?.trim(),
    });
  },

  deleteWhatsAppConnection: async (id: string): Promise<{ id: string }> => {
    if (!id) throw new Error('Connection ID is required');
    return connectionsRepository.deleteWhatsAppConnection(id);
  },

  deleteWhatsAppConnectionsBulk: async (ids: string[]): Promise<number> => {
    if (!ids || ids.length === 0) throw new Error('No IDs provided');
    return connectionsRepository.deleteWhatsAppConnectionsBulk(ids);
  },

  // Connection status and health
  getConnectionStatus: async (id: string): Promise<string | null> => {
    if (!id) return null;
    const connection = await connectionsRepository.getWhatsAppConnection(id);
    return connection?.connection_status || null;
  },

  checkConnectionHealth: async (id: string) => {
    if (!id) throw new Error('Connection ID is required');
    return connectionsRepository.checkConnectionHealth(id);
  },

  // Real-time updates
  onConnectionChange: (callback: (connection: WhatsAppConnection) => void) => {
    return connectionsRepository.subscribeToConnectionChanges(callback);
  },
};
