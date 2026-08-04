# Fluxo Completo: Clique na Conversa → Atualização de Estado → Renderização do ChatPanel

## 1. O CLIQUE (Origem)

**Arquivo:** `src/features/inbox/components/conversation-list/ConversationItem.tsx`  
**Linhas:** 272 (modo compacto) e 497 (modo confortável)  
```tsx
onClick={() => onSelect(conversation)}
```
O `onSelect` vem como prop do `VirtualizedRealtimeList`.

**Arquivo:** `src/features/inbox/components/VirtualizedRealtimeList.tsx`  
**Linhas 83-86:**
```tsx
const handleSelect = useCallback(
  () => onSelectConversation(contactId),
  [onSelectConversation, contactId],
);
```

**Arquivo:** `src/features/inbox/components/ConversationListSidebar.tsx`  
**Linha 476:** passa `inbox.handleSelectConversation` como `onSelectConversation`.

---

## 2. A FUNÇÃO QUE ATUALIZA O ESTADO

**Arquivo:** `src/features/inbox/hooks/useRealtimeInbox.ts`  
**Linhas 385-400:**

```typescript
const handleSelectConversation = useCallback(
  (contactId: string) => {
    setSelectedContactId(contactId);        // ✅ Atualiza estado principal
    setSelectedContact(contactId);          // ✅ Notifica sistema de notificações
    setDeliveryAlert(null);                 // ✅ Reseta alertas

    if (USE_EXTERNAL_DB) {
      void supabase.functions.invoke('evolution-api', {  // ✅ Marca como lido na Evolution API
        body: { action: 'read-messages', instanceName: 'wpp2', remoteJid: contactId },
      });
    } else {
      markAsRead(contactId);               // ✅ Marca como lido localmente
    }
  },
  [setSelectedContact, markAsRead]
);
```

Esta função:
1. Seta `selectedContactId` → dispara re-renderização
2. Avisa o sistema de notificações que esta conversa está ativa
3. Marca mensagens como lidas (Evolution API ou local)

---

## 3. A CADEIA DE DATA FLOW (selectedContactId → ChatPanel)

### 3.1 Data Source Loading
**Arquivo:** `src/features/inbox/hooks/useInboxSource.ts`  
**Linha 63:** `const source = useInboxSource(USE_EXTERNAL_DB, selectedContactId);`

Quando `USE_EXTERNAL_DB = true` (linha 35 do useRealtimeInbox.ts):
- `useExternalMessages(selectedContactId)` carrega mensagens da Evolution DB
- `useExternalConversations()` mantém a lista de conversas via polling (15s)

### 3.2 Localização da Conversa na Lista
**Arquivo:** `src/features/inbox/hooks/useRealtimeInbox.ts`  
**Linhas 157-163:**
```typescript
const selectedConversation = useMemo(
  () => conversations.find(
    (c) => c.contact.id === selectedContactId || c.contact.remote_jid === selectedContactId
  ) || null,
  [conversations, selectedContactId]
);
```

### 3.3 Fallback Contact (se não encontrada na lista)
**Linhas 165-184:** tentativa de carregar contato via Supabase direto.  
**⚠️ BREAK POINT A:** Quando `USE_EXTERNAL_DB = true`, esta busca é SKIPPED:
```typescript
if (!selectedContactId || selectedConversation || USE_EXTERNAL_DB) {
  setSelectedContactFallback(null);
  return;
}
```

### 3.4 Resolução Final da Conversa
**Linhas 186-190:**
```typescript
const resolvedSelectedConversation = useMemo<ConversationWithMessages | null>(() => {
  if (selectedConversation) return selectedConversation;
  if (!selectedContactFallback) return null;       // ← BREAK POINT B: retorna null
  return { contact: selectedContactFallback, messages: [], unreadCount: 0, lastMessage: null };
}, [selectedConversation, selectedContactFallback]);
```

### 3.5 Mapeamento para Legacy
**Linhas 414-428:**
```typescript
const legacyConversation = useMemo(
  () => mapToLegacyConversation(resolvedSelectedConversation),  // null se resolved for null
  [resolvedSelectedConversation]
);
const legacyMessages = useMemo(
  () => mapToLegacyMessages(...),
  [selectedMessages, resolvedSelectedConversation, selectedContactId]
);
```

