# Mapeamento de Funcionalidades e Níveis de Acesso

Este documento detalha todas as funcionalidades identificadas no projeto e a proposta de restrição de acesso por perfil de usuário.

## 1. Núcleo de Atendimento (Communication Core)
| Funcionalidade | Descrição | Agente | Supervisor | Admin |
| :--- | :--- | :---: | :---: | :---: |
| **Omnichannel Inbox** | Chat unificado (WhatsApp, CRM, Equipes) | ✅ | ✅ | ✅ |
| **Teams & Grupos** | Comunicação interna entre agentes | ✅ | ✅ | ✅ |
| **Email Inbox** | Gestão de mensagens via Gmail/Outlook | ✅ | ✅ | ✅ |
| **Gestão de Filas** | Visualização e triagem de atendimentos | 👤 | ✅ | ✅ |
| **VoIP Panel** | Realização de chamadas de voz integradas | ✅ | ✅ | ✅ |

> **Nota:** 👤 Agentes visualizam apenas filas às quais estão vinculados.

## 2. CRM & Vendas (Sales Engagement)
| Funcionalidade | Descrição | Agente | Supervisor | Admin |
| :--- | :--- | :---: | :---: | :---: |
| **CRM 360° Explorer** | Visão completa do ciclo de vida do cliente | ✅ | ✅ | ✅ |
| **Pipeline (Kanban)** | Gestão de funil de vendas e oportunidades | ✅ | ✅ | ✅ |
| **Carteira de Clientes** | Atribuição de contatos a agentes específicos | ❌ | ✅ | ✅ |
| **Catálogo & Pagamentos** | Links de pagamento e gestão de produtos | ✅ | ✅ | ✅ |
| **Agendamentos** | Calendário integrado (Google Calendar) | ✅ | ✅ | ✅ |

## 3. Inteligência Artificial (AI Features)
| Funcionalidade | Descrição | Agente | Supervisor | Admin |
| :--- | :--- | :---: | :---: | :---: |
| **Transcrição de Áudio** | Conversão automática de voz em texto | ✅ | ✅ | ✅ |
| **Previsão de Churn** | IA que identifica risco de perda de cliente | ❌ | ✅ | ✅ |
| **Análise de Sentimento** | Monitoramento do humor em real-time | ❌ | ✅ | ✅ |
| **Classificador de Tickets** | Categorização automática via IA | ❌ | ✅ | ✅ |
| **Consumo de IA** | Dashboard de custos e tokens | ❌ | ❌ | ✅ |

## 4. Automação & Marketing
| Funcionalidade | Descrição | Agente | Supervisor | Admin |
| :--- | :--- | :---: | :---: | :---: |
| **Chatbot Builder** | Construtor visual de fluxos (Robôs) | ❌ | ✅ | ✅ |
| **Campanhas** | Disparos em massa e sequências | ❌ | ✅ | ✅ |
| **WhatsApp Flows** | Fluxos nativos integrados ao WhatsApp | ❌ | ✅ | ✅ |
| **Automações Manager** | Gestão de gatilhos (triggers) do sistema | ❌ | ❌ | ✅ |

## 5. Analytics & Monitoramento (BI)
| Funcionalidade | Descrição | Agente | Supervisor | Admin |
| :--- | :--- | :---: | :---: | :---: |
| **SLA Dashboard** | Controle de metas e tempos de resposta | ❌ | ✅ | ✅ |
| **War Room** | Painel de crise e alertas críticos | ❌ | ✅ | ✅ |
| **NPS & CSAT** | Pesquisas de satisfação automatizadas | ❌ | ✅ | ✅ |
| **Real-time Monitor** | Monitoramento de atendentes online | ❌ | ✅ | ✅ |
| **Relatórios** | BI com exportação automática (Excel/PDF) | ❌ | ❌ | ✅ |

## 6. Administração & Infraestrutura
| Funcionalidade | Descrição | Agente | Supervisor | Admin |
| :--- | :--- | :---: | :---: | :---: |
| **RBAC (Papéis)** | Gestão de permissões e departamentos | ❌ | ❌ | ✅ |
| **Audit Logs** | Histórico completo de ações no sistema | ❌ | ❌ | ✅ |
| **BD Externo** | Integração com bancos de dados externos | ❌ | ❌ | ✅ |
| **API Pública** | Gestão de chaves e webhooks | ❌ | ❌ | ✅ |
| **Telemetria** | Saúde técnica e performance do banco | ❌ | ❌ | 🛠️ |

> **Nota:** 🛠️ Acesso exclusivo para o perfil de Desenvolvedor (Dev).

---
*Documento gerado para análise de permissões de acesso ao sistema.*
