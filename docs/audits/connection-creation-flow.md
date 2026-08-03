# Auditoria — Fluxo de Criação de Conexão WhatsApp

> **Data:** 2026-08-02
> **Escopo:** `src/features/connections/**`, `src/hooks/useEvolutionApi*.ts`, `src/components/connections/ConnectionsView.tsx`, `src/lib/evolutionInstance.ts`, `src/integrations/supabase/{rowNormalizers,columnMap}.ts`, `supabase/functions/evolution-api/index.ts`
> **Tipo:** Auditoria somente-leitura (nenhum código alterado)
> **Branch auditada:** `fix/esteira-etapas-3-20` (HEAD `be29c7aa5`) — comparação com `origin/prod-snapshot` (`e31ad4d8a`, espelho byte-a-byte do deploy self-hosted 2026-08-01)

---

## 1. Resposta à pergunta central (F6-02)

**CONFIRMADO — `handleAddConnection` NÃO chama a Evolution API.**

`src/features/connections/hooks/parts/useConnectionsActions.ts:36-96` faz **apenas um INSERT** em `whatsapp_connections` via `safeClient.single(...)` (linhas 49-63) e, em seguida, dispara `void handleShowQrCode(data)` (linha 78) para conexões não-oficiais. Não há nenhuma chamada a `createInstance` / `/instance/create` em lugar algum do arquivo — nem direta nem via `useEvolutionApi` (o helper `createInstance` existe em `src/hooks/useEvolutionApiManagement.ts:307-316` mas **não é usado** neste fluxo).

A criação da instância na Evolution API só acontece **implicitamente** (e apenas em produção): o action `connect` da edge function `evolution-api` em `origin/prod-snapshot` tem fallback que, ao receber 404 "does not exist", chama `POST /instance/create` (auto-create). No branch atual esse fallback **nem existe** (ver G2).

---

## 2. Mapa completo do fluxo (estado atual do branch)

```
[1] UI — ConnectionsView.tsx:199-295
    Dialog "Conectar WhatsApp": name + phone_number + Select api_type ('evolution'|'official')
    → Botão "Adicionar" (l.278) → handleAddConnection
        │
[2] HOOK — useConnectionsActions.ts:36-96 (handleAddConnection)
    ├─ valida name (l.37-40)
    ├─ instanceName = 'official_<ts36>' | generateInstanceName(name) → slug_<6díg> (l.43-46)
    ├─ ★ INSERT whatsapp_connections { name, phone_number, instance_id=slug, instance_name=slug,
    │     status='disconnected', is_default, api_type }  (l.49-63)  ← ÚNICA chamada externa
    ├─ toast "Conexão criada!" + fecha dialog + reset form + invalidateCaches (l.69-77)
    └─ if (!isOfficial) void handleShowQrCode(data)   (l.78) — fire-and-forget, sem await
        │
[3] MANAGER — useConnectionsManager.ts:117-152 (handleShowQrCode)
    ├─ guard: api_type==='official' → toast "QR não disponível" (l.119-126)
    ├─ guard: !connection.instance_id → toast "Aguardando sincronização" (l.127-134)
    ├─ abre qrCodeDialog status='loading' (l.135-145)
    └─ if (status !== 'connected') → generateQr(connection) (l.147-149)
        │
[4] generateQr — useConnectionsManager.ts:53-115
    ├─ evoName = evolutionInstanceName(connection)  ← retorna o NOME DE EXIBIÇÃO (ver G4)
    ├─ if (!evoName) → dialog error (l.58-65)
    ├─ logQrAttempt(connId, evoName, name) → tabela qr_attempts (l.66-70)
    └─ requestQrCode(evoName) → parse base64/qrcode/base64/ttl (l.72-103)
        │
[5] SERVICE — whatsappConnectionService.ts:61-87 (requestQrCode)
    └─ whatsappConnectionRepository.callEvolutionApi({ action:'connect', instanceName }) (l.66-69)
        │
[6] REPOSITORY — whatsappConnectionRepository.ts:90-92 (callEvolutionApi)
    └─ supabase.functions.invoke('evolution-api', { body })   ← Edge Function
        │
[7] EDGE FUNCTION — supabase/functions/evolution-api/index.ts (branch atual, 147 linhas)
    └─ action='connect' → ★ NÃO EXISTE handler → cai no fallback l.141 → 404 {"error":"Unknown action"}
        │
[8] RETORNO — requestQrCode lança erro → generateQr catch (l.104-112) → dialog QR em estado 'error'
```