### 3.6 Renderização do ChatPanel
**Arquivo:** `src/features/inbox/components/RealtimeInboxView.tsx`  
**Linhas 323-369:**
```tsx
{inbox.legacyConversation ? (              // ← BREAK POINT C: se null, mostra InboxEmptyChat
  <Suspense fallback={<ChatFallback />}>
    <div ...>
      <div ...>
        {inbox.selectedContactId && (       // ← BREAK POINT D: se null, não renderiza ChatPanel
          <SectionErrorBoundary ...>
            <ChatPanel
              key={inbox.legacyConversation.id}
              conversation={inbox.legacyConversation}
              messages={inbox.legacyMessages}
              ...
            />
          </SectionErrorBoundary>
        )}
      </div>
    </div>
  </Suspense>
) : (
  <div ...><InboxEmptyChat /></div>
)}
```

---

## 4. BREAK POINTS IDENTIFICADOS

### 🔴 BREAK POINT A (CRÍTICO) — `selectedContactFallback` nunca é carregado no modo externo
**Arquivo:** `useRealtimeInbox.ts`, linhas 165-168

```typescript
if (!selectedContactId || selectedConversation || USE_EXTERNAL_DB) {
  setSelectedContactFallback(null);
  return;
}
```

**Problema:** Quando `USE_EXTERNAL_DB = true` e a conversa clicada **não está na lista sidebar** (ex.: conversa antiga, filtrada, ou de outra instância), o fallback é explicitamente bloqueado. Isso faz `resolvedSelectedConversation = null`, que faz `legacyConversation = null`, que faz o ChatPanel **não renderizar** e mostrar `<InboxEmptyChat />`.

**Solução potencial:** Permitir o fallback mesmo com `USE_EXTERNAL_DB` (ou buscar o contato via proxy externo em vez de Supabase direto).

---

### 🔴 BREAK POINT B (CRÍTICO) — `resolvedSelectedConversation` retorna null sem fallback
**Arquivo:** `useRealtimeInbox.ts`, linha 188

```typescript
if (!selectedContactFallback) return null;
```

**Consequência:** `mapToLegacyConversation(null)` retorna `null`, e o ChatPanel desaparece.

---

### 🔴 BREAK POINT C — Guarda `inbox.legacyConversation` no RealtimeInboxView
**Arquivo:** `RealtimeInboxView.tsx`, linha 323

Sem `legacyConversation`, o componente `<InboxEmptyChat />` aparece — e não há indicador de "carregando" ou "selecione uma conversa" com feedback de loading.

---

### 🔴 BREAK POINT D — Guarda `inbox.selectedContactId` aninhada
**Arquivo:** `RealtimeInboxView.tsx`, linha 327

Apesar de `legacyConversation` existir, o `ChatPanel` só renderiza se `selectedContactId` também for truthy. Em condições normais isso sempre é true, mas se houver um race condition onde `legacyConversation` é derivado e o estado ainda está sendo atualizado, pode haver flicker.

---

### 🟡 BREAK POINT E — Race condition no `useExternalMessages`
**Arquivo:** `useExternalApiManagement.ts`, linhas 575-583

```typescript
useEffect(() => {
  if (remoteJid !== previousJidRef.current) {
    previousJidRef.current = remoteJid;
    lastSeenRef.current = null;
    setHasMore(true);
    setMessages([]);        // ← Limpa mensagens
    void initialFetch();
  }
}, [remoteJid, initialFetch]);
```

Quando o usuário clica em uma conversa:
1. `remoteJid` muda → mensagens são **limpas** (`setMessages([])`)
2. `initialFetch()` é chamada para buscar mensagens
3. Durante o fetch, `selectedMessages` está vazio → `legacyMessages` está vazio → ChatPanel mostra tela em branco
4. O `initialFetch` tem um guard que pode abortar se a jid mudar novamente

**Problema:** Não há estado de "loading messages" distinto para o ChatPanel mostrar um spinner. O `selectedMessagesLoading` é `true`, mas o ChatPanel renderiza com `messages={[]}` durante o carregamento.

---

### 🟡 BREAK POINT F — React key força remontagem completa
**Arquivo:** `RealtimeInboxView.tsx`, linha 330

```tsx
key={inbox.legacyConversation.id}
```

Cada troca de conversa desmonta e remonta o ChatPanel inteiro. Perde todo estado interno (scroll position, dialogs abertos, etc.). Isso é intencional, mas pode causar flicker e perda de estado UX.

---

