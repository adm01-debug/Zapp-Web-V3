# Plano de Correção e Melhorias — Módulo `ChatPanel`

**Repositório:** `adm01-debug/zapp-web-v3`
**Baseline auditada:** commit `a631524c58557abd968a648a3281a2fd2a8e832a` (main, 2026-07-30 20:17 UTC)
**Escopo:** `src/features/inbox/components/ChatPanel.tsx` + `src/features/inbox/components/chat/**` (66 arquivos, 14.507 LOC) + hooks de dados do inbox + camada Supabase self-hosted (`supabase-mcp.atomicabr.com.br`)
**Autor do plano:** auditoria QA/DBA — 2026-07-30
**Status:** proposto, nenhuma etapa aplicada

---

## 0. Como ler este documento

Cada etapa tem a mesma estrutura, para que possa ser executada de forma independente por qualquer pessoa (ou delegada ao Claude Code no VPS):

| Campo | Significado |
|---|---|
| **Severidade** | P0 (quebra produção hoje) · P1 (alto) · P2 (médio) · P3 (hardening) |
| **Depende de** | Etapas que precisam estar concluídas antes |
| **Arquivos** | Caminhos exatos tocados |
| **Diagnóstico** | O defeito concreto, com linha |
| **Mudança** | O patch proposto |
| **Critério de aceite** | Condição binária de "pronto" |
| **Teste de regressão** | O teste que impede o bug de voltar |
| **Risco / Rollback** | O que pode dar errado e como reverter |
| **Esforço** | Estimativa em horas de trabalho focado |

### Convenções obrigatórias do repositório

Estas regras valem para **todas** as etapas e derivam do histórico operacional do projeto:

1. **Escrita no GitHub via FOREVER MCP** (`github_push_files` / `github_create_or_update_file`). O GitHub MCP padrão retorna 403/404 em `adm01-debug`.
2. **Conteúdo em texto puro** no `github_push_files` — sem flag de base64.
3. **Migrations no Supabase self-hosted:** `supabase_apply_migration` está quebrado (referencia coluna inexistente `executed_at`). Usar `supabase_db_query` para o DDL + `INSERT` manual na tabela de tracking.
4. **Shell do VPS é `dash`,** não bash. Nada de bashisms.
5. **Vitest exige** `NODE_OPTIONS=--max-old-space-size=4096` ou mais.
6. **Hooks do Husky:** `HUSKY=0 git commit` quando necessário.
7. **Bot da Lovable** (`gpt-engineer-app[bot]`) commita direto em `main` a ~1 commit/70s. Ver **Etapa 20** — sem branch protection, qualquer correção deste plano pode ser revertida silenciosamente.

---

## 1. Sumário executivo dos defeitos

| ID | Severidade | Defeito | Etapa |
|---|---|---|---|
| D-01 | **P0** | Fallback de contato consulta `contacts.id` (uuid) com um JID → HTTP 400 → **ChatPanel não abre** | E02 |
| D-02 | **P0** | `instanceName` é sempre `''` em modo externo → **edição de mensagem é falso-positivo silencioso** | E03 |
| D-03 | **P0** | `registerRef` é no-op → `scrollToMessage()` sempre `false` → **3 features mortas** | E04 |
| D-04 | **P0** | Policy `messages_select` é `USING(true)` disfarçada → **sem isolamento entre agentes** | E08 |
| D-05 | **P1** | `TRUNCATE` concedido a `authenticated` em 891 tabelas | E09 |
| D-06 | **P1** | Canal Realtime com nome fixo `chat-updates-shared` → subscription morre ao trocar de conversa | E05 |
| D-07 | **P1** | Chaves de cache cross-tab usam `DEFAULT_INSTANCE` literal + `instanceName` fora das deps | E07 |
| D-08 | **P1** | Virtualizador sem `measureElement`/`scrollMargin` → offsets deslocados | E16 |
| D-09 | **P1** | Assinatura duplicada no retry de envio | E12 |
| D-10 | **P2** | `useChatPanel.ts` — 393 linhas de código morto e divergente | E18 |
| D-11 | **P2** | `useChatFilters` sem `useMemo` → anula o `memo()` do `ChatMessagesArea` | E15 |
| D-12 | **P2** | `useQuickReplies()` chamado 2× no mesmo componente | E17 |
| D-13 | **P2** | `onProgress` nunca invocado → barra de progresso decorativa | E13 |
| D-14 | **P2** | `whisperCount` recebido e ignorado; `dialogs.whisper` nunca aberto | E13 |
| D-15 | **P2** | Publicação Realtime com partições redundantes → risco de evento duplicado | E06 |
| D-16 | **P2** | `useInitialHighlight` reinicia a cada mensagem nova | E04 |
| D-17 | **P2** | Inserts de enquete/cartão gravam JID em coluna `uuid` | E14 |
| D-18 | **P3** | `anon` com `SELECT` em `public.contacts` (inerte hoje, mina amanhã) | E10 |
| D-19 | **P3** | PAT do GitHub em texto plano em `~/.git-credentials` no container | E20 |
| D-20 | **P3** | Suíte de testes não executa (`--reporter=basic` removido do Vitest) | E19 |

---

## 2. Mapa das 20 etapas

```
BLOCO A — DESBLOQUEIO FUNCIONAL (P0)          ~14h
  E01  Camada única de identidade de contato (ContactRef)
  E02  Fallback de contato: ramificar JID vs UUID
  E03  Propagação real de instanceName
  E04  scrollToMessage via virtualizer (índice, não ref)

BLOCO B — REALTIME E CONSISTÊNCIA             ~11h
  E05  Canal por conversa + filtro server-side
  E06  Higienizar a publicação supabase_realtime
  E07  Multi-instância: chaves de cache e deps

BLOCO C — SEGURANÇA SUPABASE                  ~16h
  E08  RLS com escopo real em evolution_messages
  E09  Revogar TRUNCATE/REFERENCES/TRIGGER de authenticated
  E10  Grants de anon + blindagem das views

BLOCO D — INTEGRIDADE DE ENVIO E EDIÇÃO       ~12h
  E11  Edição de mensagem sem falso sucesso
  E12  Assinatura idempotente
  E13  Contrato de onSendMessage + progresso real + whisperCount
  E14  Inserts auxiliares com referência correta

BLOCO E — PERFORMANCE E RENDER                ~10h
  E15  Memoização do pipeline de filtros
  E16  Virtualizador correto
  E17  Deduplicação de hooks e cálculos mortos

BLOCO F — QUALIDADE E GUARDA-CORPOS           ~15h
  E18  Remoção de código morto e barrel consistente
  E19  Reativar e ampliar a suíte de testes
  E20  Guarda-corpos permanentes (CI, branch protection, segredos)
```

**Esforço total estimado:** ~78h. **Caminho crítico para "chat volta a funcionar":** E01 → E02 → E03 → E04 (~14h).

---

# BLOCO A — DESBLOQUEIO FUNCIONAL

## Etapa 01 — Camada única de identidade de contato (`ContactRef`)

**Severidade:** P0 (habilitadora) · **Depende de:** — · **Esforço:** 3h

### Diagnóstico

O módulo trata `contact.id` de forma ambígua. Com `USE_EXTERNAL_DB = true` (`useRealtimeInbox.ts:35`), `selectedContactId` carrega o **`remote_jid`** do WhatsApp; em modo local carrega um **UUID**. O código alterna entre as duas interpretações sem contrato:

- `ChatPanel.tsx:165` — trata como JID (`.endsWith('@g.us')`)
- `ChatPanel.tsx:243` — trata como JID (`remoteJid:`)
- `ChatPanel.tsx:421,445,509` — trata como UUID (`contactId` para tickets, SLA, overlays)
- `ChatPanel.tsx:543,557` — trata como UUID (`contact_id` em coluna `uuid`)
- `ChatPanel.tsx:331` — deriva um terceiro formato a partir do telefone

Já existem **três** guards `isValidUUID` espalhados (`useRealtimeInbox.ts:220`, `useChatPanelHandlers.ts:185`, `useChatMediaSending.ts:72`), cada um com comportamento diferente para o mesmo caso. É sintoma clássico de abstração faltante.

### Mudança

Criar `src/features/inbox/utils/contactRef.ts`:

```ts
/**
 * Identidade canônica de um contato no inbox.
 *
 * Em modo externo (USE_EXTERNAL_DB=true) o inbox opera por remote_jid;
 * em modo local, por UUID. Toda consulta ao banco DEVE passar por aqui —
 * filtrar uma coluna uuid com um JID gera PostgREST 400 e falha silenciosa.
 */
export type ContactRef =
  | { kind: 'uuid'; uuid: string; raw: string }
  | { kind: 'jid'; remoteJid: string; phone: string | null; isGroup: boolean; raw: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const JID_SUFFIXES = ['@s.whatsapp.net', '@g.us', '@lid', '@broadcast'] as const;

export function resolveContactRef(raw: string | null | undefined): ContactRef | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (UUID_RE.test(value)) {
    return { kind: 'uuid', uuid: value.toLowerCase(), raw: value };
  }

  const isGroup = value.endsWith('@g.us');
  const hasSuffix = JID_SUFFIXES.some((s) => value.endsWith(s));
  // Um número puro ("551146375517") também é um JID sem sufixo — normalizamos.
  const remoteJid = hasSuffix
    ? value
    : /^\d{8,15}$/.test(value)
      ? `${value}@s.whatsapp.net`
      : value;

  const phone = isGroup ? null : (remoteJid.split('@')[0].replace(/\D/g, '') || null);

  return { kind: 'jid', remoteJid, phone, isGroup, raw: value };
}

/** `true` quando a referência pode ser usada como filtro em coluna `uuid`. */
export function isUuidRef(ref: ContactRef | null): ref is Extract<ContactRef, { kind: 'uuid' }> {
  return ref?.kind === 'uuid';
}
```

Substituir os três `isValidUUID` locais por `resolveContactRef` nos pontos de decisão.

> **Nota deliberada:** o regex de UUID exige versão 1–8 e variante RFC 4122. Um `isValidUUID` mais frouxo aceitaria strings como `00000000-0000-0000-0000-000000000000`, que o Postgres aceita mas que na prática indicam bug a montante. Se a base tiver UUIDs fora do padrão, relaxar para `[0-9a-f]{4}` nos dois grupos — **verificar antes de aplicar**:
> ```sql
> SELECT count(*) FROM evo.evolution_contacts
> WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
> ```

### Critério de aceite
- `resolveContactRef` exportada e usada em ≥ 3 call-sites.
- `grep -rn "isValidUUID" src/features/inbox` retorna 0 ocorrências fora de `contactRef.ts`.

### Teste de regressão
`src/features/inbox/utils/__tests__/contactRef.test.ts` — tabela de casos:

| Entrada | `kind` | Observação |
|---|---|---|
| `3f7c...-...` (uuid v4) | `uuid` | caminho local |
| `551146375517@s.whatsapp.net` | `jid` | caminho externo padrão |
| `551146375517` | `jid` | número puro → normaliza sufixo |
| `120363...@g.us` | `jid`, `isGroup` | grupo, `phone === null` |
| `""` / `null` / `undefined` | `null` | guard de entrada |
| `not-a-thing` | `jid` | degrada sem lançar |

### Risco / Rollback
Risco baixo — módulo novo, sem efeito colateral. Rollback = reverter o commit.

---

## Etapa 02 — Fallback de contato: ramificar JID vs UUID

**Severidade:** P0 · **Depende de:** E01 · **Esforço:** 4h

