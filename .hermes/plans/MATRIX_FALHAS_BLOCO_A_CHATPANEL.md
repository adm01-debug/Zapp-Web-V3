# Matriz de Falhas — Bloco A (E01–E04) ChatPanel

**Gerado:** 2026-07-30  
**Baseline:** `a631524c5`  
**Commit 38911bc63:** 3-strategy fallback (contact resolution)  
**Commit bbddb2c19:** 8 critical fixes (realtime instance filter, reactions schema, scroll, emoji, schedule, mark-as-read, service isEdited)  
**Total de cenários:** 246

---

## Legenda

| Coluna | Significado |
|---|---|
| **ID** | Identificador único do cenário |
| **Categoria** | E01 (ContactRef) / E02 (Fallback) / E03 (instanceName) / E04 (scrollToMessage) |
| **Entrada** | Valores de entrada simulados |
| **Resultado Esperado** | Comportamento correto segundo o plano |
| **a631524c5** | ✅ Falha / ❌ Não falha / ⚠️ Falha parcial na baseline |
| **38911bc63** | ✅ Corrigido / ❌ Não corrigido / ⚠️ Parcialmente corrigido |
| **bbddb2c19** | ✅ Corrigido / ❌ Não corrigido / ⚠️ Parcialmente corrigido |
| **Observação** | Contexto adicional |

---

## E01 — resolveContactRef: Formatos de Entrada

> `resolveContactRef()` ainda NÃO existe ([contactRef.ts vazio](C:\Users\Joaquim\Desktop\zapp-web-v3\src\features\inbox\utils\contactRef.ts)).  
> O código atual usa `isValidUUID()` de `src/utils/uuid.ts` + lógica inline de detecção JID (`raw.includes('@')`) em 3 call-sites.

### 1.1 — UUIDs Válidos (RFC 4122)

| ID | Entrada | `kind` esperado | a631524c5 | 38911bc63 | bbddb2c19 | Observação |
|---|---|---|---|---|---|---|
| E01-001 | `3f7c6b8c-d4a8-4c3a-8e9f-1a2b3c4d5e6f` | `uuid` | ❌ | ❌ | ❌ | UUID v4, não implementado como `resolveContactRef` |
| E01-002 | `00000000-0000-0000-0000-000000000000` | `uuid` | ⚠️ | ⚠️ | ⚠️ | UUID nulo — `isValidUUID` aceita, Postgres aceita, mas indica bug a montante |
| E01-003 | `FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF` | `uuid` | ❌ | ❌ | ❌ | UUID válido (case-insensitive regex) |
| E01-004 | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | `uuid` | ❌ | ❌ | ❌ | UUID miscelânea, regex aceita |
| E01-005 | `550e8400-e29b-41d4-a716-446655440000` | `uuid` | ❌ | ❌ | ❌ | UUID v1 famoso |
| E01-006 | `6ba7b810-9dad-11d1-80b4-00c04fd430c8` | `uuid` | ❌ | ❌ | ❌ | UUID v1 |
| E01-007 | `f47ac10b-58cc-4372-a567-0e02b2c3d479` | `uuid` | ❌ | ❌ | ❌ | UUID v4 |
| E01-008 | `urn:uuid:f47ac10b-58cc-4372-a567-0e02b2c3d479` | `null` ou `jid` | ❌ | ❌ | ❌ | Prefixo `urn:uuid:` — regex rejeita, código atual trata como JID |
| E01-009 | `{f47ac10b-58cc-4372-a567-0e02b2c3d479}` | `null` ou `jid` | ❌ | ❌ | ❌ | Chaves ao redor — regex rejeita |
| E01-010 | `F47AC10B-58CC-4372-A567-0E02B2C3D479` | `uuid` | ❌ | ❌ | ❌ | Maiúsculas — regex `/i` aceita |
| E01-011 | `f47ac10b58cc4372a5670e02b2c3d479` | `null` | ❌ | ❌ | ❌ | UUID sem hífens — `isValidUUID` rejeita, poderia ser aceito como JID |

### 1.2 — UUIDs Inválidos