**Fluxo em PRODUÇÃO** (`origin/prod-snapshot` e31ad4d8a): o passo [7] tem `action === 'connect'` (l.213-300 do snapshot) com: fetch `GET /instance/connect/<name>` → 404 + "does not exist" → **`POST /instance/create`** com `{instanceName, qrcode:true, integration:'WHATSAPP-BAILEYS', ...}` (auto-create, l.269) → refaz connect. Ou seja, em produção a instância nasce **por acidente** (lazy via fallback do connect), com o nome derivado do display name — nunca via `createInstance` explícito do frontend.

---

## 3. Gaps identificados

| # | Sev | Achado | Evidência |
|---|-----|--------|-----------|
| **G1** | P0 (F6-02) | `handleAddConnection` não chama Evolution `/instance/create` — só INSERT no banco. `createInstance` existe (useEvolutionApiManagement.ts:307) mas está órfão do fluxo | useConnectionsActions.ts:36-96; teste `__tests__/useConnectionsActions.test.tsx:245-247` valida apenas o INSERT (instance_name=gen_Vendas) e a chamada a `handleShowQrCode` — zero asserção de chamada à API Evolution |
| **G2** | P0 (**NOVO**) | **Regressão da edge function no branch atual**: `supabase/functions/evolution-api/index.ts` (restaurado em `ece27d91e`, 2026-07-28, 147 linhas) **perdeu** os actions `create-instance`, `connect`, `disconnect`, `delete-instance`, `restart-instance` presentes no `origin/prod-snapshot` (e31ad4d8a, l.195/213/410/427/490). Qualquer action de lifecycle → 404 `Unknown action`. Deploy deste branch quebra criação/QR/disconnect/delete em produção | `git show e31ad4d8a:.../index.ts` tem os handlers; `git show HEAD:.../index.ts` não tem; testes estáticos `__tests__/connect-missing-instance.test.ts` e `connect-auth-errors.test.ts` assertam blocos `action === 'connect'` que não existem mais no source → **testes falham no branch atual** |
| **G3** | P0 (F6-01) | **Pairing code 100% ausente**: 1 hit em `src` (só JSDoc em useEvolutionApiManagement.ts:296); 0 hits na edge function (branch e prod-snapshot); 0 no `QrCodeDialog.tsx` (único "código" é o label do botão de refresh, l.164). Sem action `pairing-code`, sem service, sem UI | `rg -rn "pairing" src/ supabase/functions/evolution-api/` |
| **G4** | P1 (**NOVO**) | **`generateInstanceName` é dead code para roteamento**: `evolutionInstanceName` (rowNormalizers.ts:57-67) devolve o canônico `name` (nome de exibição) **antes** de `instance_name`/`instance_id`. Conexão criada como "Vendas" roteia `/instance/connect/Vendas` (prod auto-cria instância literalmente "Vendas"); o slug `vendas_123456` gravado em `instance_id`/`instance_name` nunca é usado. Nomes com espaço (ex.: "Vendas SAC") são rejeitados pela edge function (INSTANCE_RE `^[a-zA-Z0-9_-]{1,128}$`, index.ts:81-82) → 400 "Invalid instance name". Adicionalmente, o INSERT viola o contrato do columnMap (columnMap.ts:95-96: `instance_id` = "UUID interno da Evolution"): grava slug, não UUID | rowNormalizers.ts:57-67; useConnectionsActions.ts:44-61; columnMap.ts:93-97; index.ts:81-82 |
| **G5** | P2 (F6-15) | Row `name='WPP Marketing (Cloud API Oficial)'` com `api_type='evolution'` — nome enganoso vs config real. Sem validação no `handleAddConnection` para divergência nome/type | PLANO_IMPLEMENTACAO_100.md:1045-1055; useConnectionsActions.ts:36-96 (sem checagem de nome vs api_type) |
| **G6** | P2 (relacionado) | `void handleShowQrCode(data)` é fire-and-forget (l.78): se o QR falhar (ex.: 404 G2, ou createInstance ausente), o usuário vê "Conexão criada!" e depois o dialog de erro; o registro fica **fantasma** no banco (status='disconnected' para sempre) — exatamente o cenário que o aceite do F6-02 exige evitar | useConnectionsActions.ts:78; PLANO_IMPLEMENTACAO_100.md:887 |

