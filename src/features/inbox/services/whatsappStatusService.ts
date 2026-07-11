import {
  whatsappStatusRepository,
  WhatsAppStatusMessage,
  WhatsAppPresenceInfo,
  ContactConnectionInfo,
} from '../data-access/whatsappStatusRepository';

const normalizeDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

const toTimestampNumber = (value?: number | string) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const buildPhoneNeedles = (phone: string) => {
  const digits = normalizeDigits(phone);
  if (!digits) return [];

  const values = new Set<string>([digits]);
  const withoutCountry = digits.startsWith('55') ? digits.slice(2) : digits;

  values.add(withoutCountry);

  if (withoutCountry.length >= 10) {
    const areaCode = withoutCountry.slice(0, 2);
    const localNumber = withoutCountry.slice(2);

    values.add(localNumber);

    if (localNumber.length === 9 && localNumber.startsWith('9')) {
      values.add(localNumber.slice(1));
      values.add(`${areaCode}${localNumber.slice(1)}`);
      values.add(`55${areaCode}${localNumber.slice(1)}`);
    }
  }

  return Array.from(values).filter((value) => value.length >= 8);
};

const matchesPhone = (candidate: string | null | undefined, phoneNeedles: string[]) => {
  const digits = normalizeDigits(candidate);
  if (!digits) return false;

  return phoneNeedles.some((needle) => digits.endsWith(needle) || needle.endsWith(digits));
};

const extractStatusRecords = (data: unknown): WhatsAppStatusMessage[] => {
  if (Array.isArray(data)) {
    return data as WhatsAppStatusMessage[];
  }

  if (data && typeof data === 'object') {
    const maybeMessages = (data as { messages?: { records?: unknown[] } }).messages;
    if (Array.isArray(maybeMessages?.records)) {
      return maybeMessages.records as WhatsAppStatusMessage[];
    }
  }

  return [];
};

export const whatsappStatusService = {
  async getConnectionInfo(contactPhone: string): Promise<ContactConnectionInfo> {
    const cleanPhone = normalizeDigits(contactPhone);

    let { data: contact } = await whatsappStatusRepository.getContact(contactPhone);

    if (!contact && cleanPhone && cleanPhone !== contactPhone) {
      const { data: fallback } = await whatsappStatusRepository.getContact(cleanPhone);
      contact = fallback;
    }

    let connectionId = contact?.whatsapp_connection_id;

    if (!connectionId) {
      const { data: connection } = await whatsappStatusRepository.getConnectedWhatsAppConnection();
      connectionId = connection?.id;
    }

    if (!connectionId) {
      return {
        contactName: contact?.name ?? null,
        instanceName: null,
      };
    }

    const { data: connection } = await whatsappStatusRepository.getWhatsAppConnection(connectionId);

    return {
      contactName: contact?.name ?? null,
      instanceName: connection?.instance_id ?? null,
    };
  },

  async fetchStatusData(
    phone: string
  ): Promise<{ statusMessages: WhatsAppStatusMessage[]; presence: WhatsAppPresenceInfo }> {
    const { instanceName, contactName } = await this.getConnectionInfo(phone);

    if (!instanceName) {
      throw new Error('Sem conexão WhatsApp disponível');
    }

    const [statusResult, _presenceResult] = await Promise.allSettled([
      whatsappStatusRepository.findStatusMessages(instanceName),
      whatsappStatusRepository.sendChatPresence(instanceName, phone),
    ]);

    let statusMessages: WhatsAppStatusMessage[] = [];
    if (statusResult.status === 'fulfilled') {
      const allStatuses = extractStatusRecords(statusResult.value.data);
      const phoneNeedles = buildPhoneNeedles(phone);
      const normalizedContactName = contactName?.trim().toLowerCase() ?? null;

      statusMessages = allStatuses
        .filter((status) => {
          const key = status.key ?? {
            remoteJid: status.remoteJid,
            fromMe: status.fromMe,
            id: status.id,
          };

          const isFromMe = status.fromMe ?? key.fromMe ?? false;
          if (isFromMe) return false;

          const candidateFields = [
            status.remoteJid,
            status.remoteJidAlt,
            status.participant,
            key.remoteJid,
            key.remoteJidAlt,
            key.participant,
            status.pushName,
          ];

          const phoneMatch = candidateFields.some((value) => matchesPhone(value, phoneNeedles));
          const nameMatch = Boolean(
            normalizedContactName &&
            typeof status.pushName === 'string' &&
            status.pushName.trim().toLowerCase() === normalizedContactName
          );

          return phoneMatch || nameMatch;
        })
        .sort(
          (left, right) =>
            toTimestampNumber(right.messageTimestamp) - toTimestampNumber(left.messageTimestamp)
        );
    }

    const presence: WhatsAppPresenceInfo = {
      isOnline: false,
      lastSeen: null,
      loading: false,
    };

    return { statusMessages, presence };
  },
};