### Diagnóstico

`src/features/inbox/hooks/useRealtimeInbox.ts:164-183`:

```ts
useEffect(() => {
  if (!selectedContactId || selectedConversation) { setSelectedContactFallback(null); return; }
  const loadSelectedContact = async () => {
    const { data, error } = await supabase
      .from('contacts').select('*')
      .eq('id', selectedContactId)   // ← JID em coluna uuid
      .maybeSingle();
    if (!cancelled && !error) setSelectedContactFallback(data || null);
  };
  ...
}, [selectedContactId, selectedConversation]);
```

**Prova empírica contra o banco de produção:**

```sql
SELECT count(*) FROM public.contacts WHERE id = '551146375517@s.whatsapp.net';
-- ERRO: invalid input syntax for type uuid: "551146375517@s.whatsapp.net"
```

`public.contacts` é uma **VIEW** (`relkind='v'`, `security_invoker=true`) sobre `zapp.contacts`, com `id uuid`. PostgREST devolve **400**, `error` fica truthy, `setSelectedContactFallback` nunca executa, `resolvedSelectedConversation` permanece `null` e `RealtimeInboxView.tsx:323` (`inbox.legacyConversation ? ... : null`) não renderiza nada.

O commit `a631524c` removeu o curto-circuito `|| USE_EXTERNAL_DB` da condição de guarda, mas **não adicionou o ramo de JID** — trocou "não tenta" por "tenta e recebe 400". O bug relatado persiste.

**Agravante encadeado:** `useInboxSource.ts:30-38` deriva `selectedConversationInstance` procurando o contato dentro de `conversations`. No cenário de fallback o contato **não está** nessa lista por definição, logo `selectedConversationInstance === undefined` e `useExternalMessages` cai em `DEFAULT_INSTANCE` — para um contato de outra instância, as mensagens vêm da partição errada.

### Mudança

```ts
import { resolveContactRef } from '@/features/inbox/utils/contactRef';

useEffect(() => {
  if (!selectedContactId || selectedConversation) {
    setSelectedContactFallback(null);
    return;
  }
  const ref = resolveContactRef(selectedContactId);
  if (!ref) { setSelectedContactFallback(null); return; }

  let cancelled = false;

  const loadSelectedContact = async () => {
    const query =
      ref.kind === 'uuid'
        ? supabase.from('contacts').select('*').eq('id', ref.uuid).maybeSingle()
        : supabase
            .from('evolution_contacts')
            .select('*')
            .eq('remote_jid', ref.remoteJid)
            // Um mesmo JID pode existir em várias instâncias; a mais
            // recentemente atualizada é a conversa ativa.
            .order('updated_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

    const { data, error } = await query;
    if (cancelled) return;
    if (error) {
      log.warn('[fallbackContact] falha ao carregar contato', {
        kind: ref.kind, raw: ref.raw, code: error.code, message: error.message,
      });
      setSelectedContactFallback(null);
      return;
    }
    setSelectedContactFallback(data ?? null);
  };

  void loadSelectedContact();
  return () => { cancelled = true; };
}, [selectedContactId, selectedConversation]);
```

Extrair para `src/features/inbox/hooks/useFallbackContact.ts` (o arquivo **já existe** no repo e está subutilizado — consolidar ali em vez de manter a lógica inline).

### Ponto de atenção

O `error` passa a ser **logado** em vez de descartado. Hoje o `if (!error)` engole qualquer falha. Sem isso, o próximo bug desta classe leva outros 8 meses para aparecer.

### Critério de aceite
- Abrir o inbox, clicar em uma conversa que **não** está na lista lateral (deep-link `?contact=<jid>`) → ChatPanel renderiza com nome e avatar corretos.
- Nenhum 400 no Network tab com `invalid input syntax for type uuid`.
- O log de warning aparece quando o contato realmente não existe (não silencia).

### Teste de regressão
`useFallbackContact.test.ts` com mock do client Supabase:
1. `kind='uuid'` → assert que `.from('contacts')` e `.eq('id', ...)` foram chamados.
2. `kind='jid'` → assert que `.from('evolution_contacts')` e `.eq('remote_jid', ...)` foram chamados.
3. Erro do PostgREST → `setSelectedContactFallback(null)` **e** `log.warn` chamado.
4. Unmount durante o `await` → nenhum `setState` após unmount.

### Risco / Rollback
`evolution_contacts` (view em `public`) precisa de `SELECT` para `authenticated` — **confirmado presente**. Rollback = reverter o commit; o comportamento volta a ser "não abre".

---

## Etapa 03 — Propagação real de `instanceName`

**Severidade:** P0 · **Depende de:** E01 · **Esforço:** 5h

### Diagnóstico

`src/features/inbox/hooks/useChatMediaSending.ts:70-72`:

```ts
const resolveInstance = useCallback(async (): Promise<string> => {
  if (instanceName) return instanceName;
  if (!isValidUUID(contactId)) return '';   // ← em modo externo, SEMPRE
  ...
```

Em modo externo `contactId` é JID ⇒ `instanceName` é **permanentemente `''`**. Cascata completa:

| Consumidor | Linha | Consequência real |
|---|---|---|
| Edição de mensagem | `useChatPanelHandlers.ts:125` | `if (instanceName && ...)` nunca entra → **API Evolution nunca chamada** |
| ...seguido de | `useChatPanelHandlers.ts:134` | toast **"Mensagem editada com sucesso"** dispara mesmo assim |
| `useAutomations` | `ChatPanel.tsx:244` | nenhuma regra casa por instância |
| `ChatMessagesArea` | `ChatPanel.tsx:460` | operações de mídia/status sem instância |
| `ChatInputArea` | `ChatPanel.tsx:512` | sticker / emoji custom / áudio-meme quebrados |
| `whatsappConnectionId` | `useChatMediaSending.ts:88` | fica `null` → FK nula nos inserts de enquete/cartão |

**O agente edita, vê "sucesso", e no WhatsApp do cliente nada mudou.** É o pior formato de defeito: perda de confiança sem sinal de erro.

O dado correto **já existe e já é calculado**: `useInboxSource.ts:30-38` deriva `selectedConversationInstance` a partir de `contact.instance_name` (`evo.evolution_contacts.instance_name`, `character varying`). Ele simplesmente nunca chega ao `ChatPanel`.

### Mudança

**3.1** — `useInboxSource.ts`: expor `selectedConversationInstance` no retorno do hook.

**3.2** — `useRealtimeInbox.ts`: repassar, com fallback para o contato de fallback da E02:

```ts
const resolvedInstanceName =
  selectedConversationInstance ??
  resolvedSelectedConversation?.contact?.instance_name ??
  undefined;
// ...
return { /* ... */, instanceName: resolvedInstanceName };
```

**3.3** — `ChatPanel.tsx`: aceitar `instanceName` por prop, com o hook como fallback:

```ts
interface ChatPanelProps extends LoadOlderProps {
  // ...
  /** Instância WhatsApp da conversa (evo.evolution_contacts.instance_name).
   *  Obrigatória em modo externo — sem ela, edição e mídia ficam inertes. */
  instanceName?: string;
}

const {
  instanceName: resolvedInstanceName,
  whatsappConnectionId,
  initResolve,
  /* ... */
} = useChatMediaSending(conversation.contact.id, conversation.contact.phone);

const instanceName = instanceNameProp || resolvedInstanceName;
```

**3.4** — `RealtimeInboxView.tsx:329` e `ChatPopup.tsx:229`: passar `instanceName={inbox.instanceName}`.

**3.5** — `useChatMediaSending.ts`: aceitar `instanceHint` como terceiro argumento e usar antes de tentar resolver por UUID:

```ts
export function useChatMediaSending(
  contactId: string,
  contactPhone: string | undefined,
  instanceHint?: string,
) {
  const [instanceName, setInstanceName] = useState(instanceHint ?? '');
  useEffect(() => {
    if (instanceHint) setInstanceName(instanceHint);
  }, [instanceHint]);
  // resolveInstance permanece como caminho legado (modo local / UUID)
```

**3.6** — Guarda-corpo em desenvolvimento: avisar quando a instância não resolver.

```ts
useEffect(() => {
  if (import.meta.env.DEV && !instanceName) {
    log.warn('[ChatPanel] instanceName vazio — edição, stickers e automações ficarão inertes', {
      contactId: conversation.contact.id,
    });
  }
}, [instanceName, conversation.contact.id]);
```

### Critério de aceite
- Abrir uma conversa e inspecionar: `instanceName` === `'wpp2'` (ou a instância real do contato), nunca `''`.
- Editar uma mensagem enviada há < 15 min → a alteração **aparece no WhatsApp do destinatário**.
- Enviar um sticker → chega ao destinatário.

### Teste de regressão
1. `useChatMediaSending` com `instanceHint='comercial_03'` e `contactId` JID → retorna `'comercial_03'` sem tocar no banco.
2. Teste de contrato: renderizar `ChatPanel` com `instanceName` ausente e `contactId` JID → assert que o `log.warn` de DEV dispara (impede regressão silenciosa).
3. Teste de integração da edição: com `instanceName` vazio, `editMessageApi` **não** é chamado **e** o toast de sucesso **não** dispara (ver E11).

### Risco / Rollback
Médio. Mexe em 5 arquivos e no contrato público do `ChatPanel`. `instanceName` é opcional, então nenhum call-site quebra em compilação. Rollback = reverter o commit; o sistema volta ao comportamento atual (inerte).

---

## Etapa 04 — `scrollToMessage` via virtualizer (índice, não ref)

**Severidade:** P0 · **Depende de:** — · **Esforço:** 4h

### Diagnóstico

Dois defeitos sobrepostos.

**4.a — O ref nunca é registrado.**
`ChatMessagesArea.tsx:304` passa `registerRef={noopRegisterRef}` (uma função vazia definida na linha 221) enquanto `MessageBubble.tsx:133` faz `ref={registerRef}`. O `messageRefsRef` (linha 105) **nunca recebe um único elemento**. Logo `scrollToMessage()` (linha 117) retorna `false` em 100% das chamadas.

**4.b — Ainda que 4.a fosse corrigido, o ref não resolve o problema.**
A lista é **virtualizada** (`useVirtualizer`, linha 176, `overscan: 12`). Refs só existem para as linhas **montadas**. Uma mensagem 400 posições acima simplesmente não tem elemento no DOM — nenhuma correção baseada em ref pode alcançá-la.

Features mortas em consequência:
1. **Deep-link "Ver no chat"** — `useInitialHighlight.ts:60` tenta 10× a cada 150ms e desiste
2. **Clique na citação de resposta** — `ChatPanel.tsx:336` `handleScrollToMessage` → no-op
3. **Navegação dos resultados da busca** — `ChatPanel.tsx:415` → no-op

**4.c — Efeito colateral no `useInitialHighlight`.**
`hooks/useInitialHighlight.ts:94-101` inclui `messages` nas deps. Em conversa ativa, cada mensagem nova derruba o efeito, zera `attempts`, reinicia a retentativa e cancela o timer de 3.5s — o destaque nunca conclui e o toast "Mensagem não encontrada" pode repetir.

### Mudança

**4.1** — Trocar a estratégia de scroll de *ref* para *índice*, que é o modelo correto para lista virtualizada:

```ts
// dentro de ChatMessagesArea, antes do useImperativeHandle
const messageIndexRef = useRef<Map<string, number>>(new Map());
useEffect(() => {
  const map = new Map<string, number>();
  messages.forEach((m, i) => {
    if (m.id) map.set(m.id, i);
    if (m.external_id) map.set(m.external_id, i);  // aceita id externo
  });
  messageIndexRef.current = map;
}, [messages]);

useImperativeHandle(ref, () => ({
  scrollToBottom: () => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
    }
  },
  registerMessageRef: (messageId, el) => {
    const map = messageRefsRef.current;
    if (el) map.set(messageId, el); else map.delete(messageId);
  },
  scrollToMessage: (messageId: string): boolean => {
    const index = messageIndexRef.current.get(messageId);
    if (index === undefined) return false;          // não carregada: chamador pode paginar
    virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
    setPendingFlashId(messageId);                    // destaque aplicado ao montar
    return true;
  },
  getScrollContainer: () => scrollContainerRef.current,
}), [messages.length, virtualizer]);
```

**4.2** — Ligar o `registerRef` de verdade (necessário para o flash visual da linha ao montar):

```ts
const registerRefFactory = useCallback(
  (id: string) => (el: HTMLDivElement | null) => {
    const map = messageRefsRef.current;
    if (el) map.set(id, el); else map.delete(id);
  },
  []
);
// no JSX:  registerRef={registerRefFactory(message.id)}
```

> A fábrica ainda cria uma closure por item por render. Se o profiling mostrar impacto, migrar o `MessageBubble` para `data-message-id` + `querySelector` no container — já existe `data-message-id` em `MessageBubble.tsx:142`.

**4.3** — Corrigir as deps do `useInitialHighlight`: depender de `messages.length` e de um índice estável, não do array:

```ts
const messageKey = useMemo(
  () => messages.map((m) => m.id).join('|'),
  [messages]
);
// deps: [initialHighlightMessageId, messageKey, ...]
```
E mover `attempts` para um `useRef` que **não** zera entre re-execuções do mesmo `initialHighlightMessageId`.

**4.4** — Quando `scrollToMessage` retorna `false` e há histórico mais antigo, disparar `onLoadOlder()` antes de nova tentativa — hoje o deep-link para uma mensagem antiga é insolúvel por construção.

### Critério de aceite
- Buscar um termo no chat e clicar num resultado 200 mensagens acima → a lista rola até ele e ele pisca.
- Clicar na citação de uma resposta → salta para a mensagem original.
- Deep-link `?message=<id>` → abre, rola e destaca; se a mensagem não estiver carregada, pagina e então rola.
- Em conversa recebendo mensagens a cada 2s, o destaque conclui em 3.5s e o toast de erro não repete.

### Teste de regressão
1. `scrollToMessage` com id presente → retorna `true` e `virtualizer.scrollToIndex` foi chamado com o índice correto.
2. `scrollToMessage` com id ausente → retorna `false` (sem lançar).
3. `scrollToMessage` aceita `external_id` além de `id`.
4. `useInitialHighlight`: 20 re-renders com `messages` novo mas mesmo alvo → apenas **um** ciclo de retentativa, um `onHighlightConsumed`.

### Risco / Rollback
Médio-alto: mexe no `useImperativeHandle` do componente mais quente do módulo. Mitigar com o teste 1–3 antes do merge. Rollback = reverter; volta ao estado atual (quebrado, mas estável).

---

# BLOCO B — REALTIME E CONSISTÊNCIA

## Etapa 05 — Canal por conversa + filtro server-side

**Severidade:** P1 · **Depende de:** E01 · **Esforço:** 4h

### Diagnóstico

`ChatMessagesArea.tsx:137-156`:

```ts
const channel = supabase
  .channel(`chat-updates-shared`)                                  // ← nome FIXO
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' },  // ← SEM filtro
      (payload) => { /* filtragem no cliente */ })
  .subscribe();
return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
```

Três problemas independentes:

1. **Nome de tópico fixo.** Duas instâncias do `ChatPanel` (Inbox + `ChatPopup`, ou o remount por `key={conversation.id}` ao trocar de conversa) disputam o mesmo tópico. O `removeChannel()` do unmount antigo derruba a inscrição do novo. Sintoma de campo: *"o chat para de atualizar sozinho, só volta com F5"*.

2. **Sem filtro server-side.** Toda atualização de mensagem do sistema inteiro (60.103 linhas só em `wpp2`) trafega por WebSocket para **todos** os clientes logados. A filtragem acontece no `.some()` do cliente, depois de o payload já ter cruzado a rede.

3. **Invalidação de granularidade grosseira.** `invalidateQueries({ queryKey: queryKeys.messages.all() })` invalida **todas** as conversas em cache, não a afetada.

### Mudança

```ts
const remoteJid = /* ContactRef.remoteJid da conversa ativa */;

useEffect(() => {
  if (!conversationId || !remoteJid) return;

  const channel = supabase
    .channel(`chat-updates:${remoteJid}`)                 // tópico por conversa
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'evo',
        table: 'evolution_messages',
        filter: `remote_jid=eq.${remoteJid}`,             // filtro no servidor
      },
      () => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.messages.byConversation(conversationId),  // escopo estreito
        });
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);                 // removeChannel já faz unsubscribe
  };
}, [conversationId, remoteJid, queryClient]);
```

Aplicar o mesmo tratamento a `useTeamConversations.ts:128` (`.channel('team-chat-updates')`), que tem o mesmo defeito.

> **Pré-requisito de RLS:** o filtro `remote_jid=eq.` só é seguro se a policy de SELECT também escopar. Ver **E08** — as duas etapas são complementares: E05 reduz o tráfego, E08 fecha o vazamento.

### Critério de aceite
- Abrir Inbox e `ChatPopup` simultaneamente na mesma conversa → ambos recebem atualizações.
- Trocar de conversa 10× → o realtime continua funcionando na 10ª.
- No Network/WS: ao atualizar uma mensagem de **outra** conversa, nenhum frame chega ao cliente.

### Teste de regressão
Teste com mock do client: assert que o nome do canal contém o `remoteJid` e que o objeto de subscrição inclui a chave `filter`. Falha se alguém reintroduzir tópico fixo.

### Risco / Rollback
Baixo. Rollback trivial.

---

## Etapa 06 — Higienizar a publicação `supabase_realtime`

**Severidade:** P2 · **Depende de:** — · **Esforço:** 2h

### Diagnóstico

Estado verificado no banco:

```
pg_publication: supabase_realtime  |  puballtables=false  |  pubviaroot=true
```

Com `publish_via_partition_root = true`, adicionar a tabela particionada **pai** já publica todas as partições sob o nome do pai. Mas a publicação contém **pai e folha**:

| Relação | relkind |
|---|---|
| `evo.evolution_messages` | `p` (particionada) |
| `evo.evolution_messages_wpp2` | `r` (folha) ← redundante |
| `evo.evolution_conversations` | `p` |
| `evo.evolution_conversations_wpp2` | `r` ← redundante |

Consequências: entrada redundante com risco de **evento duplicado**, o que na camada de aplicação significa `invalidateQueries` duplicado e — mais grave — **reconciliação otimista dupla** em `evolutionReconcile.ts`.

**Achado colateral relevante:** apenas a partição `wpp2` foi explicitamente adicionada. As demais 11 partições (`marketing`, `logistica`, `comercial_01..15`, `financeiro`, `compras`, `gravacao`, `default`) nunca foram. Isso é coerente com o `handleSelectConversation` que **hardcoda** `instanceName: 'wpp2'` — o sistema é, de fato, mono-instância na prática. Distribuição real de dados:

| Instância | Mensagens |
|---|---|
| `wpp2` | 60.103 |
| `comercial_03` | 5 |

### Mudança

```sql
-- Verificação prévia (deve listar as duas folhas)
SELECT n.nspname||'.'||c.relname AS rel, c.relkind
FROM pg_publication_rel pr
JOIN pg_publication p ON p.oid = pr.prpubid
JOIN pg_class c ON c.oid = pr.prrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE p.pubname = 'supabase_realtime' AND c.relkind = 'r'
  AND c.relname LIKE 'evolution_%_%';

-- Correção
ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_messages_wpp2;
ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_conversations_wpp2;

-- Confirmação: o pai continua publicando todas as partições via root
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'evo'
ORDER BY tablename;
```

Aplicar via `supabase_db_query` + linha manual na tabela de tracking (o `supabase_apply_migration` está quebrado neste ambiente).

### Critério de aceite
- `pg_publication_rel` não contém mais nenhuma folha `evolution_*_<instancia>`.
- Realtime continua entregando UPDATE de `wpp2` **e** passa a entregar de `comercial_03`.
- Um UPDATE gera **um** evento no cliente (verificar com contador no handler).

### Teste de regressão
Adicionar ao workflow de CI de saúde do banco uma query que **falha** se `pg_publication_rel` contiver partição folha de uma tabela cujo pai também esteja publicado. Ver E20.

### Risco / Rollback
Baixo. Rollback: `ALTER PUBLICATION supabase_realtime ADD TABLE evo.evolution_messages_wpp2;`.

---

## Etapa 07 — Multi-instância: chaves de cache e dependências

**Severidade:** P1 · **Depende de:** E03 · **Esforço:** 5h

### Diagnóstico

`src/hooks/useExternalApiManagement.ts` — o parâmetro `instanceName` é aceito, documentado (linha 401-402: *"Passe conversation.instance_name para suportar múltiplas instâncias"*) e repassado aos fetchers... mas **as chaves de cache usam a constante literal**:

| Linha | Chave |
|---|---|
| 460 | `` `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}` `` |
| 500 | `` `inbox:poll:${remoteJid}:${afterDate}:${DEFAULT_INSTANCE}:${jidToPhone(remoteJid)}` `` |
| 534 | `` `older:${remoteJid}:${oldest}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}` `` |
| 596 | idem, no matcher do BroadcastChannel |

Duas abas vendo o mesmo JID em instâncias diferentes **compartilham a entrada de cache** — mensagens de uma instância são servidas para a outra.

**Agravante — stale closure:** `loadInitial` e `pollNewMessages` têm deps `[remoteJid, mountedRef, getContactAvatar]`. **`instanceName` está fora.** Como `selectedConversationInstance` (E03) resolve de forma assíncrona a partir de `conversations`, o primeiro `loadInitial` captura `undefined` e busca em `DEFAULT_INSTANCE` — e nunca se recupera, porque a callback não é recriada quando a instância chega.

**Terceiro nível:** `useExternalConversations` (linha 290-303) usa `DEFAULT_INSTANCE` na `queryKey` e no fetch → **a sidebar nunca listará conversas de `comercial_03`**, embora já existam 5 mensagens lá.

### Mudança

**7.1** — Instância efetiva explícita, com fallback único e visível:

```ts
const effectiveInstance = instanceName ?? DEFAULT_INSTANCE;
```

**7.2** — Todas as chaves passam a usar `effectiveInstance`:

```ts
`inbox:initial:${effectiveInstance}:${remoteJid}:${CONVERSATION_PAGE_SIZE}`
`inbox:poll:${effectiveInstance}:${remoteJid}:${afterDate}`
`older:${effectiveInstance}:${remoteJid}:${oldest}:${CONVERSATION_PAGE_SIZE}`
```

> Instância **antes** do JID: facilita o matcher por prefixo do BroadcastChannel e a inspeção manual.

**7.3** — `effectiveInstance` entra nas deps de `loadInitial`, `pollNewMessages`, `loadOlder` e do efeito de BroadcastChannel.

**7.4** — `useExternalConversations` passa a aceitar `instances?: string[]`, com default derivado das conexões ativas em `zapp.whatsapp_connections` em vez de constante hardcoded.