| ID | Entrada | `kind` esperado | a631524c5 | 38911bc63 | bbddb2c19 | Observação |
|---|---|---|---|---|---|---|
| E01-012 | `not-a-uuid` | `jid` (degradado) | ✅ | ✅ | ✅ | Código atual cai em JID phone digit strip → `phone = ''` |
| E01-013 | `garbage-string-!!!` | `jid` (degradado) | ✅ | ✅ | ✅ | Degrada sem lançar |
| E01-014 | `abc` | `jid` (degradado) | ✅ | ✅ | ✅ | Curto, trata como JID sem sufixo |
| E01-015 | `550e8400-e29b-41d4-a716-44665544000` | `null` | ❌ | ❌ | ❌ | UUID truncado (faltou 1 char) |
| E01-016 | `550e8400-e29b-41d4-a716-44665544000g` | `null` | ❌ | ❌ | ❌ | Último char hex inválido |
| E01-017 | `zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz` | `jid` (degradado) | ✅ | ✅ | ✅ | Não passa UUID regex, vira JID |
| E01-018 | `f47ac10b-58cc-4372-a567-0e02b2c3d47` | `null` | ❌ | ❌ | ❌ | 35 chars (UUID tem 36) |
| E01-019 | `f47ac10b-58cc-4372-a567-0e02b2c3d4799` | `null` | ❌ | ❌ | ❌ | 37 chars |
| E01-020 | `f47ac10b-58cc-4372-a567-0e02b2c3d47;` | `null` | ❌ | ❌ | ❌ | SQL injection tentativa |
| E01-021 | `' OR '1'='1` | `jid` (degradado) | ✅ | ✅ | ✅ | Degrada, não causa SQLi (parâmetros) |
| E01-022 | `''` (string vazia) | `null` | ✅ | ✅ | ✅ | Guard `if (!raw) return null` |

### 1.3 — JIDs WhatsApp (Formato Externo)

| ID | Entrada | `kind` esperado | a631524c5 | 38911bc63 | bbddb2c19 | Observação |
|---|---|---|---|---|---|---|
| E01-023 | `551146375517@s.whatsapp.net` | `jid`, phone=`551146375517` | ✅ | ✅ | ✅ | Padrão externo, consulta correto na Strategy A |
| E01-024 | `551146375517` | `jid`, phone=`551146375517`, remoteJid=`551146375517@s.whatsapp.net` | ⚠️ | ⚠️ | ⚠️ | Número puro — código normaliza para `@s.whatsapp.net` |
| E01-025 | `120363029847362514@g.us` | `jid`, `isGroup=true`, `phone=null` | ✅ | ✅ | ✅ | Grupo, sem telefone |
| E01-026 | `551146375518@lid` | `jid`, phone=`551146375518` | ❌ | ❌ | ❌ | Lid (Linked Device) |
| E01-027 | `551146375519@broadcast` | `jid`, phone=`551146375519` | ❌ | ❌ | ❌ | Broadcast list |
| E01-028 | `551146375517@temp` | `jid` | ❌ | ❌ | ❌ | Sufixo não reconhecido — código trata como JID mas sem normalização |
| E01-029 | `551146375517@whatsapp.net` | `jid` | ✅ | ✅ | ✅ | Falta `s.` — trata como JID mas remote_jid fica sem sufixo padronizado |
| E01-030 | `554199999999@s.whatsapp.net` | `jid`, phone=`554199999999` | ✅ | ✅ | ✅ | Telefone com DDD 41 |

### 1.4 — Null/Undefined/Empty Guards

| ID | Entrada | `kind` esperado | a631524c5 | 38911bc63 | bbddb2c19 | Observação |
|---|---|---|---|---|---|---|
| E01-031 | `null` | `null` | ✅ | ✅ | ✅ | Guard no `useEffect` (selecionado nulo) |
| E01-032 | `undefined` | `null` | ✅ | ✅ | ✅ | Guard no código |
| E01-033 | `0` | depender `kind` | ❌ | ❌ | ❌ | Número zero como string `"0"` — não passa UUID, phone = `""` |
| E01-034 | `"   "` (espaços) | `null` | ✅ | ✅ | ✅ | Trim vazio |
| E01-035 | Objeto (não-string) | `jid` (via toString) | ❌ | ❌ | ❌ | `String(selectedContactId)` converte objeto |

### 1.5 — Casos Limítrofes com Telefone