### Observações adicionais
- **Divergência de cópias (pitfall conhecido):** a branch atual (`fix/esteira-etapas-3-20`) está atrás do `origin/prod-snapshot` neste arquivo de edge function. Recomenda-se diff explícito antes de qualquer deploy (`git diff e31ad4d8a HEAD -- supabase/functions/evolution-api/`).
- O action `connect` do prod-snapshot tem guardas corretas que **não** devem ser perdidas na restauração: bloqueio de UUID (`INSTANCE_NAME_IS_UUID`, evita instância fantasma — incidente wpp2 2026-07-04), `buildAuthError` para 401/403, `recordAuthFailureAndMaybePause`.
- Auto-sync (`useEvolutionAutoSync.ts:76-86`) insere conexões com `api_type:'evolution'` fixo e `instance_id=instanceName` — herda a ambiguidade do G4.

---

## 4. Verificação dos findings relacionados

- **F6-01 (pairing code):** ✅ VÁLIDO — ausência total confirmada (G3). Ação correta exige: action `pairing-code` na edge function (via `/instance/connect?number=<phone>`), service `requestPairingCode`, UI em `QrCodeDialog.tsx`.
- **F6-02 (handleAddConnection sem /instance/create):** ✅ VÁLIDO — confirmado (G1), com agravante novo: mesmo que o frontend chamasse, o branch atual devolveria 404 (G2).
- **F6-15 (api_type enganoso):** ✅ VÁLIDO — confirmado (G5), documentado em PLANO_IMPLEMENTACAO_100.md:1045.

---

## 5. Cadeia de chamadas canônica (referência para o fix)

```
handleAddConnection (useConnectionsActions.ts:36)
  → [FALTA] useEvolutionApi().createInstance({ instanceName, integration:'WHATSAPP-BAILEYS', qrcode:true })
      → callApi('create-instance', params) (useEvolutionApiManagement.ts:307)
      → invoke('evolution-api/create-instance') → proxy POST /instance/create (edge fn)
  → INSERT whatsapp_connections (com evo_instance_id/instance_name vindos do create)
  → handleShowQrCode → generateQr → requestQrCode → callEvolutionApi({action:'connect'})
      → invoke('evolution-api') → GET /instance/connect/<name> (edge fn)
```

---

## 6. Arquivos de referência

| Arquivo | Linhas-chave |
|---|---|
| `src/features/connections/hooks/parts/useConnectionsActions.ts` | 36-96 (handleAddConnection) |
| `src/features/connections/hooks/useConnectionsManager.ts` | 53-115 (generateQr), 117-152 (handleShowQrCode) |
| `src/features/connections/services/whatsappConnectionService.ts` | 10-13 (generateInstanceName), 61-87 (requestQrCode) |
| `src/features/connections/data-access/whatsappConnectionRepository.ts` | 90-92 (callEvolutionApi) |
| `src/hooks/useEvolutionApiManagement.ts` | 140-260 (callApi), 307-316 (createInstance) |
| `src/lib/evolutionInstance.ts` / `src/integrations/supabase/rowNormalizers.ts` | 31-33 / 57-67 (evolutionInstanceName) |
| `src/integrations/supabase/columnMap.ts` | 88-106 (contrato whatsapp_connections) |
| `src/components/connections/ConnectionsView.tsx` | 199-295 (dialog), 121-123 (auto-sync) |
| `src/hooks/useEvolutionAutoSync.ts` | 76-86 (insert auto-sync) |
| `supabase/functions/evolution-api/index.ts` (branch atual) | 141 (404 unknown action) |
| `supabase/functions/evolution-api/index.ts` (origin/prod-snapshot e31ad4d8a) | 195-208 (create-instance), 213-300 (connect + auto-create) |
| `docs/audits/PLANO_IMPLEMENTACAO_100.md` | 866-887 (F6-01/F6-02), 1045-1055 (F6-15) |