**7.5** — Remover o `'wpp2'` hardcoded de `useRealtimeInbox.ts:435`:

```ts
void supabase.functions.invoke('evolution-api', {
  body: {
    action: 'read-messages',
    instanceName: resolvedInstanceName,   // ← em vez de 'wpp2'
    remoteJid: contactId,
  },
});
```
Com guard: se `resolvedInstanceName` for falsy, **não invocar** (hoje marca como lida na instância errada).

### Critério de aceite
- Abrir uma conversa de `comercial_03` → as 5 mensagens aparecem.
- Duas abas, mesmo JID, instâncias diferentes → conteúdos distintos e corretos.
- `grep -n "DEFAULT_INSTANCE" src/hooks/useExternalApiManagement.ts` → apenas na definição do fallback.
- `grep -rn "'wpp2'" src/features src/hooks` → zero ocorrências.

### Teste de regressão
1. Chave de dedupe inclui a instância: chamar com `'a'` e `'b'` → duas chamadas ao fetcher, não uma.
2. Mudança de `instanceName` de `undefined` para `'comercial_03'` → refetch disparado.
3. Teste de lint/guarda: falha se `'wpp2'` reaparecer como literal em `src/`.

### Risco / Rollback
Médio — muda chaves de cache, o que invalida caches em memória (não persistidos; sem migração necessária). Rollback = reverter.

---

# BLOCO C — SEGURANÇA SUPABASE

## Etapa 08 — RLS com escopo real em `evo.evolution_messages`

**Severidade:** P0 · **Depende de:** E05 · **Esforço:** 8h

### Diagnóstico

Policy atual, verificada em produção:

```sql
-- evo.evolution_messages · policy "messages_select" · role authenticated · cmd SELECT
USING (
  instance_name = ANY (ARRAY[
    'wpp2','wppmkt','artes','comercial_01','comercial_02','comercial_03','comercial_04',
    'comercial_05','comercial_06','comercial_07','comercial_08','comercial_09','comercial_10',
    'comercial_11','comercial_12','comercial_13','comercial_14','comercial_15','compras',
    'default','financeiro','gravacao','logistica','marketing','wpp_pink_test','vendedor_01'
  ])
)
```

O array enumera **as 26 instâncias existentes**. Funcionalmente isto é `USING (true)`: **qualquer usuário autenticado lê todas as mensagens de todas as conversas da empresa.** Não há escopo por agente, fila, departamento ou atribuição.

Combinado com a subscrição sem filtro da E05, todo agente logado recebe em tempo real o payload de qualquer mensagem do sistema.

Policies vizinhas (para contexto):
- `messages_insert` / `authenticated_insert`: `WITH CHECK` nulo — insert irrestrito
- `messages_update` / `messages_delete`: restritas a `admin`/`supervisor` — **corretas**
- `service_role_all`: `USING(true)` — correta para service role

### Mudança

**Esta é a etapa mais sensível do plano.** Ela muda comportamento observável e pode esconder conversas de agentes que hoje veem tudo. Executar em três fases.

**Fase 1 — Medir antes de mudar (obrigatória, ~1 semana de observação).**
Criar uma view de auditoria que simula a policy nova sem aplicá-la:

```sql
CREATE OR REPLACE VIEW zapp.v_rls_impact_preview AS
SELECT
  p.user_id,
  p.role,
  count(*) FILTER (WHERE c.assigned_to = p.user_id)        AS visiveis_apos,
  count(*)                                                  AS visiveis_hoje,
  round(100.0 * count(*) FILTER (WHERE c.assigned_to = p.user_id)
        / NULLIF(count(*), 0), 2)                           AS pct_retido
FROM zapp.profiles p
CROSS JOIN LATERAL (
  SELECT m.remote_jid, m.instance_name FROM evo.evolution_messages m LIMIT 50000
) m
LEFT JOIN evo.evolution_contacts c
  ON c.remote_jid = m.remote_jid AND c.instance_name = m.instance_name
GROUP BY p.user_id, p.role;
```

Se `pct_retido` for baixo para agentes legítimos, o modelo de atribuição está incompleto — **corrigir os dados antes da policy**.

**Fase 2 — Índice de suporte (antes da policy, para não degradar leitura).**

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evo_contacts_jid_instance_assigned
  ON evo.evolution_contacts (remote_jid, instance_name, assigned_to);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_zapp_profiles_user_role
  ON zapp.profiles (user_id, role);
```

**Fase 3 — Policy nova.**

```sql
-- Função STABLE para evitar reavaliação por linha
CREATE OR REPLACE FUNCTION zapp.current_user_is_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM zapp.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['admin','supervisor'])
  );
$$;

REVOKE ALL ON FUNCTION zapp.current_user_is_privileged() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.current_user_is_privileged() TO authenticated;

DROP POLICY IF EXISTS messages_select ON evo.evolution_messages;

CREATE POLICY messages_select_scoped ON evo.evolution_messages
FOR SELECT TO authenticated
USING (
  zapp.current_user_is_privileged()
  OR EXISTS (
    SELECT 1
    FROM evo.evolution_contacts c
    WHERE c.remote_jid    = evolution_messages.remote_jid
      AND c.instance_name = evolution_messages.instance_name
      AND (
        c.assigned_to = auth.uid()
        OR c.assigned_to IS NULL          -- fila não atribuída: visível a todos
      )
  )
);
```

**Fase 3b — Fechar o insert irrestrito:**

```sql
DROP POLICY IF EXISTS authenticated_insert ON evo.evolution_messages;
DROP POLICY IF EXISTS messages_insert ON evo.evolution_messages;

CREATE POLICY messages_insert_scoped ON evo.evolution_messages
FOR INSERT TO authenticated
WITH CHECK (
  zapp.current_user_is_privileged()
  OR EXISTS (
    SELECT 1 FROM evo.evolution_contacts c
    WHERE c.remote_jid = evolution_messages.remote_jid
      AND c.instance_name = evolution_messages.instance_name
      AND (c.assigned_to = auth.uid() OR c.assigned_to IS NULL)
  )
);
```

> `SET search_path` explícito na função é obrigatório — é exatamente a classe de vulnerabilidade já corrigida em auditorias anteriores deste banco (SECDEF com `public` no caminho).

### Critério de aceite
- Agente comum: `SELECT count(*) FROM evo.evolution_messages` retorna **menos** que o total, e apenas conversas atribuídas a ele ou não atribuídas.
- Admin/supervisor: continua vendo tudo.
- `EXPLAIN ANALYZE` de uma listagem de 50 mensagens: sem `Seq Scan` em `evolution_contacts`.
- Nenhum agente perde acesso a conversa que estava legitimamente atendendo (validado pela Fase 1).

### Teste de regressão
Suíte SQL executada no CI contra um banco de teste:
1. `SET ROLE authenticated` + JWT de agente A → não enxerga mensagem de contato atribuído a B.
2. Mesmo agente → enxerga contato com `assigned_to IS NULL`.
3. JWT de admin → enxerga ambos.
4. Função `current_user_is_privileged` não é executável por `anon`.

### Risco / Rollback
**Alto.** É a etapa que pode gerar chamado de suporte no mesmo dia. Mitigação:
- Fase 1 obrigatória, com aprovação explícita antes da Fase 3.
- Janela de baixa operação para aplicar.
- Rollback preparado e testado **antes**:
```sql
DROP POLICY IF EXISTS messages_select_scoped ON evo.evolution_messages;
CREATE POLICY messages_select ON evo.evolution_messages
FOR SELECT TO authenticated
USING (instance_name = ANY (ARRAY[ /* lista original preservada no commit */ ]));
```

---

## Etapa 09 — Revogar `TRUNCATE` / `REFERENCES` / `TRIGGER` de `authenticated`

**Severidade:** P1 · **Depende de:** — · **Esforço:** 4h

### Diagnóstico

Levantamento no banco:

| Schema | Tabelas com `TRUNCATE` concedido a `authenticated` |
|---|---|
| `zapp` | 727 |
| `evo` | 72 |
| `bpm` | 41 |
| `ai` | 25 |
| `archive` | 15 |
| `storage` | 4 |
| `logistica` | 3 |
| `supabase_functions` | 2 |
| `email_app` | 1 |
| `financeiro` | 1 |
| **Total** | **891** |

Inclui `zapp.messages`, `zapp.contacts`, `evo.evolution_contacts`, `zapp.whisper_messages`. Também há `REFERENCES` e `TRIGGER` concedidos.

**Ponto crítico: RLS não se aplica a `TRUNCATE`.** Uma policy perfeita não impede `TRUNCATE zapp.messages`.

**Avaliação honesta da explorabilidade:** o PostgREST não expõe `TRUNCATE` como verbo, então não é explorável por uma chamada REST direta. O vetor real é indireto: qualquer função `SECURITY INVOKER` com SQL dinâmico, qualquer ferramenta que abra conexão Postgres com o papel `authenticated`, ou um MCP/worker mal configurado. **Não é "exploração em um clique", mas é violação grosseira de menor privilégio e o `REVOKE` custa uma linha.** Aplicar.

### Mudança

```sql
-- 1. Snapshot para rollback
CREATE TABLE IF NOT EXISTS zapp._grant_backup_20260730 AS
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('authenticated','anon')
  AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');

-- 2. Revogação por schema
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['zapp','evo','bpm','ai','archive','logistica','email_app','financeiro']
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA %I FROM authenticated, anon',
      s
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated, anon',
      s
    );
  END LOOP;
END $$;

-- 3. Verificação: deve retornar 0
SELECT count(*) AS restantes
FROM information_schema.role_table_grants
WHERE grantee IN ('authenticated','anon')
  AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
  AND table_schema IN ('zapp','evo','bpm','ai','archive','logistica','email_app','financeiro');
```

**Não tocar em `storage` e `supabase_functions`** sem verificar dependências do Supabase — schemas gerenciados pela plataforma.

O `ALTER DEFAULT PRIVILEGES` é o que impede a regressão: sem ele, a próxima tabela criada volta a receber os grants.

### Critério de aceite
- Query de verificação retorna `0` para os 8 schemas de aplicação.
- Smoke test completo do app: login, inbox, envio, edição, upload — nenhuma regressão.
- Nova tabela criada em `zapp` não nasce com `TRUNCATE` para `authenticated`.

### Teste de regressão
Query adicionada ao workflow de saúde do banco (E20): falha o CI se `count > 0`.

### Risco / Rollback
Baixo-médio. `REFERENCES` pode ser exigido por alguma migration que crie FK como `authenticated` — improvável (migrations rodam como `postgres`). Rollback a partir de `zapp._grant_backup_20260730`.

---

## Etapa 10 — Grants de `anon` e blindagem das views

**Severidade:** P3 · **Depende de:** E09 · **Esforço:** 4h

### Diagnóstico

`anon` possui `SELECT` em:
- `public.contacts`
- `public.contact_intelligence`
- `public.feature_flags`

**Teste empírico realizado:**
```sql
SET LOCAL ROLE anon; SELECT count(*) FROM public.contacts;
-- ERRO: permission denied for view contacts
```

**Não há vazamento ativo.** A cadeia `public.contacts` (view, `security_invoker=true`) → `zapp.contacts` (view, `security_invoker=true`) → `evo.evolution_contacts` (tabela, RLS) protege, porque `anon` não tem grant na base.

Ainda assim é uma mina armada: basta alguém desligar `security_invoker` numa das views, ou conceder `SELECT` na base para `anon`, e toda a base de contatos (nome, telefone, JID) fica pública. Considerando LGPD, o grant não deve existir.

**Inconsistência adicional:** `zapp.evolution_messages` tem `security_invoker = 'on'` enquanto as outras 8 views usam `'true'`. São equivalentes para o Postgres, mas a divergência indica migrations aplicadas por caminhos diferentes — vale normalizar.

### Mudança

```sql
-- 1. Revogar anon das views de dados pessoais
REVOKE SELECT ON public.contacts            FROM anon;
REVOKE SELECT ON public.contact_intelligence FROM anon;
-- feature_flags: avaliar. Se a tela de login lê flags antes do auth, manter
-- e restringir as colunas expostas por uma view dedicada.

