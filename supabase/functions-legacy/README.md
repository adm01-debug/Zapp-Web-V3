# Edge Functions Legadas — Fator X

> **Contexto:** Estas 7 funções foram migradas do projeto Supabase Cloud "Fator X" para o VPS self-hosted durante o onboarding do Zap Webb. Elas **não estão no `supabase/functions/`** principal porque usam um contrato de `_shared/` diferente (exports legados) e não foram refatoradas para o padrão atual.

---

## ⚠️ Atenção antes de qualquer deploy

Um deploy que **sobrescreva `_shared/`** com a versão deste repositório **quebra o boot** dessas funções:

```
InvalidWorkerCreation: worker boot error: Uncaught SyntaxError:
The requested module './auth.ts' does not provide an export named 'authenticateRequest'
```

O `_shared/mod.ts` **no volume VPS** (não neste repo) foi patcheado para redirecionar os imports para os arquivos `*-legacy.ts`.

---

## Inventário

| Função | Arquivo | Propósito |
|--------|---------|-----------|
| `audio-transcribe` | `index.ts` | Transcrição via Hugging Face Whisper (vault-aware) |
| `evolution-bitrix-sync` | `index.ts` | Sincroniza fila `evolution_bitrix_queue` com Bitrix24 |
| `evolution-chatbot` | `index.ts` | Bot L1 de atendimento via Evolution API |
| `evolution-followup` | `index.ts` | Processa `evolution_followups` pendentes |
| `evolution-sender` | `index.ts` | Enviador de fila `evolution_message_queue` (v8) |
| `evolution-sentiment` | `index.ts` | Análise de sentimento de mensagens |
| `evolution-templates` | `index.ts` | Gerencia templates de mensagem |

### Arquivos `_shared` exclusivos das legadas

| Arquivo (no volume VPS) | Papel |
|-------------------------|-------|
| `_shared/mod.ts` (patcheado) | Re-exporta usando `*-legacy.ts` em vez dos arquivos novos |
| `_shared/auth-legacy.ts` | `authenticateRequest` + `createSupabaseClients` (versão legada) |
| `_shared/rate-limiter-legacy.ts` | `checkRateLimit`, `RATE_LIMITS`, etc. (versão legada) |
| `_shared/validation-legacy.ts` | `parseBody`, `CommonSchemas`, `z` + `redactSecrets`, `Logger`, `getCorsHeaders`, etc. |

---

## Localização no VPS

```
/root/supabase/docker/volumes/functions/
├── _shared/
│   ├── mod.ts                  # PATCHEADO — aponta para *-legacy.ts
│   ├── auth-legacy.ts          # Fator X: authenticateRequest
│   ├── rate-limiter-legacy.ts  # Fator X: checkRateLimit / RATE_LIMITS
│   └── validation-legacy.ts   # Fator X: parseBody + Logger + getCorsHeaders
├── audio-transcribe/index.ts
├── evolution-bitrix-sync/index.ts
├── evolution-chatbot/index.ts
├── evolution-followup/index.ts
├── evolution-sender/index.ts
├── evolution-sentiment/index.ts
└── evolution-templates/index.ts
```

**Backup pós-fix disponível no host:** `/root/supabase/docker/volumes/functions-postfix-20260703-2148.tar.gz`

---

## Script de restauração (caso o _shared seja sobrescrito)

```bash
#!/bin/bash
# Restaurar _shared legado após deploy que sobrescreveu
# Executar no guardian (5c2298fa3038)

BACKUP=/root/supabase/docker/volumes/functions-postfix-20260703-2148.tar.gz

docker run --rm -v /root/supabase/docker/volumes:/vols alpine sh -c "
  tar xzf $BACKUP \
    functions/_shared/auth-legacy.ts \
    functions/_shared/rate-limiter-legacy.ts \
    functions/_shared/validation-legacy.ts \
    functions/_shared/mod.ts \
    -C /vols
  chown 0:0 /vols/functions/_shared/auth-legacy.ts \
            /vols/functions/_shared/rate-limiter-legacy.ts \
            /vols/functions/_shared/validation-legacy.ts \
            /vols/functions/_shared/mod.ts
  echo RESTAURADO
"

# Forçar restart do edge-runtime para recarregar os arquivos
docker service update --force supabase_functions
```

---

## Próximos passos (issue #169)

- [ ] Trazer os `index.ts` das 7 funções para cá (este diretório)
- [ ] Decidir se refatora para o contrato atual de `_shared` ou mantém isolado
- [ ] Documentar quais tabelas cada função usa (para migração futura)

---

_Registrado em 2026-07-04 — rodada de paridade Lovable → VPS._
