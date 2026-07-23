/** typebot Fields component for the connections section. */
export const typebotFields = [
  { key: 'url', label: 'URL do Typebot', placeholder: 'https://typebot.io' },
  { key: 'typebot', label: 'Slug do Bot', placeholder: 'meu-bot' },
  { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
  { key: 'keywordFinish', label: 'Palavra para encerrar', placeholder: '#sair' },
  { key: 'delayMessage', label: 'Delay (ms)', type: 'number' },
  { key: 'unknownMessage', label: 'Mensagem para desconhecidos', placeholder: 'Não entendi' },
  { key: 'listeningFromMe', label: 'Ouvir minhas mensagens', type: 'boolean' },
  { key: 'stopBotFromMe', label: 'Parar bot ao responder', type: 'boolean' },
];

/** openai Fields component for the connections section. */
export const openaiFields = [
  { key: 'openAiApiKey', label: 'API Key OpenAI', placeholder: 'sk-...' },
  { key: 'model', label: 'Modelo', placeholder: 'gpt-4o' },
  { key: 'systemMessage', label: 'System Prompt', placeholder: 'Você é um assistente...' },
  { key: 'maxTokens', label: 'Max Tokens', type: 'number' },
  { key: 'temperature', label: 'Temperatura', type: 'number' },
  { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
  { key: 'keywordFinish', label: 'Palavra para encerrar', placeholder: '#humano' },
  { key: 'speechToText', label: 'Speech to Text', type: 'boolean' },
  { key: 'listeningFromMe', label: 'Ouvir minhas mensagens', type: 'boolean' },
  { key: 'stopBotFromMe', label: 'Parar ao responder', type: 'boolean' },
];

/** dify Fields component for the connections section. */
export const difyFields = [
  { key: 'apiUrl', label: 'URL do Dify', placeholder: 'https://api.dify.ai/v1' },
  { key: 'apiKey', label: 'API Key', placeholder: 'app-...' },
  {
    key: 'botType',
    label: 'Tipo (chatBot/textGenerator/agent/workflow)',
    placeholder: 'chatBot',
  },
  { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
  { key: 'keywordFinish', label: 'Palavra para encerrar' },
  { key: 'speechToText', label: 'Speech to Text', type: 'boolean' },
  { key: 'listeningFromMe', label: 'Ouvir minhas mensagens', type: 'boolean' },
];

/** flowise Fields component for the connections section. */
export const flowiseFields = [
  { key: 'apiUrl', label: 'URL do Flowise', placeholder: 'https://flowise.empresa.com' },
  { key: 'apiKey', label: 'API Key (opcional)' },
  { key: 'chatflowId', label: 'Chatflow ID', placeholder: 'uuid-do-chatflow' },
  { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
];

/** chatwoot Fields component for the connections section. */
export const chatwootFields = [
  { key: 'url', label: 'URL do Chatwoot', placeholder: 'https://chatwoot.empresa.com' },
  { key: 'accountId', label: 'Account ID', placeholder: '1' },
  { key: 'token', label: 'Token', placeholder: 'seu-token' },
  { key: 'nameInbox', label: 'Nome da Inbox', placeholder: 'WhatsApp' },
  { key: 'signMsg', label: 'Assinar mensagens', type: 'boolean' },
  { key: 'reopenConversation', label: 'Reabrir conversas', type: 'boolean' },
  { key: 'importContacts', label: 'Importar contatos', type: 'boolean' },
  { key: 'importMessages', label: 'Importar mensagens', type: 'boolean' },
];

/** evolution Bot Fields component for the connections section. */
export const evolutionBotFields = [
  { key: 'apiUrl', label: 'URL do Bot', placeholder: 'https://bot.empresa.com' },
  { key: 'apiKey', label: 'API Key (opcional)' },
  { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
  { key: 'keywordFinish', label: 'Palavra para encerrar' },
  { key: 'unknownMessage', label: 'Mensagem desconhecida' },
  { key: 'delayMessage', label: 'Delay (ms)', type: 'number' },
  { key: 'listeningFromMe', label: 'Ouvir minhas mensagens', type: 'boolean' },
  { key: 'stopBotFromMe', label: 'Parar ao responder', type: 'boolean' },
];
