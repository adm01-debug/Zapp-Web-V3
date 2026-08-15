# W10 — DOCS DO HARNESS DE INTEGRAÇÃO DO PROVIDER CLOUD (Meta WhatsApp Cloud API)

**Data:** 2026-08-15 · **Branch do clone:** `work-cloud-sim` (`C:\Users\Joaquim\repos\zapp-web-v3`)
**Artefatos:**
- `work/W10_cloud_harness.test.ts` (+ cópia executável em `denotest/W10_cloud_harness.test.ts`)
- **Destino futuro:** `supabase/functions/_shared/__tests__/cloud-harness.test.ts` (trocar os imports `../../../repos/zapp-web-v3/supabase/functions/_shared/X` por `./X` — nada mais muda)
- `work/W10_cloud_docs.md` (este arquivo)
- Atualização: `work/W10_simulacao_troca_provider.md` §8 (estado pós-implementação)

**Resultado da validação (DENO_ENV=test deno test):**
```
ok | 67 passed | 0 failed (266ms)
```
Comando: `cd denotest && DENO_ENV=test deno test --allow-env --allow-net --allow-read W10_cloud_harness.test.ts`

---

## 1. Mapa arquivo → responsabilidade

| Peça do harness | Módulo usado | Origem | Estado no repo | Responsabilidade |
|---|---|---|---|---|
| Registry + 12 verbos | `providers/registry.ts` | **REAL** (clone) | Existe, mas `case 'cloud'` **lança** `'Cloud provider client not yet implemented'` | Resolver provider por env (`PROVIDER_UNDER_TEST` só em `DENO_ENV=test`); guard absoluto anti-vazamento |
| Contrato 12 verbos | `providers/evolution/index.ts` (evolutionClient) | **REAL** (clone) | Existe | Lista canônica: `sendText, sendMedia, sendSticker, getConnectionState, getQrCode, restartInstance, listInstances, listGroups, checkWhatsApp, getProfilePicture, get, post` |
| Paridade fake | `providers/fake/index.ts` (fakeProvider) | **REAL** (clone) | Existe; **assimetria W8 já corrigida** (sem `sendAudio`, com `getProfilePicture`) | Espelho de teste dos 12 verbos; `assertTestEnv()` |
| Client cloud `sendText` | `cloudClientSim` + `cloudSendText` (spec no harness) | **SPEC/fix** | `providers/cloud/client.ts` **NÃO EXISTE** | POST `/{phoneNumberId}/messages`, Bearer, retry só-transitório, fail-closed em 200 malformado |
| `classifyCloudError` | spec no harness | **SPEC/fix** | **NÃO EXISTE** | 7 códigos Meta + fallbacks HTTP; fail-closed (desconhecido → permanent) |
| Normalizer v2 | `whatsapp-cloud-normalizer.ts` (**REAL**) + `normalizeMetaPayloadV2` (spec com fixes C3/C4) | **REAL + SPEC** | Existe (v1 com gaps) | Envelope Meta → `NormalizedEvent`; validação pelo schema real `MetaWebhookPayloadSchema` |
| HMAC webhook | `hmac-validation.ts` (`verifyHmacSignature`) | **REAL** (clone) | Existe | X-Hub-Signature-256 (S047/S084) |
| Dedup idempotente | `evolution-helpers.ts` (`sha256Hex`, `markEventProcessed`) | **REAL** (clone) | Existe | Ledger `webhook_events_processed` (S006/S040) |
| Webhook v2 handler | `cloudWebhookV2` (spec no harness) | **SPEC/fix** | Handler de módulo **NÃO EXISTE** (produção usa `whatsapp-cloud-webhook/index.ts` legado, sem dedup/status) | GET verify handshake (S005), POST: HMAC → dedup → normaliza → persiste msg/status |
| Mídia | `downloadCloudMedia` (spec no harness) | **SPEC/fix** | Conversão media_id→URL **NÃO EXISTE** no repo (gap central do media_sim B) | GET `/{mediaId}` Bearer → bytes; magic bytes; 404 → failed |
| Dual-mode | `mode.ts` (spec no harness) | **SPEC/fix** | `providers/cloud/mode.ts` **NÃO EXISTE** | Grupo → evolution SEMPRE (G01/S024); 1:1 → modo ativo; default evolution (cloud OFF) |
| Artefatos W anteriores | `cloud-normalizer-types-sim`, `whatsapp-cloud-format-sim`, `media_sim`, `rate_limit_filas_sim`, `webhook-sim` (+ RELATORIOS) | **REAL** (denotest/) | **TODOS EXISTEM** | Referência de cenários da matriz S/G; o harness consolida os achados |

> **Regra do enunciado aplicada:** nenhum artefato W1–W9 necessário faltou — todos os sims de referência existem em `denotest/`. Onde o **módulo** não existe no clone (client cloud, mode.ts, classifyCloudError, downloadCloudMedia, webhook v2, normalizer v2), o harness usa os **módulos reais do clone** (normalizer v1, hmac-validation, evolution-helpers, registry, evolution/fake) e fornece a **spec do fix** no próprio arquivo, reportado abaixo.