-- 2. Normalizar security_invoker em todas as views de ponte
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v' AND n.nspname IN ('public','zapp')
      AND c.relname IN ('contacts','messages','whisper_messages',
                        'evolution_messages','evolution_contacts')
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.nspname, r.relname);
  END LOOP;
END $$;

-- 3. Verificação
SELECT n.nspname, c.relname,
       (SELECT option_value FROM pg_options_to_table(c.reloptions)
        WHERE option_name='security_invoker') AS si
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='v' AND n.nspname IN ('public','zapp')
ORDER BY 1,2;
```

### Critério de aceite
- `anon` não tem `SELECT` em nenhuma view/tabela com dado pessoal.
- Todas as views de ponte com `security_invoker = true`.
- App funciona normalmente para `authenticated` (smoke test).

### Teste de regressão
Query no workflow de saúde: falha se `anon` ganhar `SELECT` em qualquer relação de `public`/`zapp`/`evo` fora de uma allowlist explícita e versionada.

### Risco / Rollback
Baixo. Se a tela de login depender de `feature_flags` sem sessão, o app pode quebrar antes do auth — **verificar antes**:
```bash
grep -rn "feature_flags" src/ | grep -iv "test"
```
Rollback: `GRANT SELECT ON public.contacts TO anon;`

---

# BLOCO D — INTEGRIDADE DE ENVIO E EDIÇÃO

## Etapa 11 — Edição de mensagem sem falso sucesso

**Severidade:** P0 · **Depende de:** E03 · **Esforço:** 4h

### Diagnóstico

`src/features/inbox/components/chat/useChatPanelHandlers.ts:120-151`:

```ts
if (currentEditing) {
  const externalId = currentEditing.external_id;
  const contactJid = contactPhone ? `${contactPhone}@s.whatsapp.net` : '';
  setIsSending(true);
  try {
    if (instanceName && externalId && contactJid)      // ← condição quase nunca verdadeira
      await editMessageApi(instanceName, { number: contactJid, messageId: externalId, text: ... });
    await dbFrom('messages')
      .update({ content: ..., updated_at: ... })
      .eq('id', currentEditing.id);                    // ← 0 linhas afetadas não é erro
    toast({ title: 'Mensagem editada', description: 'A mensagem foi atualizada com sucesso.' });
  } catch (err) { ... }
```

Quatro defeitos empilhados:

1. **`instanceName` é sempre `''`** (E03) → o `if` nunca entra → a API Evolution nunca é chamada.
2. **`contactJid` é derivado do telefone**, não do `remote_jid`. Para grupos (`@g.us`), `contactPhone` é nulo → `contactJid = ''`. Mesmo com `instanceName` correto, grupos ficariam de fora.
3. **`UPDATE` sem verificação de rowcount.** Em modo externo, o `id` da mensagem vem de `evo.evolution_messages`; o `UPDATE` em `messages` (view sobre `zapp.messages`) casa **zero linhas**. PostgREST devolve 200/204 — não é erro.
4. **O toast de sucesso dispara incondicionalmente** após o `try`, independentemente de 1, 2 e 3.

Resultado composto: **a edição de mensagem não funciona em nenhum cenário de produção, e sempre reporta sucesso.**

### Mudança

```ts
if (currentEditing) {
  const ref = resolveContactRef(contactId);
  const targetJid = ref?.kind === 'jid' ? ref.remoteJid : null;
  const externalId = currentEditing.external_id;
  const newText = currentInput.trim();

  // Pré-condições explícitas — falhar alto em vez de fingir sucesso.
  if (!instanceName || !externalId || !targetJid) {
    log.warn('[editMessage] pré-condições ausentes', {
      hasInstance: !!instanceName, hasExternalId: !!externalId, hasJid: !!targetJid,
    });
    toast({
      title: 'Não foi possível editar',
      description: !externalId
        ? 'Esta mensagem ainda não foi confirmada pelo WhatsApp.'
        : 'Instância WhatsApp não resolvida para esta conversa.',
      variant: 'destructive',
    });
    setIsSending(false);
    return;
  }

  setIsSending(true);
  try {
    // 1. Fonte da verdade é o WhatsApp. Se falhar aqui, não tocamos no banco.
    await editMessageApi(instanceName, {
      number: targetJid,
      messageId: externalId,
      text: newText,
    });

    // 2. Espelhar no banco, verificando rowcount de verdade.
    const { data: updated, error: dbError } = await dbFrom('messages')
      .update({ content: newText, updated_at: new Date().toISOString() })
      .eq('id', currentEditing.id)
      .select('id');                                   // ← força retorno das linhas

    if (dbError) throw dbError;
    if (!updated || updated.length === 0) {
      // Editou no WhatsApp mas não no espelho local: estado divergente, não sucesso.
      log.warn('[editMessage] UPDATE casou 0 linhas', { id: currentEditing.id });
      toast({
        title: 'Editada no WhatsApp',
        description: 'A alteração foi enviada, mas o histórico local não foi atualizado.',
      });
    } else {
      toast({ title: 'Mensagem editada', description: 'A mensagem foi atualizada com sucesso.' });
    }
  } catch (err) {
    log.error('[editMessage] falhou', err);
    toast({
      title: 'Erro ao editar',
      description: err instanceof Error ? err.message : 'Não foi possível editar a mensagem.',
      variant: 'destructive',
    });
  } finally {
    setIsSending(false);
  }
  setEditingMessage(null);
  setInputValue('');
  return;
}
```

**Nota de ordem:** hoje o banco é atualizado mesmo quando o WhatsApp não é. Invertemos: **WhatsApp primeiro**. Um espelho local divergente é pior que uma edição não aplicada, porque o agente passa a acreditar num texto que o cliente nunca viu.

**Janela de edição:** `EDIT_WINDOW_MINUTES = 15` (linha 88) é mais permissiva que o limite real do WhatsApp (15 min para mensagens de texto — coincide, mas o valor está hardcoded e sem referência). Mover para `src/lib/whatsappLimits.ts` junto com os limites de PTT já centralizados em `@/lib/audio/pttLimits`.

### Critério de aceite
- Editar mensagem em conversa 1:1 → texto muda no WhatsApp do destinatário **e** no histórico.
- Editar em grupo (`@g.us`) → funciona (hoje é impossível).
- Editar mensagem sem `external_id` → toast explicativo, sem falso sucesso.
- Editar com `instanceName` ausente → toast explicativo, sem falso sucesso.

### Teste de regressão
1. `editMessageApi` rejeita → nenhum `UPDATE` no banco, toast destrutivo.
2. `editMessageApi` resolve, `UPDATE` retorna `[]` → toast de divergência (não o de sucesso pleno).
3. Sem `externalId` → `editMessageApi` **não** é chamado; toast destrutivo.
4. Contato de grupo → `number` recebe `...@g.us`, não `undefined@s.whatsapp.net`.

### Risco / Rollback
Médio. Passa a **falhar visivelmente** onde antes falhava em silêncio — vai gerar percepção de "quebrou". Comunicar à operação antes do deploy. Rollback = reverter.

---

## Etapa 12 — Assinatura idempotente

**Severidade:** P1 · **Depende de:** — · **Esforço:** 2h

### Diagnóstico

`useChatPanelHandlers.ts`:

```ts
const messageContent = trimmedInput ? applySignature(trimmedInput) : '';   // :155
// ...
} catch (err: unknown) {
  lastFailedSendRef.current = { content: messageContent, attachments };    // :231
  setInputValue(messageContent);                                          // :234  ← já assinado
}
```

E no undo (`:215`): `setInputValue(messageContent)` — idem.

Fluxo do bug: o envio falha → o campo volta com **"texto + assinatura"** → o agente clica Enviar → `applySignature` roda de novo → **"texto + assinatura + assinatura"**. Com retry duplo, três assinaturas.

O mesmo vale para `retryLastSend` (`:286`), que reenvia `failedSend.content` — já assinado — o que aqui está **correto**, porque não passa por `applySignature` novamente. A inconsistência é: `retryLastSend` trata como assinado, `setInputValue` trata como bruto. Os dois caminhos partem da mesma variável.

### Mudança

Separar as duas representações de forma explícita:

```ts
const rawInput = currentInput.trim();
const signedContent = rawInput ? applySignature(rawInput) : '';

// Guardar AMBOS: o bruto para reidratar o campo, o assinado para reenviar.
lastFailedSendRef.current = { raw: rawInput, content: signedContent, attachments };
// ...
setInputValue(rawInput);          // ← campo recebe o BRUTO
```

E tornar `applySignature` idempotente por segurança de defesa em profundidade, em `useMessageSignature`:

```ts
const applySignature = useCallback((text: string): string => {
  if (!signatureEnabled || !agentName) return text;
  const suffix = `\n\n_${agentName}_`;
  if (text.endsWith(suffix)) return text;   // já assinado — não duplica
  return `${text}${suffix}`;
}, [signatureEnabled, agentName]);
```

Mesmo tratamento no `onUndo` do `undoToast` (`:215`).

### Critério de aceite
- Forçar 3 falhas consecutivas de envio (modo DEV com `shouldSimulateFailure`) → o campo nunca acumula assinatura.
- `applySignature(applySignature(x)) === applySignature(x)`.

### Teste de regressão
Teste de propriedade: para 100 strings aleatórias, `applySignature` aplicado 2× é igual a 1×.

### Risco / Rollback
Baixo.

---

## Etapa 13 — Contrato de `onSendMessage`, progresso real e `whisperCount`

**Severidade:** P2 · **Depende de:** — · **Esforço:** 4h

### Diagnóstico

**13.a — Tipo mente sobre o contrato.**
`ChatPanel.tsx:67` declara `onSendMessage: (content: string) => void`. Mas `useChatPanelHandlers.ts:206` chama com **três** argumentos:
```ts
await onSendMessage(messageContent, attachments, (p) => setSendProgress(p));
```
TypeScript aceita (uma função de menos parâmetros é atribuível a uma de mais). Os dois call-sites reais passam funções de **dois** parâmetros:
- `RealtimeInboxView.tsx:332` → `inbox.handleSendMessage` = `(content, attachments?) => void`
- `ChatPopup.tsx:233` → `handleSendMessage`

Logo **`onProgress` nunca é invocado**. `sendProgress` fica em `0` e salta para `100` na linha 207. O componente `ChatSendProgress` e a barra em `ChatInputArea` são **puramente decorativos**.

**13.b — `whisperCount` recebido e descartado.**
`ChatPanel.tsx:95`: `whisperCount: _whisperCount = 0`. `RealtimeInboxView.tsx:339` passa `inbox.whisperCount`, que é calculado por uma query + subscrição realtime em `useRealtimeInbox.ts:196-250` (com o guard de UUID e tudo). **Todo esse custo é jogado fora.** Além disso, `dialogs.whisper` nunca é aberto por nenhum handler — só é lido em `ChatPanelOverlays` (`:449`).

### Mudança

**13.1** — Corrigir o tipo para a verdade:

```ts
interface ChatPanelProps extends LoadOlderProps {
  /** Envia a mensagem. `onProgress` é opcional e só é chamado por
   *  implementações que suportam upload com feedback (ver useMessageQueue). */
  onSendMessage: (
    content: string,
    attachments?: File[],
    onProgress?: (percent: number) => void
  ) => void | Promise<void>;
}
```

**13.2** — Ligar o progresso de ponta a ponta. `useRealtimeInbox.handleSendMessage` já tem acesso ao `messageQueue`, que já expõe `updateProgress`. Encaminhar:

```ts
handleSendMessage: useCallback(
  (content: string, attachments?: File[], onProgress?: (p: number) => void) => {
    if (!selectedContactId) return;
    const itemId = messageQueue.addToQueue(
      selectedContactId,
      content || (attachments?.length ? `Enviando ${attachments.length} anexo(s)` : ''),
      attachments,
      attachments?.length ? 'attachment' : 'text'
    );
    if (onProgress) messageQueue.subscribeProgress(itemId, onProgress);
  },
  [selectedContactId, messageQueue]
),
```
(Requer expor `subscribeProgress` em `useMessageQueue` — o hook já rastreia progresso internamente via `updateProgress`.)

**Alternativa mais barata**, se `subscribeProgress` for muito trabalho: **remover** o parâmetro `onProgress` e a barra de progresso, e usar apenas o estado do item na fila (`messageQueue.queue[i].progress`), que já é renderizado pelo `ChatInputArea` via `queue`. Preferir esta se o prazo apertar — **decidir explicitamente, não deixar meio-ligado como está hoje.**

**13.3** — Usar ou remover o `whisperCount`. Recomendação: **usar**, expondo um badge no `ChatHeaderToolbar` que abre `dialogs.whisper`:

```tsx
<ChatPanelHeader
  /* ... */
  whisperCount={whisperCount}
  onOpenWhispers={() => openDialog('whisper')}