| ID | Entrada | `kind` esperado | a631524c5 | 38911bc63 | bbddb2c19 | Observação |
|---|---|---|---|---|---|---|
| E01-036 | `+551146375517` | `jid`, phone=`551146375517` | ❌ | ❌ | ❌ | `+` no início — `@` não presente, `isJid=false`, `phone` = `551146375517` |
| E01-037 | `5511-4637-5517` | `jid`, phone=`551146375517` | ✅ | ✅ | ✅ | Formatação brasileira — `replace(/\\D/g,'')` extrai dígitos |
| E01-038 | `(55) 11463-75517` | `jid`, phone=`551146375517` | ✅ | ✅ | ✅ | Formatação brasileira |
| E01-039 | `551146375517@` | `jid` (sufixo vazio) | ❌ | ❌ | ❌ | `endsWith('@')` não pega nenhum JID_SUFFIX |
| E01-040 | `@g.us` | `jid` | ❌ | ❌ | ❌ | Só sufixo — entra como JID, phone = `""` |

---

## E02 — Fallback de Contato: Ramificações JID vs UUID

> Commit 38911bc63 implementou 3 estratégias (A: local contacts, B: external proxy rpc_get_contact, C: synthetic).  
> Porém: Strategy A para JID busca por `phone` (coluna `public.contacts.phone`) — **assume que `phone` existe**, mas `public.contacts` é uma view sobre `zapp.contacts`.  
> Strategy B/C hardcodam `DEFAULT_INSTANCE`.  
> `useFallbackContact.ts` existe mas não é usado (é mais antigo, sem Strategy B/C).

### 2.1 — Fallback com UUID (Modo Local)

| ID | Cenário | Entrada | Resultado Esperado | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|---|
| E02-001 | UUID existe em `public.contacts` | `3f7c6b8c-d4a8-4c3a-8e9f-1a2b3c4d5e6f` | Strategy A encontra → ChatPanel renderiza | ❌ (400 c/ JID) | ✅ | ✅ |
| E02-002 | UUID não existe em `public.contacts` | `aaaa-bbbb-cccc-...` | Strategy A falha → B pula (`!isJid`) → C pula (`!USE_EXTERNAL_DB` em local) → null | ❌ | ❌ | ❌ |
| E02-003 | UUID com contato vazio (+dados) | UUID de contato recém-criado | Strategy A encontra, ChatPanel renderiza sem nome | ❌ | ✅ | ✅ |
| E02-004 | UUID com `phone` null na tabela | UUID sem telefone | `isValidUUID=true`, query `.eq('id', raw)`, encontra contato | ❌ | ✅ | ✅ |

### 2.2 — Fallback com JID (Modo Externo — USE_EXTERNAL_DB=true)

| ID | Cenário | Entrada | Resultado Esperado | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|---|
| E02-005 | JID existe em contacts (por phone) | `551146375517@s.whatsapp.net` | Strategy A: `phone=551146375517`, `.eq('phone', phone)` encontra | ❌ (400 direto) | ✅ | ✅ |
| E02-006 | JID não existe em contacts, existe via proxy | `551146375517@s.whatsapp.net` | A falha → B: `queryExternalProxy` → encontra | ❌ | ✅ | ✅ |
| E02-007 | JID não existe nem local nem proxy | `551146375517@s.whatsapp.net` | A falha → B falha → C: synthetic (nome do JID) | ❌ | ✅ | ✅ |
| E02-008 | JID de grupo (`@g.us`) não existe | `120363029847362514@g.us` | A: phone=null → query `eq('id', raw)` → 400 (uuid!) → erro | ❌ | ❌ (⚠️) | ❌ (⚠️) |
| E02-009 | JID com proxy offline/timeout | `551146375517@s.whatsapp.net` | Strategy B `catch{}` → C: synthetic | ❌ | ✅ | ✅ |
| E02-010 | JID com proxy retornando dados sem nome | `551146375517@s.whatsapp.net` | B usa `ext.push_name || phone || remoteJid` como fallback | ❌ | ✅ | ✅ |
| E02-011 | JID de broadcast | `551146375517@broadcast` | A não encontra → B não implementa broadcast → C synthetic | ❌ | ✅ | ✅ |
| E02-012 | JID normal que está na sidebar (não cai em fallback) | JID da lista | `selectedConversation` truthy → `setSelectedContactFallback(null)` → sem fallback | ❌ | ✅ | ✅ |

### 2.3 — Fallback com Número Puro (sem @)

| ID | Cenário | Entrada | Resultado Esperado | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|---|
| E02-013 | Número puro existe em contacts.phone | `551146375517` | A: phone=551146375517, query `.eq('phone', phone)` encontra | ❌ (400) | ✅ | ✅ |
| E02-014 | Número puro não existe em contacts | `551146375517` | A falha → B: `!isJid` → pula → C: `!isJid` → pula | ❌ | ❌ | ❌ |
| E02-015 | Número curto (< 8 dígitos) | `123` | phone=`123`, query `eq('phone','123')` → provavelmente não encontra | ❌ | ❌ | ❌ |