---

## 2. O que fica DESLIGADO em produção (modo default = unofficial/evolution)

| Camada | Estado em produção hoje | Como liga (e por que não liga sozinho) |
|---|---|---|
| **Provider mode** | `getProviderMode()` default **`evolution`**. `PROVIDER_MODE` ausente ou inválido → evolution (fail-safe). Só o valor exato `PROVIDER_MODE=cloud` liga o modo cloud. | Env var explícita + revisão humana. Nenhuma combinação de env liga cloud acidentalmente. |
| **Registry** | `getProviderClient('cloud')` **lança** — o client cloud não existe no repo; nenhum código de produção pode resolver cloud. | Implementar `providers/cloud/client.ts` e o `case 'cloud'` no registry (GAP C1). |
| **Client cloud** | Não existe. `evolutionClient` é o único client de envio. | Fix C1 + secrets do vault (checklist §4). |
| **Webhook cloud v2** | Produção tem `whatsapp-cloud-webhook/index.ts` (legado): loga statuses sem persistir, não usa o normalizer, sem dedup por corpo. | Handler v2 (spec no harness) + roteamento `/cloud` (S049/G08). |
| **Mídia cloud** | Sem download media_id→URL; `persistMediaToStorage` é evolution-only (whitelist CDN). | Fix downloadCloudMedia + upload /media (S016/G05). |
| **Dual-mode grupos** | Roteamento não existe em produção; grupos seguem na Evolution por construção (nada envia grupo para a Meta). | mode.ts (spec) — grupo → evolution SEMPRE, mesmo com modo=cloud. |

**Regra de ouro:** ligar o cloud exige **4 ações simultâneas** (env `PROVIDER_MODE=cloud` + secrets do vault + client implementado + webhook v2 ativo). Enquanto qualquer uma faltar, produção segue 100% evolution — a troca nunca é acidental.

---

## 3. Falhas reais dos artefatos (módulos reais do clone) — GAPs C1–C5

> Todos assertados de forma determinística no harness (verde) e logados como `[GAP]`. O teste final exige exatamente 5 registros (C1, C3×2, C4, C5) — corrigir um gap no repo faz o harness falhar até o contador ser atualizado.

| ID | Artefato real | Falha observada | Fix necessário |
|---|---|---|---|
| **C1** | `providers/registry.ts` (L58) | `getProviderClient('cloud')` lança `'Cloud provider client not yet implemented'` | Implementar `providers/cloud/client.ts` (12 verbos, Bearer, retry/backoff, E.164 — spec `cloudClientSim`/`cloudSendText` no harness) e `case 'cloud': return cloudClient;` no registry. Teste R1 vira teste de resolução (R7). |
| **C3** | `whatsapp-cloud-normalizer.ts` (cases `audio` L137 e `sticker` L156) | `content=''` para audio/sticker — o tipo some do conteúdo (downstream perde semântica) | Preencher content sintético: `'[áudio]'` / `'[sticker]'` (spec `normalizeMetaPayloadV2`). |
| **C4** | `whatsapp-cloud-normalizer.ts` (L119) | `parseInt('2026-08-14T10:00:00Z')=2026` → epoch de 1970, dado errado silencioso (S051b) | `parseMetaTimestamp`: se não for `^\d+$`, `Date.parse` (spec no harness). |
| **C5** | `whatsapp-cloud-normalizer.ts` (L118) | `remoteJid = ${from}@s.whatsapp.net` sem sanitizar → `120363025903983846@g.us@s.whatsapp.net` (JID duplo p/ grupo/@c.us) (S046a) | Sanitizar `from` (E.164 + remover sufixo) antes de montar o JID. |
| **C6** (documentado, sem assert) | `whatsapp-cloud-webhook/index.ts` (produção) | Statuses só logados, nunca persistidos; persistInbound inline divergente do normalizer (G10, provado em `webhook-sim.test.ts`/`cloud-normalizer-types-sim` G10-status) | Migrar produção para o handler v2 (spec `cloudWebhookV2`) + normalizer; persistir status com update condicional (S042). |
| **C2** ✅ | `providers/fake/index.ts` | ~~`sendAudio` extra~~ → **JÁ CORRIGIDO na branch `work-cloud-sim`**: fake simétrico (12 verbos, com `getProfilePicture`, sem `sendAudio`). O harness verifica e só registra o gap se a assimetria voltar. | Nenhum (achado W8 resolvido). |

**Módulos inexistentes (reportados, com spec pronta no harness):** `providers/cloud/client.ts`, `providers/cloud/mode.ts`, `classifyCloudError`, `downloadCloudMedia`, handler webhook v2, `normalizeMetaPayloadV2`.

---

## 4. Checklist para LIGAR o cloud (quando aprovado por Joaquim)

