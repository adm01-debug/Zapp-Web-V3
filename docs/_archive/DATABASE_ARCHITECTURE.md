> **⚠️ ATENÇÃO**: Este documento está parcialmente desatualizado. A arquitetura foi consolidada para um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md) para a versão canônica.

# 🏧 Arquitetura de Bancos de Dados — ZAPP WEB

## Visão Geral

O ZAPP WEB usa **2 bancos Supabase diferentes** com responsabilidades distintas:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ZAPP WEB (Frontend)                          │
├─────────────────────────────────┬─────────────────────────────────────┤
│  Lovable Cloud Supabase       │  External CRM Supabase (GESTÃO)       │
│  allrjhkpuscmgbsnmjlv        │  pgxfvjmuubtbowutlide                 │
│                               │                                       │
│  ● Conversations              │  ● Contacts (4.747 registros)         │
│  ● Messages (1.8M+)           │  ● Companies (57.728)                 │
│  ● Queues / Routing           │  ● Contact Phones (3.141)             │
│  ● SLA / CSAT                 │  ● Contact Emails (3.069)             │
│  ● Agent Presence             │  ● Contact Social Media (1.023)       │
│  ● Notifications              │  ● Interactions (10.460)              │
│  ● Stickers / Media           │  ● DISC/VAK/EQ Profiles               │
│  ● WhatsApp Connections       │  ● Deals / Proposals                  │
│  ● Edge Functions             │  ● Audit Log (241.097)                │
│  ● Auth (users/profiles)      │  ● 370 tabelas total                  │
│  ● 275 tabelas total          │                                       │
├─────────────────────────────────┼─────────────────────────────────────┤
│  Client: supabase             │  Client: getExternalSupabase()       │
│  File: client.ts              │  File: externalClient.ts             │
│  Env: VITE_SUPABASE_URL       │  Env: VITE_EXTERNAL_SUPABASE_URL     │
└─────────────────────────────────┴─────────────────────────────────────┘
```

## Regra de Ouro

| Operação | Banco | Client |
|----------|-------|--------|
| Ler/escrever **contatos** | External CRM | `contactsDB` / `getExternalSupabase()` |
| Ler/escrever **conversas** | Lovable Cloud | `supabase` (de client.ts) |
| Ler/escrever **mensagens** | Lovable Cloud | `supabase` |
| Ler/escrever **filas/SLA** | Lovable Cloud | `supabase` |
| Ler/escrever **notas de contato** | External CRM | `contactsDB.notes` |
| Ler/escrever **empresas** | External CRM | `useExternalDB` |
| Chamar **Edge Functions** | Lovable Cloud | `supabase.functions.invoke()` |
| Auth / Login | Lovable Cloud | `supabase.auth` |

## Arquivos Chave

| Arquivo | Propósito |
|---------|----------|
| `src/integrations/supabase/client.ts` | Client do Lovable Cloud (hardcoded) |
| `src/integrations/supabase/externalClient.ts` | Client do CRM Externo (via env vars) |
| `src/lib/contactsDB.ts` | Bridge typed para CRUD de contatos no CRM |
| `src/hooks/useExternalDB.ts` | Hook genérico para queries no CRM |
| `src/hooks/useExternalContact360.ts` | Enriquecimento 360° via RPC |

## ⚠️ NUNCA Fazer

```typescript
// ❌ ERRADO — Isso lê contatos do Lovable Cloud (tabela simplificada, 27 colunas)
import { supabase } from '@/integrations/supabase/client';
const { data } = await supabase.from('contacts').select('*');

// ✅ CORRETO — Isso lê contatos do CRM real (49 colunas, 4.747 registros)
import { contactsDB } from '@/lib/contactsDB';
const contact = await contactsDB.getById(id);
```
