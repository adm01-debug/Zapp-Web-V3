import type {
  ConversationContact,
  ConversationWithMessages,
  RealtimeMessage,
} from '../../../hooks/realtime/types';

/**
 * Mock fixtures used exclusively for local UI showcase / storybook-like previews
 * of the realtime inbox. They are only rendered when the developer opts-in via
 * `localStorage.setItem('mockConversations', '1')` in DEV mode.
 *
 * The fixtures MUST satisfy the real `ConversationWithMessages` contract — no
 * extended/partial mock type — so the virtualized lists don't need any special
 * casing to accept them.
 */

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000);
const hoursAgo = (h: number) => new Date(now - h * 60 * 60_000);
const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60_000);

const createMockMessage = (
  id: string,
  contactId: string,
  content: string,
  sender: 'contact' | 'agent',
  timestamp: Date
): RealtimeMessage => ({
  id,
  contact_id: contactId,
  agent_id: sender === 'agent' ? 'agent-1' : null,
  content,
  sender,
  message_type: 'text',
  media_url: null,
  is_read: true,
  status: 'read',
  status_updated_at: timestamp.toISOString(),
  created_at: timestamp.toISOString(),
  updated_at: timestamp.toISOString(),
  external_id: `ext-${id}`,
  whatsapp_connection_id: 'conn-1',
  transcription: null,
  transcription_status: null,
  is_deleted: false,
});

type ContactSeed = Pick<
  ConversationContact,
  'id' | 'name' | 'phone' | 'company' | 'job_title' | 'tags' | 'contact_type' | 'channel_type' | 'avatar_url' | 'ai_sentiment' | 'created_at' | 'updated_at'
>;

function buildContact(seed: ContactSeed): ConversationContact {
  return {
    id: seed.id,
    name: seed.name,
    surname: null,
    nickname: null,
    phone: seed.phone,
    email: null,
    avatar_url: seed.avatar_url,
    tags: seed.tags,
    company: seed.company,
    job_title: seed.job_title,
    assigned_to: null,
    queue_id: null,
    created_at: seed.created_at,
    updated_at: seed.updated_at,
    whatsapp_connection_id: null,
    contact_type: seed.contact_type,
    group_category: null,
    ai_sentiment: seed.ai_sentiment,
    channel_type: seed.channel_type,
    channel_connection_id: null,
  };
}

interface MockSeed {
  unreadCount: number;
  updatedAt: Date;
  contact: ContactSeed;
  message: { id: string; content: string; sender: 'contact' | 'agent' };
}

function buildConversation(seed: MockSeed): ConversationWithMessages {
  const contact = buildContact(seed.contact);
  const lastMessage = createMockMessage(
    seed.message.id,
    contact.id,
    seed.message.content,
    seed.message.sender,
    seed.updatedAt
  );
  return {
    contact,
    unreadCount: seed.unreadCount,
    lastMessage,
    messages: [lastMessage],
  };
}