### 🟡 BREAK POINT G — Conversa pode não ser encontrada por JID vs ID mismatch
**Arquivo:** `useRealtimeInbox.ts`, linha 160

```typescript
c.contact.id === selectedContactId || c.contact.remote_jid === selectedContactId
```

Se `selectedContactId` for passado como JID (`551199999999@s.whatsapp.net`) mas guardado na lista como phone (`551199999999`), ou vice-versa, a conversa não será encontrada. Isso é relevante quando a Evolution API retorna remote_jid vs phone.

---

### 🟢 BREAK POINT H (INOFENSIVO) — `markAsRead` via Evolution API
**Arquivo:** `useRealtimeInbox.ts`, linhas 391-394

`supabase.functions.invoke('evolution-api', { action: 'read-messages', ... })` é **fire-and-forget** (`void`). Se falhar (ex.: Edge Function timeout), não quebra o fluxo de renderização, mas a conversa pode não ser marcada como lida.

---

## 5. DIAGRAMA DO FLUXO COMPLETO

```
User click on ConversationItem
  │
  ▼
ConversationItem.onClick(conversation)
  │ onSelect={handleSelect} [VirtualizedRealtimeList]
  ▼
handleSelect = () => onSelectConversation(contactId)
  │ onSelectConversation={inbox.handleSelectConversation}
  ▼
handleSelectConversation(contactId) [useRealtimeInbox]
  │
  ├── setSelectedContactId(contactId) ─────────► useState update
  ├── setSelectedContact(contactId) ───────────► notification system
  ├── setDeliveryAlert(null)
  └── supabase.functions.invoke('evolution-api', {read-messages})  (fire & forget)
        │
        ▼  [React re-render]
  selectedContactId changed
        │
        ├──► useInboxSource(USE_EXTERNAL_DB, selectedContactId)
        │     └── useExternalMessages(selectedContactId)
        │           └── fetchMessagesByJid() → setMessages([...])
        │
        ├──► selectedConversation memo
        │     └── conversations.find(contact.id === selectedContactId || remote_jid === ...)
        │
        ├──► [GUARD] selectedContactFallback ← SKIPPED when USE_EXTERNAL_DB=true  ← BREAK A
        │
        ├──► resolvedSelectedConversation memo
        │     └── if (!selectedConversation && !selectedContactFallback) → null  ← BREAK B
        │
        ├──► legacyConversation memo
        │     └── mapToLegacyConversation(resolvedSelectedConversation)
        │           └── if resolved is null → null  ← BREAK C
        │
        ├──► legacyMessages memo
        │     └── mapToLegacyMessages(selectedMessages || conversation.messages)
        │
        ▼
  RealtimeInboxView render
        │
        ├── guard: legacyConversation ? → ChatPanel : InboxEmptyChat  ← BREAK C
        └── guard: selectedContactId ? → renderiza : não renderiza    ← BREAK D
              │
              ▼
          ChatPanel(conversation, messages)
```

---

## 6. RESUMO DOS BREAK POINTS MAIS PROVÁVEIS

| Prioridade | Break Point | Arquivo:Linha | Condição de Falha | Sintoma |
|---|---|---|---|---|
| 🔴 **A** | Fallback contact SKIPPED com USE_EXTERNAL_DB | `useRealtimeInbox.ts:166` | Conversa não está na sidebar + USE_EXTERNAL_DB=true | ChatPanel não abre, mostra "Nenhuma conversa" |
| 🔴 **B** | resolvedSelectedConversation = null | `useRealtimeInbox.ts:188` | Sem fallback e sem conversa na lista | Mesmo que A |
| 🟡 **C** | ChatPanel só renderiza se legacyConversation existe | `RealtimeInboxView.tsx:323` | resolved = null → legacy = null | InboxEmptyChat no lugar do chat |
| 🟡 **D** | selectedContactId guard duplicado | `RealtimeInboxView.tsx:327` | Race condition no estado | Flicker |
| 🟡 **E** | Messages limpos durante troca de conversa | `useExternalApiManagement.ts:580` | Troca de JID → clear + fetch | ChatPanel vazio durante loading |
| 🟡 **F** | React key força remontagem | `RealtimeInboxView.tsx:330` | Cada troca de conversa | Perda de estado interno |
| 🟡 **G** | JID vs phone mismatch na busca | `useRealtimeInbox.ts:160` | selectedContactId não corresponde ao formato guardado | Conversa não encontrada |