/>
```
Se a decisão for remover, remover **também** a query e a subscrição em `useRealtimeInbox.ts:196-250` — hoje se paga o custo sem o benefício.

### Critério de aceite
- Enviar um arquivo de 5 MB → a barra progride de forma monotônica, não salta 0→100.
- O badge de sussurros mostra o número correto e abre o painel — **ou** o código de `whisperCount` foi removido por inteiro (sem meio-termo).
- `tsc --noEmit` limpo com a assinatura de 3 parâmetros.

### Teste de regressão
1. Mock de `onSendMessage` que invoca `onProgress(25/50/75)` → assert que `sendProgress` reflete cada valor.
2. Teste de contrato: `ChatPanelProps['onSendMessage']` aceita 3 parâmetros (falha em compilação se o tipo regredir).

### Risco / Rollback
Baixo.

---

## Etapa 14 — Inserts auxiliares com referência correta

**Severidade:** P2 · **Depende de:** E01, E03 · **Esforço:** 2h

### Diagnóstico

`ChatPanel.tsx:541-568` — dois inserts diretos, em `onPollSent` e `onContactSent`:

```ts
await dbFrom('messages').insert({
  contact_id: conversation.contact.id,        // ← JID em coluna uuid
  whatsapp_connection_id: whatsappConnectionId, // ← sempre null (E03)
  content: `📊 *Enquete:* ...`,
  message_type: 'text',
  sender: 'agent',
  status: 'sending',
});
```

Schema confirmado: `zapp.messages.contact_id` é `uuid`. Passar um JID gera `invalid input syntax for type uuid`, capturado pelo `catch` e apenas logado (`log.error`). **Enquetes e cartões de contato enviados via WhatsApp nunca aparecem no histórico do chat.**

Além disso, `status: 'sending'` é gravado e **nunca reconciliado** — se o insert funcionasse, a mensagem ficaria eternamente "enviando".

### Mudança

**14.1** — Extrair para um helper único, fora do JSX:

```ts
// src/features/inbox/hooks/useAuxiliaryMessageLog.ts
export function useAuxiliaryMessageLog(
  contactRef: ContactRef | null,
  instanceName: string | undefined,
  whatsappConnectionId: string | null
) {
  return useCallback(
    async (content: string) => {
      if (!contactRef) return;
      try {
        if (contactRef.kind === 'uuid') {
          await dbFrom('messages').insert({
            contact_id: contactRef.uuid,
            whatsapp_connection_id: whatsappConnectionId,
            content, message_type: 'text', sender: 'agent', status: 'sent',
          });
        } else {
          // Modo externo: o espelho correto é evo.evolution_messages, por JID.
          await dbFrom('evolution_messages').insert({
            remote_jid: contactRef.remoteJid,
            instance_name: instanceName,
            content, message_type: 'text', sender: 'agent', status: 'sent',
          });
        }
      } catch (err) {
        log.error('[auxiliaryMessageLog] insert falhou', err);
      }
    },
    [contactRef, instanceName, whatsappConnectionId]
  );
}
```

**14.2** — `status: 'sent'` em vez de `'sending'`: é um registro **retroativo** de algo que a API já confirmou. Não há reconciliador para esses inserts.

**14.3** — Verificar as colunas reais antes de aplicar:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='evo' AND table_name='evolution_messages'
ORDER BY ordinal_position;
```

### Critério de aceite
- Enviar uma enquete → aparece uma bolha no histórico com o resumo, imediatamente.
- Enviar um cartão de contato → idem.
- Nenhum `invalid input syntax for type uuid` no log.

### Teste de regressão
Teste unitário do helper com `ContactRef` de cada tipo → assert da tabela e das colunas usadas.

### Risco / Rollback
Baixo.

---

# BLOCO E — PERFORMANCE E RENDER

## Etapa 15 — Memoização do pipeline de filtros

**Severidade:** P2 · **Depende de:** — · **Esforço:** 2h

### Diagnóstico

`src/features/inbox/components/chat/hooks/useChatFilters.ts:45-59` — quatro derivações **sem `useMemo`**:

```ts
const failedMessages = messages.filter(...);                    // O(n)
const categoryCounts = {
  failed:         failedMessages.filter(...).length,            // O(n)
  failed_auth:    failedMessages.filter(...).length,            // O(n)
  failed_retries: failedMessages.filter(...).length,            // O(n)
};
const categoryFilteredMessages = failureCategory ? failedMessages.filter(...) : failedMessages;
const visibleMessages = failuresOnly ? categoryFilteredMessages : messages;
```

Impacto composto:

1. **O(4n) por render.** `inputValue` mora em `useChatPanelHandlers`, **dentro** do `ChatPanel` → **cada tecla digitada re-renderiza o ChatPanel inteiro** e refaz os 4 passes.
2. **Anula o `memo()` do `ChatMessagesArea`.** `visibleMessages` é identidade nova a cada render (quando `failuresOnly` é true) e `categoryCounts` é objeto novo sempre. O `memo` da linha 66 de `ChatMessagesArea` nunca acerta.
3. Conversa com 500 mensagens carregadas: 2.000 comparações por tecla, mais o re-render da lista virtualizada e de todos os `MessageBubble` visíveis.

### Mudança

```ts
const failedMessages = useMemo(
  () => messages.filter(
    (m) => m.status === 'failed' || m.status === 'failed_auth' || m.status === 'failed_retries'
  ),
  [messages]
);

// Um único passe em vez de três
const categoryCounts = useMemo(() => {
  const acc = { failed: 0, failed_auth: 0, failed_retries: 0 };
  for (const m of failedMessages) {
    if (m.status in acc) acc[m.status as keyof typeof acc]++;
  }
  return acc;
}, [failedMessages]);

const categoryFilteredMessages = useMemo(
  () => (failureCategory ? failedMessages.filter((m) => m.status === failureCategory) : failedMessages),
  [failedMessages, failureCategory]
);

const visibleMessages = useMemo(
  () => (failuresOnly ? categoryFilteredMessages : messages),
  [failuresOnly, categoryFilteredMessages, messages]
);
```

**Correção complementar — isolar o input.** A raiz do problema é o `inputValue` viver no mesmo componente que a lista. Extrair o estado do input para um componente filho (`<ChatComposer />`) que não re-renderiza a área de mensagens. Isso é refatoração maior; registrar como **débito técnico** com issue própria e implementar o `useMemo` agora.

### Critério de aceite
- React DevTools Profiler: digitar 20 caracteres → `ChatMessagesArea` re-renderiza **0** vezes (hoje: 20).
- `visibleMessages` mantém identidade referencial enquanto `messages` e os filtros não mudam.

### Teste de regressão
Teste de identidade: renderizar o hook, forçar re-render sem mudar entradas, assert `result.current.visibleMessages === prev.visibleMessages`.

### Risco / Rollback
Muito baixo.

---

## Etapa 16 — Virtualizador correto

**Severidade:** P1 · **Depende de:** E04 · **Esforço:** 5h

### Diagnóstico

`ChatMessagesArea.tsx:176-181`:

```ts
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => scrollContainerRef.current,
  estimateSize: getItemSize,
  overscan: 12,
});
```

Três defeitos:

1. **Sem `measureElement`.** As alturas reais nunca são medidas. `getItemSize` (linha 162) é heurística grosseira: `Math.max(80, 70 + Math.ceil(content.length / 60) * 22)`. Mensagens com mídia, citação, reações ou botões interativos divergem muito → **sobreposição e buracos**.

2. **Sem `scrollMargin`.** Dentro do mesmo container de scroll, **antes** do bloco virtualizado, existem: o `ChatWatermark` (linha 229), o spinner de loading (231), o `EmptyState` (237) e o banner "Criptografia de Ponta a Ponta" (249-259, ~150px). O virtualizador assume que o offset 0 é o topo do container → **todos os itens ficam deslocados por ~150px**. Itens errados são renderizados na viewport.

3. **`estimateSize` instável.** `getItemSize` é `useCallback([messages])` → nova identidade a cada mudança de mensagens, sem `virtualizer.measure()` correspondente.

**Interação com a E04:** o âncora de `loadOlder` (`useLayoutEffect`, linha 207-215) faz `scrollTop = scrollHeight - prevScrollHeight`. Com estimativas instáveis, `scrollHeight` é virtual e volátil → **o salto ao carregar histórico é errático**.

### Mudança

```ts
// 1. Medir o offset do conteúdo estático que precede o bloco virtualizado
const listStartRef = useRef<HTMLDivElement>(null);
const [scrollMargin, setScrollMargin] = useState(0);

useLayoutEffect(() => {
  const el = listStartRef.current;
  const container = scrollContainerRef.current;
  if (!el || !container) return;
  const update = () => {
    setScrollMargin(el.offsetTop - container.offsetTop);
  };
  update();
  const ro = new ResizeObserver(update);
  ro.observe(el);
  ro.observe(container);
  return () => ro.disconnect();
}, [messages.length === 0]);   // banner aparece/some conforme lista vazia

// 2. Virtualizador com medição real
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => scrollContainerRef.current,
  estimateSize: getItemSize,
  overscan: 8,
  scrollMargin,
  measureElement:
    typeof window !== 'undefined' && !navigator.userAgent.includes('Firefox')
      ? (el) => el?.getBoundingClientRect().height
      : undefined,
  getItemKey: (index) => messages[index]?.id ?? index,   // chave estável
});
```

No JSX, cada item passa a se auto-medir:

```tsx
<div
  key={virtualRow.key}
  data-index={virtualRow.index}
  ref={virtualizer.measureElement}
  style={{
    position: 'absolute',
    top: 0, left: 0, width: '100%',
    transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
    paddingBottom: '1rem',
  }}
>
```

E o marcador de início logo antes do bloco:
```tsx
<div ref={listStartRef} />
<div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
```

**16.b — Restaurar o agrupamento de mensagens.** Linhas 285-286 estão hardcoded:
```tsx
isFirstInGroup={true}
isLastInGroup={true}
```
Calcular de verdade:
```ts
const prev = messages[virtualRow.index - 1];
const next = messages[virtualRow.index + 1];
const isFirstInGroup = !prev || prev.sender !== message.sender ||
  new Date(message.timestamp).getTime() - new Date(prev.timestamp).getTime() > 5 * 60_000;
const isLastInGroup = !next || next.sender !== message.sender ||
  new Date(next.timestamp).getTime() - new Date(message.timestamp).getTime() > 5 * 60_000;
```

**16.c** — Trocar `console.error` (linha 200) pelo `log` do módulo.

**16.d** — `handleScroll` está ligado via `onScroll` do React **e** o `ChatPanel` liga um segundo listener via `bindScrollListener` (`ChatPanel.tsx:252-255`). Consolidar em um só, e incluir `isLoading` nas deps do efeito do `ChatPanel` — hoje, se a área monta em estado de loading, o listener pode nunca ser religado.

### Critério de aceite
- Rolar 500 mensagens com mídia misturada → sem sobreposição, sem buraco, sem "pulo".
- `loadOlder` mantém a posição visual da mensagem que estava no topo.
- Avatares e cauda de balão agrupam corretamente por remetente e janela de 5 min.
- Apenas **um** listener de scroll ativo.

### Teste de regressão
Teste com `@tanstack/react-virtual` em jsdom é limitado. Cobrir com **E2E Playwright** (`e2e/chat-advanced.spec.ts` já existe): rolar até o topo, capturar screenshot, comparar com baseline.

### Risco / Rollback
Alto — é o componente mais visível do produto. Validar em staging com conversa real de 1.000+ mensagens antes de produção. Rollback = reverter.

---

## Etapa 17 — Deduplicação de hooks e cálculos mortos

**Severidade:** P2 · **Depende de:** — · **Esforço:** 3h

### Diagnóstico

**17.a — `useQuickReplies()` chamado duas vezes** no mesmo componente:
```ts
const { templates: _quickReplyTemplates } = useQuickReplies();   // ChatPanel.tsx:99  — descartado
const { quickReplies: dbQuickReplies, incrementUseCount } = useQuickReplies();  // :168
```
A primeira chamada tem o resultado prefixado com `_` (descartado) mas **paga a query e a subscrição inteiras**. Duas instâncias do mesmo hook = duas queries + dois canais realtime.

**17.b — Três `useMemo` cujo resultado nunca é lido:**
```ts
const _canGenerateSummary  = messages.length >= 10;                       // :289
const _lastContactMessages = useMemo(() => messages.filter(...).slice(-5).map(...), [messages]);  // :292
const _allMessagesForHeader = useMemo(() => messages.map((m) => ({        // :300
  id, content, sender, timestamp: new Date(m.timestamp).toISOString()
})), [messages]);
```
`_allMessagesForHeader` aloca **um objeto novo por mensagem** e roda `new Date().toISOString()` para cada uma, a cada mudança de `messages`. Em conversa de 500 mensagens sob realtime, isso é lixo puro no hot path.

**17.c — `messageQueue?.getMetrics()`** é invocado no corpo do render (`:609`), a cada render, mesmo com o `ChatMonitoringDialog` fechado.

**17.d — `toggleSound` com estado obsoleto** (`useRealtimeInbox.ts:449-452`):
```ts
setSoundOn((prev) => !prev);      // funcional — correto
setSoundEnabled(!soundOn);        // lê o valor antigo — dessincroniza
```

**17.e — Closures não-funcionais em setters booleanos** (`ChatPanel.tsx:518, 528`):
```ts
onToggleWhisper={() => handlers.setIsWhisper(!handlers.isWhisper)}
onRecordToggle={() => handlers.setIsRecordingAudio(!handlers.isRecordingAudio)}
```

### Mudança

```ts
// 17.a — uma única chamada
const { quickReplies: dbQuickReplies, incrementUseCount } = useQuickReplies();

// 17.b — remover os três blocos mortos por inteiro (linhas 289-309)

// 17.c — só calcular quando o diálogo estiver aberto
const monitoringOpen = activeTool === 'monitoring';
const queueMetrics = useMemo(
  () => (monitoringOpen ? messageQueue?.getMetrics() : undefined),
  [monitoringOpen, messageQueue]
);

// 17.d
const toggleSound = useCallback(() => {
  setSoundOn((prev) => { const next = !prev; setSoundEnabled(next); return next; });
}, [setSoundEnabled]);

// 17.e
onToggleWhisper={() => handlers.setIsWhisper((v) => !v)}
onRecordToggle={() => handlers.setIsRecordingAudio((v) => !v)}
```

> `setSoundEnabled` dentro do updater do `useState` é tecnicamente um efeito colateral em função que o React pode reexecutar em StrictMode. Alternativa mais limpa: `useEffect(() => { setSoundEnabled(soundOn); }, [soundOn, setSoundEnabled])`. **Preferir esta.**

### Critério de aceite
- `grep -c "useQuickReplies()" src/features/inbox/components/ChatPanel.tsx` → `1`.
- Nenhuma variável prefixada com `_` no `ChatPanel.tsx` (exceto props deliberadamente ignoradas e documentadas).
- Profiler: alocação por render do `ChatPanel` cai proporcionalmente ao tamanho da conversa.

### Teste de regressão
Regra ESLint `no-unused-vars` com `varsIgnorePattern` **removido** para este diretório, forçando que "não usado" vire erro em vez de convenção de underscore.

### Risco / Rollback
Muito baixo.

---

# BLOCO F — QUALIDADE E GUARDA-CORPOS

## Etapa 18 — Remoção de código morto e barrel consistente

**Severidade:** P2 · **Depende de:** E01–E17 · **Esforço:** 3h

### Diagnóstico

**18.a — `src/features/inbox/components/chat/useChatPanel.ts` — 393 linhas de código morto.**
Verificação:
```
grep -rn "useChatPanel'" src --include=*.ts --include=*.tsx | grep -v useChatPanelHandlers
→ (vazio)
```
Não é importado por ninguém, **nem está no barrel** `chat/index.ts`. É uma cópia antiga da lógica do `ChatPanel` que **já divergiu**: importa `useAutomations` de `@/hooks/useAutomationManagement` enquanto o `ChatPanel` vivo importa de `@/hooks/useAutomations`. Redeclara `ChatPanelProps`. Qualquer correção deste plano feita "no arquivo errado" desaparece sem sintoma.

**18.b — Barrel incompleto.** `chat/index.ts` exporta 49 módulos, mas 14 ficam de fora: `ChatHeaderMenu`, `ChatAttachmentsPreview`, `ChatMonitoringDialog`, `ChatPanelOverlays`, `ChatSendProgress`, `ChatTemplatesOverlay`, `ChatDragOverlay` (parcial), `FailureFilterBar`, `ChatQuickRepliesPopover`, `messageBubbleParts`, `chatInputGuards`, `loadOlderMetrics` (presente), e todo o diretório `hooks/`. Sem critério declarado, ninguém sabe o que é API pública.

**18.c — `simulateChatLatency` no caminho de produção.**
`useChatPanelHandlers.ts:166-172` faz `if (import.meta.env.DEV)` + `await import(...)`. O guard está correto e o import é dinâmico, então o bundle de produção não carrega o módulo. **Isto está certo** — registrado aqui apenas para confirmar que foi verificado e não é um problema.

### Mudança

**18.1** — Deletar `src/features/inbox/components/chat/useChatPanel.ts`. Antes, fazer um `diff` contra o `ChatPanel.tsx` vivo para garantir que não há nenhuma correção só existente lá:
```bash
grep -n "" src/features/inbox/components/chat/useChatPanel.ts > /tmp/dead.txt
# revisar manualmente antes de deletar
```

**18.2** — Definir o critério do barrel em comentário no topo de `chat/index.ts`:
```ts
/**
 * API pública do módulo chat.
 *
 * REGRA: exporte aqui apenas o que é consumido FORA de `components/chat/`.
 * Componentes internos (overlays, sub-barras) e hooks privados NÃO entram —
 * importe-os por caminho relativo dentro do módulo.
 */
```
E alinhar o conteúdo à regra: remover do barrel o que só é usado internamente, adicionar o que é usado fora.

**18.3** — Ativar o checador de código morto já existente no repo (`scripts/check-dead-code`) para este diretório e adicionar as exceções legítimas à allowlist.

### Critério de aceite
- `useChatPanel.ts` não existe mais.
- `bun run build` e `tsc --noEmit` limpos.
- Todo símbolo do barrel tem ≥ 1 consumidor fora de `components/chat/`.

### Teste de regressão
`scripts/check-dead-code` no CI, falhando o build em novo arquivo órfão.

### Risco / Rollback
Baixo — código comprovadamente não referenciado. Rollback: restaurar do Git.

---

## Etapa 19 — Reativar e ampliar a suíte de testes

**Severidade:** P1 · **Depende de:** E01–E18 · **Esforço:** 8h

### Diagnóstico

**A suíte não executa.** Tentativa registrada durante a auditoria:

```
npx vitest run src/features/inbox/components/chat --reporter=basic
→ Startup Error: Failed to load custom Reporter from basic
→ cause: Failed to load url basic (resolved id: basic)
```

O reporter `basic` foi **removido** na versão do Vitest em uso. Os substitutos são `default`, `dot`, `verbose` ou `json`. Enquanto isso, **nenhum resultado de teste do módulo é confiável** — qualquer script de CI que use `--reporter=basic` falha no startup e pode estar sendo interpretado como "sem testes" em vez de "não rodou".

Aviso adicional no log:
```
`esbuild` option is set to false, but `oxc` option was not set to false.
`esbuild: false` does not have effect any more. Set `oxc: false` instead.
```
→ `vite.config.ts` / `vitest.config.ts` está com configuração obsoleta.

**Cobertura existente do módulo chat** (13 arquivos de teste), com lacuna clara: **zero testes** para `ChatPanel.tsx`, `useChatPanelHandlers.ts`, `ChatMessagesArea.tsx`, `useChatMediaSending.ts` e `useRealtimeInbox.ts` — exatamente os cinco arquivos onde estão os quatro P0.

### Mudança

**19.1** — Corrigir a invocação e a config:
```bash
grep -rn "reporter=basic\|reporter: 'basic'" . --include=*.json --include=*.yml --include=*.ts
# substituir por: --reporter=dot  (CI)  /  --reporter=default  (local)
```
E em `vitest.config.ts`: trocar `esbuild: false` por `oxc: false`.

**19.2** — Comando padronizado, com a memória necessária:
```json
"test:chat": "NODE_OPTIONS=--max-old-space-size=6144 vitest run src/features/inbox --reporter=dot"
```

**19.3** — Um teste de regressão por P0, **escrito antes da correção** (red → green):