export const MOCK_CONVERSATIONS: ConversationWithMessages[] = [
  {
    unreadCount: 7,
    updatedAt: minutesAgo(2),
    contact: {
      id: 'mock-contact-1',
      name: 'Maria Eduarda Souza Oliveira',
      company: 'Acme Corporation Ltda.',
      job_title: 'Diretora de Marketing',
      phone: '5511988887777',
      tags: ['vip', 'enterprise', 'renovação', 'q2-2026'],
      created_at: daysAgo(120).toISOString(),
      updated_at: minutesAgo(2).toISOString(),
      contact_type: 'whatsapp',
      channel_type: 'whatsapp',
      avatar_url: 'https://i.pravatar.cc/150?img=47',
      ai_sentiment: 'positive',
    },
    message: {
      id: 'm1',
      content: 'Bom dia! Recebi a proposta atualizada e gostaria de agendar uma call.',
      sender: 'contact',
    },
  },
  {
    unreadCount: 2,
    updatedAt: minutesAgo(15),
    contact: {
      id: 'mock-contact-2',
      name: 'João Silva',
      company: 'Tech Solutions',
      job_title: 'CTO',
      phone: '5511977776666',
      tags: ['lead'],
      created_at: daysAgo(30).toISOString(),
      updated_at: minutesAgo(15).toISOString(),
      contact_type: 'whatsapp',
      channel_type: 'whatsapp',
      avatar_url: 'https://i.pravatar.cc/150?img=11',
      ai_sentiment: 'neutral',
    },
    message: { id: 'm2', content: 'Perfeito, obrigado!', sender: 'contact' },
  },
  {
    unreadCount: 3,
    updatedAt: minutesAgo(45),
    contact: {
      id: 'mock-contact-3',
      name: 'Ana Carolina Ferreira',
      company: 'Studio Criativo',
      job_title: 'Designer Sênior',
      phone: '5511966665555',
      tags: ['suporte', 'bug-report'],
      created_at: daysAgo(15).toISOString(),
      updated_at: minutesAgo(45).toISOString(),
      contact_type: 'instagram',
      channel_type: 'instagram',
      avatar_url: 'https://i.pravatar.cc/150?img=20',
      ai_sentiment: 'negative',
    },
    message: { id: 'm3', content: 'Continua sem funcionar 😡', sender: 'contact' },
  },
  {
    unreadCount: 1,
    updatedAt: hoursAgo(2),
    contact: {
      id: 'mock-contact-4',
      name: 'Marcos Antonio Ribeiro',
      company: 'PromoGifts & Brindes',
      job_title: 'Gerente Comercial',
      phone: '5511955554444',
      tags: ['brindes', 'cotacao'],
      created_at: daysAgo(60).toISOString(),
      updated_at: hoursAgo(2).toISOString(),
      contact_type: 'email',
      channel_type: 'email',
      avatar_url: 'https://i.pravatar.cc/150?img=52',
      ai_sentiment: 'neutral',
    },
    message: {
      id: 'm4',
      content: 'Segue em anexo o briefing para os brindes corporativos.',
      sender: 'contact',
    },
  },
  {
    unreadCount: 12,
    updatedAt: minutesAgo(1),
    contact: {
      id: 'mock-contact-5',
      name: 'Roberto Carlos Pereira da Silva Neto',
      company: 'Multinacional Internacional Brasil S/A',
      job_title: 'CEO',
      phone: '5511944443333',
      tags: ['urgente', 'churn-risk', 'c-level'],
      created_at: daysAgo(200).toISOString(),
      updated_at: minutesAgo(1).toISOString(),
      contact_type: 'whatsapp',
      channel_type: 'whatsapp',
      avatar_url: 'https://i.pravatar.cc/150?img=33',
      ai_sentiment: 'negative',
    },
    message: {
      id: 'm5',
      content: 'Preciso de uma resposta URGENTE sobre o cancelamento do contrato.',
      sender: 'contact',
    },
  },
  {
    unreadCount: 1,
    updatedAt: hoursAgo(8),
    contact: {
      id: 'mock-contact-6',
      name: 'Carla Mendes Azevedo',
      company: 'Sicoob',
      job_title: 'Coordenadora de Parcerias',
      phone: '5511933332222',
      tags: ['parceiro'],
      created_at: daysAgo(90).toISOString(),
      updated_at: hoursAgo(8).toISOString(),
      contact_type: 'sicoob_gifts',
      channel_type: 'sicoob_gifts',
      avatar_url: 'https://i.pravatar.cc/150?img=23',
      ai_sentiment: 'positive',
    },
    message: { id: 'm6', content: 'Ok, resolvido! Valeu pelo suporte 🙏', sender: 'contact' },
  },
  {
    unreadCount: 1,
    updatedAt: hoursAgo(3),
    contact: {
      id: 'mock-contact-7',
      name: 'Fernanda Lima Carvalho',
      company: 'Bitrix24 BR',
      job_title: 'Account Executive',
      phone: '5511922221111',
      tags: ['integração-crm', 'demo-agendada'],
      created_at: daysAgo(45).toISOString(),
      updated_at: hoursAgo(3).toISOString(),
      contact_type: 'phone',
      channel_type: 'phone',
      avatar_url: 'https://i.pravatar.cc/150?img=45',
      ai_sentiment: 'neutral',
    },
    message: { id: 'm7', content: 'Pode me ligar amanhã às 10h?', sender: 'agent' },
  },
  {
    unreadCount: 1,
    updatedAt: daysAgo(1),
    contact: {
      id: 'mock-contact-8',
      name: 'Pedro Henrique Almeida',
      company: 'Pedro Henrique MEI',
      job_title: 'Consultor Autônomo',
      phone: '5511911110000',
      tags: ['cliente'],
      created_at: daysAgo(20).toISOString(),
      updated_at: daysAgo(1).toISOString(),
      contact_type: 'whatsapp',
      channel_type: 'whatsapp',
      avatar_url: 'https://i.pravatar.cc/150?img=14',
      ai_sentiment: 'positive',
    },
    message: { id: 'm8', content: '👍 Tudo certo por aqui, valeu!', sender: 'contact' },
  },
  {
    unreadCount: 4,
    updatedAt: minutesAgo(8),
    contact: {
      id: 'mock-contact-9',
      name: 'Juliana Ribeiro',
      company: 'Boutique Atelier',
      job_title: 'Sócia-Proprietária',
      phone: '5511900008888',
      tags: ['vip', 'fidelidade'],
      created_at: daysAgo(80).toISOString(),
      updated_at: minutesAgo(8).toISOString(),
      contact_type: 'instagram',
      channel_type: 'instagram',
      avatar_url: 'https://i.pravatar.cc/150?img=49',
      ai_sentiment: 'positive',
    },
    message: {
      id: 'm9',
      content: 'Adorei a coleção nova! Quando chegam as peças tamanho M?',
      sender: 'contact',
    },
  },
  {
    unreadCount: 2,
    updatedAt: minutesAgo(22),
    contact: {
      id: 'mock-contact-10',
      name: 'Lucas Almeida',
      company: 'Startup XYZ',
      job_title: 'Founder',
      phone: '5511899997777',
      tags: ['suporte'],
      created_at: daysAgo(10).toISOString(),
      updated_at: minutesAgo(22).toISOString(),
      contact_type: 'webchat',
      channel_type: 'chat',
      avatar_url: 'https://i.pravatar.cc/150?img=12',
      ai_sentiment: 'neutral',
    },
    message: {
      id: 'm10',
      content: 'Olá, vim pelo site. Vocês têm plano para times pequenos?',
      sender: 'contact',
    },
  },
  {
    unreadCount: 1,
    updatedAt: hoursAgo(1),
    contact: {
      id: 'mock-contact-11',
      name: 'Ricardo Souza',
      company: 'ABC Logística',
      job_title: 'Gerente de Contas',
      phone: '5511888886666',
      tags: ['fornecedor', 'cotacao'],
      created_at: daysAgo(150).toISOString(),
      updated_at: hoursAgo(1).toISOString(),
      contact_type: 'whatsapp',
      channel_type: 'whatsapp',
      avatar_url: 'https://i.pravatar.cc/150?img=68',
      ai_sentiment: 'neutral',
    },
    message: {
      id: 'm11',
      content: 'Cotação enviada por e-mail, conforme combinado.',
      sender: 'agent',
    },
  },
  {
    unreadCount: 1,
    updatedAt: daysAgo(2),
    contact: {
      id: 'mock-contact-12',
      name: 'Beatriz Costa',
      company: 'Beatriz Costa Design',
      job_title: 'Designer Freelancer',
      phone: '5511877775555',
      tags: ['cliente-final'],
      created_at: daysAgo(60).toISOString(),
      updated_at: daysAgo(2).toISOString(),
      contact_type: 'whatsapp',
      channel_type: 'whatsapp',
      avatar_url: 'https://i.pravatar.cc/150?img=44',
      ai_sentiment: 'positive',
    },
    message: {
      id: 'm12',
      content: 'Tudo certo! Obrigada pelo atendimento ⭐⭐⭐⭐⭐',
      sender: 'contact',
    },
  },
  {
    unreadCount: 5,
    updatedAt: minutesAgo(35),
    contact: {
      id: 'mock-contact-13',
      name: 'Eduardo Martins',
      company: 'Construtora Solaris',
      job_title: 'Diretor Financeiro',
      phone: '5511866664444',
      tags: ['churn-risk', 'enterprise', 'renovacao-pendente'],
      created_at: daysAgo(365).toISOString(),
      updated_at: minutesAgo(35).toISOString(),
      contact_type: 'whatsapp',
      channel_type: 'whatsapp',
      avatar_url: 'https://i.pravatar.cc/150?img=15',
      ai_sentiment: 'negative',
    },
    message: {
      id: 'm13',
      content: 'Preciso urgentemente revisar os valores do contrato antes de renovar.',
      sender: 'contact',
    },
  },
  {
    unreadCount: 1,
    updatedAt: hoursAgo(5),
    contact: {
      id: 'mock-contact-14',
      name: 'Patrícia Nogueira',
      company: 'Nogueira Consultoria',
      job_title: 'Consultora de Negócios',
      phone: '5511855553333',
      tags: ['novo-lead', 'inbound'],
      created_at: daysAgo(2).toISOString(),
      updated_at: hoursAgo(5).toISOString(),
      contact_type: 'instagram',
      channel_type: 'instagram',
      avatar_url: 'https://i.pravatar.cc/150?img=25',
      ai_sentiment: 'positive',
    },
    message: {
      id: 'm14',
      content: 'Vi vocês no Insta, queria saber mais sobre como funciona!',
      sender: 'contact',
    },
  },
  {
    unreadCount: 2,
    updatedAt: minutesAgo(50),
    contact: {
      id: 'mock-contact-15',
      name: 'Rafael Vieira',
      company: 'Agência Pixel',
      job_title: 'Diretor de Criação',
      phone: '5511844442222',
      tags: ['parceiro', 'co-marketing'],
      created_at: daysAgo(100).toISOString(),
      updated_at: minutesAgo(50).toISOString(),
      contact_type: 'whatsapp',
      channel_type: 'whatsapp',
      avatar_url: 'https://i.pravatar.cc/150?img=58',
      ai_sentiment: 'positive',
    },
    message: {
      id: 'm15',
      content: 'Bora alinhar a campanha conjunta semana que vem?',
      sender: 'agent',
    },
  },
].map(buildConversation);