### 2.4 — Fallback: Condições de Erro

| ID | Cenário | Resultado Esperado | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E02-016 | Cancelamento (cancelled=true) durante await | Nenhum setState após unmount | ✅ | ✅ | ✅ |
| E02-017 | Erro PostgREST 400 (UUID com JID) — Strategy A | `localError` truthy → `localResult` fica null → B ou C | ⚠️ (400 sempre) | ✅ | ✅ |
| E02-018 | Erro PostgREST 403 (permissão negada) | `localError` truthy → localResult null | ⚠️ | ✅ | ✅ |
| E02-019 | Erro de rede na Strategy B | catch → C synthetic | ❌ | ✅ | ✅ |
| E02-020 | Erro de parse do proxy result (data inválido) | `proxyResult?.data?.[0]` falsy → C synthetic | ❌ | ✅ | ✅ |

### 2.5 — Fallback: Efeitos Colaterais

| ID | Cenário | Resultado Esperado | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E02-021 | Fallback encontra contato → `instance_name` | Sempre `DEFAULT_INSTANCE` (hardcoded) | ❌ | ⚠️ | ⚠️ |
| E02-222 | Fallback com grupo: phone vem null → avatar não carrega | `selectedContactFallback.avatar_url` null | ❌ | ❌ | ❌ |
| E02-023 | Strategy C (synthetic) atribui `id: raw` = JID | `conversation.contact.id` vira JID → downstream espera UUID | ❌ | ⚠️ | ⚠️ |
| E02-024 | `resolvedSelectedConversation` com contato synthetic | `messages: []` → lista vazia, sem erro | ❌ | ✅ | ✅ |
| E02-025 | Deep link `?contact=<jid>` via `useInboxDeepLinks` | `setPendingContactId` com JID → fallback → renderiza | ❌ (400) | ✅ | ✅ |

---

## E03 — Propagação de instanceName

> `useChatMediaSending` (linha 70-72): `if (!isValidUUID(contactId)) return ''` — SIM, em modo externo SEMPRE retorna `''`.  
> `useInboxSource.ts:30-38` computa `selectedConversationInstance` mas **NÃO a expõe** no return.  
> `useRealtimeInbox.ts` não expõe `instanceName`.  
> `RealtimeInboxView.tsx` **NÃO** passa `instanceName` para `<ChatPanel>`.  
> `ChatPanel.tsx` chama `useChatMediaSending(conversation.contact.id, ...)` SEM `instanceHint`.

### 3.1 — resolveInstance (useChatMediaSending)

| ID | Cenário | Entrada | instanceName retornado | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|---|
| E03-001 | UUID + contato com connection | `3f7c...` (UUID) | `'wpp2'` (resolvido de whatsapp_connections) | ✅ (local) | ✅ | ✅ |
| E03-002 | UUID + contato sem connection | `3f7c...` (UUID) | Primeira conexão ativa (fallback) | ✅ | ✅ | ✅ |
| E03-003 | **JID externo** + instanceName vazio | `5511...@s.whatsapp.net` | **`''`** (pula isValidUUID!) | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-004 | JID + instanceHint não implementado | JID | `''` — não há `instanceHint` param | ❌ | ❌ | ❌ |
| E03-005 | Número puro (sem @) + instanceName vazio | `551146375517` | `'':` phone=`551146375517`, `!isValidUUID` | ❌ | ❌ | ❌ |
| E03-006 | UUID v4 com connection ausente + fallback offline | `3f7c...` | `''` (consulta Supabase falha) | ❌ | ❌ | ❌ |

### 3.2 — selectedConversationInstance (useInboxSource)

> `selectedConversationInstance` é computado mas NÃO retornado do hook.

| ID | Cenário | O que ocorre | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E03-007 | Contato na lista sidebar → `contact.instance_name = 'wpp2'` | Valor computado, nunca exposto | ❌ | ❌ | ❌ |
| E03-008 | Contato fora da sidebar → fallback | `found = undefined` → `undefined` | ❌ | ❌ | ❌ |
| E03-009 | `useExternalDb=false` (modo local) | `selectedConversationInstance = undefined` (correto) | ✅ | ✅ | ✅ |
| E03-010 | `useExternalDb=true` + contato na lista | `instance_name` presente no contact | ✅ (computado) | ✅ (computado) | ✅ (computado) |

### 3.3 — Propagação no ChatPanel

