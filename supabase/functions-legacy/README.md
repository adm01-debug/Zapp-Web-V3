# Edge Functions Legadas — Fator X

Este diretório (`supabase/functions-legacy/`) versiona as 7 edge functions
que existem NO VOLUME do VPS (`/root/supabase/docker/volumes/functions/`)
mas NÃO estavam no repositório — risco documentado na issue #169.

---

## Por que elas existem separadas

Essas funções foram escritas para o sistema **Fator X** e usam um `_shared/`
com API diferente do `_shared/` principal do zapp-web-v3:

| Módulo | `_shared/` principal | `_shared/` legado |
|--------|---------------------|-------------------|
| Auth | `auth.ts` | `auth-legacy.ts` |
| Rate limit | `rate-limiter.ts` | `rate-limiter-legacy.ts` |
| Validation | — | `validation-legacy.ts` |
| CORS | `cors.ts` (compartilhado) | `cors.ts` (mesmo) |
| Vault | — | `vault.ts` |
| Barrel | `mod.ts` → re-exports padrão | `mod.ts` → re-exports legacy |

Se o deploy do `_shared/` padrão sobrescrever o legado, as funções legadas
morrem com `InvalidWorkerCreation: ... does not provide an export named ...`.
**Isso já aconteceu em produção e foi corrigido com `*-legacy.ts` + repatch do `mod.ts`.**

---

## Funções legadas (7)

| Função | Propósito | Status em produção |
|--------|-----------|-------------------|
| `audio-transcribe` | Transcrição de áudio via API externa | Ativa |
| `evolution-bitrix-sync` | Sync de dados Evolution → Bitrix24 | Ativa |
| `evolution-chatbot` | Bot de atendimento via Evolution API | Ativa |
| `evolution-followup` | Follow-up automático de conversas | Ativa |
| `evolution-sender` | Envio de mensagens em massa | Ativa |
| `evolution-sentiment` | Análise de sentimento em mensagens | Ativa |
| `evolution-templates` | Gestão de templates HSM | Ativa |

---

## Estado atual do backup

O backup pós-fix do volume está preservado no host:
```
/root/supabase/docker/volumes/functions-postfix-*.tar.gz
```

Este backup contém o estado **FUNCIONAL e VALIDADO** das funções legadas.

---

## Como trazer para o repo (ação pendente)

Para versionar as funções legadas:

```bash
# 1. No VPS — extrair o backup
tar -xzf /root/supabase/docker/volumes/functions-postfix-LATEST.tar.gz \
  -C /tmp/functions-legacy-export/

# 2. No repo local — copiar para este diretório
cp -r /tmp/functions-legacy-export/audio-transcribe \
      /tmp/functions-legacy-export/evolution-* \
      supabase/functions-legacy/

# 3. Copiar o _shared legado (com a VERSÃO CORRETA dos *-legacy.ts)
cp -r /tmp/functions-legacy-export/_shared \
      supabase/functions-legacy/_shared/

# 4. Criar um deno.json para o contexto legado
# 5. Commitar e abrir PR com a label "legacy"
```

---

## Regras de deploy (NUNCA VIOLAR)

1. **NUNCA sobrescrever** `_shared/mod.ts` no volume sem verificar que
   `auth-legacy.ts`, `rate-limiter-legacy.ts` e `validation-legacy.ts`
   estão presentes.

2. **Antes de qualquer deploy de `_shared/`**, fazer backup:
   ```bash
   tar -czf /root/supabase/docker/volumes/functions-backup-$(date +%Y%m%d-%H%M).tar.gz \
     /root/supabase/docker/volumes/functions/
   ```

3. **Após deploy de `_shared/`**, validar que todas as 7 funções legadas
   ainda respondem com `supabase functions serve --no-verify-jwt <nome>`.

4. **Se uma função legada quebrar** após deploy: restaurar o `_shared/`
   legado do backup IMEDIATAMENTE. Não tentar corrigir em produção.

---

## Rota de unificação (longo prazo)

Ao unificar os dois `_shared/`:
1. Mapear todos os exports de `_shared/` legado que não existem no padrão
2. Criar aliases ou adapters no `_shared/` principal  
3. Testar cada função legada com o `_shared/` unificado em staging
4. Só então fazer o merge

_Criado pela sessão de melhoria de processo em 2026-07-22 — issue #169_