| Teste | Arquivo | Trava qual defeito |
|---|---|---|
| `contactRef.test.ts` | novo | E01 — tabela de formatos |
| `useFallbackContact.test.ts` | novo | **D-01** — nunca filtrar coluna uuid com JID |
| `useChatMediaSending.instanceHint.test.ts` | novo | **D-02** — instância vem por prop, não por UUID |
| `ChatMessagesArea.scrollToMessage.test.tsx` | novo | **D-03** — scroll por índice, não por ref |
| `useChatPanelHandlers.edit.test.ts` | novo | D-09/E11 — sem toast de sucesso quando a API não foi chamada |
| `useChatFilters.identity.test.ts` | novo | D-11 — identidade referencial estável |
| `rls-evolution-messages.sql.test` | novo | **D-04** — isolamento entre agentes |

**19.4** — Teste de contrato de props do `ChatPanel`: renderizar com o conjunto mínimo e com o completo, assert de que nenhuma prop obrigatória foi silenciosamente aceita como `undefined`.

**19.5** — Reativar o E2E. Existem 4 specs de chat (`e2e/chat-accessibility`, `chat-advanced`, `chat-media`, `chat-resilience-responsive`) mais `tests/e2e/chat-messaging.spec.ts`. Verificar quais estão sendo puladas no CI (há histórico de `boot-resilience.spec.ts` pulado por flakiness) e reativar as de chat, que cobrem justamente a E16.

### Critério de aceite
- `bun run test:chat` executa e reporta contagem real de passes/falhas.
- Cada um dos 4 P0 tem um teste que **falha** na baseline `a631524c` e **passa** após a etapa correspondente.
- Nenhum `--reporter=basic` restante no repositório.

### Teste de regressão
O próprio conjunto. Adicionar ao `quality-gate.yml` com limite (ratchet) de falhas, seguindo o padrão já usado no repo.

### Risco / Rollback
Baixo. Pode expor testes já quebrados que estavam escondidos pelo erro de startup — **isso é ganho, não regressão**, mas pode travar o CI. Introduzir com `continue-on-error: true` no primeiro dia e endurecer depois.

---

## Etapa 20 — Guarda-corpos permanentes

**Severidade:** P1 · **Depende de:** E19 · **Esforço:** 4h

### Diagnóstico

Sem esta etapa, todas as 19 anteriores são temporárias.

**20.a — Branch protection desligada.** Verificado na API:
```json
"protected": true,
"protection": { "required_status_checks": { "enforcement_level": "off", "contexts": [], "checks": [] } }
```
`enforcement_level: "off"` com zero contexts significa **proteção nominal, nenhuma proteção real**. O bot `gpt-engineer-app[bot]` (Lovable) commita direto em `main` a ~1 commit/70s. Qualquer correção deste plano pode ser revertida por um "Visual edit in Lovable" — o histórico entre `57a6f1ed8` e `a631524c` já contém `bb6a6960a Visual edit in Lovable` e `f5e0b053f Changes`.

**20.b — Segredo em texto plano.** `~/.git-credentials` no container `claude-code` (stack 122) contém um PAT do GitHub (`github_pat_11BXDMV...`) em claro, embutido também no `remote.origin.url`. O token **já está inválido** (o `git fetch` falhou com "Invalid username or token"), mas o padrão é o problema.

**20.c — Sem verificação contínua dos invariantes de banco.** Todos os achados do Bloco C podem regredir silenciosamente na próxima migration.

### Mudança

**20.1 — Branch protection efetiva:**
```
Required status checks (strict):
  - quality-gate
  - typecheck
  - test:chat
Require pull request before merging: true
Restrict who can push to matching branches:
  - remover gpt-engineer-app[bot] da lista de push direto
Allow force pushes: false
```
Se a integração da Lovable exigir push em `main`, a alternativa é apontá-la para `lovable/main` e abrir PR automático — mantendo o auto-deploy sem sacrificar a proteção.

**20.2 — Rotacionar o PAT e migrar para secret:**
```sh
git -C /workspace/repos/zapp-web-v3 remote set-url origin https://github.com/adm01-debug/zapp-web-v3.git
rm -f ~/.git-credentials
# novo PAT como secret do stack no Portainer, exposto via GH_TOKEN,
# consumido por um credential.helper que lê da env
```
Revogar o PAT antigo no GitHub mesmo estando inválido.

**20.3 — Workflow `db-invariants.yml`** rodando diariamente e em cada PR que toque `supabase/`:

```sql
-- INV-01: nenhuma partição folha publicada junto com o pai (E06)
SELECT count(*) FROM pg_publication_rel pr
JOIN pg_publication p ON p.oid=pr.prpubid
JOIN pg_class c ON c.oid=pr.prrelid
JOIN pg_inherits i ON i.inhrelid=c.oid
WHERE p.pubname='supabase_realtime'
  AND EXISTS (SELECT 1 FROM pg_publication_rel pr2 WHERE pr2.prpubid=p.oid AND pr2.prrelid=i.inhparent);
-- esperado: 0

-- INV-02: TRUNCATE/REFERENCES/TRIGGER nunca para authenticated/anon (E09)
SELECT count(*) FROM information_schema.role_table_grants
WHERE grantee IN ('authenticated','anon')
  AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
  AND table_schema IN ('zapp','evo','bpm','ai','archive','logistica','email_app','financeiro');
-- esperado: 0

-- INV-03: anon sem SELECT fora da allowlist (E10)
SELECT table_schema||'.'||table_name FROM information_schema.role_table_grants
WHERE grantee='anon' AND privilege_type='SELECT'
  AND table_schema IN ('public','zapp','evo')
  AND table_name NOT IN ('feature_flags');
-- esperado: 0 linhas

-- INV-04: nenhuma policy de SELECT equivalente a USING(true) por enumeração (E08)
SELECT polname FROM pg_policy
WHERE polrelid='evo.evolution_messages'::regclass AND polcmd='r'
  AND pg_get_expr(polqual,polrelid) NOT LIKE '%auth.uid()%';
-- esperado: 0 linhas

-- INV-05: toda view de ponte com security_invoker
SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='v' AND n.nspname IN ('public','zapp')
  AND COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                WHERE option_name='security_invoker'),'false') NOT IN ('true','on');
-- esperado: 0 linhas
```

**20.4 — Regras de lint contra as classes de bug encontradas:**
```js
// eslint.config.js — no-restricted-syntax
{
  selector: "Literal[value='wpp2']",
  message: "Instância WhatsApp hardcoded. Use conversation.instance_name (ver E07)."
},
{
  selector: "CallExpression[callee.property.name='channel'] > TemplateLiteral[expressions.length=0]",
  message: "Canal Realtime com nome fixo causa colisão de tópico. Inclua o id da conversa (ver E05)."
}
```

**20.5 — Telemetria de defeito silencioso.** Os quatro P0 tinham em comum: **erro engolido**. Adicionar ao logger um contador que reporta ao GlitchTip toda vez que um `error` de PostgREST for descartado sem tratamento em `src/features/inbox/`, e um alerta se a taxa passar de N/hora.

### Critério de aceite
- PR não mergeia em `main` sem os 3 checks verdes.
- `git config remote.origin.url` sem credencial embutida; PAT antigo revogado.
- `db-invariants.yml` rodando e verde nos 5 invariantes.
- Tentar commitar `'wpp2'` literal → lint falha.

### Teste de regressão
Os próprios invariantes. Adicionalmente: um PR de teste que reintroduza um dos defeitos deve ser **bloqueado** pelo CI — validar isso uma vez, manualmente, antes de considerar a etapa concluída.

### Risco / Rollback
Médio-organizacional, não técnico. Endurecer a `main` vai atritar com o fluxo da Lovable. Alinhar antes de aplicar. Rollback: desligar o enforcement.

---

# Anexos

## A. Ordem de execução recomendada

```
Semana 1  ── E01 → E02 → E03 → E04            (chat volta a funcionar)
             E19 (parcial: consertar o reporter, antes de tudo)

Semana 2  ── E11 → E12 → E13 → E14            (envio/edição íntegros)
             E05 → E06 → E07                  (realtime e multi-instância)

Semana 3  ── E08 Fase 1 (medição, 7 dias em observação)
             E09 → E10                        (privilégios)
             E15 → E17                        (perf barata)

Semana 4  ── E08 Fase 2/3 (janela de baixa operação)
             E16                              (virtualizador, validar em staging)
             E18 → E19 (completo) → E20
```

**Se houver apenas um dia:** E02 + E03. São ~9h e devolvem o ChatPanel e a edição de mensagens ao ar.

## B. Matriz de dependências

| Etapa | Depende de | Habilita |
|---|---|---|
| E01 | — | E02, E03, E07, E14 |
| E02 | E01 | — |
| E03 | E01 | E07, E11, E14 |
| E04 | — | E16 |
| E05 | E01 | E08 |
| E06 | — | — |
| E07 | E03 | — |
| E08 | E05 | — |
| E09 | — | E10 |
| E10 | E09 | — |
| E11 | E03 | — |
| E12 | — | — |
| E13 | — | — |
| E14 | E01, E03 | — |
| E15 | — | — |
| E16 | E04 | — |
| E17 | — | — |
| E18 | E01–E17 | — |
| E19 | E01–E18 | E20 |
| E20 | E19 | — |

## C. O que foi verificado empiricamente vs. inferido do código

Registrado por honestidade metodológica — nem tudo neste plano tem o mesmo grau de certeza.

**Verificado por execução direta contra o banco de produção:**
- `contacts.id` é `uuid`; a query com JID **falha** com `invalid input syntax for type uuid`
- `public.contacts` é VIEW com `security_invoker=true`; `anon` **não** consegue ler (testado com `SET ROLE`)
- Policy `messages_select` enumera 26 instâncias
- 891 tabelas com `TRUNCATE` para `authenticated`
- Publicação com `pubviaroot=true` contendo pai **e** folha `_wpp2`
- Distribuição de mensagens: `wpp2` 60.103 · `comercial_03` 5
- Todas as 8 tabelas assinadas via Realtime estão na publicação (nenhuma subscrição órfã)
- `evo.evolution_messages` com `REPLICA IDENTITY FULL`

**Verificado por leitura de código com confirmação cruzada:**
- `registerRef={noopRegisterRef}` vs `ref={registerRef}` (dois arquivos)
- `if (!isValidUUID(contactId)) return ''` em `useChatMediaSending`
- `useChatPanel.ts` sem consumidor (`grep` em todo `src/`)
- Chaves de cache com `DEFAULT_INSTANCE` literal (4 ocorrências)
- Ausência de `useMemo` em `useChatFilters`

**Inferido, não executado:**
- Impacto de performance quantificado (não houve profiling; estimativas por leitura)
- Comportamento exato do virtualizador com `scrollMargin` ausente (raciocínio sobre a API do `@tanstack/react-virtual`, não reproduzido)
- Duplicação de eventos por pai+folha na publicação (o comportamento do `pgoutput` neste caso específico não foi testado)
- Resultado da suíte de testes — **não foi possível executar** (ver E19)

## D. Ferramentas por etapa

| Etapa | Ferramenta |
|---|---|
| E01–E05, E07, E11–E18 | `GITHUB - MCP - FOREVER` (`github_push_files`) |
| E06, E08, E09, E10 | `SUPABASE SELF HOSTED - MCP` (`supabase_db_query`) |
| E19 | `CLAUDE CODE - VPS - MCP` (`code_exec`, container `claude-code`) |
| E20 | `GITHUB - MCP - FOREVER` + Portainer (secrets do stack 122) |

---

*Documento gerado a partir da auditoria de 2026-07-30 sobre o commit `a631524c`. Nenhuma correção foi aplicada. Cada etapa é independentemente executável e reversível.*