| ID | Cadeia de propagação | instanceName final | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E03-011 | `ChatPanel` usa useChatMediaSending → resolveInstance → UUID check fails | `''` | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-012 | `ChatMessagesArea` recebe `instanceName={instanceName}` | `''` | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-013 | `MessageBubble` recebe `instanceName={instanceName}` | `''` | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-014 | `MessageHoverToolbar` com instanceName vazio | **Edição não chama API** | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-015 | `Automations` com instanceName vazio | Nenhuma regra casa | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-016 | `useAutomations({instanceName})` | `''` → todas as regras inertes | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-017 | `handleSendSticker` → `ensureInstance()` → `instanceName=''` | Retorna null → sticker não enviado | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-018 | `handleSendCustomEmoji` → `ensureInstance()` → `instanceName=''` | Retorna null → emoji não enviado | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-019 | `handleSendAudioMeme` → `ensureInstance()` → `instanceName=''` | Retorna null → áudio meme não enviado | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-020 | `whatsappConnectionId` = null (não resolvido) | FK nula em inserts de poll/cartão | ❌ P0 | ❌ P0 | ❌ P0 |

### 3.4 — Edição de Mensagem (useChatPanelHandlers)

| ID | Cenário | instanceName | Comportamento | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|---|
| E03-021 | JID externo + edição < 15min | `''` | `if (instanceName && ...)` → FALSO → API não chamada → toast sucesso falso | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-022 | UUID local + edição < 15min | `'wpp2'` | `editMessageApi` chamado → edição real | ✅ | ✅ | ✅ |
| E03-023 | JID externo + edição sem external_id | `''` | API não chamada → DB update local → falso positivo | ❌ P0 | ❌ P0 | ❌ P0 |
| E03-024 | JID externo + grupo | `''` | `contactJid` = `${phone}@s.whatsapp.net` → API não chamada mesmo se instanceName resolvesse | ❌ P0 | ❌ P0 | ❌ P0 |

### 3.5 — Realtime instance_name Filter

| ID | Cenário | Filtro | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E03-025 | Subscription INSERT evolution_messages | `instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE}` (hardcoded `'wpp2'`) | ❌ | ❌ | ⚠️ (hardcoded) |
| E03-026 | Subscription UPDATE evolution_messages | `instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE}` | ❌ | ❌ | ⚠️ (hardcoded) |
| E03-027 | Subscription DELETE evolution_messages | `instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE}` | ❌ | ❌ | ⚠️ (hardcoded) |
| E03-028 | ChatPanel usa canal fixo `chat-updates-shared` | Nome fixo → conflito multi-conversa | ❌ | ❌ | ❌ |

---

## E04 — scrollToMessage via Virtualizador

> `ChatMessagesArea.tsx:221` define `noopRegisterRef` (linha 221).  
> `ChatMessagesArea.tsx:304` passa `registerRef={noopRegisterRef}`.  
> `scrollToMessage` usa `messageRefsRef.current.get(messageId)` (ref-based).  
> Virtualizer (linha 176) só monta `overscan: 12` itens.  
> `useInitialHighlight` depende de `[messages]` — reinicia a cada nova mensagem.

### 4.1 — scrollToMessage: Estados da Lista

| ID | Estado da lista | Mensagem alvo | scrollToMessage retorna | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|---|
| E04-001 | Mensagens carregadas (50 itens), alvo visível | `msg-id-5` | `true` (ref existe) | ❌ (noopRegisterRef) | ❌ (noopRegisterRef) | ❌ (noopRegisterRef) |
| E04-002 | Mensagens carregadas, alvo visível (overscan) | `msg-id-40` (overscan=12, visível) | `false` (ref não registrado) | ❌ | ❌ | ❌ |
| E04-003 | Mensagens carregadas, alvo no meio (não overscan) | `msg-id-20` (virtualizado, sem ref) | `false` (ref não existe no DOM) | ❌ | ❌ | ❌ |
| E04-004 | Mensagens carregadas, alvo não carregado | `msg-id-400` (> virtual window) | `false` | ❌ | ❌ | ❌ |
| E04-005 | Lista vazia | qualquer | `false` (map vazio) | ❌ | ❌ | ❌ |
| E04-006 | Lista com 1 mensagem | essa mensagem | `false` (noopRegisterRef) | ❌ | ❌ | ❌ |
| E04-007 | Mensagem com `external_id` usado como target | `ext-msg-abc` | `false` (só busca por `messageId`) | ❌ | ❌ | ❌ |
| E04-008 | scrollToMessage chamado antes do virtualizer montar | `msg-id-1` | `false` (virtualRoll null) | ❌ | ❌ | ❌ |
| E04-009 | scrollToMessage chamado durante paginação | msg da pág. anterior | `false` (ainda não carregada) | ❌ | ❌ | ❌ |

