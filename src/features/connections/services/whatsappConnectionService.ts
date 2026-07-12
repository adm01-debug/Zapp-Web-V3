import { whatsappConnectionRepository } from '../data-access/whatsappConnectionRepository';
import { supabase } from '@/integrations/supabase/client';

import { getLogger } from '@/lib/logger';

const log = getLogger('whatsappConnectionService');

export const whatsappConnectionService = {
  generateInstanceName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30) +
      '_' + Date.now().toString().slice(-6);
  },

  detectQrTtlMs(result: unknown) {
    const QR_TTL_DEFAULT_MS = 60_000;
    const QR_TTL_MIN_MS = 15_000;
    const QR_TTL_MAX_MS = 300_000;

    if (!result || typeof result !== 'object') return { ttlMs: QR_TTL_DEFAULT_MS, source: 'default' };
    const r = result as Record<string, unknown> & { qrcode?: Record<string, unknown> }; // ignore-audit: narrows Supabase query result to local interface
    const candidates = [
      r.count,
      r.qrcode?.count,
      r.ttl,
      r.qrcode?.ttl,
      r.expires_in,
    ];
    for (const raw of candidates) {
      const seconds = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
      if (Number.isFinite(seconds) && seconds > 0) {
        const ms = seconds * 1000;
        const clamped = Math.min(QR_TTL_MAX_MS, Math.max(QR_TTL_MIN_MS, ms));
        return { ttlMs: clamped, source: clamped !== ms ? 'clamped' : 'detected' };
      }
    }
    return { ttlMs: QR_TTL_DEFAULT_MS, source: 'default' };
  },

  async logQrAttempt(connId: string, instanceId: string, name: string, status: string = 'pending') {
    try {
      log.debug(`Logging QR attempt for ${instanceId} (${status})`);
      const { data: userData } = await supabase.auth.getUser();
      const result = await whatsappConnectionRepository.logQrAttempt({
        connection_id: connId,
        instance_id: instanceId,
        connection_name: name,
        status,
        requested_by: userData.user?.id ?? null,
      });
      if (result.error) {
        log.error('Error logging QR attempt:', result.error);
      }
      return result;
    } catch (err) {
      log.error('Failed to log QR attempt:', err);
      throw err;
    }
  },

  async requestQrCode(instanceId: string) {
    if (!instanceId) throw new Error('ID da instância é obrigatório');
    
    try {
      log.info(`Requesting QR code for instance ${instanceId}`);
      const { data, error } = await whatsappConnectionRepository.callEvolutionApi({
        action: 'connect',
        instanceName: instanceId
      });

      if (error) {
        log.error(`API error requesting QR for ${instanceId}:`, error);
        throw new Error(error.message || 'Erro ao gerar QR Code na API');
      }
      
      if (data?.error === true) {
        log.error(`Evolution API returned error for ${instanceId}:`, data);
        throw new Error(data.message || 'A API do Evolution retornou um erro ao gerar o QR Code');
      }
      
      log.info(`QR code successfully received for ${instanceId}`);
      return data;
    } catch (err) {
      log.error(`Critical failure requesting QR for ${instanceId}:`, err);
      throw err;
    }
  }
};
