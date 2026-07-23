/** Ping Row. */
export interface PingRow {
  kind: string;
  meta: Record<string, unknown>;
  created_at: string;
}

/** Verify Result. */
export interface VerifyResult {
  verifyTokenConfigured: boolean;
  webhookUrl: string;
  handshake: {
    status: 'pass' | 'fail' | 'skip';
    httpStatus?: number;
    echoMatches?: boolean;
    durationMs?: number;
    error?: string;
  };
  delivery: {
    status: 'pass' | 'warn';
    lastEventAt: string | null;
    lastHandshakeAt: string | null;
    counts24h: {
      handshake: number;
      event: number;
      invalid_signature: number;
      invalid_token: number;
    };
    message: string;
    recent: PingRow[];
  };
  checkedAt: string;
}

/** Secret Status. */
export interface SecretStatus {
  name: string;
  configured: boolean;
  length: number;
}

/** SECRET_DOCS. */
export const SECRET_DOCS: Record<string, { label: string; description: string; where: string }> = {
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: {
    label: 'Phone Number ID',
    description: 'ID do número do WhatsApp Business no Meta.',
    where: 'Meta for Developers → seu app → WhatsApp → API Setup → Phone number ID',
  },
  WHATSAPP_CLOUD_ACCESS_TOKEN: {
    label: 'Access Token',
    description: 'Token permanente do System User com permissão whatsapp_business_messaging.',
    where: 'Business Manager → Configurações de Negócios → Usuários do Sistema → Gerar token',
  },
  WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: {
    label: 'Webhook Verify Token',
    description: 'String secreta que a Meta usa no handshake (GET /webhook).',
    where: 'Você define livremente (ex.: UUID). Cole o mesmo valor no painel do app Meta.',
  },
  WHATSAPP_CLOUD_APP_SECRET: {
    label: 'App Secret',
    description: 'Chave secreta do app — usada para validar X-Hub-Signature-256 nos webhooks.',
    where: 'Meta for Developers → seu app → Configurações → Básico → Chave secreta',
  },
};