### 4.1 Env vars / secrets (vault — um par canônico, sem duplicatas)
- [ ] `WHATSAPP_CLOUD_TOKEN` — token system-user da Meta (nunca em VITE_, nunca em log — S083/S086)
- [ ] `WHATSAPP_CLOUD_PHONE_ID` — phone_number_id do WABA
- [ ] `WHATSAPP_CLOUD_WEBHOOK_SECRET` — app secret p/ X-Hub-Signature-256 (S047/S084)
- [ ] `WHATSAPP_CLOUD_VERIFY_TOKEN` — token do handshake GET (S005)
- [ ] `PROVIDER_MODE=cloud` — única chave que liga o dual-mode (default evolution)
- [ ] `whatsapp-cloud-secrets-status` = todos presentes; GET de teste na Graph responde 200

### 4.2 Conta Meta (pré-requisito, fora do sandbox)
- [ ] WABA em **produção** (não sandbox) — S001/S003/S004
- [ ] Número comercial **verificado** + display name configurado
- [ ] Template de re-engajamento **aprovado** (G02/S069 — maior lead time; janela 24h)
- [ ] **Nunca** conectar o mesmo número em 2 providers (S008/S076)
- [ ] Número de destino real disponível (551146375517) p/ ensaio

### 4.3 Webhook Meta (configuração no painel)
- [ ] URL: `https://…/functions/v1/whatsapp-cloud-webhook` (path `/cloud` — S049/G08)
- [ ] Verify token configurado (GET handshake testado — teste WEBHOOK v2 do harness)
- [ ] Assinatura X-Hub-Signature-256 habilitada
- [ ] Campos: `messages` + `statuses` (não só `messages`)
- [ ] Alerta de **zero ingest em N min** após ativar (TOP ensaio #1)

### 4.4 Código (fixes C1/C3/C4/C5 + handler v2)
- [ ] `providers/cloud/client.ts` (spec no harness) + `case 'cloud'` no registry (C1)
- [ ] Fixes C3/C4/C5 no `whatsapp-cloud-normalizer.ts` (ou adoção do v2)
- [ ] Handler webhook v2 (spec) no lugar do index.ts legado (C6)
- [ ] mode.ts (spec) no dispatcher; crons modo-aware (S053/S060)
- [ ] `ops.fn_cloud_url()`/`ops.fn_cloud_key()` + sql-gate modo-aware (S052)
- [ ] Script de flip/rollback idempotente + janela de graça 5 min (S071–S076)
- [ ] Baseline recalculado 24h antes (S007 — 948 vs 5077)

---

## 5. Atualização do W10_simulacao_troca_provider.md — estado pós-implementação

> Seção **§8** adicionada ao `W10_simulacao_troca_provider.md` com o estado pós-harness:
> **gaps fechados vs pendentes** (resumo abaixo; texto completo no próprio arquivo).

**Fechados pelo harness (prova de viabilidade, sem escrita no repo):**
- Contrato de 12 verbos provado par: evolutionClient × cloudClientSim × fakeProvider (R4–R7) — inclui `getProfilePicture`, sem `sendAudio`
- Client sendText com semântica de retry provada: 429 transitório reenvia; 131047/401 não reenviam; 200 malformado → fail-closed
- Normalizer v2: 16 tipos oficiais Meta + unknown sem throw; audio/sticker com content não-vazio; ISO correto; entry null fail-closed de contrato
- Webhook v2: HMAC válido/inválido, dedup por corpo (ledger real `markEventProcessed`), status persistido
- Mídia: download media_id→bytes com magic bytes (JPEG/PNG/OGG); 404 → failed
- Dual-mode: grupo→evolution SEMPRE; 1:1→cloud; default evolution (cloud OFF)
- classifyCloudError: 7 códigos Meta + fallbacks HTTP, fail-closed

**Pendentes (bloqueiam o ENSAIO real, inalterados):**
- Implementação no repo dos módulos spec (C1, C3, C4, C5, C6) — TOP 10 #1–#10 do W10 permanecem válidos
- Janela 24h + template aprovado (G02) · upload /media (G05) · SQL modo-aware (S052) · rollback/flip script (S071)
- Webhook verificado na Meta + conta fora do sandbox (TOP ensaio #1–#10)

**Mudança de status relevante:** o achado W8 #1 (`fakeProvider` sem `getProfilePicture` / com `sendAudio`) está **RESOLVIDO** na branch `work-cloud-sim` — o ensaio de mesa do harness confirmou paridade 12×12 sem assimetria.

---

## 6. Como rodar / manter

```bash
cd C:\Users\Joaquim\auditorias\decouple-audit\denotest
DENO_ENV=test deno test --allow-env --allow-net --allow-read W10_cloud_harness.test.ts
# esperado: ok | 67 passed | 0 failed
```

**Manutenção:** ao corrigir um gap no repo (C1/C3/C4/C5), ajustar o teste correspondente (de "asserta estado real + gap()" para "asserta target") e decrementar o contador do teste final. O harness é o canário: se o código real mudar sem o harness acompanhar, o teste `GAPS` falha.