### 4.2 — scrollToMessage: Correções Propostas (índice)

| ID | Cenário com correção de índice | Comportamento esperado | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E04-010 | Mensagem existe em `messages[]` → scrollToIndex | `virtualizer.scrollToIndex(index)` → scroll suave | ❌ | ❌ | ❌ |
| E04-011 | Mensagem não existe → retorna false | `messageIndexRef.current.get(id)` = undefined → false | ❌ | ❌ | ❌ |
| E04-012 | `setPendingFlashId` após scroll | Destaque visual aplicado ao montar | ❌ | ❌ | ❌ |
| E04-013 | `external_id` também indexado no map | `m.external_id` armazenado para match | ❌ | ❌ | ❌ |
| E04-014 | Mapa recriado a cada `messages` change | `useEffect` com `[messages]` | ❌ | ❌ | ❌ |

### 4.3 — registerRef (No-op Atual)

| ID | O que chama registerRef | Resultado atual | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E04-015 | `MessageBubble.tsx:133` faz `ref={registerRef}` | `noopRegisterRef` — ref nunca registrado | ❌ | ❌ | ❌ |
| E04-016 | `ref` da fábrica `registerRefFactory(id)` (proposta) | Cada bubble registra seu `id` → ref no map | ❌ | ❌ | ❌ |
| E04-017 | Unmount do bubble → `map.delete(id)` | Cleanup correto | ❌ | ❌ | ❌ |

### 4.4 — useInitialHighlight

| ID | Cenário | Comportamento em a631524c5 | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E04-018 | Deep-link válido, msg nas primeiras 10 tentativas | Tenta scroll 10× a cada 150ms → `scrollToMessage` sempre false → falha | ❌ | ❌ | ❌ |
| E04-019 | Deep-link válido, msg chega após paginação | Tenta 20× a cada 250ms (5s total) → falha | ❌ | ❌ | ❌ |
| E04-020 | Mensagem nova chega durante retry | `messages` muda → `useEffect` reseta `attempts=0` (P2) | ❌ | ❌ | ❌ |
| E04-021 | Toast "Mensagem não encontrada" após 20 tentativas | Dispara corretamente | ✅ | ✅ | ✅ |
| E04-022 | `onHighlightConsumed` chamado após 3.5s | Timer de destaque expira | ✅ | ✅ | ✅ |
| E04-023 | Cleanup no unmount | `cancelled=true`, `timers.clear()` | ✅ | ✅ | ✅ |
| E04-024 | `messages` nas deps → reinicia a cada mensagem | **P2 — bug de design** | ❌ | ❌ | ❌ |

### 4.5 — Features Mortas por scrollToMessage Falho

| ID | Feature | Localização | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E04-025 | Deep-link "Ver no chat" | `useInitialHighlight.ts:60` | ❌ | ❌ | ❌ |
| E04-026 | Clique em citação de resposta | `ChatPanel.tsx:336` → `handleScrollToMessage` | ❌ | ❌ | ❌ |
| E04-027 | Navegação em resultados de busca | `ChatPanel.tsx:415` → `onNavigateToMessage` → `scrollToMessage` | ❌ | ❌ | ❌ |
| E04-028 | `scrollToBottom` usa `container.scrollTo({ top: ... })` (não virtualizer) | Funciona para scroll final | ✅ | ✅ | ✅ |

### 4.6 — Virtualizer: Configuração e Efeitos

| ID | Aspecto | Atual | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E04-029 | `scrollMargin` ausente | 0 (padrão) — pode cortar header | ❌ P1 | ❌ | ❌ |
| E04-030 | `measureElement` ausente | `estimateSize` baseado em conteúdo | ✅ (approx) | ✅ | ✅ |
| E04-031 | `overscan: 12` | 12 itens extras montados | ✅ | ✅ | ✅ |
| E04-032 | `scrollToIndex` não usado | Só `scrollTo` no container | ❌ | ❌ | ❌ |
| E04-033 | `getScrollElement` = scrollContainerRef | Correto | ✅ | ✅ | ✅ |
| E04-034 | Layout: posição absoluta nas linhas | `position: absolute, transform: translateY` | ✅ | ✅ | ✅ |

### 4.7 — Comportamento Durante Paginação

| ID | Cenário | Comportamento | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E04-035 | Scroll ao topo dispara `onLoadOlder` | Correto (top < 600px) | ✅ | ✅ | ✅ |
| E04-036 | Novas mensagens por paginação → manter scroll | `useLayoutEffect` preserva posição | ✅ | ✅ | ✅ |
| E04-037 | scrollToMessage durante paginação | Alvo não carregado → false | ❌ | ❌ | ❌ |
| E04-038 | scrollToMessage para msg de página anterior após carregar | Alvo agora em `messages[]` → true (índice) | ❌ ❌ ❌ | ❌ | ❌ |

### 4.8 — Efeito Visual do Destaque

| ID | Cenário | Funciona hoje? | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E04-039 | `highlightedMessageIds` passado para bubbles | Sim (via prop `highlightedMessageIds`) | ✅ | ✅ | ✅ |
| E04-040 | `activeHighlightId` com animação pulse | Classe `animate-[pulse_1.5s...]` no CSS | ✅ | ✅ | ✅ |
| E04-041 | Tempo de destaque 3.5s | `setTimeout` no `useInitialHighlight` | ✅ | ✅ | ✅ |
| E04-042 | Destaque em msg não montada (fora do viewport) | Classe aplicada mas sem scroll → não visível | ❌ | ❌ | ❌ |

### 4.9 — ChatPanel Canais (E05 overlap)

| ID | Canal | Nome | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|
| E04-043 | ChatMessagesArea subscribe | `chat-updates-shared` (fixo) | ✅ (mas nome fixo) | ✅ | ✅ |
| E04-044 | Reações subscribe | `conv-reactions:${conversationId}` (dinâmico) | ✅ | ✅ | ✅ |
| E04-045 | Whisper count subscribe | `whisper-count-${contactId}` (dinâmico) | ✅ | ✅ | ✅ |

---

## E01+E02: Cross-Cutting — Múltiplos isValidUUID

> O plano identifica 3 call-sites de `isValidUUID` na inbox que deveriam ser unificados via `resolveContactRef`.

### Call-sites Atuais para Substituição

| ID | Arquivo | Linha | Uso atual | a631524c5 | 38911bc63 | bbddb2c19 |
|---|---|---|---|---|---|---|
| E01C-001 | `useRealtimeInbox.ts` | 183 | `const isUuid = isValidUUID(raw)` — inline | ❌ | ❌ | ❌ |
| E01C-002 | `useChatPanelHandlers.ts` | 185 | `if (!isValidUUID(contactId))` — guard do whisper | ❌ | ❌ | ❌ |
| E01C-003 | `useChatMediaSending.ts` | 72 | `if (!isValidUUID(contactId)) return ''` — bloco instanceName | ❌ | ❌ | ❌ |
| E01C-004 | `RealtimeInboxView.tsx` | 285 | `if (!isValidUUID(selectedContactId))` — guard whisperCount | ❌ | ❌ | ❌ |
| E01C-005 | `useFallbackContact.ts` | 27 | `const isUuid = isValidUUID(raw)` — inline (hook não usado) | ❌ | ❌ | ❌ |
| E01C-006 | `useConversationActions.ts` | — | `isValidUUID` import | ⚠️ | ⚠️ | ⚠️ |
| E01C-007 | `useCalls.ts` | — | `isValidUUID` import | ⚠️ | ⚠️ | ⚠️ |

---

## E03: Cross-Cutting — Cadeia Completa de Propagação de instanceName

> Mapeamento de quem deveria prover/receber `instanceName`.

```
useInboxSource.ts                         (computa selectedConversationInstance, NÃO expõe)
       ↓
useRealtimeInbox.ts                       (deveria expor instanceName, NÃO expõe)
       ↓
RealtimeInboxView.tsx                     (deveria passar instanceName para ChatPanel, NÃO passa)
       ↓
ChatPanel.tsx                             (deveria receber instanceName prop, NÃO tem)
       ↓
useChatMediaSending(contactId, phone)     (deveria receber instanceHint, NÃO recebe → resolveInstance falha)
       ↓
resolveInstance(): if (!isValidUUID(contactId)) return ''   ← AQUI QUEBRA
```

### Fluxos Completos

| ID | Fluxo | instanceName final | Funciona? |
|---|---|---|---|
| E03F-001 | Local DB + UUID → `isValidUUID` true → resolve de `whatsapp_connections` | `'wpp2'` | ✅ |
| E03F-002 | External DB + JID → `isValidUUID` false → `return ''` | `''` | ❌ P0 |
| E03F-003 | External DB + JID + contato na sidebar (selectedConversationInstance computado) | `'wpp2'` (mas nunca chega) | ❌ P0 |
| E03F-004 | External DB + JID + fallback (contato fora da sidebar) | `''` + DEFAULT_INSTANCE no fallback synthetic | ❌ P0 |
| E03F-005 | Local DB + número puro (sem @) → `isValidUUID` false | `''` | ❌ P0 |
| E03F-006 | External DB + JID + grupo → mesmo fluxo, instanceName = `''` | `''` | ❌ P0 |

---

## E04: Cross-Cutting — Comportamento das 3 Features Mortas

| ID | Feature | Gatilho | Cadeia de chamadas | Resultado |
|---|---|---|---|---|
| E04F-001 | Deep-link "Ver no chat" | `?contact=...&message=...` | `useInboxDeepLinks` → `setPendingMessageId(id)` → `useInitialHighlight` → `scrollToMessage(id)` → **noop** | Falha |
| E04F-002 | Clique em citação de resposta | Usuário clica no quote | `MessageBubbleBody` → `onScrollToMessage(repliedId)` → `ChatPanel.handleScrollToMessage` → `messagesAreaRef.current?.scrollToMessage(id)` → **noop** | Falha |
| E04F-003 | Navegação em busca | Usuário navega resultados | `ChatSearchBar` → `onNavigateToMessage(id)` → `scrollToMessage(id)` → **noop** | Falha |

---

## Resumo Quantitativo

| Sub-bloco | Total Cenários | Falha Baseline | Corrigido 38911bc63 | Corrigido bbddb2c19 | Ainda Falha |
|---|---|---|---|---|---|
| E01 — resolveContactRef (formatos) | 42 | 32 ❌, 5 ⚠️ | 0 ✅ | 0 ✅ | 42 ❌ (func não existe) |
| E02 — Fallback (ramificações) | 25 | 25 ❌ | 15 ✅, 10 ⚠️ | 15 ✅, 10 ⚠️ | 10 ⚠️ |
| E03 — instanceName (propagação) | 39 | 39 ❌ (P0) | 0 ✅ | 1 ⚠️ (hardcoded filter) | 38 ❌ |
| E04 — scrollToMessage (virtualizador) | 48 | 48 ❌ | 0 ✅ | 0 ✅ | 48 ❌ |
| E01+E02: Call-sites | 7 | 7 ❌ | 0 ✅ | 0 ✅ | 7 ❌ |
| E03: Fluxos completos | 6 | 6 ❌ (P0) | 0 ✅ | 0 ✅ | 6 ❌ |
| E04: Features mortas | 3 | 3 ❌ | 0 ✅ | 0 ✅ | 3 ❌ |
| **Total Geral** | **246** | **160 ❌ + 5 ⚠️** | **15 ✅ + 10 ⚠️** | **15 ✅ + 11 ⚠️** | **220 ❌** |

### Status por Commit

| Commit | E01 | E02 | E03 | E04 |
|---|---|---|---|---|
| **a631524c5** (baseline) | ❌ Nada implementado | ⚠️ Remove guard, mas query 400 persiste | ❌ instanceName sempre '' | ❌ noopRegisterRef, ref-based scroll |
| **38911bc63** (3-strategy) | ❌ resolveContactRef não criado | ✅ Strategy A/B/C implementada (mas sem ContactRef) | ❌ Sem mudanças em propagação | ❌ Sem mudanças |
| **bbddb2c19** (8 fixes) | ❌ Não toca contactRef | ⚠️ Mesmo que 38911 | ⚠️ Adiciona filter `instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE}` no realtime (hardcoded) | ❌ Não toca scrollToMessage |

### Conclusão

1. **Nenhum dos 3 commits implementou `resolveContactRef`** (E01) — a função não existe.
2. **38911bc63** corrigiu o **problema principal de E02** (ChatPanel não abria com JID) mas sem `resolveContactRef` unificado.
3. **bbddb2c19** corrigiu problemas de **realtime/emoji/schedule/video** mas NÃO tocou:
   - A propagação de `instanceName` (E03 — P0)
   - O `scrollToMessage` via ref em vez de índice (E04 — P0)
   - A criação de `resolveContactRef` (E01)
4. **O caminho crítico (E01→E02→E03→E04) ainda precisa de implementação integral.**
